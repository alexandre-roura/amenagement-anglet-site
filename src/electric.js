/*
 * Électricité : points lumineux (plafond, applique), prises, interrupteurs, RJ45, prise TV,
 * tableau électrique / compteur, pilotage du chauffage.
 * - Mode « Électricité » (bouton dans l'en-tête) : on vise la face intérieure du mur (position + hauteur), glisser pour déplacer,
 *   flèches pour le réglage fin ; en vue de dessus, repli sur le mur le plus proche du point du sol (hauteur par défaut).
 * - Données propres au logement (communes à tous les scénarios), gardées dans le navigateur et incluses dans l'export.
 * - Vérifications : meuble qui cache une prise/un interrupteur, appareil trop loin d'une prise.
 */
(function () {
  const A = window.__app;
  if (!A) return;
  const $ = (id) => document.getElementById(id);
  const KEY = 'amenagement-anglet-elec';
  const H = APT.H;

  // ------------------------------------------------------------------ types
  const TYPES = {
    ceiling: { label: 'Point lumineux (plafond)', short: 'Plafond', icon: '💡', color: '#e0a526', wall: false },
    'wall-light': { label: 'Applique / éclairage miroir', short: 'Applique', icon: '🔆', color: '#e0a526', wall: true, y: 190 },
    outlet: { label: 'Prise de courant', short: 'Prise', icon: '🔌', color: '#2f6bff', wall: true, y: 25, gang: true },
    switch: { label: 'Interrupteur', short: 'Interrupteur', icon: '⏻', color: '#8e5cf7', wall: true, y: 110, gang: true },
    rj45: { label: 'Prise réseau RJ45', short: 'RJ45', icon: '🌐', color: '#16a085', wall: true, y: 25, gang: true },
    tv: { label: 'Prise TV', short: 'TV', icon: '📺', color: '#d35400', wall: true, y: 25 },
    meter: { label: 'Tableau électrique / compteur', short: 'Tableau', icon: '⚡', color: '#c2402f', wall: true, y: 130 }, // encastré dans le mur
    heating: { label: 'Pilotage du chauffage', short: 'Chauffage', icon: '🌡', color: '#c2402f', wall: true, y: 130 },
  };
  const STYLES = { '': 'Comme les autres', bulb: 'Ampoule nue', globe: 'Boule papier', pendant: 'Suspension', flush: 'Plafonnier' };
  const WALL_STYLES = { '': 'Réglette', bulb: 'Ampoule nue' }; // appliques

  // ------------------------------------------------------------------ murs (faces intérieures, normales vers l'intérieur de la pièce)
  function edgesOf(poly, skip) {
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      if (skip && skip.includes(i)) continue;
      const a = poly[i], b = poly[(i + 1) % poly.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const d = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
      let n = [-d[1], d[0]];
      if (!APT.pointInPoly([(a[0] + b[0]) / 2 + n[0] * 2, (a[1] + b[1]) / 2 + n[1] * 2], poly)) n = [-n[0], -n[1]];
      out.push({ a, b, L, d, n });
    }
    return out;
  }
  const WALLS = { main: edgesOf(APT.main), bath: edgesOf(APT.bathPoly) };
  // pose sur le mur le plus proche, côté de la pièce où l'on a cliqué
  function toWall(x, z) {
    const p = [x, z];
    const side = APT.pointInPoly(p, APT.bathPoly) ? ['bath'] : APT.pointInPoly(p, APT.main) ? ['main'] : ['main', 'bath'];
    let best = null;
    side.forEach((k) => WALLS[k].forEach((e) => {
      const t = Math.max(6, Math.min(e.L - 6, (x - e.a[0]) * e.d[0] + (z - e.a[1]) * e.d[1]));
      const q = [e.a[0] + e.d[0] * t, e.a[1] + e.d[1] * t], dd = Math.hypot(q[0] - x, q[1] - z);
      if (!best || dd < best.dd) best = { dd, x: q[0], z: q[1], nx: e.n[0], nz: e.n[1] };
    }));
    return best;
  }
  // ------------------------------------------------------------------ surfaces des murs (pour viser le mur lui-même, à la hauteur cliquée)
  // un plan invisible par face intérieure, orienté vers la pièce : le rayon ne touche que les faces vues de l'intérieur
  // (un mur vu de dos, ex. le mur translucide devant la caméra, est traversé → on atteint le mur du fond visé)
  const WALL_LIST = [];
  ['main', 'bath'].forEach((k) => WALLS[k].forEach((e, i) => WALL_LIST.push(Object.assign(e, { kind: k, i }))));
  // éléments fixes pleine hauteur (bourrelet / gaine) : leurs faces sont des murs comme les autres
  const PILLARS = APT.fixed.filter((f) => f.kind === 'pillar');
  const inPillar = (q) => PILLARS.some((f) => APT.pointInPoly(q, f.poly));
  const inRoom = (q) => APT.pointInPoly(q, APT.main) || APT.pointInPoly(q, APT.bathPoly);
  // parties d'un segment [a→b] (normale n) qui vérifient ok(point à 1 cm devant la face), par pas de 1 cm
  function runs(a, b, n, ok) {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]), d = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], out = [];
    let start = null;
    for (let t = 0.5; t <= L; t += 1) {
      const q = [a[0] + d[0] * t + n[0], a[1] + d[1] * t + n[1]], yes = ok(q);
      if (yes && start == null) start = t - 0.5;
      if ((!yes || t + 1 > L) && start != null) { out.push([start, yes ? L : t - 0.5]); start = null; }
    }
    return out.filter(([s0, s1]) => s1 - s0 >= 2);
  }
  PILLARS.forEach((f, fi) => {
    const P = f.poly, cx = P.reduce((u, q) => u + q[0], 0) / P.length, cz = P.reduce((u, q) => u + q[1], 0) / P.length;
    P.forEach((a, i) => {
      const b = P[(i + 1) % P.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]), d = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
      let n = [-d[1], d[0]];
      if (((a[0] + b[0]) / 2 + n[0] - cx) * n[0] + ((a[1] + b[1]) / 2 + n[1] - cz) * n[1] < 0) n = [-n[0], -n[1]]; // vers l'extérieur du bourrelet
      // seulement les morceaux de face qui donnent dans la pièce (pas ceux noyés dans un mur ou côté terrasse)
      runs(a, b, n, inRoom).forEach(([s0, s1], k) => {
        const A2 = [a[0] + d[0] * s0, a[1] + d[1] * s0], B2 = [a[0] + d[0] * s1, a[1] + d[1] * s1];
        WALL_LIST.push({ a: A2, b: B2, L: s1 - s0, d, n, kind: 'fixed', i: fi * 10 + i, k, name: f.name });
      });
    });
  });
  // portions de murs cachées derrière un bourrelet : interdites, comme une ouverture pleine hauteur
  const BLOCKS = new Map();
  WALL_LIST.forEach((e) => {
    if (e.kind === 'fixed') return;
    const r = runs(e.a, e.b, e.n, inPillar);
    if (r.length) BLOCKS.set(e, r.map(([s0, s1]) => ({ kind: 'block', s: s0, w: s1 - s0, sill: -10, h: H + 20 })));
  });
  // ouvertures d'une arête (portes, baie) : pas de prise dedans. L'arête 1 de la salle d'eau (I→H) = arête 7 du séjour (H→I) à l'envers
  function openingsOf(e) {
    let o = [];
    if (e.kind === 'main') o = APT.openings[e.i] || [];
    else if (e.kind === 'bath' && e.i === 1) o = (APT.openings[7] || []).map((x) => Object.assign({}, x, { s: e.L - x.s - x.w }));
    return BLOCKS.has(e) ? o.concat(BLOCKS.get(e)) : o;
  }
  const pickWalls = new THREE.Group();
  const pickMat = new THREE.MeshBasicMaterial({ side: THREE.FrontSide });
  WALL_LIST.forEach((e) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(e.L, H), pickMat);
    m.position.set((e.a[0] + e.b[0]) / 2, H / 2, (e.a[1] + e.b[1]) / 2);
    m.rotation.y = Math.atan2(e.n[0], e.n[1]); // +z du plan = normale vers la pièce
    m.userData.wall = e;
    pickWalls.add(m);
  });
  pickWalls.updateMatrixWorld(true); // pas ajouté à la scène : jamais rendu, seulement visé
  const WALL_MARGIN = 6, Y_MIN = 4, Y_MAX = H - 8;
  // point d'un mur à la distance t de son début et à la hauteur y (bornés : pas dans un angle, pas dans une ouverture)
  function onWall(e, t, y) {
    t = Math.max(WALL_MARGIN, Math.min(e.L - WALL_MARGIN, t));
    y = Math.max(Y_MIN, Math.min(Y_MAX, y));
    for (const o of openingsOf(e)) {
      const top = o.sill + o.h;
      if (t > o.s - 5 && t < o.s + o.w + 5 && y < top + 4 && y > o.sill - 4) {
        // dans une porte / la baie : poser juste à côté (côté le plus proche), ou au-dessus si l'ouverture est étroite à cet endroit
        const left = o.s - 5, right = o.s + o.w + 5;
        const canL = left >= WALL_MARGIN, canR = right <= e.L - WALL_MARGIN;
        if (canL && (!canR || t - left <= right - t)) t = left;
        else if (canR) t = right;
        else y = Math.min(Y_MAX, top + 6);
      }
    }
    return { e, t, y, x: e.a[0] + e.d[0] * t, z: e.a[1] + e.d[1] * t, nx: e.n[0], nz: e.n[1] };
  }
  // vue de dessus : face de mur (bourrelet compris) la plus proche d'un point du sol, du côté de la pièce où il est
  function nearestWall(x, z) {
    const bath = APT.pointInPoly([x, z], APT.bathPoly);
    const pil = inPillar([x, z]); // clic dans l'emprise du bourrelet : sa face la plus proche
    let best = null;
    WALL_LIST.forEach((e) => {
      if ((e.kind === 'bath') !== bath) return;
      if (pil ? e.kind !== 'fixed' : (x - e.a[0]) * e.n[0] + (z - e.a[1]) * e.n[1] < -1) return; // sinon : pas une face vue de dos
      const t = Math.max(0, Math.min(e.L, (x - e.a[0]) * e.d[0] + (z - e.a[1]) * e.d[1]));
      const dd = Math.hypot(e.a[0] + e.d[0] * t - x, e.a[1] + e.d[1] * t - z);
      if (!best || dd < best.dd) best = { e, t, dd };
    });
    return best;
  }
  // mur sur lequel se trouve un point (le plus proche ayant la même orientation)
  function wallOf(p) {
    let best = null;
    WALL_LIST.forEach((e) => {
      if (p.nx != null && e.n[0] * p.nx + e.n[1] * p.nz < 0.9) return;
      const t = (p.x - e.a[0]) * e.d[0] + (p.z - e.a[1]) * e.d[1];
      const tt = Math.max(0, Math.min(e.L, t));
      const dd = Math.hypot(e.a[0] + e.d[0] * tt - p.x, e.a[1] + e.d[1] * tt - p.z);
      if (!best || dd < best.dd) best = { e, t, dd };
    });
    return best;
  }
  // repère « de face » : vu depuis la pièce face au mur, la gauche est du côté de -droite ; droite = (nz, -nx)
  function leftDist(e, t) { const r = [e.n[1], -e.n[0]], dr = e.d[0] * r[0] + e.d[1] * r[1]; return dr >= 0 ? t : e.L - t; }
  function fromLeft(e, s) { const r = [e.n[1], -e.n[0]], dr = e.d[0] * r[0] + e.d[1] * r[1]; return dr >= 0 ? s : e.L - s; }

  // éclairage du miroir de la salle d'eau : au milieu du meuble vasque, au-dessus du miroir (sur la frise)
  const MIRROR_Y = APT.bathLayout.mirror.y1 + 12;
  const mirrorSpot = () => { const b = APT.bath, V = APT.bathLayout.vanity; return toWall(...b.toWorld((V.s0 + V.s1) / 2, b.d - 3)); };
  // lumière de la cuisine : au milieu du plan de travail côté évier
  const KITCHEN_LIGHT_Z = (APT.kitchen.west.z0 + APT.kitchen.west.z1) / 2; // milieu du plan de travail côté évier
  let migrated = false;
  const along = (H0, I0, s) => { const L = Math.hypot(I0[0] - H0[0], I0[1] - H0[1]); return [H0[0] + ((I0[0] - H0[0]) * s) / L, H0[1] + ((I0[1] - H0[1]) * s) / L]; };

  // ------------------------------------------------------------------ positions par défaut (à ajuster par l'utilisateur)
  // positions de départ = ton électricité du 15/11/2026 (export du même jour), liaisons d'interrupteurs comprises
  const USER_DEFAULTS = [{"id": "e1", "type": "ceiling", "x": 207, "z": 140, "label": "Salon (1er tiers)", "off": true}, {"id": "e2", "type": "ceiling", "x": 414, "z": 140, "label": "Salon (2e tiers)", "off": true}, {"id": "e3", "type": "wall-light", "x": 319, "z": -100, "y": 160, "nx": 1, "nz": 0, "style": "bulb", "label": "Cuisine (ampoule murale)", "off": true}, {"id": "e4", "type": "ceiling", "x": 103.7, "z": 432.7, "label": "Entrée", "off": true}, {"id": "e5", "type": "ceiling", "x": -66.7, "z": 467.4, "style": "flush", "label": "Salle d'eau", "off": true}, {"id": "e6", "type": "wall-light", "x": 28.6, "z": 543.7, "y": 207, "nx": -0.38949050230230003, "nz": -0.9210304819148506, "label": "Éclairage miroir"}, {"id": "e7", "type": "meter", "x": 64.6, "z": 497.8, "y": 130, "nx": 0.9210304819148507, "nz": -0.3894905023023, "label": "Tableau électrique / compteur"}, {"id": "e8", "type": "heating", "x": 51.4, "z": 466.5, "y": 130, "nx": 0.9210304819148507, "nz": -0.3894905023023, "label": "Pilotage du chauffage"}, {"id": "e9", "type": "switch", "x": -7.4, "z": 302.4, "y": 110, "nx": 0.9996990331371585, "nz": 0.024532491610727816, "n": 2, "label": "Interrupteur (près de la salle d'eau)", "ctrl": [["e4"], ["e1", "e2"]]}, {"id": "e10", "type": "outlet", "x": -7.1, "z": 291, "y": 110, "nx": 0.9996990331371585, "nz": 0.024532491610727816, "label": "Prise (sous l'interrupteur)"}, {"id": "e12", "type": "outlet", "x": 620.5, "z": -150, "y": 110, "nx": -1, "nz": 0, "n": 2, "label": "Prises plan de travail"}, {"id": "emwh1kazy", "type": "outlet", "x": 526.5, "z": 187.1, "y": 25, "nx": -0.3923948611217274, "nz": -0.9197968650551382}, {"id": "emwh1kcx7", "type": "outlet", "x": 521.3, "z": 189.3, "y": 25, "nx": -0.3923948611217274, "nz": -0.9197968650551382}, {"id": "emwh1qvp0", "type": "outlet", "x": -3.4, "z": 136.6, "y": 27, "nx": 0.9996990331371585, "nz": 0.024532491610727816}, {"id": "emwh1s003", "type": "outlet", "x": -3.2, "z": 128.4, "y": 27, "nx": 0.9996990331371585, "nz": 0.024532491610727816}, {"id": "emwh1smf8", "type": "rj45", "x": -3, "z": 120.3, "y": 27, "nx": 0.9996990331371585, "nz": 0.024532491610727816}, {"id": "emwh1sr1f", "type": "tv", "x": -2.8, "z": 112.1, "y": 27, "nx": 0.9996990331371585, "nz": 0.024532491610727816}, {"id": "emwh24kyt", "type": "switch", "x": -44.1, "z": 341.3, "y": 110, "nx": 0.38949050230230003, "nz": 0.9210304819148506, "n": 2, "ctrl": [["e5"], ["e6"]]}, {"id": "emwh25w6c", "type": "outlet", "x": -34, "z": 337, "y": 110, "nx": 0.38949050230230003, "nz": 0.9210304819148506}, {"id": "emwh2ikou", "type": "outlet", "x": 393.5, "z": -5, "y": 85, "nx": 1, "nz": 0}, {"id": "emwh2lekb", "type": "switch", "x": 393.5, "z": -5, "y": 95, "nx": 1, "nz": 0, "ctrl": [["e3"]]}, {"id": "emwh3j2sz", "type": "switch", "x": 393.5, "z": -5, "y": 105, "nx": 1, "nz": 0, "ctrl": [["e2", "e1"]]}];
  function defaults() { return JSON.parse(JSON.stringify(USER_DEFAULTS)); }
  // ancienne version estimée (gardée pour mémoire, plus utilisée)
  // eslint-disable-next-line no-unused-vars
  function estimatedDefaults() {
    const M = APT.main, b = APT.bath;
    const corridor = [M[5], M[6], M[7], M[8]];
    const cx = corridor.reduce((s, q) => s + q[0], 0) / 4, cz = corridor.reduce((s, q) => s + q[1], 0) / 4;
    const bathC = b.toWorld(b.w / 2, b.d / 2);
    const mirror = mirrorSpot();
    const pts = [];
    const add = (type, x, z, extra) => pts.push(Object.assign({ id: 'e' + (pts.length + 1), type, x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10 }, extra || {}));
    const wall = (type, x, z, extra) => { const w = toWall(x, z); add(type, w.x, w.z, Object.assign({ nx: w.nx, nz: w.nz, y: TYPES[type].y }, extra || {})); };
    // points lumineux décrits par l'utilisateur : salon aux 2 tiers (le 2e aligné avec la cuisine), entrée, salle d'eau, miroir
    add('ceiling', 207, 140, { label: 'Salon (1er tiers)' });
    add('ceiling', 414, 140, { label: 'Salon (2e tiers)' });
    // cuisine : réglette horizontale à ~160 cm, au milieu du mur côté évier (au-dessus du plan), pas un point au plafond
    wall('wall-light', APT.kitchen.west.x + 3, KITCHEN_LIGHT_Z, { y: 160, style: 'bulb', label: 'Cuisine (ampoule murale)' });
    add('ceiling', cx, cz, { label: 'Entrée' });
    add('ceiling', bathC[0], bathC[1], { label: "Salle d'eau", style: 'flush' });
    add('wall-light', mirror.x, mirror.z, { nx: mirror.nx, nz: mirror.nz, y: MIRROR_Y, label: 'Éclairage miroir' });
    // tableau électrique dans l'entrée, sur le mur de la salle d'eau ; pilotage du chauffage juste à sa droite (vu de l'entrée)
    const meter = along(M[7], M[8], 32), heat = along(M[7], M[8], 66);
    wall('meter', meter[0] + 5, meter[1] + 2, { label: 'Tableau électrique / compteur' });
    wall('heating', heat[0] + 5, heat[1] + 2, { label: 'Pilotage du chauffage' });
    // vus sur les photos (positions approximatives)
    wall('switch', 5, 305, { y: 115, label: 'Interrupteur (près de la salle d\'eau)' });
    wall('outlet', 5, 305, { y: 95, label: 'Prise (sous l\'interrupteur)' });
    wall('outlet', 275, 5, { label: 'Prise près de la baie' });
    wall('outlet', 615, -150, { y: 110, n: 2, label: 'Prises plan de travail' });
    // interrupteurs supposés (à ajuster) : entrée, à côté de la porte d'entrée (mur droit) ; salle d'eau, dans l'entrée à gauche de sa porte
    const nearG = along(M[6], M[5], 25);
    wall('switch', nearG[0] - 3, nearG[1] - 2, { label: 'Interrupteur entrée' });
    const nearBath = along(M[7], M[8], 110);
    wall('switch', nearBath[0] + 5, nearBath[1] + 2, { n: 2, label: "Interrupteur salle d'eau" });
    // liaisons par défaut (interrupteur → lumières, par poste)
    const id = (label) => (pts.find((p) => p.label === label) || {}).id;
    const link = (label, ctrl) => { const s = pts.find((p) => p.label === label); if (s) s.ctrl = ctrl.map((g) => g.map(id).filter(Boolean)); };
    link("Interrupteur (près de la salle d'eau)", [['Salon (1er tiers)', 'Salon (2e tiers)']]);
    link('Interrupteur entrée', [['Entrée']]);
    link("Interrupteur salle d'eau", [["Salle d'eau"], ['Éclairage miroir']]);
    return pts;
  }

  // ------------------------------------------------------------------ données
  let pts = [];
  // mode visite : uniquement l'électricité du lien, sinon les positions par défaut ; jamais le stockage du navigateur (ADR 0009)
  const viewOnly = !!(window.SCEN && SCEN.viewOnly);
  // lien : e = liste complète (anciens liens) ; e2 = un id seul pour un point resté comme au départ, sinon le point entier
  const sharedList = () => {
    const P = SCEN.sharedPayload;
    if (Array.isArray(P.e)) return P.e;
    if (!Array.isArray(P.e2)) return null;
    const byId = {};
    defaults().forEach((d) => (byId[d.id] = d));
    return P.e2.map((x) => (typeof x === 'string' ? (Object.prototype.hasOwnProperty.call(byId, x) ? byId[x] : null) : x)).filter(Boolean);
  };
  const shared = viewOnly && SCEN.sharedPayload ? sharedList() : null;
  function load() {
    if (shared) return shared;
    if (viewOnly) return defaults();
    try { const v = JSON.parse(localStorage.getItem(KEY)); if (Array.isArray(v)) return migrate(v); } catch (e) {}
    return defaults();
  }
  // 15/11/2026 : la lumière de la cuisine est une ampoule nue au mur côté évier, à ~160 cm, au milieu du plan.
  // Migration (une fois) des positions par défaut jamais déplacées : ancien point au plafond (414 ; −106),
  // puis première version en réglette (z −125).
  function migrate(list) {
    list.forEach((p) => {
      if (!p) return;
      const oldCeil = p.type === 'ceiling' && p.label === 'Cuisine' && Math.abs(p.x - 414) < 1 && Math.abs(p.z + 106) < 1;
      const oldBar = p.type === 'wall-light' && p.label === 'Cuisine (réglette)' && Math.abs(p.x - 319) < 1 && Math.abs(p.z + 125) < 1;
      // 15/11/2026 : tableau électrique et pilotage du chauffage un peu plus bas (150 → 130 cm) s'ils n'ont pas été réglés
      if ((p.type === 'meter' || p.type === 'heating') && p.y === 150) { p.y = 130; migrated = true; }
      // 15/11/2026 : salle d'eau réaménagée → l'éclairage du miroir suit le meuble vasque (s'il était resté à sa place de départ)
      if (p.type === 'wall-light' && p.label === 'Éclairage miroir' && p.y === 190) {
        const old = toWall(...APT.bath.toWorld(152, APT.bath.d - 3));
        if (Math.hypot(p.x - old.x, p.z - old.z) < 1.5) { const m = mirrorSpot(); Object.assign(p, { x: Math.round(m.x * 10) / 10, z: Math.round(m.z * 10) / 10, nx: m.nx, nz: m.nz, y: MIRROR_Y }); migrated = true; }
      }
      if (oldCeil || oldBar) {
        const w = toWall(APT.kitchen.west.x + 3, KITCHEN_LIGHT_Z);
        Object.assign(p, { type: 'wall-light', x: w.x, z: w.z, nx: w.nx, nz: w.nz, y: 160, style: 'bulb', label: 'Cuisine (ampoule murale)' });
        migrated = true;
      }
    });
    return list;
  }
  const has = (o, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);
  // nombre fini : isFinite(null) === true, d'où ce test explicite (null, '' ou objet refusés)
  const num = (v) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? +v : NaN);
  const fin = (v) => Number.isFinite(num(v));
  // identifiant sûr (il finit dans des attributs HTML et des sélecteurs) : lettres, chiffres, _ et - seulement
  const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
  const isLight = (p) => p.type === 'ceiling' || p.type === 'wall-light';
  // liaisons interrupteur → lumières, par poste : ctrl = [[ids du poste 1], [ids du poste 2], …] (au plus n postes)
  // ids existants (points lumineux) seulement, dédoublonnés ; postes vides en fin retirés ; champ supprimé s'il ne relie rien
  function cleanCtrl(p, lightIds) {
    const raw = p.ctrl;
    delete p.ctrl;
    if (p.type !== 'switch' || !Array.isArray(raw)) return;
    const c = raw.slice(0, p.n || 1).map((g) => {
      if (!Array.isArray(g)) return [];
      const out = [];
      g.forEach((id) => { if (typeof id === 'string' && ID_RE.test(id) && lightIds.has(id) && !out.includes(id)) out.push(id); });
      return out;
    });
    while (c.length && !c[c.length - 1].length) c.pop();
    if (c.length) p.ctrl = c;
  }
  // à appeler après toute modification de la liste (point supprimé, postes réduits, import…)
  function pruneCtrl(list) {
    const lightIds = new Set(list.filter(isLight).map((p) => p.id));
    list.forEach((p) => { if (p.ctrl !== undefined) cleanCtrl(p, lightIds); });
    return list;
  }
  function clean(list) {
    const ids = new Set();
    const newId = () => { let id; do id = 'e' + Math.random().toString(36).slice(2, 8); while (ids.has(id)); return id; };
    const out = (Array.isArray(list) ? list : []).filter((p) => p && typeof p === 'object' && has(TYPES, p.type) && fin(p.x) && fin(p.z)).map((p) => {
      let id = typeof p.id === 'string' || typeof p.id === 'number' ? String(p.id) : '';
      if (!ID_RE.test(id) || ids.has(id)) id = newId(); // identifiant manquant, douteux ou en double : on en crée un
      ids.add(id);
      const o = { id, type: p.type, x: Math.round(num(p.x) * 10) / 10, z: Math.round(num(p.z) * 10) / 10 };
      if (TYPES[p.type].wall) {
        o.y = fin(p.y) ? Math.max(0, Math.min(H, num(p.y))) : TYPES[p.type].y;
        o.nx = fin(p.nx) ? num(p.nx) : 0; o.nz = fin(p.nz) ? num(p.nz) : 0;
      }
      if (fin(p.n) && num(p.n) > 1) o.n = Math.min(4, Math.round(num(p.n)));
      if (typeof p.style === 'string' && p.style && has(STYLES, p.style)) o.style = p.style;
      if (typeof p.label === 'string' && p.label.trim()) o.label = p.label.slice(0, 80);
      if (p.off && (p.type === 'ceiling' || p.type === 'wall-light')) o.off = true; // lumière éteinte
      if (p.type === 'switch' && Array.isArray(p.ctrl)) o.ctrl = p.ctrl; // filtré ci-dessous, une fois tous les ids connus
      return o;
    });
    return pruneCtrl(out);
  }
  pts = clean(load());
  if (migrated && !viewOnly) save(); // migration enregistrée une fois
  function save() {
    if (viewOnly) return;
    try { localStorage.setItem(KEY, JSON.stringify(pts)); } catch (e) {}
  }
  let selId = null;
  const sel = () => pts.find((p) => p.id === selId) || null;

  // ------------------------------------------------------------------ interrupteurs → lumières
  const lightName = (p) => p.label || (p.type === 'wall-light' ? 'Applique' : 'Point lumineux');
  const byId = (id) => pts.find((p) => p.id === id) || null;
  // lumières d'un poste (k : 0 = premier poste)
  const postLights = (sw, k) => ((sw.ctrl && sw.ctrl[k]) || []).map(byId).filter((p) => p && isLight(p));
  // postes reliés : [{ sw, k, lights, on }] ; un poste est « allumé » si au moins une de ses lumières l'est
  function groups() {
    const out = [];
    pts.forEach((sw) => {
      if (sw.type !== 'switch' || !sw.ctrl) return;
      sw.ctrl.forEach((_, k) => { const lights = postLights(sw, k); if (lights.length) out.push({ sw, k, lights, on: lights.some((p) => !p.off) }); });
    });
    return out;
  }
  // interrupteurs (et postes) qui commandent une lumière
  const controllers = (light) => groups().filter((g) => g.lights.includes(light));
  const postName = (sw, k) => pName(sw) + ((sw.n || 1) > 1 ? ` · poste ${k + 1}` : '');
  // basculer un poste : tout s'éteint si au moins une lumière est allumée, sinon tout s'allume (instantané, sans recréer les lumières)
  function toggle(id, k, force) {
    const sw = byId(id);
    if (!sw || sw.type !== 'switch') return null;
    const lights = postLights(sw, k);
    if (!lights.length) return null;
    const on = typeof force === 'boolean' ? force : !lights.some((p) => !p.off);
    lights.forEach((p) => { if (on) delete p.off; else p.off = true; });
    save();
    if (window.__lights) { __lights.applyCeiling(); __lights.renderPoints(); }
    renderCard();
    if (A.invalidate) A.invalidate();
    return on;
  }

  const ELEC = (window.ELEC = {
    points: () => pts,
    data: () => JSON.parse(JSON.stringify(pts)),
    setData: (list) => { pts = clean(list); selId = null; changed(); },
    save: () => save(),
    renderCard: () => renderCard(), // appelé par lights.js quand un point est allumé/éteint depuis la carte Éclairage
    types: TYPES,
    groups, // postes d'interrupteurs reliés à des lumières (carte Éclairage)
    toggle, // ELEC.toggle(idInterrupteur, poste (0…), forcer?) → nouvel état (true = allumé), null si rien de relié
    postName,
    lightName,
  });
  // le lien de partage / de visite emporte l'électricité (en ne détaillant que les points modifiés ou ajoutés)
  const canon = (o) => JSON.stringify(Object.keys(o).sort().reduce((r, k) => ((r[k] = o[k]), r), {}));
  if (window.SCEN && SCEN.shareExtras) SCEN.shareExtras.push(() => {
    const base = {};
    clean(defaults()).forEach((d) => (base[d.id] = canon(d)));
    const r4 = (v) => Math.round(v * 1e4) / 1e4;
    return { e2: ELEC.data().map((p) => {
      if (base[p.id] === canon(p)) return p.id;
      if (typeof p.nx === 'number') { p.nx = r4(p.nx); p.nz = r4(p.nz); }
      return p;
    }) };
  });

  function changed(noSave) {
    pruneCtrl(pts); // liaisons vers des lumières supprimées ou des postes retirés
    if (!noSave) save();
    rebuild3D();
    if (window.__lights && __lights.rebuildCeiling) __lights.rebuildCeiling();
    renderCard();
    runChecks();
  }

  // ------------------------------------------------------------------ 3D : plaques murales + repères du mode
  const group = new THREE.Group();
  A.scene.add(group);
  const badges = new THREE.Group();
  badges.visible = false;
  A.scene.add(badges);
  const plateMat = new THREE.MeshStandardMaterial({ color: 0xfbfbf9, roughness: 0.4 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x3a3c40, roughness: 0.6 });
  const greyMat = new THREE.MeshStandardMaterial({ color: 0xd8d9d6, roughness: 0.5 });
  const iconCache = {};
  function iconTex(type, selected) {
    const k = type + (selected ? '*' : '');
    if (iconCache[k]) return iconCache[k];
    const c = document.createElement('canvas');
    c.width = c.height = 96;
    const x = c.getContext('2d');
    x.beginPath(); x.arc(48, 48, 40, 0, Math.PI * 2);
    x.fillStyle = '#ffffff'; x.fill();
    x.lineWidth = selected ? 10 : 6; x.strokeStyle = selected ? '#1f5f5b' : TYPES[type].color; x.stroke();
    x.font = '44px "Segoe UI Emoji", "Apple Color Emoji", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = '#222'; x.fillText(TYPES[type].icon, 48, 52);
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    return (iconCache[k] = t);
  }
  const box = (g, w, h, d, m, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = false; b.receiveShadow = true; g.add(b); return b; };

  function plate(p) {
    const g = new THREE.Group();
    g.position.set(p.x + (p.nx || 0) * 0.6, p.y, p.z + (p.nz || 0) * 0.6);
    // +z local = vers la pièce. Attention : nz peut valoir 0 (mur orienté est/ouest) → pas de « || 1 », qui donnait une diagonale à 45°
    g.rotation.y = p.nx || p.nz ? Math.atan2(p.nx || 0, p.nz || 0) : 0;
    const n = p.n || 1;
    if (p.type === 'meter') {
      // tableau encastré dans le mur : seule la porte affleure (cadre + porte + petite poignée)
      box(g, 48, 64, 0.6, greyMat, 0, 0, 0.3);
      box(g, 45, 61, 1, plateMat, 0, 0, 0.9);
      box(g, 41, 0.4, 0.3, greyMat, 0, 18, 1.5);
      box(g, 2.4, 7, 0.8, greyMat, 18, -4, 1.7);
    } else if (p.type === 'heating') {
      box(g, 12, 12, 2.4, plateMat, 0, 0, 1.2);
      box(g, 8, 4.5, 0.4, darkMat, 0, 2, 2.5);
    } else if (p.type !== 'wall-light') {
      for (let k = 0; k < n; k++) {
        const ox = (k - (n - 1) / 2) * 7.2;
        box(g, 8.2, 8.2, 1.2, plateMat, ox, 0, 0.6);
        if (p.type === 'outlet') { box(g, 4.4, 4.4, 0.3, greyMat, ox, 0, 1.25); box(g, 0.8, 0.8, 0.4, darkMat, ox - 1, 0, 1.4); box(g, 0.8, 0.8, 0.4, darkMat, ox + 1, 0, 1.4); }
        if (p.type === 'switch') { box(g, 5, 5, 0.6, greyMat, ox, 0, 1.4); g.userData.sw = p.id; } // plaque cliquable (basculer un poste)
        if (p.type === 'rj45') box(g, 1.8, 1.4, 0.4, darkMat, ox, 0, 1.3);
        if (p.type === 'tv') { const r = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.6, 16), greyMat); r.rotation.x = Math.PI / 2; r.position.set(ox, 0, 1.4); g.add(r); }
      }
    }
    return g;
  }

  function rebuild3D() {
    [group, badges].forEach((g) => { while (g.children.length) { const c = g.children.pop(); c.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.isSprite) o.material.dispose(); }); } });
    pts.forEach((p) => {
      if (TYPES[p.type].wall) group.add(plate(p));
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: iconTex(p.type, p.id === selId), depthTest: false, transparent: true }));
      s.position.set(p.x + (p.nx || 0) * 14, p.type === 'ceiling' ? H - 20 : Math.min(H - 25, (p.y || 30) + 18), p.z + (p.nz || 0) * 14);
      s.userData.id = p.id;
      s.renderOrder = 30;
      badges.add(s);
    });
    scaleBadges();
    if (A.invalidate) A.invalidate(); // rendu à la demande : les repères n'ont pas d'ombre, markShadows ne suffit pas
  }
  // taille des repères constante à l'écran
  const v3 = new THREE.Vector3();
  function scaleBadges() {
    if (!badges.visible) return;
    badges.children.forEach((s) => {
      const d = A.camera.position.distanceTo(s.position);
      const k = (2 * d * Math.tan((A.camera.fov * Math.PI) / 360)) / Math.max(1, A.renderer.domElement.clientHeight) * 26;
      s.scale.set(k, k, 1);
    });
  }
  A.hooks.frame.push(scaleBadges);

  // ------------------------------------------------------------------ vérifications
  const NEEDS_POWER = { deskpc: 'Bureau PC', lampfloor: 'Lampadaire', lampdesk: 'Lampe de bureau', lampbedside: 'Lampe de chevet', tvstand: 'Meuble TV' };
  const MAX_CORD = 200; // cm : longueur raisonnable d'un câble / d'une rallonge courte
  let checks = [];
  function runChecks() {
    const out = [];
    const items = A.items;
    const fmt = (cm) => (cm / 100).toFixed(1).replace('.', ',') + ' m';
    // 1) prises / interrupteurs cachés par un meuble (hors sièges et objets posés, déplaçables)
    pts.filter((p) => TYPES[p.type].wall && p.type !== 'wall-light').forEach((p) => {
      const probe = [p.x + (p.nx || 0) * 4, p.z + (p.nz || 0) * 4];
      items.forEach((it) => {
        const def = FURN.byId[it.type];
        if (def.seat || def.onTop) return;
        if (def.under && p.y < (def.top || 75)) return; // prise sous / derrière une table ou un bureau : normal, accessible
        const topH = def.top ? def.top * (it.h / def.h) : it.h; // hauteur du plateau (bureau : 75 cm, pas les écrans)
        const pl = A.poly(it);
        const near = APT.pointInPoly(probe, pl) || pl.some((a, j) => { const b = pl[(j + 1) % 4]; const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz; const t = Math.max(0, Math.min(1, ((probe[0] - a[0]) * dx + (probe[1] - a[1]) * dz) / L2)); return Math.hypot(a[0] + dx * t - probe[0], a[1] + dz * t - probe[1]) < 4; });
        if (near && topH > (p.y || 0) - 6) out.push({ ko: true, text: `${it.name} cache : ${p.label || TYPES[p.type].label}`, item: it, pt: p });
      });
    });
    // 2) appareils à brancher : prise la plus proche
    const outlets = pts.filter((p) => p.type === 'outlet');
    items.forEach((it) => {
      if (!NEEDS_POWER[it.type]) return;
      let best = Infinity;
      outlets.forEach((o) => { best = Math.min(best, Math.hypot(o.x - it.x, o.z - it.z)); });
      const ok = best <= MAX_CORD;
      out.push({ ko: !ok, text: `${it.name} : prise la plus proche à ${isFinite(best) ? fmt(best) : '—'}${ok ? '' : ' (rallonge nécessaire)'}`, item: it });
    });
    // 3) bureau PC : RJ45 (information)
    const rj = pts.filter((p) => p.type === 'rj45');
    items.filter((it) => it.type === 'deskpc').forEach((it) => {
      let best = Infinity;
      rj.forEach((o) => { best = Math.min(best, Math.hypot(o.x - it.x, o.z - it.z)); });
      out.push({ info: true, text: rj.length ? `${it.name} : RJ45 la plus proche à ${fmt(best)}` : `${it.name} : aucune prise RJ45 placée (Wi-Fi ?)`, item: it });
    });
    checks = out;
    renderChecks();
  }

  // ------------------------------------------------------------------ interface
  const css = document.createElement('style');
  css.textContent = `
    #elec-slot { flex:none; }
    .el-types { display:grid; grid-template-columns:1fr 1fr; gap:5px; margin-top:8px; }
    .el-types button { font-size:12px; padding:6px 6px; text-align:left; display:flex; gap:6px; align-items:center; }
    .el-types button.on { background:var(--accent); border-color:var(--accent); color:#fff; }
    .el-list { list-style:none; margin:8px 0 0; padding:0; max-height:200px; overflow:auto; }
    .el-list li { display:flex; gap:7px; align-items:center; padding:4px 6px; border-radius:6px; cursor:pointer; font-size:12.5px; }
    .el-list li:hover { background:var(--soft); }
    .el-list li.sel { background:var(--accent-soft); color:var(--accent); font-weight:600; }
    .el-list li small { color:var(--mute); margin-left:auto; font-variant-numeric:tabular-nums; }
    .el-checks { list-style:none; margin:6px 0 0; padding:0; }
    .el-checks li { font-size:12px; padding:3px 4px; border-radius:5px; display:flex; gap:6px; cursor:pointer; }
    .el-checks li:hover { background:var(--soft); }
    .el-checks li.ko { color:#8a2a1c; }
    .el-checks li b { width:12px; flex:none; text-align:center; }
    .el-checks li.ok b { color:#2f8a57; } .el-checks li.ko b { color:var(--bad); } .el-checks li.info b { color:var(--mute); }
    #el-sel .row { margin-top:6px; }
    .el-post { border:1px solid var(--line); border-radius:7px; padding:5px 7px; margin-top:6px; }
    .el-post-head { display:flex; align-items:center; justify-content:space-between; gap:6px; font-size:12px; font-weight:600; }
    .el-post-head button { font-size:11.5px; padding:2px 8px; }
    .el-post-head button.lit { background:#fff4d6; border-color:#e0a526; }
    .el-post-lights { display:flex; flex-direction:column; gap:2px; margin-top:4px; }
    .el-post-lights label { font-size:12px; display:flex; gap:4px; align-items:center; cursor:pointer; }
    .el-post-lights input { width:auto; margin:0; }
    .el-by { margin-top:6px; }
    #el-sel select, #el-sel input { font-size:13px; }
    #elec-badge { display:inline-block; min-width:16px; padding:0 4px; margin-left:4px; border-radius:99px; background:var(--bad); color:#fff; font-size:11px; line-height:16px; text-align:center; }
    #elec-badge[hidden] { display:none; }
    #el-hint { left:50%; top:14px; transform:translateX(-50%); z-index:5; color:var(--ink); white-space:nowrap; }
    #el-hint[hidden] { display:none; }`;
  document.head.appendChild(css);

  $('elec-slot').innerHTML = `<button id="elec-btn" class="icon" title="Placer prises, interrupteurs, points lumineux…">⚡ Électricité<span id="elec-badge" hidden></span></button>`;
  const card = $('elec-card');
  card.hidden = false;
  const hint = document.createElement('div');
  hint.id = 'el-hint';
  hint.className = 'bubble';
  hint.hidden = true;
  $('view').appendChild(hint);

  let mode = false, placeType = null;
  function renderCard() {
    const s = sel();
    const typeBtns = Object.entries(TYPES).map(([k, t]) => `<button data-t="${k}" class="${placeType === k ? 'on' : ''}" title="${t.label}">${t.icon} ${t.short}</button>`).join('');
    const list = pts.map((p) => `<li data-id="${esc(p.id)}" class="${p.id === selId ? 'sel' : ''}"><span>${TYPES[p.type].icon}</span><span>${esc(p.label || TYPES[p.type].label)}</span><small>${TYPES[p.type].wall ? Math.round(p.y) + ' cm' : 'plafond'}</small></li>`).join('');
    card.innerHTML = `
      <div class="card-head"><h3>Électricité</h3><button id="el-mode" class="${mode ? 'on' : ''}" style="padding:3px 9px;font-size:12px">${mode ? 'Terminer' : 'Placer / modifier'}</button></div>
      ${mode ? `<div class="legend">Choisis un élément, puis clique <b>sur le mur</b>, à la hauteur voulue (en vue 3D), ou n'importe où pour un point au plafond. Glisse un repère pour le déplacer sur les murs.</div>
      <div class="el-types">${typeBtns}</div>` : ''}
      ${mode && s ? selPanel(s) : ''}
      ${mode ? `<ul class="el-list">${list}</ul>
      <div class="btns"><button id="el-reset" class="danger" title="Remettre les positions estimées au départ">Positions de départ</button></div>` : ''}
      <div class="group-label">Vérifications</div>
      <ul class="el-checks" id="el-checks"></ul>`;
    card.querySelectorAll('.el-types button').forEach((b) => (b.onclick = () => { placeType = placeType === b.dataset.t ? null : b.dataset.t; selId = null; updateHint(); renderCard(); rebuild3D(); }));
    card.querySelectorAll('.el-list li').forEach((li) => (li.onclick = () => { selId = li.dataset.id; placeType = null; updateHint(); renderCard(); rebuild3D(); }));
    const m = $('el-mode'); if (m) m.onclick = () => setMode(!mode);
    const r = $('el-reset'); if (r) r.onclick = () => { if (confirm("Remettre toutes les positions électriques de départ ? (tes modifications seront perdues)")) { pts = clean(defaults()); selId = null; changed(); } };
    if (s) bindSel(s);
    renderChecks();
  }
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function selPanel(s) {
    const t = TYPES[s.type];
    return `<div id="el-sel" style="border-top:1px solid var(--line);margin-top:10px;padding-top:8px">
      <div class="group-label" style="margin-top:0">Sélection · ${t.icon} ${t.label}</div>
      <label class="field">Nom<input id="el-label" type="text" maxlength="80" value="${esc(s.label || '')}" placeholder="${esc(t.label)}"></label>
      ${t.wall ? (() => {
        const w = wallOf(s);
        return `<div class="row el-pos">
          <label>Hauteur du sol (cm)<input id="el-y" type="number" step="1" min="${Y_MIN}" max="${Y_MAX}" value="${Math.round(s.y)}"></label>
          <label>Depuis l'angle gauche (cm)<input id="el-s" type="number" step="1" value="${w ? Math.round(leftDist(w.e, w.t)) : ''}"></label>
        </div>
        <div class="legend"><span id="el-wall">${w ? `Mur de ${Math.round(w.e.L)} cm, vu de face depuis la pièce. ` : ''}</span>Glisse le repère sur les murs, ou <kbd>←</kbd><kbd>→</kbd> le long du mur et <kbd>↑</kbd><kbd>↓</kbd> en hauteur (<kbd>Maj</kbd> : 10 cm).</div>`;
      })() : ''}
      <div class="row">
        ${t.wall ? '' : `<label>X (cm)<input id="el-x" type="number" step="1" value="${Math.round(s.x)}"></label>
        <label>Z (cm)<input id="el-z" type="number" step="1" value="${Math.round(s.z)}"></label>`}
        ${t.gang ? `<label>Nombre de postes<select id="el-n">${[1, 2, 3, 4].map((k) => `<option ${(s.n || 1) === k ? 'selected' : ''}>${k}</option>`).join('')}</select></label>` : ''}
        ${s.type === 'ceiling' || s.type === 'wall-light' ? `<label>Allumé<select id="el-on"><option value="1" ${s.off ? '' : 'selected'}>Oui</option><option value="0" ${s.off ? 'selected' : ''}>Non</option></select></label>` : ''}
        ${s.type === 'ceiling' || s.type === 'wall-light' ? `<label>Luminaire<select id="el-style">${Object.entries(s.type === 'ceiling' ? STYLES : WALL_STYLES).map(([k, v]) => `<option value="${k}" ${(s.style || '') === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>` : ''}
      </div>
      ${s.type === 'switch' ? ctrlPanel(s) : ''}
      ${isLight(s) ? (() => {
        const c = controllers(s);
        return `<div class="legend el-by">Commandé par : ${c.length ? c.map((g) => `<b>${esc(postName(g.sw, g.k))}</b>`).join(', ') : 'aucun interrupteur (relie-le depuis un interrupteur)'}</div>`;
      })() : ''}
      <div class="btns"><button id="el-del" class="danger">Supprimer</button></div>
    </div>`;
  }
  // interrupteur : une ligne par poste, cases à cocher des lumières du logement + bouton « basculer »
  function ctrlPanel(s) {
    const lights = pts.filter(isLight);
    if (!lights.length) return '<div class="legend">Aucun point lumineux à relier : place-en d\'abord.</div>';
    const n = s.n || 1;
    let h = '<div class="group-label">Lumières commandées</div>';
    for (let k = 0; k < n; k++) {
      const ids = (s.ctrl && s.ctrl[k]) || [], linked = postLights(s, k), on = linked.some((p) => !p.off);
      h += `<div class="el-post" data-k="${k}">
        <div class="el-post-head"><span>${n > 1 ? `Poste ${k + 1}` : 'Interrupteur'}</span>
          <button class="el-tg${linked.length && on ? ' lit' : ''}" data-k="${k}" ${linked.length ? '' : 'disabled'} title="Allumer / éteindre les lumières de ce poste">${linked.length ? (on ? '💡 Éteindre' : 'Allumer') : 'Rien de relié'}</button></div>
        <div class="el-post-lights">${lights.map((p) => `<label><input type="checkbox" data-k="${k}" data-id="${esc(p.id)}" ${ids.includes(p.id) ? 'checked' : ''}>${TYPES[p.type].icon} ${esc(lightName(p))}</label>`).join('')}</div>
      </div>`;
    }
    return h;
  }
  function bindSel(s) {
    const on = (id, ev, fn) => { const e = $(id); if (e) e[ev] = fn; };
    on('el-label', 'oninput', (e) => { s.label = e.target.value; save(); const li = card.querySelector(`.el-list li[data-id="${cssEsc(s.id)}"] span:nth-child(2)`); if (li) li.textContent = s.label || TYPES[s.type].label; if (window.__lights && (s.type === 'ceiling' || s.type === 'wall-light')) __lights.renderPoints(); });
    // hauteur et position le long du mur : appliquées en direct à la saisie (sans reconstruire le panneau), enregistrées en sortie de champ
    const live = (fn) => (e) => { const v = parseFloat(e.target.value); if (!isFinite(v)) return; fn(v); rebuild3D(); if (s.type === 'wall-light' && window.__lights) __lights.rebuildCeiling(); };
    on('el-y', 'oninput', live((v) => nudge(s, 0, v - (s.y || 0))));
    on('el-s', 'oninput', live((v) => { const w = wallOf(s); if (w) nudge(s, v - leftDist(w.e, w.t), 0); }));
    on('el-y', 'onchange', () => changed());
    on('el-s', 'onchange', () => changed());
    on('el-n', 'onchange', (e) => { s.n = +e.target.value; changed(); });
    on('el-on', 'onchange', (e) => {
      if (e.target.value === '1') delete s.off; else s.off = true;
      save();
      if (window.__lights) { __lights.applyCeiling(); __lights.renderPoints(); } // instantané : pas de reconstruction
    });
    on('el-style', 'onchange', (e) => { if (e.target.value) s.style = e.target.value; else delete s.style; changed(); });
    const moveXZ = () => { const x = +$('el-x').value, z = +$('el-z').value; if (isFinite(x) && isFinite(z)) { s.x = r1(x); s.z = r1(z); } changed(); };
    on('el-x', 'onchange', moveXZ);
    on('el-z', 'onchange', moveXZ);
    on('el-del', 'onclick', () => { pts = pts.filter((p) => p !== s); selId = null; changed(); });
    // liaisons interrupteur → lumières
    card.querySelectorAll('.el-post-lights input').forEach((cb) => (cb.onchange = () => {
      const k = +cb.dataset.k, id = cb.dataset.id, n = s.n || 1;
      const c = Array.from({ length: n }, (_, j) => ((s.ctrl && s.ctrl[j]) || []).slice());
      c[k] = cb.checked ? c[k].concat(c[k].includes(id) ? [] : [id]) : c[k].filter((x) => x !== id);
      s.ctrl = c;
      changed(); // nettoie (postes vides en fin), enregistre, met à jour la carte Éclairage
    }));
    card.querySelectorAll('.el-tg').forEach((b) => (b.onclick = () => toggle(s.id, +b.dataset.k)));
  }
  const cssEsc = (v) => (window.CSS && CSS.escape ? CSS.escape(v) : String(v).replace(/[^A-Za-z0-9_-]/g, '\\$&')); // repli (vieux navigateurs) ; les ids sont déjà filtrés par ID_RE
  function renderChecks() {
    const ul = $('el-checks');
    if (!ul) return;
    const ko = checks.filter((c) => c.ko).length;
    ul.innerHTML = checks.length ? '' : '<li class="info"><b>·</b>Rien à signaler.</li>';
    checks.forEach((c) => {
      const li = document.createElement('li');
      li.className = c.ko ? 'ko' : c.info ? 'info' : 'ok';
      li.innerHTML = `<b>${c.ko ? '✗' : c.info ? 'i' : '✓'}</b><span></span>`;
      li.querySelector('span').textContent = c.text;
      li.onclick = () => { if (c.pt && mode) { selId = c.pt.id; renderCard(); rebuild3D(); } else if (c.item && !mode && !A.readOnly) A.select(c.item); };
      ul.appendChild(li);
    });
    const badge = $('elec-badge');
    badge.hidden = !ko;
    badge.textContent = ko;
  }
  function updateHint() {
    hint.hidden = !mode;
    if (!mode) return;
    const touch = window.matchMedia && matchMedia('(pointer: coarse)').matches;
    const tap = touch ? 'Touche' : 'Clique', esc = touch ? '' : ' · Échap pour annuler';
    const top = fromAbove();
    hint.textContent = placeType
      ? `${TYPES[placeType].icon} ${tap} ${TYPES[placeType].wall ? (top ? 'près du mur voulu (vue de dessus : hauteur par défaut — passe en 3D pour viser la hauteur)' : 'sur le mur, à la hauteur voulue') : "à l'endroit du point lumineux"} pour poser${esc}`
      : `Choisis un élément à poser dans le panneau, ou glisse un repère sur les murs pour le déplacer${touch ? '' : ' · Échap pour terminer'}`;
  }

  function setMode(on) {
    if (A.readOnly || A.isWalking()) on = false;
    mode = on;
    placeType = null;
    if (!on) selId = null;
    A.tool = on ? 'elec' : A.tool === 'elec' ? null : A.tool;
    // on garde la vue courante : en 3D on vise directement le mur (position + hauteur) ; la vue Dessus reste utile pour le plafond
    if (on) A.select(null);
    badges.visible = on;
    $('elec-btn').classList.toggle('on', on);
    updateHint();
    renderCard();
    rebuild3D();
  }
  $('elec-btn').onclick = () => setMode(!mode);
  // flèches : réglage fin du point mural sélectionné (avant le noyau, qui déplacerait la vue)
  window.addEventListener('keydown', (e) => {
    if (!mode || /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
    const s = sel(), k = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[e.key];
    if (!s || !k || !TYPES[s.type].wall) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const step = e.shiftKey ? 10 : 1;
    nudge(s, k[0] * step, k[1] * step);
    rebuild3D(); liveFields(s);
    clearTimeout(nudgeSave); nudgeSave = setTimeout(() => changed(), 400);
  }, true);
  let nudgeSave = null;
  window.addEventListener('keydown', (e) => {
    if (!mode) return;
    if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
    if (e.key === 'Escape') { if (placeType || selId) { placeType = null; selId = null; updateHint(); renderCard(); rebuild3D(); } else setMode(false); }
    if ((e.key === 'Delete' || e.key === 'Backspace') && sel()) { const s = sel(); pts = pts.filter((p) => p !== s); selId = null; changed(); e.preventDefault(); }
  });

  // ------------------------------------------------------------------ souris (seulement en mode Électricité)
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const cvs = A.renderer.domElement;
  function setRay(e) {
    altHeld = !!(e.altKey || e.shiftKey); // Maj (ou Alt) : sans aimant
    const r = cvs.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, A.camera);
  }
  function floorPoint() { const p = new THREE.Vector3(); return ray.ray.intersectPlane(floor, p) ? p : null; }
  // vue (presque) de dessus : les murs se voient par la tranche, on ne peut pas viser une hauteur → pose au sol puis mur le plus proche
  const camDir = new THREE.Vector3();
  const fromAbove = () => A.camera.getWorldDirection(camDir).y < -0.94;
  // mur visé sous la souris (face intérieure), à la hauteur visée
  function wallHit() {
    if (fromAbove()) return null;
    const h = ray.intersectObjects(pickWalls.children, false)[0];
    if (!h) return null;
    const e = h.object.userData.wall;
    return onWall(e, (h.point.x - e.a[0]) * e.d[0] + (h.point.z - e.a[1]) * e.d[1], h.point.y);
  }
  const r1 = (v) => Math.round(v * 10) / 10;
  function applyWall(p, w) { p.x = r1(w.x); p.z = r1(w.z); p.nx = w.nx; p.nz = w.nz; p.y = Math.round(w.y); }
  // ---- magnétisme des prises (prise, RJ45, TV), à la pose et au glisser à la souris ; Maj (ou Alt) pour le désactiver
  //  1) côte à côte avec une autre prise du même mur (entraxe d'un cadre multiple, même hauteur) ;
  //  2) sinon hauteur standard (25 cm, 110 cm au-dessus du plan de travail) ou hauteur d'une autre prise du logement ;
  //  3) avec « Aimant 5 cm » : position le long du mur et hauteur arrondies à 5 cm (si rien d'autre n'a aimanté).
  // familles : les prises (courant, RJ45, TV) s'aimantent entre elles, les interrupteurs entre eux
  const SNAP_TYPES = { outlet: 'plug', rj45: 'plug', tv: 'plug', switch: 'switch' };
  const GANG = 7.2; // entraxe de deux postes dans un même cadre (cm)
  const STD_Y_OF = { plug: [25, 110], switch: [110] };
  const MAX_GANG = 4;
  const NEAR_SIDE = 10, NEAR_Y = 5; // portée de l'aimant (cm)
  let altHeld = false, snapLabel = null, snapNext = null; // snapNext : point voisin sur lequel on s'est calé (fusion des interrupteurs)
  const fam = (q) => SNAP_TYPES[q.type];
  // deux interrupteurs côte à côte = un seul interrupteur à plusieurs postes (jusqu'à MAX_GANG)
  const canMerge = (p, q) => p.type === 'switch' && q.type === 'switch' && (p.n || 1) + (q.n || 1) <= MAX_GANG;
  const gangName = (n) => ['', 'simple', 'double', 'triple', 'quadruple'][n] + ' interrupteur';
  const pName = (q) => q.label || TYPES[q.type].label;
  function snapWall(p, w) {
    snapLabel = null; snapNext = null;
    if (!SNAP_TYPES[p.type] || altHeld) return w;
    let t = w.t, y = w.y;
    // 1) à côté d'une prise du même mur
    let best = null;
    pts.forEach((q) => {
      if (q === p || q.id === p.id || fam(q) !== fam(p)) return;
      const wq = wallOf(q);
      if (!wq || wq.e !== w.e) return;
      const gap = (GANG * ((q.n || 1) + (p.n || 1))) / 2;
      [-1, 1].forEach((side) => {
        const tt = wq.t + side * gap, d = Math.hypot(tt - t, (q.y || 0) - y);
        if (d < NEAR_SIDE && (!best || d < best.d)) best = { d, t: tt, y: q.y, q };
      });
    });
    if (best) {
      const r = onWall(w.e, best.t, best.y);
      // pas de calage si l'ouverture voisine (porte, baie) a repoussé le point ailleurs
      if (Math.abs(r.t - best.t) < 0.5) {
        snapNext = best.q;
        snapLabel = canMerge(p, best.q) ? `contre « ${pName(best.q)} » → ${gangName((p.n || 1) + (best.q.n || 1))}` : `à côté de « ${pName(best.q)} »`;
        return r;
      }
    }
    // 2) hauteur standard ou hauteur d'une autre prise
    let snappedY = false;
    const STD_Y = STD_Y_OF[fam(p)];
    const hs = STD_Y.concat(pts.filter((q) => q !== p && q.id !== p.id && fam(q) === fam(p) && q.y != null).map((q) => Math.round(q.y)));
    let by = null;
    hs.forEach((h) => { const d = Math.abs(h - y); if (d < NEAR_Y && (by == null || d < Math.abs(by - y))) by = h; });
    if (by != null) { y = by; snappedY = true; snapLabel = `hauteur ${by} cm` + (STD_Y.includes(by) ? '' : p.type === 'switch' ? ' (comme un autre interrupteur)' : ' (comme une autre prise)'); }
    // 3) pas de 5 cm
    const grid = $('snap') && $('snap').checked;
    if (grid) {
      t = fromLeft(w.e, Math.round(leftDist(w.e, t) / 5) * 5);
      if (!snappedY) y = Math.round(y / 5) * 5;
    }
    return onWall(w.e, t, y);
  }

  // fusion : p (posé contre q, de son côté) rejoint le cadre de q ; le cadre est recentré pour que les postes existants ne bougent pas
  function mergeInto(p, q) {
    const wq = wallOf(q), wp = wallOf(p);
    if (!wq || !wp || wq.e !== wp.e) return false;
    const nq = q.n || 1, np = p.n || 1;
    // liaisons : les postes sont numérotés de gauche à droite (vu de face) → ceux de p avant ou après ceux de q
    const pad = (c, n) => Array.from({ length: n }, (_, k) => ((c && c[k]) || []).slice());
    const pLeft = leftDist(wp.e, wp.t) < leftDist(wq.e, wq.t);
    const ctrl = pLeft ? pad(p.ctrl, np).concat(pad(q.ctrl, nq)) : pad(q.ctrl, nq).concat(pad(p.ctrl, np));
    if (ctrl.some((g) => g.length)) q.ctrl = ctrl; else delete q.ctrl;
    q.n = nq + np;
    applyWall(q, onWall(wq.e, (wq.t * nq + wp.t * np) / (nq + np), q.y));
    pts = pts.filter((x) => x !== p && x.id !== p.id);
    selId = q.id;
    if (window.SCEN && SCEN.toast) SCEN.toast(`🧲 ${gangName(q.n)[0].toUpperCase() + gangName(q.n).slice(1)} (« ${pName(q)} »)`);
    return true;
  }

  // place le point sous la souris : mur visé (position + hauteur) si possible, sinon projection du sol (hauteur gardée)
  function placeFromRay(p) {
    if (TYPES[p.type].wall) {
      const w = wallHit();
      if (w) { applyWall(p, snapWall(p, w)); return true; }
      const f = floorPoint();
      if (!f) return false;
      const wo = nearestWall(f.x, f.z);
      if (!wo) return false;
      applyWall(p, snapWall(p, onWall(wo.e, wo.t, p.y != null ? p.y : TYPES[p.type].y)));
      return true;
    }
    const f = floorPoint();
    if (!f) return false;
    p.x = r1(f.x); p.z = r1(f.z); delete p.nx; delete p.nz;
    return true;
  }
  // champs du panneau mis à jour en direct pendant un glisser (sans reconstruire le panneau)
  function liveFields(p) {
    const set = (id, v) => { const el = $(id); if (el && document.activeElement !== el) el.value = v; };
    if (TYPES[p.type].wall) {
      const w = wallOf(p);
      set('el-y', Math.round(p.y));
      if (w) { set('el-s', Math.round(leftDist(w.e, w.t))); const lg = $('el-wall'); if (lg) lg.textContent = `Mur de ${Math.round(w.e.L)} cm, vu de face depuis la pièce. `; }
    } else { set('el-x', Math.round(p.x)); set('el-z', Math.round(p.z)); }
  }
  // déplacement précis d'un point mural : ds le long du mur (vu de face, + = vers la droite), dy en hauteur
  function nudge(p, ds, dy) {
    const w = wallOf(p);
    if (!w) return;
    const s = leftDist(w.e, w.t) + ds;
    applyWall(p, onWall(w.e, fromLeft(w.e, s), (p.y || 0) + dy));
  }
  let drag = null, down = null;
  cvs.addEventListener('pointerdown', (e) => {
    if (!mode || e.button !== 0) return;
    setRay(e);
    // en train de poser un élément : le clic pose, même près d'un repère existant (sinon on attraperait ce repère)
    const hit = placeType ? null : ray.intersectObjects(badges.children, false)[0];
    if (hit) { // saisir un repère existant
      e.stopImmediatePropagation();
      selId = hit.object.userData.id;
      placeType = null;
      drag = { id: selId };
      cvs.setPointerCapture(e.pointerId);
      renderCard(); rebuild3D(); updateHint();
      return;
    }
    down = { x: e.clientX, y: e.clientY };
  }, true);
  cvs.addEventListener('pointermove', (e) => {
    if (!mode || !drag) return;
    setRay(e);
    const p = sel();
    if (p && placeFromRay(p)) {
      rebuild3D();
      if (p.type === 'ceiling' || p.type === 'wall-light') { if (window.__lights) __lights.rebuildCeiling(); }
      liveFields(p);
      // bulle : sur quoi la prise s'est aimantée
      if (SNAP_TYPES[p.type]) hint.textContent = snapLabel ? `🧲 Calée ${snapLabel} · Maj pour placer librement` : `${TYPES[p.type].icon} ${Math.round(p.y)} cm du sol · Maj pour placer sans aimant`;
    }
  });
  cvs.addEventListener('pointerup', (e) => {
    if (!mode) return;
    if (drag) {
      // lâché contre un autre interrupteur : un seul cadre à plusieurs postes
      const p = sel();
      if (p && snapNext && canMerge(p, snapNext) && pts.includes(snapNext)) mergeInto(p, snapNext);
      drag = null; snapLabel = null; snapNext = null; updateHint(); changed(); return;
    }
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) { down = null; return; } // c'était un glisser de caméra
    down = null;
    if (!placeType) return;
    setRay(e);
    const t = TYPES[placeType];
    const p = { id: 'e' + Date.now().toString(36), type: placeType };
    if (t.wall) {
      // clic sur le mur : pose là où on a cliqué, à cette hauteur ; clic au sol (ou vue de dessus) : hauteur habituelle du type
      const w = wallHit();
      if (w) applyWall(p, snapWall(p, w));
      else { p.y = t.y; if (!placeFromRay(p)) return; }
      if (snapNext && canMerge(p, snapNext)) { mergeInto(p, snapNext); snapNext = null; placeType = null; updateHint(); changed(); return; }
      if (snapLabel && window.SCEN && SCEN.toast) SCEN.toast(`🧲 ${t.label} calée ${snapLabel}`);
    } else if (!placeFromRay(p)) return;
    pts.push(p);
    selId = p.id;
    placeType = null;
    updateHint();
    changed();
  });

  // ------------------------------------------------------------------ clic sur un interrupteur (hors mode Électricité, Marcher compris)
  // Écouteur sur window en capture : il passe AVANT celui du noyau (sur le canvas). On n'intercepte que si le premier objet
  // touché par le rayon est la plaque d'un interrupteur relié (ni un meuble, ni un mur vu de face devant) ; sinon rien ne change.
  const v3b = new THREE.Vector3();
  function switchHit(e) {
    const r = cvs.getBoundingClientRect();
    // Marcher avec la souris capturée : on vise le centre de l'écran
    if (document.pointerLockElement === cvs) ndc.set(0, 0);
    else ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, A.camera);
    group.updateMatrixWorld(true);
    const plates = group.children.filter((g) => g.userData.sw);
    if (!plates.length) return null;
    const objs = plates.concat(pickWalls.children, A.items.map((i) => i.group));
    const h = ray.intersectObjects(objs, true)[0];
    if (!h) return null;
    let o = h.object;
    while (o && !o.userData.sw && o.parent && o.parent !== group) o = o.parent;
    if (!o || !o.userData.sw) return null;
    const sw = byId(o.userData.sw);
    if (!sw) return null;
    // poste le plus proche du point cliqué (repère local de la plaque : +x = droite vu de face)
    const n = sw.n || 1, lx = o.worldToLocal(v3b.copy(h.point)).x;
    const k = Math.max(0, Math.min(n - 1, Math.round(lx / GANG + (n - 1) / 2)));
    return postLights(sw, k).length ? { sw, k } : null;
  }
  window.addEventListener('pointerdown', (e) => {
    // aussi en mode visite : le visiteur allume / éteint (rien n'est enregistré chez lui : save() ne fait rien en visite)
    if (mode || A.tool || e.button !== 0 || e.target !== cvs) return;
    const hit = switchHit(e);
    if (!hit) return;
    e.stopImmediatePropagation(); // ni sélection de meuble, ni rotation de la caméra
    e.preventDefault();
    const on = toggle(hit.sw.id, hit.k);
    if (window.SCEN && SCEN.toast && !A.isWalking()) SCEN.toast(`${on ? '💡' : '⏻'} ${postName(hit.sw, hit.k)} : ${on ? 'allumé' : 'éteint'}`);
  }, true);

  // ------------------------------------------------------------------ liaison
  A.hooks.change.push(() => runChecks());
  A.hooks.frame.push(() => { if (mode && A.isWalking()) setMode(false); });
  if (A.readOnly) $('elec-slot').hidden = true;
  rebuild3D();
  if (window.__lights && __lights.rebuildCeiling) __lights.rebuildCeiling();
  renderCard();
  runChecks();
})();
