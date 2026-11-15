/*
 * Éclairage : moment de la journée, points lumineux du plafond (style, puissance, couleur),
 * et lampes posées par l'utilisateur (lampadaire, lampe de bureau, de chevet).
 * - Le réglage de chaque lampe (allumée, puissance, température) est enregistré avec le scénario (item.light).
 * - L'ambiance (moment + plafond) est commune à tous les scénarios, gardée dans le navigateur.
 */
(function () {
  const A = window.__app;
  if (!A) return;
  const $ = (id) => document.getElementById(id);
  const KEY = 'amenagement-anglet-ambiance';
  const H = APT.H;

  // ------------------------------------------------------------------ couleur d'une température (K) -> RGB
  function kelvin(k) {
    const t = k / 100;
    let r, g, b;
    if (t <= 66) {
      r = 255;
      g = 99.4708025861 * Math.log(t) - 161.1195681661;
      b = t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
    } else {
      r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
      g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
      b = 255;
    }
    const c = (v) => Math.max(0, Math.min(255, v)) / 255;
    return new THREE.Color(c(r), c(g), c(b));
  }
  // ampoule connectée : mode "white" (température) ou "color" (teinte libre)
  const lightColor = (mode, k, c) => (mode === 'color' && c ? new THREE.Color(c) : kelvin(k));
  const SWATCHES = ['#ff3b30', '#ff9500', '#ffd60a', '#34c759', '#32d3e6', '#2f6bff', '#8e5cf7', '#ff4fa3'];
  const kLabel = (k) => `${k} K · ` + (k < 2800 ? 'blanc chaud' : k < 3600 ? 'blanc doux' : k < 4800 ? 'blanc neutre' : 'blanc froid');

  // ------------------------------------------------------------------ ambiance
  const MOMENTS = {
    jour: { sun: 1, hemi: 1, env: 1, bg: 0xe4e9ee },
    soir: { sun: 0.5, hemi: 0.5, env: 0.45, bg: 0xb59a8a, sunColor: 0xff9550 },
    nuit: { sun: 0, hemi: 0.1, env: 0.08, bg: 0x111827 },
  };
  const AMB_DEFAULT = { moment: 'jour', ceilOn: true, ceilP: 60, ceilK: 2700, ceilStyle: 'globe', ceilMode: 'white', ceilColor: '#ff9500' };
  const CEIL_STYLES = ['bulb', 'globe', 'pendant', 'flush'];
  const GLOBE_Y = 28; // centre de la boule papier sous le plafond (cm) : elle pend de 44 cm en tout
  // ambiance validée : chaque champ invalide reprend la valeur par défaut (fichier importé, stockage ancien ou abîmé)
  function checkAmb(o) {
    const a = Object.assign({}, AMB_DEFAULT);
    if (!o || typeof o !== 'object' || Array.isArray(o)) return a;
    const n = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : NaN);
    if (typeof o.moment === 'string' && Object.prototype.hasOwnProperty.call(MOMENTS, o.moment)) a.moment = o.moment;
    if (typeof o.ceilOn === 'boolean') a.ceilOn = o.ceilOn;
    if (!isNaN(n(o.ceilP))) a.ceilP = Math.round(Math.min(100, Math.max(0, o.ceilP)));
    if (!isNaN(n(o.ceilK))) a.ceilK = Math.round(Math.min(6500, Math.max(2200, o.ceilK)));
    if (CEIL_STYLES.includes(o.ceilStyle)) a.ceilStyle = o.ceilStyle;
    if (o.ceilMode === 'white' || o.ceilMode === 'color') a.ceilMode = o.ceilMode;
    if (typeof o.ceilColor === 'string' && /^#[0-9a-f]{6}$/i.test(o.ceilColor)) a.ceilColor = o.ceilColor.toLowerCase();
    return a;
  }
  // mode visite : ambiance par défaut, rien n'est lu ni écrit dans le navigateur (ADR 0009)
  const viewOnly = !!(window.SCEN && SCEN.viewOnly);
  // visite : ambiance du lien (moment de la journée choisi, plafond), sinon celle de départ
  let amb = checkAmb(viewOnly && SCEN.sharedPayload && SCEN.sharedPayload.a ? Object.assign({}, AMB_DEFAULT, SCEN.sharedPayload.a) : null);
  if (!viewOnly) { try { amb = checkAmb(JSON.parse(localStorage.getItem(KEY))); } catch (e) {} }
  const saveAmb = () => { if (viewOnly) return; try { localStorage.setItem(KEY, JSON.stringify(amb)); } catch (e) {} };

  // luminaires : un par point lumineux posé dans le mode Électricité (plafond ou applique murale)
  let ceilFix = [];
  function makeFixture(pt) {
    const isWall = pt.type === 'wall-light';
    const l = new THREE.PointLight(0xffc474, 0, isWall ? 450 : 700, 2);
    l.shadow.mapSize.set(1024, 1024);
    l.shadow.bias = -0.003;
    A.scene.add(l);
    const bulbMesh = new THREE.Mesh(new THREE.SphereGeometry(3.5, 12, 8), new THREE.MeshBasicMaterial({ color: 0xfff1cf }));
    A.scene.add(bulbMesh);
    const g = new THREE.Group();
    g.position.set(pt.x, H, pt.z);
    if (isWall) {
      // applique (éclairage miroir) : réglette lumineuse contre le mur
      const glowMat = new THREE.MeshStandardMaterial({ color: 0xf3f1ec, roughness: 0.4, emissive: 0x000000 });
      const bar = new THREE.Mesh(new THREE.BoxGeometry(46, 5, 7), glowMat);
      g.position.set(pt.x + (pt.nx || 0) * 4, pt.y, pt.z + (pt.nz || 0) * 4);
      g.rotation.y = pt.nx || pt.nz ? Math.atan2(pt.nx || 0, pt.nz || 0) : 0; // nz peut valoir 0 (mur est/ouest)
      g.add(bar);
      // variante « ampoule nue au mur » (style 'bulb') : socle rond (point de centre DCL) + douille, l'ampoule = bulbMesh
      const dcl = new THREE.Group();
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(5.5, 5.5, 1.6, 28), new THREE.MeshStandardMaterial({ color: 0xf7f7f4, roughness: 0.5 }));
      disc.rotation.x = Math.PI / 2; disc.position.z = 0.8;
      const sock = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.8, 5, 16), new THREE.MeshStandardMaterial({ color: 0xeeeeea, roughness: 0.5 }));
      sock.rotation.x = Math.PI / 2; sock.position.z = 4;
      dcl.add(disc, sock);
      g.add(dcl);
      A.scene.add(g);
      bulbMesh.visible = false;
      return { pt, light: l, bulbMesh, g, wall: true, glowMat, bar, dcl };
    }
    const glowMat = new THREE.MeshStandardMaterial({ color: 0xf6efe2, roughness: 0.8, side: THREE.DoubleSide, emissive: 0x000000 });
    // suspension : fil + abat-jour conique
    const pendant = new THREE.Group();
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 62, 6), new THREE.MeshStandardMaterial({ color: 0x222222 }));
    cord.position.y = -31;
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(4, 19, 18, 28, 1, true), glowMat);
    cone.position.y = -71;
    pendant.add(cord, cone);
    // plafonnier : disque diffusant
    const flush = new THREE.Mesh(new THREE.CylinderGeometry(19, 17, 7, 32), glowMat);
    flush.position.y = -4;
    // boule diffusante (papier / opaline), suspendue par un fil court
    const globe = new THREE.Group();
    // boule plus près du plafond (fil de 12 cm) : centre à GLOBE_Y sous le plafond
    const gcord = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, GLOBE_Y - 16, 6), new THREE.MeshStandardMaterial({ color: 0xeeeeee }));
    gcord.position.y = -(GLOBE_Y - 16) / 2;
    const ballMat = new THREE.MeshStandardMaterial({ color: 0xfbf8f1, roughness: 0.95, emissive: 0x000000, transparent: true, opacity: 0.96 });
    const ball = new THREE.Mesh(new THREE.SphereGeometry(16, 32, 20), ballMat);
    ball.position.y = -GLOBE_Y;
    for (let i = -2; i <= 2; i++) { // nervures du papier
      const rib = new THREE.Mesh(new THREE.TorusGeometry(Math.sqrt(256 - (i * 5.5) ** 2), 0.18, 4, 40), new THREE.MeshStandardMaterial({ color: 0xe9e2d3 }));
      rib.rotation.x = Math.PI / 2; rib.position.y = -GLOBE_Y + i * 5.5; globe.add(rib);
    }
    globe.add(gcord, ball);
    g.add(pendant, flush, globe);
    A.scene.add(g);
    return { pt, light: l, bulbMesh, g, pendant, flush, globe, glowMat, ballMat };
  }
  function disposeFixture(c) {
    A.scene.remove(c.light, c.bulbMesh, c.g);
    if (c.light.shadow && c.light.shadow.map) c.light.shadow.map.dispose();
    c.g.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  }
  // (re)crée les luminaires à partir des points lumineux du mode Électricité
  // Recréer les lumières oblige à recompiler tous les rendus (lent) : on ne le fait que si la liste des points change
  // (ajout / suppression / changement de type). Un déplacement ou un allumage met juste à jour l'existant.
  let ceilKey = '';
  function rebuildCeiling() {
    const pts = window.ELEC ? ELEC.points().filter((p) => p.type === 'ceiling' || p.type === 'wall-light') : [];
    const key = pts.map((p) => p.id + ':' + p.type).join('|');
    if (key !== ceilKey) {
      ceilFix.forEach(disposeFixture);
      ceilFix = pts.map(makeFixture);
      ceilKey = key;
    } else {
      ceilFix.forEach((c, i) => (c.pt = pts[i])); // mêmes points, données éventuellement remplacées
    }
    applyCeiling();
    renderPoints();
  }

  function applyAmbiance(real) {
    const m = MOMENTS[amb.moment] || MOMENTS.jour;
    const r = A.rig;
    r.sun.intensity *= m.sun;
    r.sun.visible = m.sun > 0;
    if (m.sunColor) r.sun.color.set(m.sunColor);
    r.hemi.intensity *= m.hemi;
    A.scene.background.set(m.bg);
    if (real && m.env !== 1) A.scene.traverse((o) => { if (o.material && o.material.isMeshStandardMaterial) o.material.envMapIntensity *= m.env; });
    applyCeiling(real);
  }

  function applyCeiling(real) {
    real = real ?? A.realistic();
    const col = lightColor(amb.ceilMode, amb.ceilK, amb.ceilColor), base = real ? 0.8 : 0.3, master = amb.ceilOn && amb.ceilP > 0;
    // les ombres ne dépendent PAS de l'allumage (sinon chaque interrupteur recompile tout) : une lumière éteinte a juste une intensité nulle
    let shadowBudget = real ? 2 : 0; // ombres limitées aux 2 premiers points du plafond (coût d'affichage)
    ceilFix.forEach((c) => {
      const l = c.light, on = master && !c.pt.off; // chaque point peut être éteint séparément
      l.color.copy(col);
      l.intensity = on ? base * (amb.ceilP / 60) * (c.wall ? 0.5 : 1) : 0;
      if (c.wall) {
        const nx = c.pt.nx || 0, nz = c.pt.nz || 0, bulb = c.pt.style === 'bulb'; // réglette (défaut) ou ampoule nue au mur
        c.g.position.set(c.pt.x + nx * (bulb ? 0 : 4), c.pt.y, c.pt.z + nz * (bulb ? 0 : 4));
        c.g.rotation.y = nx || nz ? Math.atan2(nx, nz) : 0;
        if (c.bar) c.bar.visible = !bulb;
        if (c.dcl) c.dcl.visible = bulb;
        c.bulbMesh.visible = bulb;
        if (bulb) {
          c.bulbMesh.position.set(c.pt.x + nx * 9.5, c.pt.y, c.pt.z + nz * 9.5);
          c.bulbMesh.material.color.copy(on ? col : new THREE.Color(0x777777));
          l.position.set(c.pt.x + nx * 14, c.pt.y, c.pt.z + nz * 14);
        } else l.position.set(c.g.position.x + nx * 12, c.pt.y - 6, c.g.position.z + nz * 12);
        if (l.castShadow) l.castShadow = false;
        c.glowMat.emissive.copy(col).multiplyScalar(on ? 1.1 * (amb.ceilP / 100) : 0);
        return;
      }
      const st = c.pt.style || amb.ceilStyle; // style propre au point, sinon le style général
      l.position.set(c.pt.x, st === 'pendant' ? H - 76 : st === 'flush' ? H - 10 : st === 'globe' ? H - GLOBE_Y : H - 12, c.pt.z);
      const sh = shadowBudget-- > 0;
      if (l.castShadow !== sh) l.castShadow = sh;
      c.bulbMesh.visible = st === 'bulb';
      c.bulbMesh.material.color.copy(on ? col : new THREE.Color(0x777777));
      c.bulbMesh.position.copy(l.position);
      c.pendant.visible = st === 'pendant';
      c.flush.visible = st === 'flush';
      c.globe.visible = st === 'globe';
      c.g.position.set(c.pt.x, H, c.pt.z);
      c.glowMat.emissive.copy(col).multiplyScalar(on ? 0.9 * (amb.ceilP / 100) : 0);
      c.ballMat.emissive.copy(col).multiplyScalar(on ? 0.75 * (amb.ceilP / 100) : 0);
    });
    if (A.markShadows) A.markShadows();
  }
  A.hooks.rig.push(applyAmbiance);

  // ------------------------------------------------------------------ lampes posées (objets du catalogue avec "light")
  const lamps = new Map(); // id -> PointLight
  const tmp = new THREE.Vector3();

  function syncLamps() {
    const real = A.realistic();
    const present = new Set();
    let shadowBudget = real ? 2 : 0;
    A.items.forEach((it) => {
      const def = FURN.byId[it.type];
      if (!def.light || !it.light) return;
      present.add(it.id);
      let l = lamps.get(it.id);
      if (!l) {
        l = new THREE.PointLight(0xffffff, 0, 650, 1.6);
        // ombres douces (abat-jour en tissu = source diffuse) : carte plus fine + bords flous (shadow.radius, PCF)
        l.shadow.mapSize.set(1024, 1024);
        l.shadow.bias = -0.004;
        l.shadow.radius = 10;
        // lumière de rebond (sans ombre) : imite la lumière renvoyée par les murs, les ombres ne sont plus noires
        l.userData.fill = new THREE.PointLight(0xffffff, 0, 650, 1.6);
        A.scene.add(l, l.userData.fill);
        lamps.set(it.id, l);
      }
      const [px, py, pz] = def.light.pos;
      it.group.updateMatrixWorld(true);
      tmp.set((px * it.w) / def.w, (py * it.h) / def.h, (pz * it.d) / def.d);
      it.group.localToWorld(tmp);
      l.position.copy(tmp);
      const col = lightColor(it.light.m, it.light.k, it.light.c), on = it.light.on && it.light.p > 0, f = it.light.p / 100;
      l.color.copy(col);
      const shadow = shadowBudget > 0; // indépendant de l'allumage : allumer/éteindre reste instantané
      if (shadow) shadowBudget--;
      if (l.castShadow !== shadow) l.castShadow = shadow;
      // puissance totale inchangée : avec ombres, 55 % pour la lumière directe et 45 % de rebond
      const I = on ? (real ? 1.3 : 0.7) * f : 0, fill = l.userData.fill;
      l.intensity = shadow ? I * 0.55 : I;
      fill.color.copy(col); fill.position.copy(tmp); fill.intensity = shadow ? I * 0.45 : 0;
      // abat-jour et ampoule qui s'illuminent
      it.group.traverse((m) => {
        if (!m.material || !m.material.emissive) return;
        if (m.userData.glow) m.material.emissive.copy(col).multiplyScalar(on ? 0.85 * f : 0);
        if (m.userData.bulb) m.material.emissive.copy(col).multiplyScalar(on ? 1.6 : 0);
      });
    });
    lamps.forEach((l, id) => { if (!present.has(id)) { A.scene.remove(l, l.userData.fill); if (l.shadow && l.shadow.map) l.shadow.map.dispose(); lamps.delete(id); } });
    if (A.markShadows) A.markShadows();
  }

  // ------------------------------------------------------------------ liste des lumières à allumer / éteindre une par une
  function renderPoints() {
    const box = $('ceil-points');
    if (!box) return;
    const rows = [];
    ceilFix.forEach((c) => rows.push({ kind: 'pt', ref: c.pt, name: c.pt.label || (c.wall ? 'Applique' : 'Point lumineux'), on: !c.pt.off, icon: c.wall ? '🔆' : '💡' }));
    A.items.forEach((it) => { if (it.light) rows.push({ kind: 'lamp', ref: it, name: it.name, on: !!it.light.on, icon: '🛋' }); });
    box.innerHTML = rows.length ? '' : '<div class="legend">Aucune lumière. Place des points lumineux avec ⚡ Électricité, ou ajoute des lampes.</div>';
    // interrupteurs reliés : un bouton par poste, qui allume / éteint ensemble ses lumières (liaisons faites dans ⚡ Électricité)
    const grps = window.ELEC && ELEC.groups ? ELEC.groups() : [];
    if (grps.length) {
      const gb = document.createElement('div');
      gb.className = 'lt-groups';
      grps.forEach((g) => {
        const row = document.createElement('div');
        row.className = 'lt-grp' + (g.on ? ' on' : '');
        row.innerHTML = '<span class="lt-grp-t"><b></b><small></small></span><button type="button"></button>';
        row.querySelector('b').textContent = '⏻ ' + ELEC.postName(g.sw, g.k);
        row.querySelector('small').textContent = g.lights.map((p) => ELEC.lightName(p)).join(', ');
        const bt = row.querySelector('button');
        bt.textContent = g.on ? 'Éteindre' : 'Allumer';
        bt.title = 'Basculer ce poste : allume ou éteint ensemble ses lumières';
        if (A.readOnly) bt.disabled = true;
        bt.onclick = () => ELEC.toggle(g.sw.id, g.k); // met à jour l'éclairage, cette liste et la carte Électricité
        gb.appendChild(row);
      });
      box.appendChild(gb);
      const sub = document.createElement('div');
      sub.className = 'lt-sub';
      sub.textContent = 'Lumière par lumière';
      box.appendChild(sub);
    }
    rows.forEach((r) => {
      const lab = document.createElement('label');
      lab.className = 'switch lt-pt';
      lab.innerHTML = `<input type="checkbox" ${r.on ? 'checked' : ''}><span></span>`;
      lab.querySelector('span').textContent = `${r.icon} ${r.name}`;
      if (A.readOnly) lab.querySelector('input').disabled = true;
      lab.querySelector('input').onchange = (e) => {
        if (r.kind === 'pt') {
          if (e.target.checked) delete r.ref.off; else r.ref.off = true;
          if (window.ELEC && ELEC.save) ELEC.save();
          applyCeiling();
          if (window.ELEC && ELEC.groups && ELEC.groups().some((g) => g.lights.includes(r.ref))) renderPoints(); // état des postes reliés
          if (window.ELEC && ELEC.renderCard) ELEC.renderCard(); // carte Électricité (sélecteur « Allumé ») à jour
        } else {
          r.ref.light.on = e.target.checked;
          A.refreshStates(); // lampe : enregistrée avec le scénario, annulable
        }
      };
      box.appendChild(lab);
    });
  }

  // ------------------------------------------------------------------ interface
  const card = $('lights-card');
  // bloc couleur : Blanc (température) / Couleur (teinte libre + teintes rapides)
  const colorBlock = (pfx) => `
    <div class="seg lt-mode" id="${pfx}-mode" role="group" aria-label="Type de lumière"><button data-v="white">Blanc</button><button data-v="color">Couleur</button></div>
    <label class="lt-range" id="${pfx}-kwrap">Température <span id="${pfx}-k-v"></span><input type="range" id="${pfx}-k" class="lt-k" min="2200" max="6500" step="100"></label>
    <div class="lt-colors" id="${pfx}-cwrap"><input type="color" id="${pfx}-c" aria-label="Choisir une couleur">${SWATCHES.map((s) => `<button class="sw" data-c="${s}" style="background:${s}" aria-label="${s}"></button>`).join('')}</div>`;
  card.innerHTML = `
    <div class="card-head"><h3>Éclairage</h3></div>
    <div class="seg lt-moment" role="group" aria-label="Moment de la journée">
      <button data-m="jour">☀ Jour</button><button data-m="soir">Soir</button><button data-m="nuit">☾ Nuit</button>
    </div>
    <div class="group-label">Points lumineux · plafond et appliques</div>
    <div class="lt-row">
      <label class="switch" title="Interrupteur général de tous les points lumineux"><input type="checkbox" id="ceil-on"> Tout</label>
      <select id="ceil-style" aria-label="Type de luminaire">
        <option value="bulb">Ampoule nue</option><option value="globe">Boule papier</option><option value="pendant">Suspension</option><option value="flush">Plafonnier</option>
      </select>
    </div>
    <label class="lt-range">Puissance <span id="ceil-p-v"></span><input type="range" id="ceil-p" min="0" max="100" step="5"></label>
    ${colorBlock('ceil')}
    <div class="group-label">Allumées / éteintes</div>
    <div class="lt-points" id="ceil-points"></div>
    <div id="lamp-sel" hidden>
      <div class="group-label">Lampe sélectionnée · <span id="lamp-name"></span></div>
      <label class="switch"><input type="checkbox" id="lamp-on"> Allumée</label>
      <label class="lt-range">Puissance <span id="lamp-p-v"></span><input type="range" id="lamp-p" min="0" max="100" step="5"></label>
      ${colorBlock('lamp')}
    </div>
    <div class="legend lt-tip">Ajoute des lampes depuis le catalogue (groupe « Éclairage ») ; lampe de bureau et de chevet se posent sur un meuble. Mets « Nuit » pour juger l'éclairage.</div>`;

  const css = document.createElement('style');
  css.textContent = `
    .lt-moment { display:flex; margin-bottom:4px; }
    .lt-moment button { flex:1; }
    .lt-row { display:flex; gap:8px; align-items:center; justify-content:space-between; margin-bottom:6px; }
    .lt-row select { width:auto; flex:1; min-width:0; padding:5px 7px; font-size:13px; }
    .lt-range { display:block; font-size:12px; color:var(--mute); margin-top:8px; }
    .lt-range span { float:right; color:var(--ink); font-variant-numeric:tabular-nums; }
    .lt-range input { width:100%; margin:4px 0 0; accent-color:var(--accent); }
    .lt-k { accent-color:#d9a441 !important; }
    #lamp-sel { border-top:1px solid var(--line); margin-top:12px; }
    #lamp-sel .switch { margin-top:2px; }
    .lt-tip { margin-top:10px; }
    .lt-points { display:flex; flex-direction:column; gap:7px; margin-top:4px; }
    .lt-points .switch { font-size:12.5px; color:var(--ink); }
    .lt-points .switch:not(:has(input:checked)) { color:var(--mute); }
    .lt-groups { display:flex; flex-direction:column; gap:5px; }
    .lt-grp { display:flex; align-items:center; gap:8px; padding:5px 7px; border:1px solid var(--line); border-radius:7px; }
    .lt-grp.on { border-color:#e0a526; background:#fff8e6; }
    .lt-grp-t { flex:1; min-width:0; display:flex; flex-direction:column; font-size:12.5px; color:var(--ink); }
    .lt-grp-t small { color:var(--mute); font-size:11.5px; }
    .lt-grp button { flex:none; font-size:11.5px; padding:3px 9px; }
    .lt-sub { font-size:11.5px; color:var(--mute); margin-top:4px; }
    .lt-mode { display:flex; margin-top:10px; }
    .lt-mode button { flex:1; }
    .lt-colors { display:flex; gap:6px; align-items:center; margin-top:8px; flex-wrap:wrap; }
    .lt-colors input[type=color] { width:34px; height:26px; padding:0 2px; border:1px solid var(--line-strong); border-radius:6px; background:#fff; cursor:pointer; }
    .lt-colors .sw { width:20px; height:20px; border-radius:50%; padding:0; border:2px solid #fff; box-shadow:0 0 0 1px var(--line-strong); }
    .lt-colors .sw:hover { transform:scale(1.15); }
    [hidden].lt-range, .lt-colors[hidden] { display:none; }`;
  document.head.appendChild(css);

  function renderAmb() {
    card.querySelectorAll('.lt-moment button').forEach((b) => b.classList.toggle('active', b.dataset.m === amb.moment));
    $('ceil-on').checked = amb.ceilOn;
    $('ceil-style').value = amb.ceilStyle;
    $('ceil-p').value = amb.ceilP;
    $('ceil-p-v').textContent = amb.ceilP + ' %';
    $('ceil-k').value = amb.ceilK;
    $('ceil-k-v').textContent = kLabel(amb.ceilK);
    renderMode('ceil', amb.ceilMode, amb.ceilColor);
  }
  function renderMode(pfx, mode, color) {
    mode = mode === 'color' ? 'color' : 'white';
    card.querySelectorAll(`#${pfx}-mode button`).forEach((b) => b.classList.toggle('active', b.dataset.v === mode));
    $(`${pfx}-kwrap`).hidden = mode !== 'white';
    $(`${pfx}-cwrap`).hidden = mode !== 'color';
    if (document.activeElement !== $(`${pfx}-c`)) $(`${pfx}-c`).value = color || '#ff9500';
  }
  // branche les boutons Blanc/Couleur, le sélecteur et les teintes rapides
  function bindColor(pfx, setMode, setColor) {
    card.querySelectorAll(`#${pfx}-mode button`).forEach((b) => (b.onclick = () => setMode(b.dataset.v)));
    $(`${pfx}-c`).oninput = (e) => setColor(e.target.value);
    card.querySelectorAll(`#${pfx}-cwrap .sw`).forEach((b) => (b.onclick = () => setColor(b.dataset.c)));
  }
  bindColor('ceil', (v) => { amb.ceilMode = v; saveAmb(); renderAmb(); applyCeiling(); }, (c) => { amb.ceilColor = c; saveAmb(); renderAmb(); applyCeiling(); });
  card.querySelectorAll('.lt-moment button').forEach((b) => (b.onclick = () => { amb.moment = b.dataset.m; saveAmb(); renderAmb(); A.rig.applyRig(); syncLamps(); }));
  $('ceil-on').onchange = (e) => { amb.ceilOn = e.target.checked; saveAmb(); applyCeiling(); };
  $('ceil-style').onchange = (e) => { amb.ceilStyle = e.target.value; saveAmb(); applyCeiling(); };
  $('ceil-p').oninput = (e) => { amb.ceilP = +e.target.value; saveAmb(); renderAmb(); applyCeiling(); };
  $('ceil-k').oninput = (e) => { amb.ceilK = +e.target.value; saveAmb(); renderAmb(); applyCeiling(); };

  // lampe sélectionnée
  const selLamp = () => { const s = A.getSelected(); return s && s.light ? s : null; };
  function renderLamp() {
    const s = selLamp();
    $('lamp-sel').hidden = !s;
    if (!s) return;
    $('lamp-name').textContent = s.name;
    $('lamp-on').checked = s.light.on;
    if (document.activeElement !== $('lamp-p')) $('lamp-p').value = s.light.p;
    if (document.activeElement !== $('lamp-k')) $('lamp-k').value = s.light.k;
    $('lamp-p-v').textContent = s.light.p + ' %';
    $('lamp-k-v').textContent = kLabel(s.light.k);
    renderMode('lamp', s.light.m, s.light.c);
  }
  const setLamp = (key, v) => { const s = selLamp(); if (!s) return; s.light[key] = v; A.refreshStates(); }; // refreshStates : sauvegarde + annulable
  $('lamp-on').onchange = (e) => setLamp('on', e.target.checked);
  $('lamp-p').oninput = (e) => setLamp('p', +e.target.value);
  $('lamp-k').oninput = (e) => setLamp('k', +e.target.value);
  bindColor('lamp', (v) => { const s = selLamp(); if (s && !s.light.c) s.light.c = '#ff9500'; setLamp('m', v); }, (c) => { const s = selLamp(); if (s) s.light.m = 'color'; setLamp('c', c); });

  let lampKey = '';
  A.hooks.change.push(() => {
    syncLamps(); renderLamp();
    const k = A.items.filter((i) => i.light).map((i) => i.id + ':' + i.light.on + ':' + i.name).join('|');
    if (k !== lampKey) { lampKey = k; renderPoints(); } // liste des lumières seulement si les lampes changent
  });
  A.hooks.rig.push(() => syncLamps());

  renderAmb();
  A.rig.applyRig(); // applique l'ambiance enregistrée
  syncLamps();
  renderLamp();

  rebuildCeiling();
  // remplace l'ambiance (import JSON) : validée, enregistrée, interface et éclairage mis à jour
  function setAmb(o) {
    amb = checkAmb(o);
    saveAmb();
    renderAmb();
    A.rig.applyRig(); // moment + plafond (hooks rig)
    syncLamps();
    return amb;
  }
  // le lien emporte l'ambiance (seulement ce qui diffère du départ)
  if (window.SCEN && SCEN.shareExtras) SCEN.shareExtras.push(() => {
    const a = {};
    Object.keys(AMB_DEFAULT).forEach((k) => { if (amb[k] !== AMB_DEFAULT[k]) a[k] = amb[k]; });
    return Object.keys(a).length ? { a } : {};
  });
  window.__lights = { kelvin, syncLamps, rebuildCeiling, applyCeiling, renderPoints, amb: () => amb, check: checkAmb, setAmb };
})();
