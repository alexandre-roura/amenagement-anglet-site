/*
 * Placement assisté : aimant aux murs (y compris le mur en biais), calage dans les coins,
 * alignement / accolement entre meubles avec lignes guides, bouton « Coller au mur ».
 * S'appuie sur window.APT (apartment.js) et window.__app (app.js : hooks.drag, isInvalid, poly...).
 * Repère : x vers la droite, z vers le sud, cm. Rotation : avant d'un meuble = +z local.
 */
(function () {
  const app = window.__app;
  if (!app || !window.THREE || !window.APT || !window.FURN) { console.warn('snap.js : application introuvable'); return; }
  const { scene, renderer, hooks } = app;

  const WALL_SNAP = 15; // cm : distance d'attraction des murs / éléments fixes
  const ALIGN_SNAP = 6; // cm : distance d'alignement entre meubles
  const NEAR = 150; // cm : un meuble n'est pris comme repère d'alignement que s'il est à moins de 150 cm
  const INSET_DRAG = 0.2; // cm : jeu laissé contre un mur pendant le glisser (un point exactement sur le mur est jugé « dehors »)
  const INSET_BTN = 0.5; // cm : jeu laissé par le bouton « Coller au mur »
  const MIN_SOLID = 20; // cm de mur plein (hors portes / baies) nécessaires pour s'y coller
  const CORNER_MAX = 10; // cm : « Coller au mur » ne cale dans un coin que s'il est à moins de 10 cm le long du mur

  // ------------------------------------------------------------------ styles + interface
  const css = document.createElement('style');
  css.textContent = `
    #snap-slot { flex:none; }
    #sel-snap { margin-top:8px; }
    #sel-snap button { width:100%; }
    #sel-snap[hidden] { display:none; }`;
  document.head.appendChild(css);

  // écran tactile : pas de touches Maj / Alt / Ctrl+Z, les aides le disent autrement
  const touch = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
  const slot = document.getElementById('snap-slot');
  let wallsInput = null;
  if (slot) {
    const tip = 'Pendant le glisser : colle les meubles aux murs (et en prend l’angle), cale dans les coins et aligne sur les meubles voisins. ' +
      (touch ? 'Décoche pour placer un meuble librement.' : 'Maintenir Maj (ou Alt) pendant le glisser pour désactiver momentanément.');
    slot.innerHTML = `<label class="switch" title="${tip}"><input type="checkbox" id="snap-walls" checked> Aimant aux murs</label>`;
    wallsInput = slot.querySelector('#snap-walls');
    const viewOnly = !!(window.SCEN && SCEN.viewOnly); // mode visite : rien n'est lu ni écrit dans le navigateur
    if (!viewOnly) {
      try { if (localStorage.getItem('snapWalls') === '0') wallsInput.checked = false; } catch (e) { /* stockage indisponible */ }
      wallsInput.addEventListener('change', () => { try { localStorage.setItem('snapWalls', wallsInput.checked ? '1' : '0'); } catch (e) { /* idem */ } });
    }
  }
  const enabled = () => !wallsInput || wallsInput.checked;

  const extra = document.getElementById('sel-extra');
  let selBox = null, btnWall = null;
  if (extra) {
    selBox = document.createElement('div');
    selBox.id = 'sel-snap';
    selBox.hidden = true;
    selBox.innerHTML = `<button id="btn-snapwall" title="Colle le meuble au mur le plus proche en gardant son sens (dos au mur s'il a un dos et y faisait face) — ${touch ? 'bouton ↶ Annuler' : 'Ctrl+Z'} pour annuler">⇥ Coller au mur</button>`;
    extra.appendChild(selBox);
    btnWall = selBox.querySelector('#btn-snapwall');
  }

  // ------------------------------------------------------------------ géométrie
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
  const onTop = (it) => !!(FURN.byId[it.type] && FURN.byId[it.type].onTop);
  const axes = (rotDeg) => {
    const a = (rotDeg * Math.PI) / 180;
    return { r: [Math.cos(a), -Math.sin(a)], f: [Math.sin(a), Math.cos(a)] }; // droite (+x local), avant (+z local)
  };
  // demi-étendue d'un rectangle w x d (rotation rot) dans la direction unitaire k
  const halfExt = (it, rot, k) => { const { r, f } = axes(rot); return (Math.abs(dot(k, r)) * it.w) / 2 + (Math.abs(dot(k, f)) * it.d) / 2; };

  // segments d'appui : murs (normale vers l'intérieur de la pièce) et éléments fixes (normale vers l'extérieur)
  function makeSegs(poly, room, kind) {
    return poly.map((a, i) => {
      const b = poly[(i + 1) % poly.length];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const d = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
      let n = [-d[1], d[0]];
      const mid = [(a[0] + b[0]) / 2 + n[0] * 2, (a[1] + b[1]) / 2 + n[1] * 2];
      const inside = APT.pointInPoly(mid, poly);
      if ((kind === 'wall') !== inside) n = [-n[0], -n[1]];
      return { a, b, L, d, n, room, kind, holes: [] };
    });
  }
  const mainSegs = makeSegs(APT.main, 'main', 'wall');
  const bathSegs = makeSegs(APT.bathPoly, 'bath', 'wall');
  const fixedSegs = [];
  APT.fixed.forEach((f) => fixedSegs.push(...makeSegs(f.poly, null, 'fixed')));
  // faces des éléments fixes pleine hauteur (bourrelet, colonne du chauffe-eau) : murs pour les objets muraux
  const tallSegs = [];
  const buildTall = () => { tallSegs.length = 0; APT.fixed.filter((f) => f.kind === 'pillar' || f.kind === 'column').forEach((f) => tallSegs.push(...makeSegs(f.poly, null, 'fixed'))); };
  buildTall();
  // cuisine / salle d'eau réglées depuis l'interface : recalculer les bords des éléments fixes
  if (app.hooks.fixed) app.hooks.fixed.push(() => { fixedSegs.length = 0; APT.fixed.forEach((f) => fixedSegs.push(...makeSegs(f.poly, null, 'fixed'))); buildTall(); });

  // ouvertures (portes, baie, porte-fenêtre) reportées sur tous les segments colinéaires (mur partagé avec la salle d'eau)
  Object.keys(APT.openings).forEach((k) => {
    const e = mainSegs[+k];
    APT.openings[k].forEach((o) => {
      const p0 = [e.a[0] + e.d[0] * o.s, e.a[1] + e.d[1] * o.s], p1 = [e.a[0] + e.d[0] * (o.s + o.w), e.a[1] + e.d[1] * (o.s + o.w)];
      mainSegs.concat(bathSegs).forEach((s) => {
        const off = (p) => Math.abs(dot([p[0] - s.a[0], p[1] - s.a[1]], [-s.d[1], s.d[0]]));
        if (off(p0) > 1 || off(p1) > 1) return;
        const u0 = dot([p0[0] - s.a[0], p0[1] - s.a[1]], s.d), u1 = dot([p1[0] - s.a[0], p1[1] - s.a[1]], s.d);
        s.holes.push([Math.min(u0, u1), Math.max(u0, u1)]);
      });
    });
  });

  // longueur de mur plein (segment moins ouvertures) recouverte par l'intervalle [s0, s1] le long du segment
  function solidOverlap(seg, s0, s1) {
    const lo = Math.max(0, s0), hi = Math.min(seg.L, s1);
    if (hi <= lo) return 0;
    let len = hi - lo;
    seg.holes.forEach(([h0, h1]) => { len -= Math.max(0, Math.min(hi, h1) - Math.max(lo, h0)); });
    return len;
  }

  function supportSegs(it) {
    const inBath = APT.pointInPoly([it.x, it.z], APT.bathPoly);
    return (inBath ? bathSegs : mainSegs).concat(fixedSegs);
  }

  // rotation alignée sur le segment la plus proche de rot0 (dos au segment quand le meuble était à peu près dans ce sens)
  function alignedRot(seg, rot0) {
    const aw = (Math.atan2(seg.n[0], seg.n[1]) * 180) / Math.PI; // avant du meuble = normale du mur
    let delta = (((aw - rot0) % 90) + 90) % 90;
    if (delta > 45) delta -= 90;
    if (Math.abs(delta) < 0.05) return rot0;
    return Math.round((rot0 + delta) * 100) / 100;
  }

  // distance signée du centre au segment (le long de sa normale) et position le long du segment
  const local = (seg, x, z) => { const v = [x - seg.a[0], z - seg.a[1]]; return { s: dot(v, seg.d), t: dot(v, seg.n) }; };

  // ------------------------------------------------------------------ aimant aux murs
  // renvoie une liste de propositions { x, z, rot, segs } (de la meilleure à la moins bonne)
  function wallCandidates(it, x, z, rot0, segs, inset) {
    const INSET = inset == null ? INSET_DRAG : inset;
    const out = [];
    segs.forEach((seg) => {
      const rot = alignedRot(seg, rot0);
      const hn = halfExt(it, rot, seg.n), hs = halfExt(it, rot, seg.d);
      const { s, t } = local(seg, x, z);
      if (t <= 0) return; // centre derrière le mur
      const gap = t - hn;
      if (gap > WALL_SNAP || gap < -WALL_SNAP) return;
      if (solidOverlap(seg, s - hs, s + hs) < Math.min(MIN_SOLID, hs * 2 - 1)) return; // devant une porte / la baie, ou au-delà du mur
      const k = hn + INSET - t;
      out.push({ x: x + seg.n[0] * k, z: z + seg.n[1] * k, rot, segs: [seg], score: Math.abs(gap) + (seg.kind === 'fixed' ? 0.5 : 0) });
    });
    out.sort((a, b) => a.score - b.score);
    // coins : second appui non parallèle, déplacement le long du premier mur
    const withCorners = [];
    out.forEach((c) => {
      const s1 = c.segs[0];
      let best = null;
      segs.forEach((seg) => {
        if (seg === s1) return;
        const cos = dot(s1.d, seg.n);
        if (Math.abs(cos) < 0.3) return; // parallèle
        const hn = halfExt(it, c.rot, seg.n), hs = halfExt(it, c.rot, seg.d);
        const { s, t } = local(seg, c.x, c.z);
        if (t <= 0) return;
        const gap = t - hn;
        if (gap > WALL_SNAP || gap < -WALL_SNAP) return;
        if (solidOverlap(seg, s - hs, s + hs) <= 0.5 && Math.abs(gap) > 1) return; // pas en face de ce second appui
        const shift = (hn + INSET - t) / cos;
        if (Math.abs(shift) > WALL_SNAP / Math.abs(cos) + 1) return;
        if (!best || Math.abs(gap) < best.g) best = { g: Math.abs(gap), seg, shift };
      });
      if (best) withCorners.push({ x: c.x + s1.d[0] * best.shift, z: c.z + s1.d[1] * best.shift, rot: c.rot, segs: [s1, best.seg], score: c.score - 1 });
      withCorners.push(c);
    });
    return withCorners;
  }

  // ------------------------------------------------------------------ alignement entre meubles
  function alignTo(it, lockU, lockV) {
    const { r, f } = axes(it.rot);
    const cu = it.x * r[0] + it.z * r[1], cv = it.x * f[0] + it.z * f[1];
    const own = { u: [cu - it.w / 2, cu, cu + it.w / 2], v: [cv - it.d / 2, cv, cv + it.d / 2] };
    const best = { u: null, v: null };
    app.items.forEach((o) => {
      if (o === it || onTop(o)) return;
      const dr = ((((o.rot - it.rot) % 90) + 90) % 90);
      if (dr > 0.5 && dr < 89.5) return; // pas dans le même axe
      let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
      app.poly(o).forEach((p) => {
        const pu = dot(p, r), pv = dot(p, f);
        u0 = Math.min(u0, pu); u1 = Math.max(u1, pu); v0 = Math.min(v0, pv); v1 = Math.max(v1, pv);
      });
      const oth = { u: [u0, (u0 + u1) / 2, u1], v: [v0, (v0 + v1) / 2, v1] };
      const gapU = Math.max(u0 - own.u[2], own.u[0] - u1), gapV = Math.max(v0 - own.v[2], own.v[0] - v1);
      [['u', gapV], ['v', gapU]].forEach(([ax, perpGap]) => {
        if (perpGap > NEAR || (ax === 'u' ? lockU : lockV)) return;
        // bord à bord (même bord ou bords opposés = accolés), centre à centre
        const pairs = [[0, 0], [2, 2], [0, 2], [2, 0], [1, 1]];
        pairs.forEach(([i, j]) => {
          const sh = oth[ax][j] - own[ax][i];
          const score = Math.abs(sh) + (i === 1 ? 0.3 : 0);
          if (Math.abs(sh) <= ALIGN_SNAP && (!best[ax] || score < best[ax].score)) best[ax] = { sh, score, line: oth[ax][j], o, oth };
        });
      });
    });
    return { r, f, own, best };
  }

  // ------------------------------------------------------------------ lignes guides
  const guideMat = new THREE.LineBasicMaterial({ color: 0x2a6fdb, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false, toneMapped: false });
  const wallMat = new THREE.LineBasicMaterial({ color: 0x1f5f5b, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false, toneMapped: false });
  const MAXV = 64;
  function makeLines(m) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAXV * 3), 3));
    g.setDrawRange(0, 0);
    const l = new THREE.LineSegments(g, m);
    l.renderOrder = 30;
    l.frustumCulled = false;
    l.visible = false;
    scene.add(l);
    return l;
  }
  const guideLines = makeLines(guideMat), wallLines = makeLines(wallMat);
  function setLines(l, segs) {
    const arr = l.geometry.attributes.position.array;
    let n = 0;
    segs.slice(0, MAXV / 2).forEach(([p, q]) => {
      arr[n * 3] = p[0]; arr[n * 3 + 1] = 2; arr[n * 3 + 2] = p[1]; n++;
      arr[n * 3] = q[0]; arr[n * 3 + 1] = 2; arr[n * 3 + 2] = q[1]; n++;
    });
    l.geometry.setDrawRange(0, n);
    l.geometry.attributes.position.needsUpdate = true;
    l.visible = n > 0;
  }
  function clearGuides() { setLines(guideLines, []); setLines(wallLines, []); }

  // ------------------------------------------------------------------ glisser
  let altDown = false;
  let session = null; // { it, rot0 } : rotation au début du glisser (on y revient en quittant un mur)
  renderer.domElement.addEventListener('pointerdown', (e) => { altDown = e.altKey || e.shiftKey; session = null; }, true);
  renderer.domElement.addEventListener('pointermove', (e) => { altDown = e.altKey || e.shiftKey; }, true);
  window.addEventListener('keydown', (e) => { if (e.key === 'Alt' || e.key === 'Shift') { altDown = true; if (session) e.preventDefault(); } });
  window.addEventListener('keyup', (e) => { if (e.key === 'Alt' || e.key === 'Shift') { altDown = false; if (session) e.preventDefault(); } });
  window.addEventListener('blur', () => { altDown = false; });
  const endDrag = () => { session = null; clearGuides(); };
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);

  const blocked = () => app.readOnly || app.tool || (app.isWalking && app.isWalking());

  // session.rot0 : rotation « voulue » (celle du début du glisser, ou celle donnée pendant le glisser avec R / les boutons) ;
  // session.last : rotation laissée par l'aimant à l'image précédente (si it.rot en diffère, l'utilisateur a tourné le meuble)
  function snapDrag(it) {
    if (!session || session.it !== it) session = { it, rot0: it.rot, last: it.rot };
    else if (Math.abs(it.rot - session.last) > 1e-6) session.rot0 = it.rot;
    try { snapDragStep(it); } finally { session.last = it.rot; }
  }
  function snapDragStep(it) {
    const x0 = it.x, z0 = it.z, rot0 = session.rot0;
    it.rot = rot0;
    // un objet mural reste collé au mur même si « Aimant aux murs » est décoché (Maj / Alt pour le décoller)
    if (blocked() || (!enabled() && !isWallItem(it)) || altDown || onTop(it)) { clearGuides(); return; }

    // 1) murs et éléments fixes
    let wallSegsUsed = [];
    const cands = wallCandidates(it, x0, z0, rot0, supportSegs(it));
    for (const c of cands.slice(0, 8)) {
      it.x = c.x; it.z = c.z; it.rot = c.rot;
      if (!app.isInvalid(it)) { wallSegsUsed = c.segs; break; }
    }
    if (!wallSegsUsed.length) { it.x = x0; it.z = z0; it.rot = rot0; }

    // 2) alignement sur les meubles voisins (axes non bloqués par un mur)
    let lockU = false, lockV = false;
    const { r } = axes(it.rot);
    wallSegsUsed.forEach((s) => { if (Math.abs(dot(s.n, r)) > 0.7) lockU = true; else lockV = true; });
    const guides = [];
    if (!(lockU && lockV)) {
      const al = alignTo(it, lockU, lockV);
      const bx = it.x, bz = it.z;
      const tries = [['u', 'v'], ['u'], ['v']].filter((t) => t.every((ax) => al.best[ax]));
      for (const t of tries) {
        it.x = bx; it.z = bz;
        t.forEach((ax) => {
          const k = ax === 'u' ? al.r : al.f;
          it.x += k[0] * al.best[ax].sh; it.z += k[1] * al.best[ax].sh;
        });
        if (!app.isInvalid(it)) {
          t.forEach((ax) => {
            const b = al.best[ax], other = ax === 'u' ? 'v' : 'u';
            const ownO = al.own[other], oo = b.oth[other];
            const shO = t.indexOf(other) >= 0 ? al.best[other].sh : 0; // décalage éventuel sur l'autre axe
            const lo = Math.min(ownO[0] + shO, oo[0]) - 10, hi = Math.max(ownO[2] + shO, oo[2]) + 10;
            const k = ax === 'u' ? al.r : al.f, kp = ax === 'u' ? al.f : al.r;
            const P = (a, b2) => [k[0] * a + kp[0] * b2, k[1] * a + kp[1] * b2];
            guides.push([P(b.line, lo), P(b.line, hi)]);
          });
          break;
        }
        it.x = bx; it.z = bz;
      }
    }
    setLines(guideLines, guides);

    // repère du mur touché : trait le long de la face collée
    setLines(wallLines, wallSegsUsed.map((seg) => {
      const hs = halfExt(it, it.rot, seg.d), { s } = local(seg, it.x, it.z);
      const s0 = Math.max(0, s - hs - 15), s1 = Math.min(seg.L, s + hs + 15);
      return [[seg.a[0] + seg.d[0] * s0, seg.a[1] + seg.d[1] * s0], [seg.a[0] + seg.d[0] * s1, seg.a[1] + seg.d[1] * s1]];
    }));
  }
  hooks.drag.push(snapDrag);

  // ------------------------------------------------------------------ bouton « Coller au mur »
  // Choix du mur : le plus proche du meuble tel qu'il est posé (distance de son empreinte actuelle aux parties pleines
  // des murs, hors portes et baies, + 0,5 cm par degré de rotation nécessaire pour départager un coin). Rotation : parmi les 4 rotations alignées sur ce mur, celle qui garde le même sens
  // d'empreinte que maintenant (un lit posé en long reste en long) ; si le meuble a un dos (HAS_BACK) et présente sa face
  // avant ou son dos au mur, il est mis dos au mur. Position : la plus proche de l'actuelle le long du mur, à INSET_BTN du
  // mur, sans chevauchement ; calage dans le coin voisin (autre mur, à moins de CORNER_MAX) si possible. Si rien ne rentre, essai sur les murs suivants, puis avec l'autre sens.
  const angDiff = (a, b) => { const d = ((((a - b) % 360) + 540) % 360) - 180; return Math.abs(d); };
  const norm360 = (a) => Math.round((((a % 360) + 360) % 360) * 100) / 100;
  function segDist(p, q, a, b) {
    // distance entre deux segments [p,q] et [a,b] (0 s'ils se croisent)
    const cr = (o, u, v) => (u[0] - o[0]) * (v[1] - o[1]) - (u[1] - o[1]) * (v[0] - o[0]);
    const d1 = cr(a, b, p), d2 = cr(a, b, q), d3 = cr(p, q, a), d4 = cr(p, q, b);
    if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return 0;
    const pd = (c, u, v) => {
      const dx = v[0] - u[0], dz = v[1] - u[1], L2 = dx * dx + dz * dz;
      const t = L2 ? Math.max(0, Math.min(1, ((c[0] - u[0]) * dx + (c[1] - u[1]) * dz) / L2)) : 0;
      return Math.hypot(c[0] - u[0] - dx * t, c[1] - u[1] - dz * t);
    };
    return Math.min(pd(p, a, b), pd(q, a, b), pd(a, p, q), pd(b, p, q));
  }
  // parties pleines d'un segment de mur (entre les ouvertures), en abscisses [s0, s1]
  function solidPieces(seg) {
    const out = [];
    let s0 = 0;
    seg.holes.slice().sort((h, g) => h[0] - g[0]).forEach(([h0, h1]) => {
      if (h0 > s0 + 0.5) out.push([s0, Math.min(h0, seg.L)]);
      s0 = Math.max(s0, h1);
    });
    if (seg.L > s0 + 0.5) out.push([s0, seg.L]);
    return out;
  }
  const at = (seg, s) => [seg.a[0] + seg.d[0] * s, seg.a[1] + seg.d[1] * s];

  // meubles qui ont un dos (rangements, lits (tête), canapé, bureaux, meuble TV…) : ceux-là sont mis dos au mur.
  // Les autres (tables, chaises, tabourets, fauteuil, pouf, plante…) gardent la rotation alignée la plus proche
  // (une chaise tournée vers le mur reste tournée vers le mur).
  const HAS_BACK = new Set(['wardrobe', 'bookshelf', 'dresser', 'nightstand', 'bed1', 'bed2', 'loftbed', 'sofa', 'deskpc', 'desk',
    'kallax', 'kallaxmanga', 'column', 'shoebench', 'tvstand', 'mirror', 'fridge170', 'customshelf']);
  const isWallItem = (it) => !!(FURN.byId[it.type] && FURN.byId[it.type].wall); // drapeau, sabres… : toujours dos au mur
  const hasBack = (it) => HAS_BACK.has(it.type) || isWallItem(it);
  // rotation préférée contre ce mur : même sens d'empreinte que rot0 ; dos au mur si le meuble a un dos et que son avant
  // ou son dos fait face au mur
  function wallRots(it, seg, rot0) {
    const back = norm360((Math.atan2(seg.n[0], seg.n[1]) * 180) / Math.PI); // avant du meuble = vers la pièce
    if (isWallItem(it)) return { main: back, alt: null }; // objet mural : toujours à plat, dos au mur
    let r = norm360(alignedRot(seg, rot0));
    let other;
    if (hasBack(it)) {
      if (angDiff(r, back + 180) < 1) r = back; // face au mur -> dos au mur
      other = angDiff(r, back) < 1 || angDiff(r, back + 180) < 1 ? norm360(back + 90) : back; // autre sens d'empreinte
    } else {
      // autre sens d'empreinte : le quart de tour le plus proche de la rotation actuelle
      const a = norm360(r + 90), b = norm360(r - 90);
      other = angDiff(a, rot0) <= angDiff(b, rot0) ? a : b;
    }
    return { main: r, alt: angDiff(other, r) < 1 ? null : other };
  }

  function tryWall(it, seg, rot, x0, z0, segsAll) {
    const hn = halfExt(it, rot, seg.n), hs = halfExt(it, rot, seg.d);
    const sCur = local(seg, x0, z0).s;
    // positions candidates le long du mur : autour de la position actuelle (pas de 5 cm), plus les positions « à touche »
    // contre les ouvertures et contre les meubles / éléments fixes voisins (pour ne pas rater une place juste à la taille)
    const cand = [];
    for (let k = -100; k <= 100; k++) cand.push(sCur + k * 5);
    const g = INSET_BTN;
    seg.holes.forEach(([h0, h1]) => cand.push(h0 - hs, h1 + hs));
    cand.push(hs, seg.L - hs);
    const band = (pts) => pts.some((p) => { const t = local(seg, p[0], p[1]).t; return t > -1 && t < 2 * hn + 5; });
    const obst = app.items.filter((o) => o !== it && !onTop(o)).map((o) => app.poly(o)).concat(APT.fixed.map((f) => f.poly));
    obst.forEach((pl) => {
      if (!band(pl)) return;
      let u0 = Infinity, u1 = -Infinity;
      pl.forEach((p) => { const s = local(seg, p[0], p[1]).s; u0 = Math.min(u0, s); u1 = Math.max(u1, s); });
      cand.push(u0 - hs - g, u1 + hs + g);
    });
    const uniq = [...new Set(cand.map((s) => Math.round(s * 100) / 100))].sort((a, b) => Math.abs(a - sCur) - Math.abs(b - sCur));
    // 1er passage : entièrement contre du mur plein ; 2e passage : devant une ouverture toléré en partie (≥ 20 cm de plein)
    for (const strict of [true, false]) {
      const need = strict ? hs * 2 - 1 : Math.min(MIN_SOLID, hs * 2 - 1);
      for (const s of uniq) {
        if (strict && (s < hs - 0.01 || s > seg.L - hs + 0.01)) continue;
        if (solidOverlap(seg, s - hs, s + hs) < need) continue;
        const px = seg.a[0] + seg.d[0] * s + seg.n[0] * (hn + g), pz = seg.a[1] + seg.d[1] * s + seg.n[1] * (hn + g);
        it.x = px; it.z = pz; it.rot = rot;
        if (app.isInvalid(it)) continue;
        // coin proche : on s'y cale si c'est possible, contre un autre MUR seulement (pas contre un radiateur ou un
        // élément fixe) et sans trop s'éloigner de la position actuelle le long du mur
        const corner = wallCandidates(it, px, pz, rot, segsAll, g).find((c) => c.segs.length === 2 && c.segs[0] === seg &&
          c.segs[1].kind === 'wall' && Math.abs(local(seg, c.x, c.z).s - sCur) <= CORNER_MAX);
        if (corner) {
          it.x = corner.x; it.z = corner.z;
          if (app.isInvalid(it)) { it.x = px; it.z = pz; }
        }
        return true;
      }
    }
    return false;
  }

  function snapToWall(it) {
    if (!it || blocked() || onTop(it)) return false;
    const x0 = it.x, z0 = it.z, rot0 = it.rot;
    const inBath = APT.pointInPoly([x0, z0], APT.bathPoly);
    // objet mural : les faces du bourrelet (et des colonnes pleine hauteur) sont des murs comme les autres
    const room = (inBath ? bathSegs : mainSegs).concat(isWallItem(it) ? tallSegs : []);
    const cur = app.poly(it);
    const walls = room
      .map((seg) => {
        if (local(seg, x0, z0).t <= 0) return null; // centre derrière ce mur
        let dist = Infinity;
        solidPieces(seg).forEach(([s0, s1]) => {
          if (s1 - s0 < MIN_SOLID) return;
          const a = at(seg, s0), b = at(seg, s1);
          cur.forEach((p, i) => { dist = Math.min(dist, segDist(p, cur[(i + 1) % cur.length], a, b)); });
        });
        // à distance égale (meuble dans un coin), on préfère le mur qui demande le moins de rotation (0,5 cm par degré)
        return isFinite(dist) ? { seg, dist, score: dist + 0.5 * angDiff(alignedRot(seg, rot0), rot0) } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.score - b.score)
      .slice(0, 5);
    const segsAll = room.concat(fixedSegs);
    // d'abord le sens actuel sur chaque mur (du plus proche au plus loin), puis l'autre sens
    for (const which of ['main', 'alt']) for (const { seg } of walls) {
      const rot = wallRots(it, seg, rot0)[which];
      if (rot == null) continue;
      if (tryWall(it, seg, rot, x0, z0, segsAll)) {
        app.sync(it);
        app.refreshStates();
        return true;
      }
    }
    it.x = x0; it.z = z0; it.rot = rot0;
    if (window.SCEN && SCEN.toast) SCEN.toast('Pas de place libre contre un mur proche pour ce meuble.');
    return false;
  }
  if (btnWall) btnWall.onclick = () => snapToWall(app.getSelected());

  function updatePanel() {
    if (!selBox) return;
    const it = app.getSelected();
    selBox.hidden = !it || app.readOnly || onTop(it);
    if (btnWall) btnWall.disabled = !!(app.isWalking && app.isWalking());
  }
  hooks.change.push(updatePanel);
  let walking = false;
  hooks.frame.push(() => {
    const w = !!(app.isWalking && app.isWalking());
    if (w !== walking) { walking = w; updatePanel(); if (w) clearGuides(); }
  });
  updatePanel();

  window.__snap = { snapToWall, snapDrag, segs: { main: mainSegs, bath: bathSegs, fixed: fixedSegs } };
})();
