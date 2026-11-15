/*
 * Outil de mesure, cotes dynamiques du meuble sélectionné et zones de passage.
 * S'appuie sur window.APT (apartment.js) et window.__app (app.js). Rien n'est sauvegardé.
 * Repère : x vers la droite, z vers le sud, cm. Les objets 3D ajoutés ici restent au niveau du sol.
 */
(function () {
  const app = window.__app;
  if (!app || !window.THREE || !window.APT) { console.warn('measure.js : application introuvable'); return; }
  const { scene, camera, renderer, hooks } = app;
  const view = document.getElementById('view');
  const slot = document.getElementById('tools-slot');
  const T = APT.T;
  // écran tactile : « Touche » au lieu de « Clique », et pas de touche Échap -> bouton ✕ dans la bulle d'aide
  const isTouch = () => !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);

  // ------------------------------------------------------------------ styles
  const css = document.createElement('style');
  css.textContent = `
    #m-labels { position:absolute; inset:0; pointer-events:none; overflow:hidden; z-index:4; }
    .m-lbl { position:absolute; left:0; top:0; background:rgba(255,255,255,.95); border:1.5px solid #2a5db0; color:#1d3f7a;
      border-radius:6px; padding:1px 6px; font:600 12px/1.35 Inter, system-ui, "Segoe UI", sans-serif; white-space:nowrap;
      font-variant-numeric:tabular-nums; box-shadow:0 1px 3px rgba(0,0,0,.12); }
    .m-lbl.cote { border-color:var(--accent); color:var(--accent); font-size:11.5px; }
    .m-lbl.prev { opacity:.85; border-style:dashed; }
    #m-hint { left:50%; top:14px; transform:translateX(-50%); z-index:5; color:var(--ink); white-space:nowrap; }
    #m-hint.touch { display:flex; align-items:center; gap:8px; padding:4px 4px 4px 11px; }
    #m-hint button { flex:none; min-height:34px; padding:0 10px; font-size:12.5px; white-space:nowrap; }
    #tools-slot { flex:none; }
    #tools-slot button { white-space:nowrap; padding:6px 9px; }
    #m-hint[hidden], #pass-panel[hidden] { display:none; }
    #pass-panel { left:14px; top:14px; z-index:5; width:236px; max-height:calc(100% - 80px); overflow:auto; padding:9px 11px; color:var(--ink); }
    #pass-panel .pp-head { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:6px; }
    #pass-panel .pp-head strong { font-size:13px; }
    #pass-panel select { width:auto; padding:2px 6px; font-size:12px; border-radius:6px; }
    #pass-panel .pp-leg { display:flex; gap:10px; color:var(--mute); margin-bottom:4px; flex-wrap:wrap; }
    #pass-panel .sw { display:inline-block; width:10px; height:10px; border-radius:3px; margin-right:4px; vertical-align:-1px; }
    #pass-panel h5 { margin:8px 0 2px; font-size:10.5px; text-transform:uppercase; letter-spacing:.06em; color:var(--mute); font-weight:600; }
    #pass-panel ul { list-style:none; margin:0; padding:0; }
    #pass-panel li { display:flex; gap:6px; align-items:baseline; padding:2px 4px; border-radius:5px; font-size:12px; }
    #pass-panel li.click { cursor:pointer; }
    #pass-panel li.click:hover { background:var(--soft); }
    #pass-panel li b { width:12px; flex:none; text-align:center; }
    #pass-panel li.ok b { color:#2f8a57; }
    #pass-panel li.ko b { color:var(--bad); }
    #pass-panel li.ko { color:#8a2a1c; }
    #pass-panel li small { color:var(--mute); }
    #m-clear { position:absolute; right:14px; top:14px; z-index:5; font-size:12px; padding:5px 10px; box-shadow:var(--shadow); }
    #m-clear[hidden] { display:none; }`;
  document.head.appendChild(css);

  // ------------------------------------------------------------------ interface (en-tête)
  slot.innerHTML = `
    <button id="m-tool" class="icon" title="Mesurer une distance au sol (${isTouch() ? 'touche à nouveau pour quitter' : 'Échap pour quitter'})">📏 Mesurer</button>
    <label class="switch" title="Distances libres autour du meuble sélectionné"><input type="checkbox" id="m-cotes" checked> Cotes auto</label>
    <label class="switch" title="Zones de circulation depuis la porte d'entrée"><input type="checkbox" id="m-pass"> Passages</label>`;
  const btnTool = document.getElementById('m-tool');
  // bouton d'effacement posé dans la vue 3D (l'en-tête est déjà chargé)
  const btnClear = document.createElement('button');
  btnClear.id = 'm-clear';
  btnClear.hidden = true;
  btnClear.title = 'Effacer toutes les mesures';
  btnClear.textContent = '✕ Effacer les mesures';
  view.appendChild(btnClear);

  const lblLayer = document.createElement('div');
  lblLayer.id = 'm-labels';
  view.appendChild(lblLayer);
  const hint = document.createElement('div');
  hint.id = 'm-hint';
  hint.className = 'bubble';
  hint.hidden = true;
  const hintTxt = document.createElement('span');
  const hintBtn = document.createElement('button'); // au doigt : annuler le point posé / quitter l'outil (= Échap)
  hintBtn.type = 'button';
  hint.append(hintTxt, hintBtn);
  view.appendChild(hint);

  // ------------------------------------------------------------------ géométrie 2D
  const fmtM = (d) => (d / 100).toFixed(2).replace('.', ',') + ' m';
  const fmtCm = (d) => Math.round(d) + ' cm';
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

  // arête i d'un polygone : direction d, normale sortante n, at(s, t) = point à s le long de l'arête et t vers l'extérieur
  function edgeInfo(poly, i) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const L = dist(a, b);
    const d = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
    let n = [d[1], -d[0]];
    if (APT.pointInPoly([(a[0] + b[0]) / 2 + n[0] * 2, (a[1] + b[1]) / 2 + n[1] * 2], poly)) n = [-n[0], -n[1]];
    return { a, b, L, d, n, at: (s, t) => [a[0] + d[0] * s + n[0] * t, a[1] + d[1] * s + n[1] * t] };
  }
  const polySegs = (poly) => poly.map((p, i) => [p, poly[(i + 1) % poly.length]]);
  const wallSegs = polySegs(APT.main).concat(polySegs(APT.bathPoly));
  const wallVerts = APT.main.concat(APT.bathPoly);
  // murs pleins pour les cotes : arêtes des pièces moins les ouvertures (portes, baie, porte-fenêtre), chaque ouverture
  // étant reportée sur toutes les arêtes colinéaires (mur partagé avec la salle d'eau) — même logique que snap.js
  const solidWallSegs = (() => {
    const edges = wallSegs.map(([a, b]) => {
      const L = dist(a, b);
      return { a, b, L, d: [(b[0] - a[0]) / L, (b[1] - a[1]) / L], holes: [] };
    });
    const along = (e, p) => (p[0] - e.a[0]) * e.d[0] + (p[1] - e.a[1]) * e.d[1];
    const off = (e, p) => Math.abs((p[0] - e.a[0]) * -e.d[1] + (p[1] - e.a[1]) * e.d[0]);
    Object.keys(APT.openings).forEach((k) => {
      const e = edges[+k]; // arête k de APT.main
      APT.openings[k].forEach((o) => {
        const p0 = [e.a[0] + e.d[0] * o.s, e.a[1] + e.d[1] * o.s], p1 = [e.a[0] + e.d[0] * (o.s + o.w), e.a[1] + e.d[1] * (o.s + o.w)];
        edges.forEach((s) => {
          if (off(s, p0) > 1 || off(s, p1) > 1) return;
          const u0 = along(s, p0), u1 = along(s, p1);
          s.holes.push([Math.min(u0, u1), Math.max(u0, u1)]);
        });
      });
    });
    const out = [];
    edges.forEach((e) => {
      let s0 = 0;
      const pt = (s) => [e.a[0] + e.d[0] * s, e.a[1] + e.d[1] * s];
      e.holes.sort((h, g) => h[0] - g[0]).forEach(([h0, h1]) => {
        if (h0 > s0 + 0.01) out.push([pt(s0), pt(Math.min(h0, e.L))]);
        s0 = Math.max(s0, h1);
      });
      if (e.L > s0 + 0.01) out.push([pt(s0), e.b]);
    });
    return out;
  })();

  function closestOnSeg(p, a, b) {
    const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz;
    const t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2)) : 0;
    return [a[0] + dx * t, a[1] + dz * t];
  }

  // ------------------------------------------------------------------ primitives 3D (épaisseur constante à l'écran)
  const segGeo = new THREE.PlaneGeometry(1, 1);
  segGeo.rotateX(-Math.PI / 2);
  const dotGeo = new THREE.CircleGeometry(1, 20);
  dotGeo.rotateX(-Math.PI / 2);
  const shared = new Set([segGeo, dotGeo]);
  const mat = (color, opacity) =>
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: opacity == null ? 1 : opacity, depthTest: false, depthWrite: false, toneMapped: false });
  const M = {
    meas: mat(0x2a5db0), prev: mat(0x2a5db0, 0.65), snap: mat(0xe8590c), free: mat(0x2a5db0, 0.5),
    cote: mat(0x1f5f5b), door: mat(0x4f5b66, 0.9), doorBad: mat(0xc2402f),
  };

  function seg(g, p, q, m, y, px) {
    const dx = q[0] - p[0], dz = q[1] - p[1];
    const s = new THREE.Mesh(segGeo, m);
    s.position.set((p[0] + q[0]) / 2, y, (p[1] + q[1]) / 2);
    s.rotation.y = Math.atan2(-dz, dx);
    s.scale.set(Math.max(Math.hypot(dx, dz), 0.01), 1, 1);
    s.userData.kind = 'seg';
    s.userData.px = px || 2.5;
    s.renderOrder = 20;
    g.add(s);
    return s;
  }
  function dot(g, p, m, y, px) {
    const s = new THREE.Mesh(dotGeo, m);
    s.position.set(p[0], y, p[1]);
    s.userData.kind = 'dot';
    s.userData.px = px || 4;
    s.renderOrder = 21;
    g.add(s);
    return s;
  }
  // vide un groupe ; les géométries partagées et les matériaux communs sont conservés
  function clearGroup(g) {
    removeLabels(g);
    while (g.children.length) {
      const c = g.children.pop();
      c.traverse((o) => {
        if (o.geometry && !shared.has(o.geometry)) o.geometry.dispose();
        if (o.material && o.userData.ownMat) o.material.dispose();
      });
      if (c.children.length) clearGroup(c);
    }
  }

  const v3 = new THREE.Vector3();
  function worldPerPx(pos) {
    const D = camera.position.distanceTo(pos);
    return (2 * D * Math.tan((camera.fov * Math.PI) / 360)) / Math.max(1, renderer.domElement.clientHeight);
  }
  function fitWidths(g) {
    if (!g.visible) return;
    g.traverse((o) => {
      if (!o.userData.kind) return;
      o.getWorldPosition(v3);
      const k = worldPerPx(v3) * o.userData.px;
      if (o.userData.kind === 'seg') o.scale.z = k;
      else o.scale.set(k, 1, k);
    });
  }

  // ------------------------------------------------------------------ étiquettes HTML suivant la 3D
  const labels = []; // { el, p, g }
  function addLabel(g, text, x, z, cls) {
    const el = document.createElement('div');
    el.className = 'm-lbl ' + (cls || '');
    el.textContent = text;
    el.style.display = 'none';
    lblLayer.appendChild(el);
    labels.push({ el, p: new THREE.Vector3(x, 2, z), g });
  }
  function removeLabels(g) {
    for (let i = labels.length - 1; i >= 0; i--) if (labels[i].g === g) { labels[i].el.remove(); labels.splice(i, 1); }
  }
  function shown(o) { for (; o; o = o.parent) if (!o.visible) return false; return true; }
  function placeLabels() {
    const w = renderer.domElement.clientWidth, h = renderer.domElement.clientHeight;
    labels.forEach((L) => {
      v3.copy(L.p).project(camera);
      if (!shown(L.g) || v3.z > 1 || v3.z < -1) { L.el.style.display = 'none'; return; }
      L.el.style.display = '';
      L.el.style.transform = `translate(${((v3.x + 1) / 2) * w}px, ${((1 - v3.y) / 2) * h}px) translate(-50%, -50%)`;
    });
  }

  // ================================================================== 1. OUTIL DE MESURE
  const measGroup = new THREE.Group();
  const prevGroup = new THREE.Group();
  scene.add(measGroup, prevGroup);
  const SNAP = 8; // cm
  let toolOn = false, ptA = null, hover = null;

  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  function floorPoint(e) {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const p = new THREE.Vector3();
    return ray.ray.intersectPlane(floorPlane, p) ? [p.x, p.z] : null;
  }

  // accrochage : coins (murs, éléments fixes, meubles) puis projection sur le mur le plus proche
  function snapPoint(p) {
    let best = null, bd = SNAP;
    const test = (c) => { const d = dist(c, p); if (d < bd) { bd = d; best = c; } };
    wallVerts.forEach(test);
    APT.fixed.forEach((f) => f.poly.forEach(test));
    app.items.forEach((it) => app.poly(it).forEach(test));
    if (best) return { p: [best[0], best[1]], snapped: true };
    bd = SNAP;
    wallSegs.forEach(([a, b]) => test(closestOnSeg(p, a, b)));
    if (best) return { p: best, snapped: true };
    return { p, snapped: false };
  }

  function drawMeasure(g, a, b, m, cls) {
    seg(g, a, b, m, 1.5, 2.5);
    dot(g, a, m, 1.5, 4);
    dot(g, b, m, 1.5, 4);
    if (dist(a, b) > 0.5) addLabel(g, fmtM(dist(a, b)), (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, cls);
  }

  function renderPreview() {
    clearGroup(prevGroup);
    prevGroup.visible = toolOn && !app.isWalking();
    if (!toolOn) return;
    if (ptA) {
      dot(prevGroup, ptA, M.meas, 1.5, 4.5);
      if (hover) drawMeasure(prevGroup, ptA, hover.p, M.prev, 'prev');
    }
    if (hover) dot(prevGroup, hover.p, hover.snapped ? M.snap : M.free, 1.6, hover.snapped ? 5 : 3);
    const touch = isTouch();
    hint.classList.toggle('touch', touch);
    hintBtn.hidden = !touch;
    if (touch) {
      hintTxt.textContent = ptA
        ? 'Touche le second point (glisse le doigt pour ajuster, lâche pour poser)'
        : 'Touche un premier point au sol (aimanté aux coins et aux murs)';
      hintBtn.textContent = ptA ? '✕ Annuler le point' : '✕ Quitter';
      hintBtn.title = ptA ? 'Annuler le premier point' : "Quitter l'outil Mesurer";
    } else {
      hintTxt.textContent = ptA
        ? 'Clique le second point · Échap pour annuler ce point'
        : 'Clique un premier point au sol (aimanté aux coins et aux murs) · Échap pour quitter';
    }
  }
  // annuler le point en cours, sinon quitter l'outil (Échap, ou bouton ✕ au doigt)
  function cancelStep() { if (ptA) { ptA = null; renderPreview(); } else setTool(false); }
  hintBtn.addEventListener('click', (e) => { e.stopPropagation(); cancelStep(); });

  function updateClearBtn() { btnClear.hidden = measGroup.children.length === 0; }

  function setTool(on) {
    if (on && app.isWalking()) return;
    toolOn = on;
    app.tool = on ? 'measure' : null;
    ptA = null;
    hover = null;
    btnTool.classList.toggle('on', on);
    hint.hidden = !on;
    renderer.domElement.style.cursor = on ? 'crosshair' : 'default';
    renderPreview();
  }
  btnTool.onclick = () => setTool(!toolOn);
  btnClear.onclick = () => { clearGroup(measGroup); updateClearBtn(); };

  // souris : clic = appui et relâchement à moins de 5 px (sinon c'est une rotation de caméra).
  // doigt : l'appui est « pris » par l'outil (stopPropagation : mobile.js garde le pointeur, la caméra ne tourne pas),
  // le point suit le doigt et se pose au relâchement ; un 2e doigt annule l'appui et rend la main à la caméra (zoom).
  let down = null;
  renderer.domElement.addEventListener('pointerdown', (e) => {
    down = null;
    if (!toolOn || e.button !== 0) return;
    if (e.pointerType === 'touch') {
      if (!e.isPrimary) return; // 2e doigt : geste de caméra
      e.stopPropagation();
      down = { x: e.clientX, y: e.clientY, touch: true, id: e.pointerId };
      const fp = floorPoint(e);
      hover = fp ? snapPoint(fp) : null;
      renderPreview();
      if (app.invalidate) app.invalidate();
      return;
    }
    down = { x: e.clientX, y: e.clientY };
  });
  renderer.domElement.addEventListener('touchstart', (e) => { if (e.touches.length > 1) down = null; }, { passive: true });
  window.addEventListener('pointercancel', () => { down = null; });
  window.addEventListener('pointerup', (e) => {
    const d = down;
    down = null;
    if (!toolOn || !d || e.button !== 0) return;
    if (d.touch ? e.pointerId !== d.id : Math.hypot(e.clientX - d.x, e.clientY - d.y) >= 5) return;
    const fp = floorPoint(e);
    if (!fp) return;
    hover = snapPoint(fp);
    if (!ptA) ptA = hover.p;
    else {
      if (dist(ptA, hover.p) > 0.5) {
        const g = new THREE.Group();
        drawMeasure(g, ptA, hover.p, M.meas);
        measGroup.add(g);
        updateClearBtn();
      }
      ptA = null;
    }
    renderPreview();
  });
  renderer.domElement.addEventListener('pointermove', (e) => {
    if (!toolOn) return;
    renderer.domElement.style.cursor = 'crosshair'; // passe après app.js qui remet "grab" sur les meubles
    const fp = floorPoint(e);
    hover = fp ? snapPoint(fp) : null;
    renderPreview();
  });
  renderer.domElement.addEventListener('pointerleave', () => { if (toolOn) { hover = null; renderPreview(); } });
  window.addEventListener('keydown', (e) => {
    if (!toolOn || e.key !== 'Escape') return;
    cancelStep();
    e.preventDefault();
  });

  // ================================================================== 2. COTES DU MEUBLE SÉLECTIONNÉ
  const coteGroup = new THREE.Group();
  scene.add(coteGroup);
  const MAX_COTE = 300;
  const cotesInput = document.getElementById('m-cotes');

  function obstacleSegs(except) {
    const segs = solidWallSegs.slice(); // portes et baies ne sont pas des murs : la cote va jusqu'au mur réel
    APT.fixed.forEach((f) => segs.push(...polySegs(f.poly)));
    app.items.forEach((it) => { if (it !== except) segs.push(...polySegs(app.poly(it))); });
    return segs;
  }

  // distance de balayage : la face (centre o, demi-largeur hw le long de lat) avance selon dir jusqu'au premier segment
  function sweep(o, dir, lat, hw, segs) {
    let best = Infinity, bestS = 0;
    const lim = Math.max(0, hw - 1); // 1 cm de tolérance : un voisin collé sur le côté ne compte pas
    for (const [p, q] of segs) {
      const ps = (p[0] - o[0]) * lat[0] + (p[1] - o[1]) * lat[1], pt = (p[0] - o[0]) * dir[0] + (p[1] - o[1]) * dir[1];
      const qs = (q[0] - o[0]) * lat[0] + (q[1] - o[1]) * lat[1], qt = (q[0] - o[0]) * dir[0] + (q[1] - o[1]) * dir[1];
      const ds = qs - ps;
      let u0 = 0, u1 = 1;
      if (Math.abs(ds) < 1e-9) { if (ps < -lim || ps > lim) continue; }
      else {
        let ua = (-lim - ps) / ds, ub = (lim - ps) / ds;
        if (ua > ub) [ua, ub] = [ub, ua];
        u0 = Math.max(0, ua); u1 = Math.min(1, ub);
        if (u0 > u1) continue;
      }
      const t0 = pt + (qt - pt) * u0, t1 = pt + (qt - pt) * u1, s0 = ps + ds * u0, s1 = ps + ds * u1;
      if (t0 < -0.5 && t1 < -0.5) continue; // entièrement derrière la face
      let t, s;
      if (t0 < -0.5 || t1 < -0.5) { t = 0; s = s0 + ((s1 - s0) * (0 - t0)) / (t1 - t0); } // traverse la face
      else if (t0 <= t1) { t = t0; s = s0; } else { t = t1; s = s1; }
      if (t < best) { best = Math.max(0, t); bestS = s; }
    }
    return { d: best, s: bestS };
  }

  function updateCotes() {
    clearGroup(coteGroup);
    const it = app.getSelected();
    if (!cotesInput.checked || !it || app.isWalking() || app.items.indexOf(it) < 0) return;
    const a = (it.rot * Math.PI) / 180;
    const f = [Math.sin(a), Math.cos(a)], r = [Math.cos(a), -Math.sin(a)]; // avant (+z local), droite (+x local)
    const segs = obstacleSegs(it);
    [
      [f, r, it.d / 2, it.w / 2],
      [[-f[0], -f[1]], r, it.d / 2, it.w / 2],
      [r, f, it.w / 2, it.d / 2],
      [[-r[0], -r[1]], f, it.w / 2, it.d / 2],
    ].forEach(([dir, lat, off, hw]) => {
      const o = [it.x + dir[0] * off, it.z + dir[1] * off];
      const res = sweep(o, dir, lat, hw, segs);
      if (!(res.d >= 1) || res.d > MAX_COTE) return;
      const s = hw > 8 ? Math.max(-hw + 4, Math.min(hw - 4, res.s)) : 0;
      const p = [o[0] + lat[0] * s, o[1] + lat[1] * s];
      const q = [p[0] + dir[0] * res.d, p[1] + dir[1] * res.d];
      seg(coteGroup, p, q, M.cote, 2, 2);
      const tk = Math.min(7, res.d / 2 + 3);
      [p, q].forEach((c) => seg(coteGroup, [c[0] - lat[0] * tk, c[1] - lat[1] * tk], [c[0] + lat[0] * tk, c[1] + lat[1] * tk], M.cote, 2, 2));
      addLabel(coteGroup, fmtCm(res.d), (p[0] + q[0]) / 2, (p[1] + q[1]) / 2, 'cote');
    });
  }
  cotesInput.onchange = updateCotes;

  // ================================================================== 3. ZONES DE PASSAGE
  const passInput = document.getElementById('m-pass');
  const passGroup = new THREE.Group();
  passGroup.visible = false;
  scene.add(passGroup);
  let passW = 60;

  // grille de 5 cm couvrant la pièce principale, la salle d'eau et le palier devant l'entrée
  const CELL = 5, X0 = -220, Z0 = -225, NX = 170, NZ = 174, N = NX * NZ;
  const cellOf = (p) => {
    const i = Math.floor((p[0] - X0) / CELL), j = Math.floor((p[1] - Z0) / CELL);
    return i < 0 || j < 0 || i >= NX || j >= NZ ? -1 : j * NX + i;
  };
  function raster(poly, fn) {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    poly.forEach(([x, z]) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); });
    const i0 = Math.max(0, Math.floor((x0 - X0) / CELL)), i1 = Math.min(NX - 1, Math.floor((x1 - X0) / CELL));
    const j0 = Math.max(0, Math.floor((z0 - Z0) / CELL)), j1 = Math.min(NZ - 1, Math.floor((z1 - Z0) / CELL));
    const p = [0, 0];
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      p[0] = X0 + (i + 0.5) * CELL; p[1] = Z0 + (j + 0.5) * CELL;
      if (APT.pointInPoly(p, poly)) fn(j * NX + i);
    }
  }

  // portes (sens donnés par l'utilisateur) :
  // - entrée (arête 6) : s'ouvre vers l'intérieur, paumelles côté G, le vantail se rabat vers le mur du salon ;
  // - salle d'eau (arête 7) : s'ouvre côté entrée/salon, poignée à droite vue de l'entrée -> paumelles côté H ;
  // - porte-fenêtre cuisine (arête 2) : s'ouvre vers l'intérieur, poignée à gauche -> paumelles côté mur du frigo (D)
  const eEntry = edgeInfo(APT.main, 6), oEntry = APT.openings[6][0];
  const eBath = edgeInfo(APT.main, 7), oBath = APT.openings[7][0]; // n de eBath pointe vers la salle d'eau
  const landPoly = [eEntry.at(oEntry.s, 0), eEntry.at(oEntry.s + oEntry.w, 0), eEntry.at(oEntry.s + oEntry.w, T + 50), eEntry.at(oEntry.s, T + 50)];

  const bbox = (pl) => ({ pl, x0: Math.min(...pl.map((p) => p[0])), x1: Math.max(...pl.map((p) => p[0])), z0: Math.min(...pl.map((p) => p[1])), z1: Math.max(...pl.map((p) => p[1])) });
  // masques fixes
  const inRoom = new Uint8Array(N), landing = new Uint8Array(N), base = new Uint8Array(N), wallG = new Float64Array(N), wallMask = new Uint8Array(N);
  (function buildStatic() {
    const p = [0, 0];
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
      const k = j * NX + i;
      p[0] = X0 + (i + 0.5) * CELL; p[1] = Z0 + (j + 0.5) * CELL;
      const room = APT.pointInPoly(p, APT.main) || APT.pointInPoly(p, APT.bathPoly);
      const land = !room && APT.pointInPoly(p, landPoly);
      inRoom[k] = room ? 1 : 0;
      landing[k] = land ? 1 : 0;
      let free = room || land;
      // mur partagé séjour / salle d'eau (épaisseur côté salle d'eau), sauf la baie de la porte
      const rx = p[0] - eBath.a[0], rz = p[1] - eBath.a[1];
      const s = rx * eBath.d[0] + rz * eBath.d[1], t = rx * eBath.n[0] + rz * eBath.n[1];
      if (free && t > -0.5 && t < T + 0.5 && s > -T && s < eBath.L + T && !(s > oBath.s && s < oBath.s + oBath.w)) free = false;
      base[k] = free ? 1 : 0;
    }
    wallG.set(base); // murs seuls (éléments fixes exclus : leur distance est calculée exactement)
    wallMask.set(base);
    APT.fixed.forEach((f) => raster(f.poly, (k) => (base[k] = 0)));
  })();
  // cuisine / salle d'eau réglées depuis l'interface (hook « fixed ») : les murs ne bougent pas, seuls les éléments fixes
  function rebuildFixedGrid() {
    base.set(wallMask);
    APT.fixed.forEach((f) => raster(f.poly, (k) => (base[k] = 0)));
  }

  // transformée en distance euclidienne exacte (Felzenszwalb), distances au carré en cellules
  const INF = 1e20;
  const tf = new Float64Array(Math.max(NX, NZ)), td = new Float64Array(Math.max(NX, NZ)), tz = new Float64Array(Math.max(NX, NZ) + 1);
  const tv = new Int32Array(Math.max(NX, NZ));
  function dt1(n) {
    let k = 0;
    tv[0] = 0; tz[0] = -INF; tz[1] = INF;
    for (let q = 1; q < n; q++) {
      let s = (tf[q] + q * q - (tf[tv[k]] + tv[k] * tv[k])) / (2 * q - 2 * tv[k]);
      while (s <= tz[k]) { k--; s = (tf[q] + q * q - (tf[tv[k]] + tv[k] * tv[k])) / (2 * q - 2 * tv[k]); }
      k++; tv[k] = q; tz[k] = s; tz[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < n; q++) { while (tz[k + 1] < q) k++; td[q] = (q - tv[k]) * (q - tv[k]) + tf[tv[k]]; }
  }
  function edt(g) {
    for (let i = 0; i < NX; i++) { for (let j = 0; j < NZ; j++) tf[j] = g[j * NX + i]; dt1(NZ); for (let j = 0; j < NZ; j++) g[j * NX + i] = td[j]; }
    for (let j = 0; j < NZ; j++) { const o = j * NX; for (let i = 0; i < NX; i++) tf[i] = g[o + i]; dt1(NX); for (let i = 0; i < NX; i++) g[o + i] = td[i]; }
  }

  // distance (cm) du centre de chaque cellule aux murs, estimée sur la grille (statique) : centre de la cellule
  // bloquée la plus proche moins une demi-cellule (exact pour un mur sur une ligne de la grille, ±2,5 cm sinon)
  const wallD = new Float32Array(N);
  for (let k = 0; k < N; k++) wallG[k] = wallG[k] ? INF : 0;
  edt(wallG);
  for (let k = 0; k < N; k++) wallD[k] = Math.sqrt(wallG[k]) * CELL - CELL / 2;

  // Distance EXACTE aux murs (les murs en biais ne tombent pas sur la grille : ±2,5 cm, assez pour fermer la porte de
  // la salle d'eau (73 cm) à 70 cm). Contour de la zone libre = séjour ∪ salle d'eau ∪ palier, moins l'épaisseur du mur
  // séjour / salle d'eau hors de la baie de porte. On découpe les arêtes candidates en petits morceaux, on garde ceux
  // qui séparent du libre et du bloqué, puis on fusionne les morceaux consécutifs en segments.
  const freeExact = (p) => {
    if (!(APT.pointInPoly(p, APT.main) || APT.pointInPoly(p, APT.bathPoly) || APT.pointInPoly(p, landPoly))) return false;
    const rx = p[0] - eBath.a[0], rz = p[1] - eBath.a[1];
    const s = rx * eBath.d[0] + rz * eBath.d[1], t = rx * eBath.n[0] + rz * eBath.n[1];
    return !(t > 0 && t < T && s > -T && s < eBath.L + T && !(s > oBath.s && s < oBath.s + oBath.w));
  };
  const wallLines = (() => {
    const cands = polySegs(APT.main).concat(polySegs(APT.bathPoly), polySegs(landPoly));
    const S = (s, t) => eBath.at(s, t);
    [[S(-T, T), S(eBath.L + T, T)], [S(oBath.s, 0), S(oBath.s, T)], [S(oBath.s + oBath.w, 0), S(oBath.s + oBath.w, T)],
      [S(-T, 0), S(-T, T)], [S(eBath.L + T, 0), S(eBath.L + T, T)]].forEach((sg) => cands.push(sg));
    const out = [];
    cands.forEach(([a, b]) => {
      const L = dist(a, b), n = Math.max(1, Math.ceil(L / 0.25));
      const d = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], nn = [-d[1] * 0.05, d[0] * 0.05];
      let start = -1;
      for (let k = 0; k <= n; k++) {
        let keep = false;
        if (k < n) {
          const m = [a[0] + (b[0] - a[0]) * ((k + 0.5) / n), a[1] + (b[1] - a[1]) * ((k + 0.5) / n)];
          keep = freeExact([m[0] + nn[0], m[1] + nn[1]]) !== freeExact([m[0] - nn[0], m[1] - nn[1]]);
        }
        if (keep && start < 0) start = k;
        if (!keep && start >= 0) {
          out.push([[a[0] + (b[0] - a[0]) * (start / n), a[1] + (b[1] - a[1]) * (start / n)], [a[0] + (b[0] - a[0]) * (k / n), a[1] + (b[1] - a[1]) * (k / n)]]);
          start = -1;
        }
      }
    });
    return out.map((sg) => bbox(sg));
  })();
  const wallNear = { d: 0, x: 0, z: 0 };
  function wallDist(px, pz) {
    wallNear.d = Infinity;
    for (const o of wallLines) {
      if (px < o.x0 - wallNear.d || px > o.x1 + wallNear.d || pz < o.z0 - wallNear.d || pz > o.z1 + wallNear.d) continue;
      const q = closestOnSeg([px, pz], o.pl[0], o.pl[1]);
      const d = Math.hypot(px - q[0], pz - q[1]);
      if (d < wallNear.d) { wallNear.d = d; wallNear.x = q[0]; wallNear.z = q[1]; }
    }
    return wallNear;
  }
  // près des murs (< 60 cm), la distance de grille est remplacée par la distance exacte du centre de la cellule
  for (let k = 0; k < N; k++) {
    if (!wallG[k] || wallD[k] > 60) continue;
    const i = k % NX;
    wallD[k] = wallDist(X0 + (i + 0.5) * CELL, Z0 + ((k - i) / NX + 0.5) * CELL).d;
  }

  // distance exacte d'un point aux empreintes (meubles + éléments fixes) ; renvoie aussi le point le plus proche
  const near = { d: 0, x: 0, z: 0 };
  function objDist(px, pz, obst) {
    near.d = Infinity;
    for (const o of obst) {
      if (px < o.x0 - near.d || px > o.x1 + near.d || pz < o.z0 - near.d || pz > o.z1 + near.d) continue;
      const pl = o.pl;
      if (APT.pointInPoly([px, pz], pl)) { near.d = 0; near.x = px; near.z = pz; return near; }
      for (let i = 0; i < pl.length; i++) {
        const q = closestOnSeg([px, pz], pl[i], pl[(i + 1) % pl.length]);
        const d = Math.hypot(px - q[0], pz - q[1]);
        if (d < near.d) { near.d = d; near.x = q[0]; near.z = q[1]; }
      }
    }
    return near;
  }
  let fixedObst = APT.fixed.map((f) => bbox(f.poly));
  if (app.hooks.fixed) app.hooks.fixed.push(() => {
    rebuildFixedGrid();
    fixedObst = APT.fixed.map((f) => bbox(f.poly));
    lastGrid = null;
    if (passInput.checked) computePassages();
  });

  // superposition au sol : texture canvas (1 pixel = 1 cellule)
  const cvs = document.createElement('canvas');
  cvs.width = NX; cvs.height = NZ;
  const ctx = cvs.getContext('2d');
  const img = ctx.createImageData(NX, NZ);
  const tex = new THREE.CanvasTexture(cvs);
  tex.encoding = THREE.sRGBEncoding;
  const overlay = new THREE.Mesh(
    new THREE.PlaneGeometry(NX * CELL, NZ * CELL).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 })
  );
  overlay.position.set(X0 + (NX * CELL) / 2, 0.8, Z0 + (NZ * CELL) / 2);
  overlay.renderOrder = 3;
  passGroup.add(overlay);

  // débattements de portes (dessinés une fois, recolorés si un meuble empiète)
  const doors = [
    { name: "Porte d'entrée", hinge: eEntry.at(oEntry.s, 0), closed: eEntry.d, open: [-eEntry.n[0], -eEntry.n[1]], R: oEntry.w },
    { name: "Porte de la salle d'eau", hinge: eBath.at(oBath.s, 0), closed: eBath.d, open: [-eBath.n[0], -eBath.n[1]], R: oBath.w },
    (() => { const e = edgeInfo(APT.main, 2), o = APT.openings[2][0];
      return { name: 'Porte-fenêtre (cuisine)', hinge: e.at(o.s + o.w, 0), closed: [-e.d[0], -e.d[1]], open: [-e.n[0], -e.n[1]], R: o.w }; })(),
  ];
  doors.forEach((dr) => {
    const pts = [dr.hinge];
    for (let k = 0; k <= 12; k++) {
      const th = (k / 12) * (Math.PI / 2), c = Math.cos(th), s = Math.sin(th);
      pts.push([dr.hinge[0] + (dr.closed[0] * c + dr.open[0] * s) * dr.R, dr.hinge[1] + (dr.closed[1] * c + dr.open[1] * s) * dr.R]);
    }
    dr.sector = pts;
    dr.g = new THREE.Group();
    const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
    dr.fillMat = new THREE.MeshBasicMaterial({ color: 0x4f5b66, transparent: true, opacity: 0.1, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 });
    const fill = new THREE.Mesh(new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2), dr.fillMat);
    fill.position.y = 1;
    fill.renderOrder = 4;
    dr.g.add(fill);
    dr.lines = [];
    for (let k = 1; k < pts.length - 1; k++) dr.lines.push(seg(dr.g, pts[k], pts[k + 1], M.door, 1.2, 1.8));
    dr.lines.push(seg(dr.g, dr.hinge, pts[pts.length - 1], M.door, 1.2, 2.5)); // vantail ouvert
    passGroup.add(dr.g);
  });

  // ---- points d'accès
  const SEATS = new Set(['chair', 'gamingchair', 'pouf', 'pedestal']); // se déplacent à la main
  const ALL_SIDES = new Set(['chair', 'gamingchair', 'pouf', 'pedestal', 'table', 'coffeetable', 'plant']);
  const BEDS = new Set(['bed1', 'bed2', 'loftbed']);
  const REACH_TOL = 25; // cm : un passage doit passer à moins de 25 cm du point

  function accessPoints(it) {
    const a = (it.rot * Math.PI) / 180, f = [Math.sin(a), Math.cos(a)], r = [Math.cos(a), -Math.sin(a)];
    const P = (u, v) => [it.x + r[0] * u + f[0] * v, it.z + r[1] * u + f[1] * v]; // u = droite, v = avant
    const g = 35;
    if (BEDS.has(it.type)) {
      return it.d >= it.w
        ? [-1, 1].flatMap((sd) => [-0.25, 0, 0.25].map((k) => P(sd * (it.w / 2 + g), k * it.d)))
        : [-1, 1].flatMap((sd) => [-0.25, 0, 0.25].map((k) => P(k * it.w, sd * (it.d / 2 + g))));
    }
    if (ALL_SIDES.has(it.type)) return [P(0, it.d / 2 + g), P(0, -it.d / 2 - g), P(it.w / 2 + g, 0), P(-it.w / 2 - g, 0)];
    return [P(0, it.d / 2 + g)];
  }
  const KA = APT.kitchenAccess; // points devant l'évier, les plaques et le frigo (apartment.js)
  const baie = APT.openings[0][0], eBaie = edgeInfo(APT.main, 0);
  const FIXED_POINTS = [
    { name: 'Baie vitrée', pts: [0.15, 0.3, 0.5, 0.7, 0.85].map((k) => eBaie.at(baie.s + baie.w * k, -35)) },
    { name: "Salle d'eau", pts: [eBath.at(oBath.s + oBath.w / 2, T + 35)] },
    { name: 'Porte-fenêtre (cuisine)', pts: (() => { const o = APT.openings[2][0], e = edgeInfo(APT.main, 2); return [0.3, 0.5, 0.7].map((k) => e.at(o.s + o.w * k, -35)); })() },
    { name: 'Évier', pts: [KA.sink] },
    { name: 'Plaques', pts: [KA.hob] },
    { name: 'Frigo', pts: [KA.fridge] },
  ];

  let lastGrid = null;
  function computePassages() {
    const t0 = performance.now();
    const hw = passW / 2;
    const free = base.slice();
    const items = app.items.filter((it) => !(app.onWall && app.onWall(it))); // objets muraux : en hauteur, ne gênent pas le passage
    const polys = items.map((it) => app.poly(it));
    polys.forEach((pl) => raster(pl, (k) => (free[k] = 0)));

    // 1) cellules « dégagées » : une personne de largeur passW peut s'y tenir, son centre étant quelque part dans la cellule.
    //    La grille sert de premier tri (gC = distance au centre bloqué le plus proche, la vraie distance D vérifie
    //    gC − 5 ≤ D ≤ gC à peu de chose près) ; près du seuil, distance exacte aux empreintes des meubles et éléments
    //    fixes, et si le centre de la cellule est un peu trop près d'un objet, on essaie de décaler la personne
    //    à l'intérieur de sa cellule (au plus une demi-cellule) en s'éloignant de cet objet.
    //    Résultat : un couloir entre deux meubles de largeur ≥ passW est accessible, un couloir plus étroit ne l'est pas
    //    (à 0,01 cm près). Les murs aussi sont à distance exacte (wallDist) près du seuil, et la personne peut se
    //    décaler dans sa cellule en s'éloignant du mur et/ou de l'objet le plus proche (passage en biais, porte étroite).
    const g1 = new Float64Array(N);
    for (let k = 0; k < N; k++) g1[k] = free[k] ? INF : 0;
    edt(g1);
    const clear = new Uint8Array(N);
    const obst = polys.map(bbox).concat(fixedObst);
    const EPS = 0.01, H = CELL / 2;
    for (let k = 0; k < N; k++) {
      if (!free[k]) continue;
      const gC = Math.sqrt(g1[k]) * CELL;
      if (gC + H * Math.SQRT2 < hw - EPS || wallD[k] + H * Math.SQRT2 < hw - EPS) continue; // trop près, même en se décalant
      const i = k % NX, cx = X0 + (i + 0.5) * CELL, cz = Z0 + ((k - i) / NX + 0.5) * CELL;
      const dw = wallD[k];
      if (gC - CELL >= hw && dw >= hw - EPS) { clear[k] = 1; continue; } // largement dégagé
      const o = objDist(cx, cz, obst);
      const dObj = o.d;
      if (Math.min(dObj, dw) >= hw - EPS) { clear[k] = 1; continue; }
      if (dObj <= 0) continue; // centre dans un objet
      // décalage dans la cellule (au plus une demi-cellule par axe), en s'éloignant de l'objet, du mur, ou des deux
      const ox = (cx - o.x) / dObj, oz = (cz - o.z) / dObj;
      const w = wallDist(cx, cz);
      const wx = w.d > 0 ? (cx - w.x) / w.d : 0, wz = w.d > 0 ? (cz - w.z) / w.d : 0;
      const dirs = [];
      if (dObj < hw) dirs.push([ox, oz, hw - dObj]);
      if (w.d < hw) dirs.push([wx, wz, hw - w.d]);
      if (dObj < hw && w.d < hw) { // coincé entre les deux : direction moyenne, et décalages intermédiaires
        const mx = ox + wx, mz = oz + wz, ml = Math.hypot(mx, mz);
        if (ml > 1e-6) dirs.push([mx / ml, mz / ml, Math.max(hw - dObj, hw - w.d)]);
      }
      for (const [ux, uz, need] of dirs) {
        const lim = H / Math.max(Math.abs(ux), Math.abs(uz), 1e-9);
        let ok = false;
        for (const f of [1, 0.5, 0.25]) { // décalage nécessaire, puis plus court (l'autre contrainte peut se resserrer)
          const sh = Math.min(lim, need * f);
          const px2 = cx + ux * sh, pz2 = cz + uz * sh;
          if (wallDist(px2, pz2).d >= hw - EPS && objDist(px2, pz2, obst).d >= hw - EPS) { ok = true; break; }
        }
        if (ok) { clear[k] = 1; break; }
      }
    }

    // 2) remplissage depuis le palier de la porte d'entrée
    const reach = new Uint8Array(N), stack = new Int32Array(N);
    let sp = 0;
    for (let k = 0; k < N; k++) if (landing[k] && clear[k]) { reach[k] = 1; stack[sp++] = k; }
    while (sp) {
      const k = stack[--sp], i = k % NX;
      const nb = [i > 0 ? k - 1 : -1, i < NX - 1 ? k + 1 : -1, k - NX, k + NX];
      for (const m of nb) if (m >= 0 && m < N && clear[m] && !reach[m]) { reach[m] = 1; stack[sp++] = m; }
    }

    // 3) zone balayée par la personne = centres atteignables dilatés de hw
    const g2 = new Float64Array(N);
    for (let k = 0; k < N; k++) g2[k] = reach[k] ? 0 : INF;
    edt(g2);

    const px = img.data;
    for (let k = 0; k < N; k++) {
      const o = k * 4;
      if (!inRoom[k] || !free[k]) { px[o + 3] = 0; continue; }
      if (Math.sqrt(g2[k]) * CELL <= hw + CELL / 2) { px[o] = 52; px[o + 1] = 168; px[o + 2] = 92; px[o + 3] = 52; }
      else { px[o] = 240; px[o + 1] = 136; px[o + 2] = 28; px[o + 3] = 135; }
    }
    ctx.putImageData(img, 0, 0);
    tex.needsUpdate = true;
    lastGrid = { free, g2 };

    // accès aux points
    const okDirect = (p) => { const k = cellOf(p); return k >= 0 && inRoom[k] && free[k] && Math.sqrt(g2[k]) * CELL <= REACH_TOL; };
    // siège sur le point, ou juste à côté (< 25 cm) : on peut l'écarter pour atteindre le meuble
    const nearPoly = (p, pl) => APT.pointInPoly(p, pl) || pl.some((a, j) => dist(p, closestOnSeg(p, a, pl[(j + 1) % pl.length])) < 25);
    const seatAt = (p, self) => items.find((o, i) => o !== self && SEATS.has(o.type) && nearPoly(p, polys[i]));
    const seatOk = (s) => accessPoints(s).some(okDirect);
    const ok = (p, self) => { if (okDirect(p)) return true; const s = seatAt(p, self); return !!s && seatOk(s); }; // une chaise devant se pousse
    const rows = { acces: [], portes: [], meubles: [] };
    FIXED_POINTS.forEach((fp) => rows.acces.push({ ok: fp.pts.some((p) => ok(p)), text: fp.name }));
    doors.forEach((dr) => {
      const hit = items.filter((it, i) => APT.polyOverlap(polys[i], dr.sector, 0.5));
      dr.lines.forEach((l) => (l.material = hit.length ? M.doorBad : M.door));
      dr.fillMat.color.set(hit.length ? 0xc2402f : 0x4f5b66);
      dr.fillMat.opacity = hit.length ? 0.22 : 0.1;
      rows.portes.push({ ok: !hit.length, text: dr.name + (hit.length ? ' : gênée par ' + hit.map((h) => h.name).join(', ') : ' : débattement libre'), item: hit[0] });
    });
    const count = {}, idx = {};
    items.forEach((it) => (count[it.name] = (count[it.name] || 0) + 1));
    items.forEach((it, i) => {
      idx[it.name] = (idx[it.name] || 0) + 1;
      const label = it.name + (count[it.name] > 1 ? ' ' + idx[it.name] : '');
      // objet posé sur un autre meuble (lampe de bureau...) : pas d'accès propre à vérifier
      if (polys.some((pl, j) => j !== i && APT.pointInPoly([it.x, it.z], pl) && items[j].w * items[j].d > it.w * it.d)) return;
      rows.meubles.push({ ok: accessPoints(it).some((p) => ok(p, it)), text: label, item: it, bed: BEDS.has(it.type) });
    });
    renderPanel(rows);
    passGroup.userData.ms = performance.now() - t0;
    if (app.invalidate) app.invalidate(); // rendu à la demande : afficher les nouvelles zones même après un changement par code
  }

  // ---- panneau
  const panel = document.createElement('div');
  panel.id = 'pass-panel';
  panel.className = 'bubble';
  panel.hidden = true;
  panel.innerHTML = `
    <div class="pp-head"><strong>Passages</strong>
      <label>largeur <select id="pass-w" aria-label="Largeur de passage">
        <option value="50">50 cm</option><option value="60" selected>60 cm</option><option value="70">70 cm</option><option value="80">80 cm</option>
      </select></label></div>
    <div class="pp-leg"><span><i class="sw" style="background:rgba(52,168,92,.45)"></i>accessible</span><span><i class="sw" style="background:rgba(240,136,28,.75)"></i>trop étroit / isolé</span></div>
    <div id="pass-rows"></div>`;
  view.appendChild(panel);
  const passRows = panel.querySelector('#pass-rows');
  panel.querySelector('#pass-w').onchange = (e) => { passW = +e.target.value; computePassages(); };

  function renderPanel(rows) {
    passRows.innerHTML = '';
    const section = (title, list, tip) => {
      if (!list.length) return;
      const h = document.createElement('h5');
      h.textContent = title;
      if (tip) h.title = tip;
      const ul = document.createElement('ul');
      list.forEach((r) => {
        const li = document.createElement('li');
        li.className = (r.ok ? 'ok' : 'ko') + (r.item ? ' click' : '');
        const b = document.createElement('b');
        b.textContent = r.ok ? '✓' : '✗';
        const sp = document.createElement('span');
        sp.textContent = r.text;
        li.append(b, sp);
        if (r.bed) { const sm = document.createElement('small'); sm.textContent = r.ok ? '' : '(côté long)'; li.append(sm); }
        if (r.item) { li.title = 'Sélectionner ce meuble'; li.onclick = () => app.select(r.item); }
        ul.appendChild(li);
      });
      passRows.append(h, ul);
    };
    section('Accès depuis l\'entrée', rows.acces);
    section('Portes', rows.portes);
    section('Meubles (accès à l\'avant)', rows.meubles, 'Point à ~35 cm devant le meuble ; côté long pour un lit ; tous les côtés pour chaises et tables');
  }

  let passTimer = 0;
  function schedulePassages() {
    if (!passInput.checked) return;
    clearTimeout(passTimer);
    passTimer = setTimeout(computePassages, 150);
  }
  passInput.onchange = () => {
    applyVisibility();
    if (passInput.checked) computePassages();
  };

  // ================================================================== liaison avec l'application
  let walking = false;
  function applyVisibility() {
    measGroup.visible = !walking;
    prevGroup.visible = toolOn && !walking;
    passGroup.visible = passInput.checked && !walking;
    panel.hidden = !(passInput.checked && !walking);
    btnTool.disabled = walking;
  }

  hooks.change.push(() => { updateCotes(); schedulePassages(); });
  hooks.frame.push(() => {
    const w = app.isWalking();
    if (w !== walking) {
      walking = w;
      if (w) setTool(false);
      applyVisibility();
      updateCotes();
    }
    fitWidths(measGroup); fitWidths(prevGroup); fitWidths(coteGroup); fitWidths(passGroup);
    placeLabels();
  });

  updateCotes();
  applyVisibility();
  window.__measure = { setTool, computePassages, setPassWidth: (w) => { passW = w; panel.querySelector('#pass-w').value = String(w); computePassages(); }, grid: () => lastGrid, snapPoint };
})();
