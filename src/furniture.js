/*
 * Catalogue de meubles (modèles procéduraux détaillés).
 * Dimensions en cm : w = largeur (x), d = profondeur (z), h = hauteur (y).
 * L'avant du meuble est du côté +z. L'origine du groupe est au centre de l'empreinte, au sol.
 */
(function () {
  const FURN = (window.FURN = {});
  const PI = Math.PI;
  const V3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);

  // ------------------------------------------------------------------ matières
  // couleurs historiques -> matière (utilisé aussi par les éléments fixes dans app.js)
  const KIND = {};
  [0x5a4636, 0x7a5f47, 0xb9a384, 0xc9b79a, 0xa89677, 0xd8d1c4, 0xece8de, 0xcdbfa6, 0x2a2a2e, 0x1c1c1f, 0xb9b0a2, 0xaaa296].forEach((c) => (KIND[c] = ['wood', 0.5, 0.6]));
  const PASS = ['emissive', 'emissiveIntensity', 'emissiveMap', 'transparent', 'opacity', 'map', 'side', 'envMapIntensity'];

  function mat(color, o) {
    o = o || {};
    const p = { color, roughness: o.roughness != null ? o.roughness : 0.8, metalness: o.metalness || 0 };
    PASS.forEach((k) => { if (o[k] != null) p[k] = o[k]; });
    const m = new THREE.MeshStandardMaterial(p);
    const legacy = KIND[color];
    const kind = o.kind !== undefined ? o.kind : legacy ? legacy[0] : null;
    if (kind) {
      MATS.apply(m, kind, o.bumpScale != null ? o.bumpScale : legacy ? legacy[1] : 0.6);
      if (o.roughness == null && legacy) m.roughness = legacy[2];
    }
    return m;
  }
  const kindOf = (color, o) => (o && o.kind !== undefined ? o.kind : KIND[color] ? KIND[color][0] : null);
  const kindSize = (k) => (k && MATS[k] ? MATS[k].size : 60);
  function scaleUV(geo, size) {
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / size, uv.getY(i) / size);
    uv.needsUpdate = true;
  }
  function put(parent, geo, m, x, y, z) {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  // ------------------------------------------------------------------ primitives (y = bas de la pièce)
  function box(parent, w, h, d, color, x, y, z, o) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const k = kindOf(color, o);
    if (k) MATS.scaleBoxUV(geo, w, h, d, kindSize(k));
    return put(parent, geo, mat(color, o), x, y + h / 2, z);
  }

  // boîte à arêtes arrondies (rayon r dans le plan w×h, léger chanfrein sur la profondeur)
  function rbox(parent, w, h, d, color, x, y, z, r, o) {
    const b = Math.max(0.2, Math.min(1.0, r * 0.5, w / 4, h / 4, d / 4));
    const ww = Math.max(w - 2 * b, 0.1), hh = Math.max(h - 2 * b, 0.1), dd = Math.max(d - 2 * b, 0.1);
    const rr = Math.max(Math.min(r - b, ww / 2 - 0.01, hh / 2 - 0.01), 0.01);
    const x0 = -ww / 2, y0 = -hh / 2, s = new THREE.Shape();
    s.moveTo(x0 + rr, y0); s.lineTo(x0 + ww - rr, y0);
    s.absarc(x0 + ww - rr, y0 + rr, rr, -PI / 2, 0, false); s.lineTo(x0 + ww, y0 + hh - rr);
    s.absarc(x0 + ww - rr, y0 + hh - rr, rr, 0, PI / 2, false); s.lineTo(x0 + rr, y0 + hh);
    s.absarc(x0 + rr, y0 + hh - rr, rr, PI / 2, PI, false); s.lineTo(x0, y0 + rr);
    s.absarc(x0 + rr, y0 + rr, rr, PI, 1.5 * PI, false);
    const geo = new THREE.ExtrudeGeometry(s, { depth: dd, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 2, curveSegments: 6 });
    geo.translate(0, 0, -dd / 2);
    const k = kindOf(color, o);
    if (k) scaleUV(geo, kindSize(k));
    return put(parent, geo, mat(color, o), x, y + h / 2, z);
  }

  function cyl(parent, rt, rb, h, color, x, y, z, o, seg) {
    return put(parent, new THREE.CylinderGeometry(rt, rb, h, seg || 16), mat(color, o), x, y + h / 2, z);
  }
  // barre entre deux points
  function rod(parent, p0, p1, r, color, o, seg) {
    const a = V3(p0), b = V3(p1), len = a.distanceTo(b);
    const m = put(parent, new THREE.CylinderGeometry(r, r, len, seg || 10), mat(color, o), 0, 0, 0);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    return m;
  }
  // pied carré effilé
  function tleg(parent, x, z, h, sTop, sBot, color, o) {
    const m = cyl(parent, sTop / Math.SQRT2, sBot / Math.SQRT2, h, color, x, 0, z, o, 4);
    m.rotation.y = PI / 4;
    return m;
  }
  function plane(parent, w, d, map, x, y, z, o) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat(0xffffff, Object.assign({ map }, o || {})));
    m.rotation.x = -PI / 2;
    m.position.set(x, y, z);
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  FURN.box = box; FURN.rbox = rbox; FURN.mat = mat;

  // ------------------------------------------------------------------ textures dessinées
  const cv = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const sRGB = (c) => { const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 8; return t; };
  const seeded = (seed) => { let s = seed; return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646; };
  const cache = {};

  function screenTex() {
    if (cache.screen) return cache.screen;
    const c = cv(512, 288), x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 512, 288);
    g.addColorStop(0, '#0d2a5c'); g.addColorStop(0.6, '#1c5fa8'); g.addColorStop(1, '#0a1d3f');
    x.fillStyle = g; x.fillRect(0, 0, 512, 288);
    x.fillStyle = 'rgba(255,255,255,0.10)'; x.beginPath(); x.arc(380, 90, 120, 0, PI * 2); x.fill();
    x.fillStyle = 'rgba(15,20,32,0.92)'; x.fillRect(0, 262, 512, 26); // barre des tâches
    for (let i = 0; i < 7; i++) { x.fillStyle = 'rgba(255,255,255,0.55)'; x.fillRect(150 + i * 28, 268, 14, 14); }
    x.fillStyle = 'rgba(245,248,252,0.9)'; x.fillRect(46, 40, 170, 110); x.fillStyle = '#d7dde6'; x.fillRect(46, 40, 170, 14); // fenêtre
    for (let i = 0; i < 6; i++) { x.fillStyle = 'rgba(30,45,70,0.5)'; x.fillRect(58, 66 + i * 14, 100 + ((i * 37) % 50), 5); }
    return (cache.screen = sRGB(c));
  }
  function keyboardTex() {
    if (cache.kb) return cache.kb;
    const c = cv(512, 160), x = c.getContext('2d');
    x.fillStyle = '#17171a'; x.fillRect(0, 0, 512, 160);
    for (let r = 0; r < 5; r++) for (let k = 0; k < 15; k++) {
      x.fillStyle = '#2c2c32'; x.fillRect(10 + k * 33, 12 + r * 28, 29, 23);
      x.fillStyle = '#3a3a42'; x.fillRect(11 + k * 33, 13 + r * 28, 27, 4);
    }
    return (cache.kb = sRGB(c));
  }
  // touches du K70 : capuchons noirs (map) + éclairage RGB par touche, dégradé arc-en-ciel (emissiveMap)
  function kbRGBMat() {
    if (cache.kbRGB) return cache.kbRGB;
    const W = 840, Hc = 300, col = cv(W, Hc), em = cv(W, Hc), x = col.getContext('2d'), e = em.getContext('2d');
    x.fillStyle = '#121214'; x.fillRect(0, 0, W, Hc);
    e.fillStyle = '#000'; e.fillRect(0, 0, W, Hc);
    const u = (W - 20) / 22.6, gap = 4; // 1 unité de touche : 22,5 unités de large (bloc + navigation + pavé numérique)
    const key = (cx, cy, w, h) => {
      const px = 10 + cx * u, py = 18 + cy * u, ww = w * u - gap, hh = (h || 1) * u - gap;
      const hue = ((px / W) * 300 + 200) % 360;
      e.fillStyle = `hsl(${hue},100%,${42}%)`; e.fillRect(px - 1, py - 1, ww + 2, hh + 2); // halo sous la touche
      x.fillStyle = '#26262b'; x.fillRect(px, py, ww, hh);
      x.fillStyle = '#34343a'; x.fillRect(px + 2, py + 2, ww - 4, 3);
      e.fillStyle = `hsl(${hue},100%,70%)`; e.fillRect(px + ww * 0.3, py + hh * 0.3, ww * 0.35, hh * 0.3); // légende éclairée
    };
    // bloc principal (6 rangées), pavé de navigation, pavé numérique
    for (let k = 0; k < 13; k++) key(k === 0 ? 0 : k + 1 + (k > 4 ? 0.5 : 0) + (k > 8 ? 0.5 : 0), 0, 1);
    [[13, 2], [13.5, 1.5], [12.75, 2.25], [12.25, 2.75]].forEach(([n, last], r) => { for (let k = 0; k < n; k++) key(k, r + 1.5, 1); key(n, r + 1.5, last); });
    [1.25, 1.25, 1.25, 6.25, 1.25, 1.25, 1.25, 1.25].reduce((xx, w) => { key(xx, 5.5, w); return xx + w; }, 0);
    for (let r = 0; r < 2; r++) for (let k = 0; k < 3; k++) key(15.25 + k, 1.5 + r, 1);
    key(16.25, 4.5, 1); for (let k = 0; k < 3; k++) key(15.25 + k, 5.5, 1);
    for (let r = 0; r < 5; r++) for (let k = 0; k < 4; k++) if (!((k === 3 && (r === 1 || r === 3)) || (r === 4 && k === 1))) key(18.5 + k, 1.5 + r, 1, k === 3 && (r === 0 || r === 2) ? 2 : 1);
    key(18.5, 5.5, 2);
    const m = new THREE.MeshStandardMaterial({ map: sRGB(col), emissive: 0xffffff, emissiveMap: sRGB(em), emissiveIntensity: 0.9, roughness: 0.55 });
    return (cache.kbRGB = m);
  }
  // tapis SteelSeries QcK : tissu noir, petit logo blanc dans un coin
  function padMat() {
    if (cache.pad) return cache.pad;
    const c = cv(900, 300), x = c.getContext('2d'), r = seeded(31);
    x.fillStyle = '#0f0f11'; x.fillRect(0, 0, 900, 300);
    for (let i = 0; i < 2500; i++) { x.fillStyle = r() > 0.5 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.12)'; x.fillRect(r() * 900, r() * 300, 2, 2); }
    // logo seul (pas de texte), petit, dans le coin avant droit
    x.fillStyle = '#e9e9e9'; x.beginPath(); x.arc(862, 268, 11, 0, PI * 2); x.fill();
    x.fillStyle = '#0f0f11'; x.beginPath(); x.arc(862, 268, 5.5, 0, PI * 2); x.fill();
    x.fillStyle = '#e9e9e9'; for (let k = 0; k < 6; k++) { const a = (k * PI) / 3; x.fillRect(862 + Math.cos(a) * 11 - 2, 268 + Math.sin(a) * 11 - 2, 4, 4); }
    return (cache.pad = new THREE.MeshStandardMaterial({ map: sRGB(c), roughness: 0.97 }));
  }
  function floralTex() {
    if (cache.floral) return cache.floral;
    const c = cv(256, 256), x = c.getContext('2d'), r = seeded(77);
    x.fillStyle = '#c4452a'; x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 70; i++) {
      const px = r() * 256, py = r() * 256, rad = 5 + r() * 8;
      x.fillStyle = r() > 0.5 ? '#f3e4cf' : '#8a2a1a';
      x.beginPath(); x.arc(px, py, rad, 0, PI * 2); x.fill();
      x.fillStyle = '#e8a23a'; x.beginPath(); x.arc(px, py, rad * 0.35, 0, PI * 2); x.fill();
    }
    const t = sRGB(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return (cache.floral = t);
  }

  // dos de mangas : 12 styles de séries, matières partagées
  function spinePool() {
    if (cache.spines) return cache.spines;
    // dos de séries : teintes moyennes (pas de blanc pur, qui ressortait comme du papier vierge), papier des tranches crème
    const pal = [['#b23a35', '#f0c74e'], ['#2c4f7c', '#e6dfcc'], ['#cf952e', '#2a2a2a'], ['#356b46', '#ece2c8'], ['#5e3b78', '#e2d6ea'], ['#bdb4a2', '#2a2a2a'],
      ['#1f1f22', '#d6ad3a'], ['#c4642a', '#1f1f1f'], ['#3b8693', '#efe8d8'], ['#7c1d2a', '#ece1cc'], ['#1d3566', '#f0c845'], ['#cbc2b0', '#a83a35'],
      ['#7d8436', '#f1ead6'], ['#d9715a', '#262626'], ['#45454d', '#e6dfcf'], ['#9c3a63', '#f0e5ea']];
    const r = seeded(5);
    cache.paper = mat(0xd6c9a8, { roughness: 0.95 });
    cache.spines = pal.map(([bg, fg], idx) => {
      const c = cv(48, 190), x = c.getContext('2d');
      x.fillStyle = bg; x.fillRect(0, 0, 48, 190);
      x.fillStyle = fg; x.fillRect(0, 0, 48, 14);
      x.beginPath(); x.arc(24, 30, 7, 0, PI * 2); x.fill();
      for (let k = 0; k < 9; k++) { // faux titre vertical
        x.fillStyle = fg; x.globalAlpha = 0.9; x.fillRect(14 + (k % 2) * 8, 48 + k * 11, 6 + r() * 14, 7);
      }
      x.globalAlpha = 1;
      x.fillStyle = fg; x.fillRect(6, 160, 36, 24);
      x.fillStyle = bg; x.fillRect(12, 166, 10 + (idx % 3) * 6, 12);
      // dos arrondi : bords plus sombres, léger reflet au centre, petite usure
      const sh = x.createLinearGradient(0, 0, 48, 0);
      sh.addColorStop(0, 'rgba(0,0,0,0.28)'); sh.addColorStop(0.3, 'rgba(255,255,255,0.05)'); sh.addColorStop(0.7, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.3)');
      x.fillStyle = sh; x.fillRect(0, 0, 48, 190);
      const spine = new THREE.MeshStandardMaterial({ map: sRGB(c), roughness: 0.7 });
      const cover = new THREE.MeshStandardMaterial({ color: new THREE.Color(bg), roughness: 0.6 });
      return { spine, cover };
    });
    return cache.spines;
  }

  // ------------------------------------------------------------------ modèles
  const METAL = { metalness: 0.65, roughness: 0.35 };
  const BLACK_METAL = { metalness: 0.5, roughness: 0.45 };

  function bed(w, d) {
    return (g) => {
      const wood = 0x8a6a4c, W = { kind: 'wood', bumpScale: 0.5, roughness: 0.6 };
      const lx = w / 2 - 3, lz = d / 2 - 3;
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => box(g, 5, 14, 5, wood, sx * lx, 0, sz * lz, W));
      box(g, 3.5, 16, d - 2, wood, -w / 2 + 1.75, 14, 0, W);
      box(g, 3.5, 16, d - 2, wood, w / 2 - 1.75, 14, 0, W);
      box(g, w - 7, 16, 3.5, wood, 0, 14, d / 2 - 1.75, W);
      box(g, w - 7, 16, 3.5, wood, 0, 14, -d / 2 + 1.75, W);
      for (let z = -d / 2 + 10; z < d / 2 - 6; z += 13) box(g, w - 7, 1.2, 7, 0xb9a384, 0, 22, z, { kind: 'wood', bumpScale: 0.3 }); // lattes
      rbox(g, w - 5, 18, d - 5, 0xece8df, 0, 30, 0, 5, { kind: 'fabric', bumpScale: 0.5, roughness: 0.9 }); // matelas
      const dz = d * 0.62, zc = d / 2 - dz / 2 - 1; // couette
      rbox(g, w - 1, 7, dz, 0x7f93a6, 0, 46, zc, 3.2, { kind: 'fabric', bumpScale: 0.6, roughness: 0.95 });
      rbox(g, 2.6, 22, dz, 0x7f93a6, -(w / 2 - 0.2), 30, zc, 1.2, { kind: 'fabric', roughness: 0.95 });
      rbox(g, 2.6, 22, dz, 0x7f93a6, w / 2 - 0.2, 30, zc, 1.2, { kind: 'fabric', roughness: 0.95 });
      rbox(g, w - 1, 20, 2.6, 0x7f93a6, 0, 30, d / 2 - 1.5, 1.2, { kind: 'fabric', roughness: 0.95 });
      const fold = rbox(g, w - 3, 5, 18, 0x93a6b8, 0, 52, -d / 2 + dz + 1, 2.4, { kind: 'fabric', roughness: 0.95 }); // rabat
      fold.rotation.x = 0.04;
      const pil = rbox(g, w * 0.72, 11, 36, 0xffffff, 0, 47, -d / 2 + 24, 5, { kind: 'fabric', bumpScale: 0.3, roughness: 0.95 });
      pil.rotation.x = -0.1;
      rbox(g, w + 2, 52, 4, wood, 0, 16, -d / 2 + 0.5, 1.6, W); // tête de lit
      box(g, 6, 58, 6, wood, -w / 2 + 1, 0, -d / 2 + 2, W);
      box(g, 6, 58, 6, wood, w / 2 - 1, 0, -d / 2 + 2, W);
    };
  }

  // écran (par défaut AOC 24 pouces 16:9 : dalle 53,1 × 29,9 cm, ~54,1 × 32,4 cm avec le cadre fin)
  function monitor(g, x, z, ry, W, Hh) {
    W = W || 54.1; Hh = Hh || 32.4;
    const m = new THREE.Group();
    rbox(m, W, Hh, 2.2, 0x0c0c0e, 0, 14, 0, 0.6, { roughness: 0.4 });
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(W - 1, Hh - 2.5), new THREE.MeshStandardMaterial({ color: 0x050505, emissive: 0xffffff, emissiveMap: screenTex(), emissiveIntensity: 0.85, roughness: 0.15 }));
    scr.position.set(0, 14 + 2 + (Hh - 2.5) / 2, 1.25);
    m.add(scr);
    rbox(m, 5, 15, 2.2, 0x1c1c20, 0, 2, -3, 0.8, BLACK_METAL); // col
    rbox(m, 26, 1.4, 17, 0x1c1c20, 0, 0, 1, 0.7, BLACK_METAL); // pied
    m.position.set(x, 75, z);
    m.rotation.y = ry;
    g.add(m);
  }

  function deskPC(w, d) {
    return (g) => {
      rbox(g, w, 3, d, 0x2b2b30, 0, 72, 0, 1.4, { kind: 'wood', roughness: 0.5, bumpScale: 0.4 });
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => box(g, 4, 72, 4, 0x131316, sx * (w / 2 - 6), 0, sz * (d / 2 - 6), BLACK_METAL));
      box(g, w - 14, 3, 2.5, 0x131316, 0, 56, -d / 2 + 6, BLACK_METAL);
      box(g, 2.5, 3, d - 14, 0x131316, -(w / 2 - 6), 56, 0, BLACK_METAL);
      box(g, 2.5, 3, d - 14, 0x131316, w / 2 - 6, 56, 0, BLACK_METAL);
      box(g, w - 40, 7, 1.2, 0x202024, 0, 58, -d / 2 + 4, { roughness: 0.9 }); // goulotte à câbles
      // 2 écrans AOC 24 pouces collés bord à bord
      // gauche bien droit ; droit pivoté (~17°) vers l'utilisateur autour de son bord gauche, qui reste collé au premier
      // l'écran de gauche presque au milieu du bureau (son centre à −5 cm)
      const MW = 54.1, MZ = -d / 2 + 22, ang = 0.3, MX = -5 + MW / 2; // MX : bord commun ; centre de l'écran de gauche à 5 cm à gauche du milieu
      monitor(g, MX - MW / 2, MZ, 0);
      monitor(g, MX + (MW / 2) * Math.cos(ang), MZ + (MW / 2) * Math.sin(ang), -ang);
      // tapis SteelSeries QcK XL (90 × 30 cm) sous le clavier et la souris
      const padZ = d / 2 - 18;
      const pad = new THREE.Mesh(new THREE.BoxGeometry(90, 0.4, 30), [cache.padSide || (cache.padSide = mat(0x111113, { roughness: 0.95 })), cache.padSide, padMat(), cache.padSide, cache.padSide, cache.padSide]);
      pad.position.set(0, 75.2, padZ); pad.receiveShadow = true; g.add(pad);
      // clavier Corsair K70 RGB (pleine taille, 43,6 × 16,5 cm, châssis alu noir, rétroéclairage RGB par touche)
      const kx = -12, kz = padZ - 1;
      rbox(g, 43.6, 2.2, 16.5, 0x1b1b1e, kx, 75.4, kz, 0.6, { metalness: 0.45, roughness: 0.4 });
      const keys = new THREE.Mesh(new THREE.PlaneGeometry(42, 15), kbRGBMat());
      keys.rotation.x = -PI / 2; keys.position.set(kx, 77.7, kz); g.add(keys);
      cyl(g, 0.9, 0.9, 1, 0x2a2a2e, kx + 19, 77.6, kz - 7, { metalness: 0.6, roughness: 0.3 }, 16); // molette de volume
      rbox(g, 6.5, 3.8, 12, 0x1d1d21, 25, 75.6, padZ + 1, 2.8, { roughness: 0.4 }); // souris
      // tour (verre trempé + ventilateurs RGB), posée au sol sous le bureau
      const t = new THREE.Group();
      box(t, 21, 47, 45, 0x18181c, 0, 0, 0, { roughness: 0.5 });
      box(t, 0.6, 44, 40, 0x0b0d12, -10.5, 1.5, 0, { transparent: true, opacity: 0.55, roughness: 0.1 }); // vitre latérale
      [[-12, 'lime'], [0, 'cyan'], [12, 'magenta']].forEach(([zz, c], i) => {
        const col = [0x39ff88, 0x2bd9ff, 0xff3ad0][i];
        const ring = new THREE.Mesh(new THREE.TorusGeometry(5.6, 0.7, 8, 24), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: col, emissiveIntensity: 1.2 }));
        ring.rotation.y = PI / 2; ring.position.set(-9.6, 23, zz); t.add(ring);
      });
      box(t, 18, 1, 40, 0x1f1f25, 0, 12, 0, { metalness: 0.4 }); // carte graphique (suggérée)
      box(t, 0.5, 1.2, 18, 0x39ff88, -9.5, 8, 6, { emissive: 0x39ff88, emissiveIntensity: 1 });
      t.position.set(w / 2 - 22, 0, -4);
      g.add(t);
    };
  }

  function bookshelf(w, d, h) {
    return (g) => {
      const wood = 0xc9b79a, W = { kind: 'wood', bumpScale: 0.4, roughness: 0.6 };
      box(g, 2, h, d, wood, -w / 2 + 1, 0, 0, W);
      box(g, 2, h, d, wood, w / 2 - 1, 0, 0, W);
      box(g, w - 4, h, 0.8, 0xa89677, 0, 0, -d / 2 + 0.4, W);
      const n = 4, gap = (h - 2) / n, shelfY = [];
      for (let i = 0; i <= n; i++) { box(g, w - 4, 2, d - 1, wood, 0, i * gap, 0.5, W); shelfY.push(i * gap + 2); }
      // 100 mangas, rangés étagère par étagère, séries cohérentes
      const r = seeded(13), pool = spinePool();
      let count = 0, shelf = 0, x = -w / 2 + 3.2, style = 0, left = 10;
      const innerR = w / 2 - 3.2;
      while (count < 100 && shelf < n) {
        const tw = 1.15 + r() * 0.45;
        if (x + tw > innerR) { shelf++; x = -w / 2 + 3.2; continue; }
        if (left-- <= 0) { style = (style + 1 + ((r() * 3) | 0)) % pool.length; left = 8 + ((r() * 8) | 0); }
        const th = 17.6 + r() * 1.2, td = 12.4;
        const s = pool[style];
        const m = new THREE.Mesh(new THREE.BoxGeometry(tw - 0.08, th, td), [s.cover, s.cover, cache.paper, cache.paper, s.spine, cache.paper]);
        m.position.set(x + tw / 2, shelfY[shelf] + th / 2, d / 2 - 3.5 - td / 2);
        m.rotation.z = r() > 0.97 ? 0.06 : 0;
        m.castShadow = true; m.receiveShadow = true;
        g.add(m);
        x += tw; count++;
      }
      // petite figurine sur le dessus
      cyl(g, 3.2, 3.6, 1.2, 0x2a2a2e, w / 2 - 12, h, 0, { roughness: 0.4 });
      const fig = new THREE.Mesh(new THREE.SphereGeometry(3.4, 14, 12), mat(0xe9c9a6, { roughness: 0.55 }));
      fig.position.set(w / 2 - 12, h + 8.4, 0); fig.castShadow = true; g.add(fig);
      cyl(g, 2.4, 3, 4.2, 0xd0702a, w / 2 - 12, h + 1.2, 0, { roughness: 0.5 });
    };
  }

  function wardrobe(w, d, h) {
    return (g) => {
      const carcass = 0xe7e1d4, oak = 0xd3bf9f;
      box(g, 2, h - 6, d - 2, carcass, -w / 2 + 1, 6, -1, { roughness: 0.55 });
      box(g, 2, h - 6, d - 2, carcass, w / 2 - 1, 6, -1, { roughness: 0.55 });
      box(g, w, 2, d, carcass, 0, h - 2, 0, { roughness: 0.55 });
      box(g, w - 4, h - 8, 2, carcass, 0, 6, -d / 2 + 1, { roughness: 0.7 });
      box(g, w - 6, 6, d - 6, 0x6b5a46, 0, 0, 0, { roughness: 0.7 }); // socle en retrait
      rbox(g, w + 1, 3, d + 1, carcass, 0, h - 3, 0, 1, { roughness: 0.5 }); // corniche
      const dw = (w - 4) / 2 - 0.4, dh = h - 12;
      rbox(g, dw, dh, 2, oak, -dw / 2 - 0.4, 7, d / 2 - 1.2, 0.8, { kind: 'wood', bumpScale: 0.5, roughness: 0.55 });
      rbox(g, dw, dh, 2, oak, dw / 2 + 0.4, 7, d / 2 - 1.2, 0.8, { kind: 'wood', bumpScale: 0.5, roughness: 0.55 });
      [-1, 1].forEach((s) => { // poignées verticales en métal
        rod(g, [s * 5, h / 2 - 22, d / 2 + 3.4], [s * 5, h / 2 + 22, d / 2 + 3.4], 0.7, 0xcfd3d6, METAL);
        [h / 2 - 20, h / 2 + 20].forEach((yy) => rod(g, [s * 5, yy, d / 2 + 1.4], [s * 5, yy, d / 2 + 3.4], 0.5, 0xcfd3d6, METAL));
      });
    };
  }

  function table(w, d) {
    return (g) => {
      rbox(g, w, 3, d, 0x1c1c1f, 0, 72, 0, 1.2, { kind: 'wood', roughness: 0.35, bumpScale: 0.3 });
      const m = { metalness: 0.5, roughness: 0.45 };
      box(g, w - 12, 6, 1.6, 0x101012, 0, 66, d / 2 - 6, m);
      box(g, w - 12, 6, 1.6, 0x101012, 0, 66, -d / 2 + 6, m);
      box(g, 1.6, 6, d - 12, 0x101012, w / 2 - 6, 66, 0, m);
      box(g, 1.6, 6, d - 12, 0x101012, -w / 2 + 6, 66, 0, m);
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => tleg(g, sx * (w / 2 - 6), sz * (d / 2 - 6), 72, 4.4, 2.6, 0x101012, m));
    };
  }

  function chair() {
    return (g) => {
      const metal = { metalness: 0.5, roughness: 0.4 };
      const L = 0x1a1a1d;
      [[-1, 1], [1, 1]].forEach(([sx, sz]) => rod(g, [sx * 17.5, 0, sz * 17.5], [sx * 17, 44, sz * 17], 1.1, L, metal)); // pieds avant
      [[-1], [1]].forEach(([sx]) => rod(g, [sx * 18.5, 0, -22], [sx * 17.5, 84, -20], 1.1, L, metal)); // pieds arrière montant
      rod(g, [-17.5, 24, 17.3], [17.5, 24, 17.3], 0.8, L, metal);
      rod(g, [-18, 24, -21], [18, 24, -21], 0.8, L, metal);
      rbox(g, 40, 4.5, 40, 0x3b3b41, 0, 44, 1, 2, { kind: 'leather', bumpScale: 0.15, roughness: 0.6 }); // assise
      const back = rbox(g, 37, 20, 2.6, 0x3b3b41, 0, 62, -19, 1.8, { kind: 'leather', bumpScale: 0.15, roughness: 0.6 });
      back.rotation.x = -0.12;
    };
  }

  function armchair(w, d) {
    return (g) => {
      const black = 0x1f1f23, L = { kind: 'leather', bumpScale: 0.2, roughness: 0.6 };
      // pieds métalliques fins, légèrement écartés
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => rod(g, [sx * (w / 2 - 6), 21, sz * (d / 2 - 6)], [sx * (w / 2 - 3), 0, sz * (d / 2 - 3)], 1.2, 0x131316, BLACK_METAL));
      rbox(g, w, 14, d, black, 0, 21, 0, 3, L); // châssis / assise basse
      rbox(g, 11, 24, d - 12, black, -w / 2 + 5.5, 34, 5, 4, L); // accoudoirs
      rbox(g, 11, 24, d - 12, black, w / 2 - 5.5, 34, 5, 4, L);
      rbox(g, w, 40, 12, black, 0, 34, -d / 2 + 6, 5, L); // dossier
      rbox(g, w - 24, 11, d - 22, black, 0, 35, 6, 5, L); // coussin d'assise
      const cu = rbox(g, 38, 8, 38, 0xffffff, 2, 45, -4, 4, { map: floralTex(), roughness: 0.9 });
      cu.rotation.set(-0.35, 0.35, 0.05);
    };
  }

  function sofa(w, d) {
    return (g) => {
      const c = 0x6d737a, F = { kind: 'fabric', bumpScale: 0.7, roughness: 0.95 };
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => cyl(g, 2, 1.4, 10, 0x6b4a30, sx * (w / 2 - 8), 0, sz * (d / 2 - 8), { kind: 'wood' }, 10));
      rbox(g, w, 14, d, 0x5a6067, 0, 10, 0, 3, F);
      rbox(g, 16, 28, d - 6, c, -w / 2 + 8, 24, 3, 5, F);
      rbox(g, 16, 28, d - 6, c, w / 2 - 8, 24, 3, 5, F);
      const cw = (w - 32) / 2;
      [-1, 1].forEach((s) => {
        rbox(g, cw - 0.5, 14, d - 22, c, s * (cw / 2 + 0.3), 24, 8, 5, F); // assises
        const bk = rbox(g, cw - 0.5, 34, 13, c, s * (cw / 2 + 0.3), 38, -d / 2 + 14, 6, F); // dossiers
        bk.rotation.x = -0.14;
      });
    };
  }

  function drawerChest(w, d, h, drawers, color) {
    return (g) => {
      const wd = { kind: 'wood', bumpScale: 0.5, roughness: 0.55 };
      const legH = 13, bodyH = h - legH - 2.5;
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => tleg(g, sx * (w / 2 - 6), sz * (d / 2 - 5), legH + 1, 3.6, 2.4, 0x7a5a3a, wd));
      box(g, w - 2, bodyH, d - 2, 0xece6d8, 0, legH, 0, { roughness: 0.6 });
      const dh = (bodyH - 2) / drawers;
      for (let i = 0; i < drawers; i++) {
        rbox(g, w - 5, dh - 1.2, 1.8, color, 0, legH + 1 + i * dh, d / 2 - 0.6, 0.8, wd);
        rbox(g, 14, 1.1, 1.6, 0xcfd3d6, 0, legH + 1 + i * dh + dh * 0.55, d / 2 + 0.9, 0.5, METAL); // poignée barre
      }
      rbox(g, w + 1, 2.5, d + 1, color, 0, h - 2.5, 0, 1, wd); // plateau
    };
  }

  function nightstand(w, d, h) {
    return (g) => {
      const wd = { kind: 'wood', bumpScale: 0.5, roughness: 0.55 }, col = 0xcdbfa6;
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => tleg(g, sx * (w / 2 - 4), sz * (d / 2 - 4), 13, 3.2, 2.2, 0x7a5a3a, wd));
      box(g, 2, h - 13 - 2.5, d - 2, col, -w / 2 + 1.5, 13, 0, wd);
      box(g, 2, h - 13 - 2.5, d - 2, col, w / 2 - 1.5, 13, 0, wd);
      box(g, w - 4, 2, d - 2, col, 0, 13, 0, wd);
      box(g, w - 4, h - 13 - 2.5, 1.2, col, 0, 13, -d / 2 + 1, wd);
      rbox(g, w - 4, 14, 1.8, col, 0, h - 2.5 - 15.5, d / 2 - 0.9, 0.8, wd); // tiroir
      cyl(g, 1.3, 1.3, 1.4, 0xcfd3d6, 0, h - 2.5 - 9, d / 2 + 0.6, METAL, 12).rotation.x = PI / 2;
      rbox(g, w + 1, 2.5, d + 1, col, 0, h - 2.5, 0, 1, wd);
    };
  }

  function plainDesk(w, d) {
    return (g) => {
      rbox(g, w, 3, d, 0xb9a384, 0, 72, 0, 1.2, { kind: 'wood', bumpScale: 0.5, roughness: 0.5 });
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => tleg(g, sx * (w / 2 - 5), sz * (d / 2 - 5), 72, 4, 2.6, 0x3a3a3e, BLACK_METAL));
      rbox(g, 40, 11, d - 14, 0xb9a384, w / 2 - 28, 59, 0, 1, { kind: 'wood' }); // caisson tiroir suspendu
      rbox(g, 38, 9.5, 1.6, 0xc9b79a, w / 2 - 28, 59.7, d / 2 - 7, 0.8, { kind: 'wood' });
      rbox(g, 10, 1.1, 1.4, 0xcfd3d6, w / 2 - 28, 64, d / 2 - 5.6, 0.5, METAL);
    };
  }

  // ------------------------------------------------------------------ nouveaux modèles
  // révolution d'un profil [[r, y], ...] (du bas vers le haut) autour de l'axe y
  function lathe(parent, pts, color, x, y, z, o, seg) {
    const geo = new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(p[0], p[1])), seg || 32);
    const k = kindOf(color, o);
    if (k) {
      let len = 0, maxR = 0;
      for (let i = 0; i < pts.length; i++) { maxR = Math.max(maxR, pts[i][0]); if (i) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); }
      const uv = geo.attributes.uv, size = kindSize(k);
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * 2 * PI * maxR) / size, (uv.getY(i) * len) / size);
      uv.needsUpdate = true;
    }
    return put(parent, geo, mat(color, Object.assign({ side: THREE.DoubleSide }, o || {})), x, y, z);
  }
  const profileR = (pts, y) => { // rayon d'un profil à la hauteur y (interpolation linéaire)
    for (let i = 1; i < pts.length; i++) if (y <= pts[i][1]) { const a = pts[i - 1], b = pts[i], t = (y - a[1]) / Math.max(b[1] - a[1], 1e-6); return a[0] + (b[0] - a[0]) * t; }
    return pts[pts.length - 1][0];
  };
  function ring(parent, R, tube, color, x, y, z, o) { // anneau horizontal (passepoil, jonc...)
    const m = put(parent, new THREE.TorusGeometry(R, tube, 6, 48), mat(color, o), x, y, z);
    m.rotation.x = PI / 2;
    return m;
  }

  // chaussure (pointe vers +z) : 'sneaker' | 'boot' | 'flat'
  function shoe(g, x, y, z, color, sole, type, ry) {
    const s = new THREE.Group(), F = { kind: 'leather', bumpScale: 0.15, roughness: 0.6 };
    if (type === 'flat') {
      rbox(s, 23, 1.2, 8.4, sole, 0, 0, 0, 0.6, { roughness: 0.8 });
      rbox(s, 22, 3.6, 8, color, 0.2, 0.8, 0, 1.6, F);
      rbox(s, 13, 0.5, 6.2, 0x3b2a20, 3, 4.2, 0, 0.25, { roughness: 0.9 }); // ouverture
    } else {
      rbox(s, 26, 2.4, 9.6, sole, 0, 0, 0, 1.1, { roughness: 0.8 });
      rbox(s, 25, 7, 8.8, color, 0.4, 1.8, 0, 3.2, F);
      if (type === 'boot') {
        rbox(s, 10.5, 13.5, 8.6, color, 6.6, 2, 0, 2.2, F); // tige
        rbox(s, 8.5, 0.5, 6.4, 0x151515, 6.6, 15.3, 0, 0.25, { roughness: 0.9 });
      } else {
        rbox(s, 11, 2.6, 9.2, 0xf1f1ef, 3, 3, 0, 1.2, { roughness: 0.7 }); // bande latérale
        rbox(s, 9, 0.6, 6, 0x151515, 5.5, 8.6, 0, 0.3, { roughness: 0.9 }); // ouverture
        const t = rbox(s, 7, 1.4, 5.2, color, 0, 8.2, 0, 0.6, F); // languette
        t.rotation.z = -0.18;
      }
    }
    s.position.set(x, y, z);
    s.rotation.y = PI / 2 + (ry || 0); // x local -> -z monde : la pointe (x local négatif) va vers +z
    g.add(s);
    return s;
  }
  function shoePair(g, x, y, z, color, sole, type) {
    shoe(g, x - 5.4, y, z, color, sole, type, 0.04);
    shoe(g, x + 5.4, y, z, color, sole, type, -0.04);
  }
  // livres debout alignés de x0 vers la droite sur une largeur maxi
  function bookRow(g, x0, maxW, y, zBack, maxH, maxD, seed) {
    const r = seeded(seed), cols = [0x8a2f2f, 0x2f4f7a, 0xd9c9a8, 0x3d6b4f, 0x222226, 0xc28a3a, 0x6a4a7a, 0xe8e2d4];
    let x = x0;
    while (true) {
      const tw = 1.8 + r() * 2.2, th = Math.min(maxH, 17 + r() * 9), td = Math.min(maxD, 13 + r() * 6);
      if (x + tw > x0 + maxW) break;
      rbox(g, tw - 0.1, th, td, cols[(r() * cols.length) | 0], x + tw / 2, y, zBack + td / 2, 0.3, { roughness: 0.65 });
      x += tw;
    }
  }

  function gamingChair() {
    return (g) => {
      const blk = 0x1b1b1e, red = 0x8e1420, L = { kind: 'leather', bumpScale: 0.15, roughness: 0.55 };
      const base = 0x151517, plast = { roughness: 0.45 };
      // piètement étoile 5 branches + roulettes
      cyl(g, 4.2, 4.8, 6, base, 0, 6, 0, BLACK_METAL, 20);
      for (let i = 0; i < 5; i++) {
        const a = PI / 2 + (i * 2 * PI) / 5, arm = new THREE.Group();
        arm.rotation.y = -a; // +x local -> direction de la branche
        rbox(arm, 25, 3.4, 4.6, base, 14.5, 6, 0, 1.4, BLACK_METAL);
        rbox(arm, 4.6, 2.2, 4.2, 0x0f0f11, 28, 4.2, 0, 1, plast); // chape
        [-1.15, 1.15].forEach((zz) => { // roue double
          const wh = cyl(arm, 2.6, 2.6, 1.3, 0x202023, 28.6, 2.6 - 0.65, zz, plast, 18);
          wh.rotation.x = PI / 2;
        });
        cyl(arm, 1.1, 1.1, 0.4, 0x8a8f94, 28.6, 2.6 - 0.2, 1.95, METAL, 10).rotation.x = PI / 2; // enjoliveur
        g.add(arm);
      }
      // vérin
      cyl(g, 3.1, 3.1, 18, base, 0, 11, 0, plast, 18);
      cyl(g, 1.9, 1.9, 13, 0xcfd3d6, 0, 28, 0, METAL, 16);
      rbox(g, 24, 4, 26, 0x18181a, 0, 40, -1, 1.5, BLACK_METAL); // mécanisme
      rod(g, [10, 42, 4], [23, 41, 9], 0.6, base, BLACK_METAL); // manette
      cyl(g, 1.1, 1.1, 3, base, 23, 39.6, 9, plast).rotation.z = PI / 2;
      // assise baquet
      rbox(g, 46, 7, 50, blk, 0, 44, 2, 3, L);
      [-1, 1].forEach((s) => rbox(g, 7, 6, 48, blk, s * 22, 48.5, 2, 3, L)); // rebords latéraux
      rbox(g, 30, 1.2, 42, red, 0, 50.6, 4, 0.6, { kind: 'leather', bumpScale: 0.15, roughness: 0.75 });
      // dossier haut incliné
      const bk = new THREE.Group();
      bk.position.set(0, 52, -17.5);
      bk.rotation.x = -0.13;
      rbox(bk, 46, 52, 8, blk, 0, 0, 0, 5, L);
      rbox(bk, 38, 24, 8, blk, 0, 50, 0, 5, L); // épaules
      [-1, 1].forEach((s) => {
        rbox(bk, 7, 48, 10, blk, s * 21, 2, 1.5, 3.5, L); // ailes
        rbox(bk, 4, 58, 0.8, red, s * 11, 6, 4.2, 0.4, L); // bandes rouges
        rbox(bk, 4, 8, 0.6, 0x060607, s * 10, 62, 4.3, 1.6, { roughness: 0.9 }); // passages de harnais
      });
      rbox(bk, 22, 11, 7, blk, 0, 54, 6, 4, L); // appui-tête
      rbox(bk, 9, 3, 0.6, red, 0, 58, 9.7, 1, L); // logo
      rbox(bk, 26, 11, 7, blk, 0, 10, 6, 4, L); // coussin lombaire
      g.add(bk);
      box(g, 6, 10, 4, base, 0, 42, -17, BLACK_METAL); // liaison dossier
      // accoudoirs
      [-1, 1].forEach((s) => {
        box(g, 15, 2.5, 6, base, s * 20, 44, -4, BLACK_METAL);
        rbox(g, 3.5, 20, 5, base, s * 28.5, 44, -4, 1.2, BLACK_METAL);
        rbox(g, 7, 3, 25, 0x232327, s * 28.5, 64, -1, 1.4, { kind: 'leather', bumpScale: 0.1, roughness: 0.6 });
      });
    };
  }

  function coffeeTable(w, d, h) {
    return (g) => {
      const oak = 0xb48a5e, W = { kind: 'wood', bumpScale: 0.5, roughness: 0.55 }, blk = 0x1e1e21;
      const legH = h - 3.5;
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => tleg(g, sx * (w / 2 - 5), sz * (d / 2 - 5), legH, 3.6, 2.4, blk, BLACK_METAL));
      [-1, 1].forEach((s) => {
        box(g, w - 12, 5, 1.6, blk, 0, legH - 5, s * (d / 2 - 5), BLACK_METAL); // ceinture
        box(g, 1.6, 5, d - 12, blk, s * (w / 2 - 5), legH - 5, 0, BLACK_METAL);
        box(g, w - 12, 1.5, 1.5, blk, 0, 7.5, s * (d / 2 - 5), BLACK_METAL); // traverses basses
      });
      rbox(g, w, 3.5, d, oak, 0, legH, 0, 1.4, W); // plateau
      rbox(g, w - 14, 2, d - 10, oak, 0, 9, 0, 0.8, W); // tablette basse
      // déco : livres et magazine sur la tablette, télécommande et dessous de verre sur le plateau
      rbox(g, 26, 2.6, 19, 0x2f4f7a, -20, 11, 1, 0.4, { roughness: 0.6 });
      const b2 = rbox(g, 22, 2.2, 16, 0xd9c9a8, -19, 13.6, 0.5, 0.4, { roughness: 0.6 });
      b2.rotation.y = 0.18;
      const mg = rbox(g, 21, 0.6, 28, 0x8a2f2f, 17, 11, 2, 0.3, { roughness: 0.5 });
      mg.rotation.y = -0.25;
      const rc = rbox(g, 4.5, 1.6, 16, 0x151517, 24, h, 6, 0.7, { roughness: 0.4 });
      rc.rotation.y = -0.3;
      cyl(g, 4.5, 4.5, 0.5, 0x6b4a30, -26, h, -6, { kind: 'wood' }, 20);
    };
  }

  function tvStand(w, d, h) {
    return (g) => {
      const wh = 0xf1eee8, oak = 0xc9a77c, W = { kind: 'wood', bumpScale: 0.5, roughness: 0.55 }, P = { roughness: 0.55 };
      const cd = d - 3, cz = -1.5, by = 10, bh = h - by - 2.5, fz = cz + cd / 2;
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => tleg(g, sx * (w / 2 - 8), cz + sz * (cd / 2 - 5), by + 0.5, 3.2, 2.2, 0x7a5a3a, W));
      box(g, w - 2, 2, cd, wh, 0, by, cz, P);
      [-1, 1].forEach((s) => box(g, 2, bh, cd, wh, s * (w / 2 - 1), by, cz, P));
      box(g, w - 4, bh, 1, wh, 0, by, cz - cd / 2 + 0.5, P);
      [-1, 1].forEach((s) => box(g, 2, bh - 2, cd - 1, wh, s * 23, by + 2, cz + 0.5, P)); // séparations
      box(g, 44, 1.6, cd - 2, wh, 0, by + 17, cz + 0.5, P); // tablette niche
      rbox(g, w, 2.5, d - 2, oak, 0, h - 2.5, -1, 1, W); // plateau chêne
      // portes latérales + poignées
      const dw = w / 2 - 2 - 24 - 0.6, dcx = 24 + 0.3 + dw / 2;
      [-1, 1].forEach((s) => {
        rbox(g, dw, bh - 2.6, 1.8, oak, s * dcx, by + 2.3, fz + 0.9, 0.8, W);
        const hy = by + bh - 8, hx = s * (24 + 6);
        rod(g, [hx, hy - 6, fz + 2.5], [hx, hy + 6, fz + 2.5], 0.45, 0x1e1e21, BLACK_METAL);
        [hy - 5, hy + 5].forEach((yy) => rod(g, [hx, yy, fz + 1.7], [hx, yy, fz + 2.5], 0.35, 0x1e1e21, BLACK_METAL));
      });
      // niche : console de jeu + boîtiers de jeux, box internet en haut
      rbox(g, 30, 7, 24, 0xf2f2f0, -4, by + 2, cz + 2, 2.4, { roughness: 0.4 });
      rbox(g, 30.4, 1.2, 24.4, 0x111114, -4, by + 5, cz + 2, 0.6, { roughness: 0.4 });
      cyl(g, 0.6, 0.6, 0.3, 0x2bd9ff, 9, by + 7.2, cz + 12, { emissive: 0x2bd9ff, emissiveIntensity: 0.8 });
      [0x1f3b73, 0x1f3b73, 0x111114, 0xb3202a].forEach((c, i) => rbox(g, 1.4, 16.5, 13.5, c, 8 + i * 1.6, by + 18.6, cz - 1, 0.3, { roughness: 0.5 }));
      rbox(g, 20, 4, 14, 0x222226, -9, by + 18.6, cz, 1.6, { roughness: 0.4 });
      [0, 1, 2].forEach((i) => box(g, 1, 0.4, 0.3, 0x39ff88, -15 + i * 2, by + 20.6, cz + 7.1, { emissive: 0x39ff88, emissiveIntensity: 0.9 }));
    };
  }

  function cubeShelf(w, d, h, cols, rows) {
    return (g) => {
      const wh = 0xf3f2ee, P = { roughness: 0.5 }, T = 3.6, t = 1.6;
      const cw = (w - 2 * T - (cols - 1) * t) / cols, ch = (h - 2 * T - (rows - 1) * t) / rows;
      [-1, 1].forEach((s) => rbox(g, T, h, d, wh, s * (w / 2 - T / 2), 0, 0, 0.8, P));
      rbox(g, w - 2 * T + 1, T, d, wh, 0, h - T, 0, 0.6, P);
      box(g, w - 2 * T, T, d, wh, 0, 0, 0, P);
      box(g, w - 2 * T, h - 2 * T, 0.4, 0xe7e5df, 0, T, -d / 2 + 0.2, P);
      for (let c = 1; c < cols; c++) box(g, t, h - 2 * T, d - 0.4, wh, -w / 2 + T + c * cw + (c - 1) * t + t / 2, T, 0.2, P);
      for (let r = 1; r < rows; r++) box(g, w - 2 * T, t, d - 0.4, wh, 0, T + r * ch + (r - 1) * t, 0.2, P);
      const cx = (c) => -w / 2 + T + c * (cw + t) + cw / 2, cy = (r) => T + r * (ch + t);
      const F = { kind: 'fabric', bumpScale: 0.6, roughness: 0.95 };
      const fabBox = (c, r, col, slot) => { // boîte de rangement en tissu
        const bw = cw - 1.4, bh = ch - 1.2, bd = d - 4, fz = d / 2 - 0.8;
        rbox(g, bw, bh, bd, col, cx(c), cy(r), fz - bd / 2, 1.2, F);
        rbox(g, 10, 3, 0.6, slot, cx(c), cy(r) + bh - 7.5, fz + 0.1, 1.4, { roughness: 1 }); // poignée découpée
      };
      fabBox(0, 0, 0x8d9096, 0x3a3c40);
      fabBox(1, 0, 0xcdbb9c, 0x6b5a46);
      fabBox(1, 1, 0x3c4a5c, 0x1a2028);
      fabBox(0, 2, 0xcdbb9c, 0x6b5a46);
      bookRow(g, cx(0) - cw / 2 + 1, cw - 8, cy(1), -d / 2 + 4, ch - 2, d - 8, 21);
      const lean = rbox(g, 2.6, 24, 17, 0x8a2f2f, cx(0) + cw / 2 - 5, cy(1) + 0.3, -d / 2 + 13, 0.3, { roughness: 0.6 });
      lean.rotation.z = 0.28;
      bookRow(g, cx(1) - cw / 2 + 1, cw - 2, cy(3), -d / 2 + 4, ch - 2, d - 8, 34);
      // cases déco : vase + livres à plat, petite plante
      lathe(g, [[0, 0], [4.5, 0], [6, 4], [6.2, 10], [4, 16], [2.6, 19], [3, 20.5], [0, 20.5]], 0x5f8a8b, cx(0) - 6, cy(3), 0, { roughness: 0.3 }, 24);
      rbox(g, 20, 2.4, 15, 0x222226, cx(0) + 5, cy(3), 0, 0.3, { roughness: 0.6 });
      rbox(g, 18, 2, 13, 0xd9c9a8, cx(0) + 5, cy(3) + 2.4, 0, 0.3, { roughness: 0.6 });
      cyl(g, 5, 4, 9, 0xe9e4da, cx(1), cy(2), 0, { roughness: 0.6 }, 20);
      for (let i = 0; i < 9; i++) {
        const a = i * 2.4, lf = rod(g, [cx(1), cy(2) + 8, 0], [cx(1) + Math.cos(a) * 6.5, cy(2) + 13 + (i % 3) * 3, Math.sin(a) * 6.5], 1.4, 0x4f8a45, { roughness: 0.6 }, 6);
        lf.scale.set(1.6, 1, 0.5);
      }
    };
  }

  // KALLAX 2×4 brun-noir (photo de l'utilisateur) avec ses ~100 mangas rangés dans les cases du haut
  function kallaxManga(w, d, h, count) {
    return (g) => {
      const col = 0x2e2926, W = { kind: 'wood', bumpScale: 0.35, roughness: 0.55 }, T = 3.6, t = 1.6, cols = 2, rows = 4;
      const cw = (w - 2 * T - (cols - 1) * t) / cols, ch = (h - 2 * T - (rows - 1) * t) / rows;
      [-1, 1].forEach((s) => rbox(g, T, h, d, col, s * (w / 2 - T / 2), 0, 0, 0.6, W));
      rbox(g, w - 2 * T + 1, T, d, col, 0, h - T, 0, 0.5, W);
      box(g, w - 2 * T, T, d, col, 0, 0, 0, W);
      for (let c = 1; c < cols; c++) box(g, t, h - 2 * T, d, col, -w / 2 + T + c * cw + (c - 1) * t + t / 2, T, 0, W);
      for (let r = 1; r < rows; r++) box(g, w - 2 * T, t, d, col, 0, T + r * ch + (r - 1) * t, 0, W);
      const cx = (c) => -w / 2 + T + c * (cw + t) + cw / 2, cy = (r) => T + r * (ch + t);
      // remplissage : rangée du haut, puis la suivante..., de gauche à droite, une seule rangée de tomes en façade
      const r0 = seeded(29), pool = spinePool(), td = 12.8;
      let n = 0, style = 0, left = 9;
      for (let r = rows - 1; r >= 0 && n < count; r--) {
        for (let c = 0; c < cols && n < count; c++) {
          let x = cx(c) - cw / 2 + 0.6;
          while (n < count) {
            const tw = 1.25 + r0() * 0.4;
            if (x + tw > cx(c) + cw / 2 - 0.6) break;
            if (left-- <= 0) { style = (style + 1 + ((r0() * 3) | 0)) % pool.length; left = 8 + ((r0() * 10) | 0); }
            const th = 17.8 + r0() * 0.8, s = pool[style];
            const m = new THREE.Mesh(new THREE.BoxGeometry(tw - 0.08, th, td), [s.cover, s.cover, cache.paper, cache.paper, s.spine, cache.paper]);
            m.position.set(x + tw / 2, cy(r) + th / 2, d / 2 - 1.5 - td / 2);
            m.castShadow = true; m.receiveShadow = true;
            g.add(m);
            x += tw; n++;
          }
        }
      }
    };
  }

  function narrowColumn(w, d, h) {
    return (g) => {
      const wh = 0xf1eee8, oak = 0xc9a77c, W = { kind: 'wood', bumpScale: 0.5, roughness: 0.55 }, P = { roughness: 0.55 };
      const cd = d - 2, cz = -1, fz = cz + cd / 2;
      [-1, 1].forEach((s) => box(g, 1.8, h - 2, cd, wh, s * (w / 2 - 0.9), 0, cz, P));
      rbox(g, w, 2, cd + 1, oak, 0, h - 2, cz + 0.5, 0.8, W);
      box(g, w - 3.6, 6, cd - 4, 0xd8d3c8, 0, 0, cz - 1.5, P); // socle en retrait
      box(g, w - 3.6, 1.8, cd, wh, 0, 6, cz, P);
      box(g, w - 3.6, h - 8, 0.6, 0xe7e3da, 0, 6, cz - cd / 2 + 0.3, P);
      [96, 126, 154].forEach((y) => box(g, w - 3.6, 1.8, cd - 1, wh, 0, y, cz + 0.5, P));
      // porte basse
      rbox(g, w - 4, 88, 1.6, oak, 0, 7.6, fz - 1.3, 0.6, W);
      rod(g, [w / 2 - 6, 78, fz + 0.7], [w / 2 - 6, 92, fz + 0.7], 0.45, 0x1e1e21, BLACK_METAL);
      [79, 91].forEach((yy) => rod(g, [w / 2 - 6, yy, fz - 0.5], [w / 2 - 6, yy, fz + 0.7], 0.35, 0x1e1e21, BLACK_METAL));
      // contenu des niches
      rbox(g, w - 9, 19, cd - 7, 0xb39b78, 0, 97.8, cz + 1, 1.5, { kind: 'fabric', bumpScale: 0.8, roughness: 0.95 }); // panier
      rbox(g, 8, 2.4, 0.6, 0x6b5a46, 0, 112, cz + 1 + (cd - 7) / 2 + 0.1, 1, { roughness: 1 });
      bookRow(g, -w / 2 + 2.5, w - 6, 127.8, cz - cd / 2 + 2, 24, cd - 5, 55);
      lathe(g, [[0, 0], [3.5, 0], [5, 3], [5.2, 9], [3, 14], [2, 16], [2.4, 17], [0, 17]], 0xd8cfc0, -6, 155.8, cz, { roughness: 0.4 }, 24);
      cyl(g, 4, 3.4, 6, 0x2a2a2e, 8, 155.8, cz, { roughness: 0.4 }, 20);
      cyl(g, 3.6, 3.6, 0.8, 0xe8e2d4, 8, 161.8, cz, { roughness: 0.9 }, 20); // bougie
    };
  }

  function clothesRack(w, d, h) {
    return (g) => {
      const fr = 0x1a1a1d, oak = 0xc9a77c, W = { kind: 'wood', bumpScale: 0.5, roughness: 0.55 };
      const fx = w / 2 - 2, railY = h - 4.5, sz = d / 2 - 7;
      [-1, 1].forEach((s) => {
        rbox(g, 3, 3, d, fr, s * fx, 0, 0, 1, BLACK_METAL); // pieds
        [-1, 1].forEach((e) => box(g, 3.2, 0.5, 2.5, 0x0c0c0c, s * fx, 0, e * (d / 2 - 1.3), { roughness: 0.9 }));
        rod(g, [s * fx, 3, 0], [s * fx, h - 3, 0], 1.6, fr, BLACK_METAL, 12); // montants
        cyl(g, 2, 2, 2.6, fr, s * fx, h - 3.4, 0, BLACK_METAL, 14);
        rod(g, [s * fx, 14, -sz], [s * fx, 14, sz], 1, fr, BLACK_METAL);
        rod(g, [-fx, 14, s * sz], [fx, 14, s * sz], 1, fr, BLACK_METAL);
      });
      rod(g, [-fx, railY, 0], [fx, railY, 0], 1.3, 0x2a2a2e, METAL, 14); // tringle
      for (let i = 0; i < 6; i++) box(g, w - 8, 1.6, 5, oak, 0, 15, -15 + i * 6, W); // lattes à chaussures
      shoePair(g, -30, 16.6, 0, 0xf0efea, 0xdedad2, 'sneaker');
      shoePair(g, 0, 16.6, 0, 0x5a3b26, 0x2a1d14, 'boot');
      shoePair(g, 29, 16.6, 0, 0x22252b, 0xf2f2f0, 'sneaker');
      // vêtements sur cintres
      const F = { kind: 'fabric', bumpScale: 0.3, roughness: 0.95 };
      const clothes = [
        [-39, 0x2f3e55, 'coat', 92, 6], [-26, 0xe8e4da, 'shirt', 70, 3], [-14, 0x7a2f35, 'shirt', 68, 3.5], [-3, 0x3d6b4f, 'dress', 98, 3],
        [8, 0x1f2328, 'pants', 0, 3], [19, 0xc9a77c, 'coat', 86, 5.5], [31, 0x8fb0cf, 'shirt', 70, 3], [40, 0x55585e, 'shirt', 72, 4],
      ];
      clothes.forEach(([x, col, type, len, th]) => {
        const hk = put(g, new THREE.TorusGeometry(1.9, 0.28, 6, 14, PI), mat(0xb8bcc0, METAL), x, railY, 0);
        hk.rotation.y = PI / 2;
        rod(g, [x, railY, -1.9], [x, railY - 5, 0], 0.28, 0xb8bcc0, METAL, 6);
        const top = railY - 5;
        [-1, 1].forEach((s) => rod(g, [x, top, 0], [x, top - 6, s * 19], 0.7, 0x8a6a4c, { kind: 'wood' }, 8)); // cintre bois
        rod(g, [x, top - 6.6, -18.5], [x, top - 6.6, 18.5], 0.45, 0x8a6a4c, { kind: 'wood' }, 8);
        const gg = new THREE.Group();
        gg.position.set(x, 0, 0);
        gg.rotation.y = PI / 2; // largeur du vêtement le long de z
        const yTop = top - 4.5;
        if (type === 'pants') {
          rbox(gg, 30, 34, th, col, 0, top - 6.6 - 34 + 2, 0, 1.2, F); // pantalon plié sur la barre
          rbox(gg, 30, 1.2, th + 1.2, col, 0, top - 7.2, 0, 0.6, F);
        } else {
          const bw = type === 'coat' ? 40 : 36;
          rbox(gg, bw, len, th, col, 0, yTop - len, 0, 6, F);
          if (type !== 'dress') [-1, 1].forEach((s) => rbox(gg, 6.5, len * 0.62, th * 0.9, col, s * (bw / 2 - 2.6), yTop - 3 - len * 0.62, 0, 3, F)); // manches
          rbox(gg, 12, 3, th + 0.6, type === 'shirt' ? 0xffffff : col, 0, yTop - 2.2, 0, 1.4, F); // col
        }
        g.add(gg);
      });
    };
  }

  function loftBed(w, d, h) {
    return (g) => {
      const wood = 0xcfae7f, W = { kind: 'wood', bumpScale: 0.5, roughness: 0.6 };
      const px = w / 2 - 2.5, pz = d / 2 - 2.5, rx = w / 2 - 2, py = 128;
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
        box(g, 5, h - 1.5, 5, wood, sx * px, 0, sz * pz, W); // montants
        rbox(g, 5, 1.5, 5, wood, sx * px, h - 1.5, sz * pz, 0.7, W);
        box(g, 4.8, 0.6, 4.8, 0x2a2a2e, sx * px, 0, sz * pz, { roughness: 0.9 }); // patins
      });
      [-1, 1].forEach((s) => {
        box(g, 4, 12, d - 10, wood, s * rx, py, 0, W); // longerons
        box(g, w - 10, 12, 4, wood, 0, py, s * (d / 2 - 2), W); // traverses
        box(g, 2.5, 2.5, d - 10, wood, s * (w / 2 - 5.25), py + 3, 0, W); // tasseaux
      });
      for (let z = -d / 2 + 10; z <= d / 2 - 10; z += 12) box(g, w - 12, 1.5, 7, 0xe2cfa8, 0, py + 5.5, z, { kind: 'wood', bumpScale: 0.3 });
      rbox(g, w - 10, 14, d - 10, 0xece8df, 0, py + 7, 0, 5, { kind: 'fabric', bumpScale: 0.5, roughness: 0.9 }); // matelas
      const top = py + 21, dz = d * 0.6;
      rbox(g, w - 11, 4, dz, 0x8a9a7c, 0, top, d / 2 - dz / 2 - 6, 2, { kind: 'fabric', bumpScale: 0.6, roughness: 0.95 }); // couette
      rbox(g, w - 12, 3, 16, 0x9fae92, 0, top + 2.5, d / 2 - dz - 2, 1.4, { kind: 'fabric', roughness: 0.95 }).rotation.x = 0.05;
      const pil = rbox(g, w * 0.58, 9, 30, 0xffffff, 0, top, -d / 2 + 24, 4.4, { kind: 'fabric', bumpScale: 0.3, roughness: 0.95 });
      pil.rotation.x = -0.1;
      // échelle droite côté +x, vers l'avant
      const zA = d / 2 - 50, zB = d / 2 - 12;
      [zA, zB].forEach((z) => box(g, 4, h, 4.5, wood, rx, 0, z, W));
      [24, 50, 76, 102].forEach((y) => rod(g, [rx, y, zA + 2.25], [rx, y, zB - 2.25], 1.6, 0xe2cfa8, { kind: 'wood' }, 12));
      // garde-corps
      const gy = [161, h - 4];
      gy.forEach((y) => {
        box(g, 4, 4, d - 5, wood, -rx, y, 0, W);
        box(g, 4, 4, zA - 2.25 + pz - 2.5, wood, rx, y, (zA - 2.25 - pz + 2.5) / 2, W);
        [-1, 1].forEach((s) => box(g, w - 5, 4, 4, wood, 0, y, s * (d / 2 - 2), W));
      });
      box(g, w - 5, 26, 2, wood, 0, py + 12, -(d / 2 - 2), W); // panneau tête
      for (let z = -d / 2 + 30; z < zA - 10; z += 30) [-rx, rx].forEach((x) => box(g, 3, 25, 3, wood, x, py + 12, z, W)); // barreaux
      for (let z = zA + 10; z < d / 2 - 10; z += 30) box(g, 3, 25, 3, wood, -rx, py + 12, z, W);
      // contreventement (côté -x)
      rod(g, [-rx, 14, -pz + 3], [-rx, py, -16], 1.5, wood, W, 8);
      rod(g, [-rx, 14, pz - 3], [-rx, py, 16], 1.5, wood, W, 8);
    };
  }

  function pouf(w, d, h) {
    return (g) => {
      const R = Math.min(w, d) / 2 - 0.4, col = 0xa8771f, F = { kind: 'fabric', bumpScale: 0.45, roughness: 0.95 };
      const pts = [[0, 0], [R - 3, 0], [R - 1, 0.7], [R - 0.2, 2.6], [R, 6], [R, h - 8], [R - 0.3, h - 4.5], [R - 1.6, h - 1.6], [R - 4.5, h - 0.2], [0, h]];
      lathe(g, pts, col, 0, 0, 0, F, 40);
      ring(g, profileR(pts, h - 3.2) + 0.05, 0.55, 0x8a6118, 0, h - 3.2, 0, F);
      ring(g, profileR(pts, 3.5) - 0.2, 0.55, 0x8a6118, 0, 3.5, 0, F);
      const tab = rbox(g, 6, 3.2, 1.6, 0x6b4a30, 0, h - 7, R - 0.9, 1.2, { kind: 'leather', bumpScale: 0.2, roughness: 0.6 }); // poignée cuir
      tab.rotation.x = 0.05;
    };
  }

  function plant(w, d, h) {
    return (g) => {
      const potPts = [[0, 0], [11, 0], [11.8, 0.8], [14.6, 26], [15.6, 27], [15.8, 29.5], [15, 30], [14.4, 28]];
      lathe(g, potPts, 0xe9e4da, 0, 0, 0, { roughness: 0.55 }, 36);
      ring(g, 12, 0.5, 0xb9b0a2, 0, 4, 0, { roughness: 0.5 });
      cyl(g, 14.3, 14.3, 1, 0x2e2118, 0, 26, 0, { roughness: 1 }, 30); // terreau
      const trunk = [[0, 26, 0], [1.4, 58, 0.6], [0.4, 88, -0.8], [1, 108, 0.2]];
      for (let i = 1; i < trunk.length; i++) rod(g, trunk[i - 1], trunk[i], 1.25 - i * 0.2, 0x6b4a30, { kind: 'wood', roughness: 0.8 }, 8);
      const tAt = (y) => { for (let i = 1; i < trunk.length; i++) if (y <= trunk[i][1]) { const a = trunk[i - 1], b = trunk[i], t = (y - a[1]) / (b[1] - a[1]); return [a[0] + (b[0] - a[0]) * t, y, a[2] + (b[2] - a[2]) * t]; } return trunk[trunk.length - 1]; };
      const r = seeded(91), greens = [0x2a5a26, 0x234d20, 0x33692d];
      const lim = Math.min(w, d) / 2 - 2.5;
      const n = 26;
      for (let i = 0; i < n; i++) {
        const f = i / (n - 1), y = 52 + f * 52, base = tAt(y);
        const elev = 0.3 + f * 0.65 + (r() - 0.5) * 0.2;
        let L = 15 + r() * 5;
        L = Math.min(L, (lim - 3) / Math.cos(elev), (h - y - 1) / Math.max(Math.sin(elev), 0.1));
        const W2 = L * 0.36;
        const s = new THREE.Shape();
        s.moveTo(0, 0);
        s.bezierCurveTo(W2 * 0.6, L * 0.15, W2 * 1.15, L * 0.55, W2 * 0.75, L * 0.88);
        s.quadraticCurveTo(W2 * 0.3, L * 1.02, 0, L);
        s.quadraticCurveTo(-W2 * 0.3, L * 1.02, -W2 * 0.75, L * 0.88);
        s.bezierCurveTo(-W2 * 1.15, L * 0.55, -W2 * 0.6, L * 0.15, 0, 0);
        const geo = new THREE.ShapeGeometry(s, 8), pos = geo.attributes.position;
        for (let k = 0; k < pos.count; k++) { const ly = pos.getY(k), lx = pos.getX(k); pos.setZ(k, 0.008 * ly * ly - 0.04 * lx * lx); } // courbure (retombe + gouttière)
        geo.computeVertexNormals();
        const leaf = new THREE.Mesh(geo, mat(greens[i % 3], { roughness: 0.6, side: THREE.DoubleSide }));
        leaf.rotation.x = PI / 2 - elev;
        leaf.castShadow = true;
        const holder = new THREE.Group();
        const az = i * 2.39996 + (r() - 0.5) * 0.4;
        holder.position.set(base[0] + Math.sin(az) * 1.2, y, base[2] + Math.cos(az) * 1.2);
        holder.rotation.y = az;
        holder.add(leaf);
        g.add(holder);
        rod(g, base, [holder.position.x, y + 0.3, holder.position.z], 0.35, 0x4a6b2e, { roughness: 0.7 }, 5); // pétiole
      }
    };
  }

  function floorMirror(w, d, h) {
    return (g) => {
      const oak = 0xb8946a, W = { kind: 'wood', bumpScale: 0.5, roughness: 0.55 }, brass = 0xc8a45a;
      const ppx = w / 2 - 1.75, pz = -3, pivY = 95;
      [-1, 1].forEach((s) => {
        rbox(g, 4, 3, d, oak, s * (w / 2 - 2), 0, 0, 1.2, W); // patins
        box(g, 3.5, h - 3 - 1.75, 3.5, oak, s * ppx, 3, pz, W); // montants
        const cap = new THREE.Mesh(new THREE.SphereGeometry(1.75, 12, 8, 0, 2 * PI, 0, PI / 2), mat(oak, W));
        cap.position.set(s * ppx, h - 1.75, pz); cap.castShadow = true; g.add(cap);
        cyl(g, 1.5, 1.5, 0.8, brass, s * ppx, pivY, pz + 2.15, METAL, 16).rotation.x = PI / 2; // molettes
        cyl(g, 0.8, 0.8, 1.8, brass, s * (w / 2 - 4), pivY - 0.9, pz, METAL, 10).rotation.z = PI / 2; // axes
      });
      box(g, w - 7, 3, 3, oak, 0, 9, pz, W); // traverse basse
      const fr = new THREE.Group();
      fr.position.set(0, pivY, pz);
      fr.rotation.x = -0.06;
      const fw = w - 9, fh = 130;
      rbox(fr, fw, fh, 2.6, oak, 0, -fh / 2, 0, 2.5, W);
      box(fr, fw - 5, fh - 5, 0.3, 0xdfe6ea, 0, -fh / 2 + 2.5, 1.45, { metalness: 1, roughness: 0.03 }); // glace
      [[fw, 2.5, 0, fh / 2 - 2.5], [fw, 2.5, 0, -fh / 2], [2.5, fh - 5, -fw / 2 + 1.25, -fh / 2 + 2.5], [2.5, fh - 5, fw / 2 - 1.25, -fh / 2 + 2.5]]
        .forEach(([bw, bh, x, y]) => rbox(fr, bw, bh, 1, oak, x, y, 1.6, 0.6, W)); // cadre en relief
      g.add(fr);
    };
  }

  function pedestal(w, d, h) {
    return (g) => {
      const col = 0x34373c, P = { metalness: 0.3, roughness: 0.5 }, plast = { roughness: 0.45 };
      const cd = d - 4, cz = -2, fz = cz + cd / 2, by = 6;
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => { // roulettes
        const x = sx * (w / 2 - 5), z = cz + sz * (cd / 2 - 5);
        rbox(g, 3.6, 1.4, 3.6, 0x111113, x, 4.6, z, 0.6, plast);
        [-0.8, 0.8].forEach((xx) => cyl(g, 2.2, 2.2, 1, 0x1c1c1f, x + xx, 2.2 - 0.5, z + 0.8, plast, 16).rotation.z = PI / 2);
        cyl(g, 0.7, 0.7, 1.4, 0x8a8f94, x, 3.4, z, METAL, 8);
      });
      rbox(g, w, h - by - 2, cd, col, 0, by, cz, 1, P);
      rbox(g, w, 2, cd + 1, col, 0, h - 2, cz + 0.5, 0.8, P); // plateau
      const fronts = [13, 13, h - by - 2 - 26 - 2.4];
      let y = h - 2 - 0.6;
      fronts.forEach((fh, i) => {
        y -= fh;
        rbox(g, w - 1.6, fh - 0.6, 1.4, 0x3d4046, 0, y, fz + 0.7, 0.6, P);
        rbox(g, i === 2 ? 22 : 16, 1.4, 1.4, 0xc4c8cc, 0, y + fh - 4, fz + 2.1, 0.6, METAL); // poignée alu
        if (i === 2) rbox(g, 9, 3.4, 0.4, 0xe9e4da, 0, y + 6, fz + 1.6, 0.3, { roughness: 0.8 }); // porte-étiquette
        y -= 0.6;
      });
      cyl(g, 1.1, 1.1, 0.8, 0xc4c8cc, w / 2 - 4.5, h - 2.6 - 7, fz + 1.4 + 0.4, METAL, 14).rotation.x = PI / 2; // serrure
    };
  }

  function shoeBench(w, d, h) {
    return (g) => {
      const wood = 0xc8a678, W = { kind: 'wood', bumpScale: 0.5, roughness: 0.55 };
      const topY = h - 7;
      [-1, 1].forEach((s) => rbox(g, 2.6, topY, d, wood, s * (w / 2 - 1.3), 0, 0, 0.8, W)); // flancs
      [4, 22].forEach((y) => [-10, 0, 10].forEach((z) => box(g, w - 5.2, 1.6, 8, wood, 0, y, z, W))); // tablettes à lattes
      box(g, w - 5.2, 4, 1.5, wood, 0, topY - 8, -d / 2 + 0.75, W);
      rbox(g, w, 2.5, d, wood, 0, topY, 0, 1, W); // plateau
      rbox(g, w - 3, h - topY - 2.5, d - 3, 0x7d838a, 0, topY + 2.5, 0, 2, { kind: 'fabric', bumpScale: 0.7, roughness: 0.95 }); // coussin
      shoePair(g, -25, 5.6, 0, 0x5a3b26, 0x2a1d14, 'boot');
      shoePair(g, 1, 5.6, 0, 0xf0efea, 0xdedad2, 'sneaker');
      shoePair(g, 25, 5.6, 1, 0x22252b, 0xe8e4da, 'sneaker');
      shoePair(g, -22, 23.6, 1, 0x8a2f35, 0xd9c9a8, 'flat');
      shoePair(g, 6, 23.6, 0, 0x2f4f7a, 0xf2f2f0, 'sneaker');
    };
  }

  FURN.catalog = [
    { id: 'bed1', name: 'Lit 1 place', group: 'Chambre', w: 90, d: 200, h: 68, build: bed(90, 200) },
    { id: 'bed2', name: 'Lit 2 places', group: 'Chambre', w: 140, d: 200, h: 68, build: bed(140, 200) },
    { id: 'wardrobe', name: 'Armoire 2 portes', group: 'Rangement', w: 100, d: 55, h: 200, build: wardrobe(100, 55, 200) },
    { id: 'bookshelf', name: 'Bibliothèque mangas', group: 'Rangement', w: 70, d: 25, h: 100, build: bookshelf(70, 25, 100) },
    { id: 'dresser', name: 'Commode 3 tiroirs', group: 'Rangement', w: 80, d: 40, h: 80, build: drawerChest(80, 40, 80, 3, 0xd9c7a8) },
    { id: 'nightstand', name: 'Table de chevet', group: 'Chambre', w: 40, d: 40, h: 50, build: nightstand(40, 40, 50) },
    { id: 'deskpc', name: 'Bureau PC (tour + 2 écrans)', group: 'Bureau', w: 140, d: 70, h: 118, build: deskPC(140, 70) },
    { id: 'desk', name: 'Bureau simple', group: 'Bureau', w: 120, d: 60, h: 75, build: plainDesk(120, 60) },
    { id: 'table', name: 'Table noire', group: 'Séjour', w: 110, d: 60, h: 75, build: table(110, 60) },
    { id: 'chair', name: 'Chaise', group: 'Séjour', w: 42, d: 42, h: 85, build: chair() },
    { id: 'armchair', name: 'Fauteuil', group: 'Séjour', w: 70, d: 66, h: 75, build: armchair(70, 66) },
    { id: 'sofa', name: 'Canapé 2 places', group: 'Séjour', w: 160, d: 85, h: 80, build: sofa(160, 85) },
    { id: 'gamingchair', name: 'Chaise gaming à roulettes', group: 'Bureau', w: 65, d: 65, h: 128, build: gamingChair() },
    { id: 'pedestal', name: 'Caisson à roulettes 3 tiroirs', group: 'Bureau', w: 40, d: 50, h: 60, build: pedestal(40, 50, 60) },
    { id: 'loftbed', name: 'Lit mezzanine 1 place', group: 'Chambre', w: 100, d: 200, h: 180, build: loftBed(100, 200, 180) },
    { id: 'clothesrack', name: 'Portant à vêtements', group: 'Chambre', w: 100, d: 45, h: 160, build: clothesRack(100, 45, 160) },
    { id: 'kallax', name: 'Étagère à cases 2×4', group: 'Rangement', w: 77, d: 39, h: 147, build: cubeShelf(77, 39, 147, 2, 4) },
    { id: 'column', name: 'Colonne de rangement', group: 'Rangement', w: 40, d: 30, h: 180, build: narrowColumn(40, 30, 180) },
    { id: 'shoebench', name: 'Banc à chaussures', group: 'Rangement', w: 80, d: 30, h: 50, build: shoeBench(80, 30, 50) },
    { id: 'coffeetable', name: 'Table basse', group: 'Séjour', w: 90, d: 50, h: 40, build: coffeeTable(90, 50, 40) },
    { id: 'tvstand', name: 'Meuble TV bas', group: 'Séjour', w: 140, d: 40, h: 48, build: tvStand(140, 40, 48) },
    { id: 'pouf', name: 'Pouf', group: 'Séjour', w: 40, d: 40, h: 42, build: pouf(40, 40, 42) },
    { id: 'plant', name: 'Plante verte en pot', group: 'Déco', w: 40, d: 40, h: 120, build: plant(40, 40, 120) },
    { id: 'mirror', name: 'Miroir sur pied', group: 'Déco', w: 45, d: 35, h: 165, build: floorMirror(45, 35, 165) },
  ];
  // ------------------------------------------------------------------ lampes
  // Les abat-jour (userData.glow) et ampoules (userData.bulb) s'illuminent quand la lampe est allumée (géré par lights.js).
  const shadeMat = (color) => ({ side: THREE.DoubleSide, roughness: 0.9, kind: 'fabric', bumpScale: 0.2, emissive: 0x000000 });
  function shade(g, rt, rb, h, color, y) {
    const m = put(g, new THREE.CylinderGeometry(rt, rb, h, 28, 1, true), mat(color, shadeMat(color)), 0, y + h / 2, 0);
    m.userData.glow = true;
    m.castShadow = false;
    return m;
  }
  function bulb(g, r, x, y, z) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), new THREE.MeshStandardMaterial({ color: 0xfff6e0, emissive: 0x000000, roughness: 0.3 }));
    b.position.set(x, y, z);
    b.userData.bulb = true;
    g.add(b);
    return b;
  }
  function floorLamp(w, d, h) {
    return (g) => {
      cyl(g, 14, 14.5, 2.4, 0x2a2a2e, 0, 0, 0, BLACK_METAL, 32);
      // tige fine : pas d'ombre (avec les ombres floues, elle dessinait une grande barre sombre sur le mur et le sol)
      rod(g, [0, 2.4, 0], [0, h - 22, 0], 0.9, 0x2a2a2e, BLACK_METAL).castShadow = false;
      rod(g, [-6, h - 23, 0], [6, h - 23, 0], 0.4, 0x2a2a2e, BLACK_METAL).castShadow = false;
      bulb(g, 3.2, 0, h - 16, 0);
      shade(g, 12, 17, 26, 0xf1e6d2, h - 26);
    };
  }
  function deskLamp() {
    return (g) => {
      cyl(g, 7.5, 8, 1.8, 0x1f1f23, 0, 0, 0, BLACK_METAL, 24);
      rod(g, [0, 1.8, -2], [0, 26, -6], 0.6, 0x1f1f23, BLACK_METAL);
      rod(g, [0, 26, -6], [0, 38, 4], 0.6, 0x1f1f23, BLACK_METAL);
      const head = put(g, new THREE.CylinderGeometry(2.2, 6.5, 9, 22, 1, true), mat(0x1f1f23, Object.assign({ side: THREE.DoubleSide }, BLACK_METAL)), 0, 35, 6);
      head.rotation.x = 0.35;
      // dessus de la tête fermé : sinon, en rendu réaliste (ombres), l'ampoule projette par ce petit trou une tache nette au plafond
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.3, 0.6, 22), head.material); cap.position.y = 4.5; cap.castShadow = true; head.add(cap);
      bulb(g, 2, 0, 34, 6.5);
    };
  }
  function bedsideLamp() {
    return (g) => {
      const base = put(g, new THREE.SphereGeometry(8, 24, 16), mat(0xb5603f, { roughness: 0.45 }), 0, 9, 0);
      base.scale.set(1, 1.05, 1);
      cyl(g, 1.6, 2.2, 4, 0x8a8a8a, 0, 17, 0, METAL, 14);
      bulb(g, 2.4, 0, 27, 0);
      shade(g, 9.5, 12.5, 18, 0xf4ecdc, 22);
    };
  }
  // grand frigo-congélateur posé au sol (congélateur en bas), avant = +z
  function fridgeTall(w, d, h) {
    return (g) => {
      const white = 0xf3f3f1, fr = { roughness: 0.3 };
      rbox(g, w, h - 2, d - 4, white, 0, 2, -2, 1.5, fr); // caisse
      box(g, w - 4, 2, d - 8, 0x2a2a2c, 0, 0, -2); // pieds / socle
      const split = Math.round(h * 0.38); // congélateur en bas
      rbox(g, w - 0.6, split - 3, 4, white, 0, 2.5, d / 2 - 2, 1.2, fr);
      rbox(g, w - 0.6, h - split - 4, 4, white, 0, split + 1, d / 2 - 2, 1.2, fr);
      box(g, 1.6, 34, 2.2, 0xb8bcc0, w / 2 - 6, split - 40, d / 2 + 1, METAL); // poignées verticales
      box(g, 1.6, 40, 2.2, 0xb8bcc0, w / 2 - 6, split + 8, d / 2 + 1, METAL);
    };
  }
  FURN.catalog.push(
    { id: 'fridge170', name: 'Grand frigo-congélateur', group: 'Cuisine', w: 60, d: 65, h: 170, build: fridgeTall(60, 65, 170) },
    { id: 'kallaxmanga', name: 'KALLAX 2×4 brun-noir + 100 mangas', group: 'Rangement', w: 77, d: 39, h: 147, build: kallaxManga(77, 39, 147, 100) },
    { id: 'lampfloor', name: 'Lampadaire', group: 'Éclairage', w: 30, d: 30, h: 160, build: floorLamp(30, 30, 160), light: { pos: [0, 144, 0], p: 70, k: 2700 } },
    { id: 'lampdesk', name: 'Lampe de bureau', group: 'Éclairage', w: 18, d: 22, h: 42, build: deskLamp(), light: { pos: [0, 32, 7], p: 55, k: 4000 }, onTop: true },
    { id: 'lampbedside', name: 'Lampe de chevet', group: 'Éclairage', w: 26, d: 26, h: 40, build: bedsideLamp(), light: { pos: [0, 28, 0], p: 40, k: 2700 }, onTop: true }
  );

  // hauteur du plateau des meubles sur lesquels on peut poser une lampe (sinon : leur hauteur totale)
  const TOPS = { kallaxmanga: 147, deskpc: 75, desk: 75, table: 75, nightstand: 50, dresser: 80, bookshelf: 100, pedestal: 60, kallax: 147, column: 180, shoebench: 50, coffeetable: 40, tvstand: 48 };
  FURN.catalog.forEach((c) => { if (TOPS[c.id]) c.top = TOPS[c.id]; });

  // chevauchements autorisés : un siège (ou caisson) se range sous une table / un bureau ;
  // sous le lit mezzanine (plancher à 128 cm) on peut mettre tout ce qui fait au plus 128 cm de haut
  const SEATS = new Set(['chair', 'gamingchair', 'pouf', 'pedestal']);
  const UNDER = new Set(['table', 'desk', 'deskpc', 'coffeetable']);
  FURN.catalog.forEach((c) => {
    if (SEATS.has(c.id)) c.seat = true;
    if (UNDER.has(c.id)) c.under = true;
    if (c.id === 'loftbed') c.clearance = 128;
  });

  // ------------------------------------------------------------------ meubles sur mesure (groupe « Personnalisé »)
  // Construits directement aux dimensions demandées (pas d'étirement : pieds et épaisseurs restent réalistes).
  // La couleur choisie par l'utilisateur est appliquée ensuite par src/custom.js (meta.color).
  const CW = { kind: 'wood', bumpScale: 0.45, roughness: 0.55 };
  const CUSTOM_WOOD = 0xc9ad88;
  function customBlock() {
    return (g, w, d, h) => {
      const r = Math.min(2, w / 6, h / 6, d / 6);
      rbox(g, w, h, d, CUSTOM_WOOD, 0, 0, 0, r, CW);
    };
  }
  function customTable() {
    return (g, w, d, h) => {
      const t = Math.max(1.2, Math.min(3, h * 0.06)); // épaisseur du plateau
      const leg = Math.max(2, Math.min(5, w / 12, d / 8)); // section des pieds
      const ix = Math.max(leg / 2 + 0.5, Math.min(5, w / 8)), iz = Math.max(leg / 2 + 0.5, Math.min(5, d / 8)); // retrait des pieds
      const lh = Math.max(h - t, 1);
      rbox(g, w, t, d, CUSTOM_WOOD, 0, lh, 0, Math.min(1.2, t / 2), CW); // plateau
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => tleg(g, sx * (w / 2 - ix), sz * (d / 2 - iz), lh, leg, leg * 0.75, CUSTOM_WOOD, CW));
      if (lh > 30 && w > 30 && d > 25) { // ceinture sous le plateau
        const ah = Math.min(7, lh * 0.1), y = lh - ah;
        [-1, 1].forEach((s) => {
          box(g, w - 2 * ix - leg, ah, 1.8, CUSTOM_WOOD, 0, y, s * (d / 2 - iz), CW);
          box(g, 1.8, ah, d - 2 * iz - leg, CUSTOM_WOOD, s * (w / 2 - ix), y, 0, CW);
        });
      }
    };
  }
  function customShelf() {
    return (g, w, d, h) => {
      const T = Math.min(2.2, w / 10), t = 1.8, base = Math.min(6, h * 0.05);
      [-1, 1].forEach((s) => rbox(g, T, h, d, CUSTOM_WOOD, s * (w / 2 - T / 2), 0, 0, Math.min(0.6, T / 3), CW)); // montants
      const n = Math.max(2, Math.round((h - base) / 36) + 1); // tablettes, ~36 cm d'écart
      const iw = Math.max(w - 2 * T, 1);
      for (let i = 0; i < n; i++) {
        const y = i === n - 1 ? h - t : base + (i * (h - t - base)) / (n - 1);
        box(g, iw, t, d - 0.6, CUSTOM_WOOD, 0, y, 0.3, CW);
      }
      if (base > 1.5) box(g, iw, base, 1.6, CUSTOM_WOOD, 0, 0, d / 2 - 2.5, CW); // plinthe
      if (h > 60 && w > 30) { // croix de contreventement au dos (fines barres métalliques)
        const z = -d / 2 + 0.6, x0 = -w / 2 + T, x1 = w / 2 - T, y0 = base + t, y1 = h - t;
        rod(g, [x0, y0, z], [x1, y1, z], 0.35, 0x26262a, BLACK_METAL, 6);
        rod(g, [x1, y0, z], [x0, y1, z], 0.35, 0x26262a, BLACK_METAL, 6);
      }
    };
  }
  FURN.catalog.push(
    { id: 'custom', name: 'Bloc / caisson', group: 'Personnalisé', w: 60, d: 40, h: 50, build: customBlock(), dynamic: true, custom: true, top: 50 },
    { id: 'customtable', name: 'Table / bureau', group: 'Personnalisé', w: 120, d: 70, h: 75, build: customTable(), dynamic: true, custom: true, top: 75, under: true },
    { id: 'customshelf', name: 'Étagère ouverte', group: 'Personnalisé', w: 80, d: 30, h: 180, build: customShelf(), dynamic: true, custom: true, top: 180 }
  );

  // ================================================================== DÉCO MURALE (sabres, drapeau)
  // Objets « muraux » (drapeau `wall: { y }`) : posés contre un mur à une hauteur réglable (meta.y = hauteur du bas, cm),
  // déplaçables comme un meuble ; l'avant = +z local (dos au mur = −z). Les sabres sont construits le long de x local,
  // poignée à gauche, tranchant vers le haut (présentation traditionnelle), dans leur fourreau.
  const GOLD = { metalness: 0.8, roughness: 0.32 };
  // tressage de la poignée (ito) : fond de la couleur du lien, losanges (hishigami) de la couleur de la peau (same)
  function tsukaTex(wrap, skin, accent) {
    const k = 'tsuka' + wrap + skin;
    if (cache[k]) return cache[k];
    const c = cv(128, 256), x = c.getContext('2d');
    x.fillStyle = wrap; x.fillRect(0, 0, 128, 256);
    for (let i = 0; i < 9; i++) { // losanges le long de la poignée (v = longueur)
      const cy = 14 + i * 28.5;
      for (const cx of [16, 48, 80, 112]) { // 4 colonnes autour de la poignée : visibles de face comme de côté
        x.fillStyle = skin; x.beginPath(); x.moveTo(cx, cy - 11); x.lineTo(cx + 9, cy); x.lineTo(cx, cy + 11); x.lineTo(cx - 9, cy); x.closePath(); x.fill();
      }
      x.strokeStyle = 'rgba(0,0,0,0.35)'; x.lineWidth = 2; x.beginPath(); x.moveTo(0, cy + 14); x.lineTo(128, cy + 14); x.stroke();
    }
    if (accent) { x.fillStyle = accent; [16, 48, 80, 112].forEach((cx) => x.fillRect(cx - 5, 118, 10, 18)); } // menuki
    return (cache[k] = sRGB(c));
  }
  // un sabre complet dans son fourreau, centré en (cx, cy, cz), le long de +x (poignée vers −x)
  function katana(g, o, cx, cy, cz) {
    const S = new THREE.Group(); S.position.set(cx, cy, cz); g.add(S);
    const tL = o.tsuka, sL = o.saya, total = 2.2 + tL + 1.5 + sL + 1.5, x0 = -total / 2;
    const along = (geo) => { geo.rotateZ(-PI / 2); return geo; }; // cylindre (axe y) → axe x
    // kashira (pommeau)
    const kas = new THREE.Mesh(along(new THREE.CylinderGeometry(1.45, 1.55, 2.2, 24)), mat(o.metal, o.metalOpts)); kas.scale.set(1, 1.15, 0.85); kas.position.x = x0 + 1.1; S.add(kas);
    // tsuka (poignée tressée)
    const ts = new THREE.Mesh(along(new THREE.CylinderGeometry(1.5, 1.6, tL, 28, 1, true)), new THREE.MeshStandardMaterial({ map: tsukaTex(o.wrap, o.skin, o.menuki), roughness: 0.8, side: THREE.DoubleSide }));
    ts.scale.set(1, 1.15, 0.82); ts.position.x = x0 + 2.2 + tL / 2; ts.castShadow = true; S.add(ts);
    // fuchi (bague avant la garde)
    const fu = new THREE.Mesh(along(new THREE.CylinderGeometry(1.65, 1.65, 1.2, 24)), mat(o.metal, o.metalOpts)); fu.scale.set(1, 1.15, 0.85); fu.position.x = x0 + 2.2 + tL + 0.1; S.add(fu);
    const xT = x0 + 2.2 + tL + 0.9; // garde (tsuba)
    o.tsuba(S, xT);
    // fourreau (saya) courbe : ellipse extrudée le long d'un arc (sori ~ 1,8 cm), tranchant vers le haut
    const xa = xT + 0.6, xb = xa + sL;
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(xa, 0, 0), new THREE.Vector3((xa + xb) / 2, 1.8, 0), new THREE.Vector3(xb, 1.6, 0));
    const sh = new THREE.Shape(); sh.absellipse(0, 0, 1.75, 1.15, 0, PI * 2, false, 0);
    const saya = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { steps: 48, bevelEnabled: false, extrudePath: curve }), new THREE.MeshStandardMaterial({ color: o.sayaColor, roughness: o.sayaRough, metalness: 0.05 }));
    saya.castShadow = true; saya.receiveShadow = true; S.add(saya);
    // koiguchi (embouchure) et kojiri (bout) : bagues
    const ring = (x, y, len) => { const r = new THREE.Mesh(along(new THREE.CylinderGeometry(1.85, 1.85, len, 24)), mat(o.fitting, o.fittingOpts)); r.scale.set(1, 1, 0.68); r.position.set(x, y, 0); S.add(r); return r; };
    ring(xa + 1, 0.15, 2);
    ring(xb + 0.4, 1.6, 1.6).rotation.z = -0.06;
    // sageo : cordon noué près de l'embouchure, deux boucles qui pendent
    const cord = mat(o.cord, { roughness: 0.9 });
    [9.2, 10.1, 11.0].forEach((dx) => { const kn = new THREE.Mesh(new THREE.TorusGeometry(1.86, 0.24, 8, 28), cord); kn.rotation.y = PI / 2; kn.scale.set(1, 1, 0.66); kn.position.set(xa + dx, 0.75, 0); S.add(kn); });
    [-1, 1].forEach((sd) => { // nœud : deux petites boucles plates posées sur le devant du fourreau
      const loop = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.26, 8, 20), cord);
      loop.scale.set(1.3, 0.75, 0.35); loop.rotation.z = sd * 0.5; loop.position.set(xa + 10.1 + sd * 1.7, 0.2, 1.25); S.add(loop);
    });
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 4.5, 8), cord); tail.position.set(xa + 10.6, -1.6, 1.15); tail.rotation.z = 0.25; S.add(tail); // brin qui pend
    if (o.extra) o.extra(S, x0);
    return S;
  }
  // garde ovale de Wado Ichimonji : cerclage doré, centre bronze sombre granité, seppa dorées
  function tsubaWado(S, xT) {
    const outer = new THREE.Shape(); outer.absellipse(0, 0, 4.0, 3.7, 0, PI * 2);
    const hole = new THREE.Path(); hole.absellipse(0, 0, 3.4, 3.1, 0, PI * 2, true); outer.holes.push(hole);
    const rim = new THREE.Mesh(new THREE.ExtrudeGeometry(outer, { depth: 0.75, bevelEnabled: true, bevelSize: 0.12, bevelThickness: 0.12, bevelSegments: 2 }), mat(0xc9a227, GOLD));
    rim.rotation.y = PI / 2; rim.position.x = xT + 0.37; S.add(rim);
    const inner = new THREE.Shape(); inner.absellipse(0, 0, 3.45, 3.15, 0, PI * 2);
    const plate = new THREE.Mesh(new THREE.ExtrudeGeometry(inner, { depth: 0.5, bevelEnabled: false }), mat(0x4a4632, { roughness: 0.85, metalness: 0.35 }));
    plate.rotation.y = PI / 2; plate.position.x = xT + 0.25; S.add(plate);
    [-0.6, 0.6].forEach((dx) => { const sp = new THREE.Mesh(new THREE.CylinderGeometry(1.75, 1.75, 0.25, 24), mat(0xd9b545, GOLD)); sp.rotation.z = PI / 2; sp.scale.set(1, 1.1, 0.75); sp.position.x = xT + dx; S.add(sp); });
  }
  // garde de Tensa Zangetsu : « manji » noir à crans (4 bras coudés autour d'un carré central)
  function tsubaZangetsu(S, xT) {
    const T = new THREE.Group(); T.position.x = xT; T.rotation.y = PI / 2; S.add(T); // plan de la garde perpendiculaire au sabre
    const bm = mat(0x141416, { roughness: 0.45, metalness: 0.45 });
    const add = (w, h, x, y, a, m) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.9), m || bm); b.position.set(x, y, 0); b.rotation.z = a || 0; b.castShadow = true; T.add(b); };
    add(4.6, 4.6, 0, 0);
    for (let k = 0; k < 4; k++) {
      const a = (k * PI) / 2, c = Math.cos(a), s2 = Math.sin(a);
      const P = (x, y) => [x * c - y * s2, x * s2 + y * c];
      const arm = P(0, 4.0), elbow = P(-2.2, 6.2), cr = P(-3.6, 5.3);
      add(1.6, 3.6, arm[0], arm[1], a);
      add(4.0, 1.6, elbow[0], elbow[1], a);
      add(0.9, 0.9, cr[0], cr[1], a, mat(0x0a0a0b, { roughness: 0.6 })); // cran
    }
  }
  // chaîne au pommeau de Zangetsu (maillons alternés qui pendent)
  function chain(S, x0) {
    const m = mat(0x1c1c1f, { metalness: 0.7, roughness: 0.35 });
    for (let i = 0; i < 13; i++) {
      const t = i / 12, l = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.14, 6, 14), m);
      l.position.set(x0 - 0.8 - Math.sin(t * PI * 0.5) * 3.2, -i * 1.05, 0.2);
      l.scale.set(1, 1.45, 1); l.rotation.set(i % 2 ? PI / 2 : 0, 0, 0.25 * t); S.add(l);
    }
  }
  const WADO = { tsuka: 26, saya: 74, wrap: '#f3f1ea', skin: '#1a1a1a', menuki: '#c9a227', metal: 0xc9a227, metalOpts: GOLD, fitting: 0xc9a227, fittingOpts: GOLD,
    sayaColor: 0xf5f3ee, sayaRough: 0.22, cord: 0xf3f1ea, tsuba: tsubaWado };
  const ZANGETSU = { tsuka: 27, saya: 75, wrap: '#141416', skin: '#b01e22', menuki: null, metal: 0x1a1a1d, metalOpts: { metalness: 0.5, roughness: 0.45 }, fitting: 0x161618,
    fittingOpts: { roughness: 0.6 }, sayaColor: 0x141416, sayaRough: 0.78, cord: 0x111113, tsuba: tsubaZangetsu, extra: (S, x0) => chain(S, x0) };
  // crochets muraux : platine contre le mur + bras qui passe sous le fourreau + petit relevé à l'avant
  function wallHooks(g, d, y, span) {
    const hm = mat(0x1d1d20, { metalness: 0.5, roughness: 0.4 });
    [-span / 2, span / 2].forEach((x) => {
      const pl = new THREE.Mesh(new THREE.BoxGeometry(3, 5, 0.6), hm); pl.position.set(x, y - 1, -d / 2 + 0.3); g.add(pl);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.2, d - 1.5), hm); arm.position.set(x, y - 2.6, 0); g.add(arm);
      const tip = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.4, 1), hm); tip.position.set(x, y - 1.6, d / 2 - 1.2); g.add(tip);
    });
  }
  function swordWall(o, axisY) {
    return (g, w, d) => { wallHooks(g, d, axisY - 1.6, 50); katana(g, o, 0, axisY, -d / 2 + 4.6); };
  }
  // support à poser (katana kake) 2 étages, laqué noir : Zangetsu en bas, Wado en haut
  function swordRack(w, d) {
    return (g) => {
      const L = { roughness: 0.35, metalness: 0.1 };
      rbox(g, w, 2.2, d, 0x121214, 0, 0, 0, 0.8, L); // socle
      [-w / 2 + 9, w / 2 - 9].forEach((x) => {
        rbox(g, 3.2, 40, 7, 0x121214, x, 2.2, -d / 2 + 6, 1.2, L); // montant
        [15, 32].forEach((y) => { // bras en U qui reçoivent les sabres
          box(g, 3.2, 1.8, 10, 0x121214, x, y - 2.6, -d / 2 + 13, L);
          box(g, 3.2, 3.4, 1.4, 0x121214, x, y - 2.6, -d / 2 + 17.4, L);
        });
      });
      katana(g, ZANGETSU, 0, 15 + 0.8, -d / 2 + 14.4);
      katana(g, WADO, 0, 32 + 0.8, -d / 2 + 14.4);
    };
  }
  // drapeau Kame (亀) : tissu orange légèrement ondulé, disque crème cerclé de noir, kanji noir, œillets à gauche
  function kameTex() {
    if (cache.kame) return cache.kame;
    const W = 1500, Hh = 900, c = cv(W, Hh), x = c.getContext('2d'), r = seeded(41);
    x.fillStyle = '#e8672a'; x.fillRect(0, 0, W, Hh);
    for (let i = 0; i < 2600; i++) { x.fillStyle = r() > 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(80,20,0,0.05)'; x.fillRect(r() * W, r() * Hh, 2 + r() * 3, 1); } // trame du tissu
    x.fillStyle = 'rgba(120,40,0,0.18)'; x.fillRect(0, 0, 22, Hh); // ourlet côté hampe
    const cx = W / 2, cy = Hh / 2, R = Hh * 0.355;
    x.fillStyle = '#111'; x.beginPath(); x.arc(cx, cy, R, 0, PI * 2); x.fill();
    x.fillStyle = '#f2dc9e'; x.beginPath(); x.arc(cx, cy, R * 0.9, 0, PI * 2); x.fill();
    x.fillStyle = '#111'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = '900 ' + Math.round(R * 1.38) + 'px "Yu Gothic", "YuGothic", "Hiragino Sans", "Noto Sans CJK JP", "Noto Sans JP", "Microsoft YaHei", "MS Gothic", sans-serif';
    x.fillText('亀', cx, cy + R * 0.04);
    [[34, 34], [34, Hh - 34]].forEach(([gx, gy]) => { // œillets
      x.fillStyle = '#c7c9cc'; x.beginPath(); x.arc(gx, gy, 15, 0, PI * 2); x.fill();
      x.fillStyle = '#5b4a40'; x.beginPath(); x.arc(gx, gy, 7, 0, PI * 2); x.fill();
    });
    return (cache.kame = sRGB(c));
  }
  function flagKame(w, d, h) {
    return (g) => {
      const geo = new THREE.PlaneGeometry(w, h, 40, 24), pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) { // plis légers (le tissu n'est pas tendu)
        const px = pos.getX(i), py = pos.getY(i);
        pos.setZ(i, 0.5 * Math.sin(px / 9.5) * (0.6 + 0.4 * Math.cos(py / 23)) + 0.25 * Math.sin(py / 7 + px / 31));
      }
      geo.computeVertexNormals();
      const f = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: kameTex(), roughness: 0.92, side: THREE.DoubleSide }));
      f.position.set(0, h / 2, -d / 2 + 1.2); f.castShadow = true; f.receiveShadow = true; g.add(f);
      [[-w / 2 + 3.4, h - 3.4], [-w / 2 + 3.4, 3.4], [w / 2 - 3.4, h - 3.4], [w / 2 - 3.4, 3.4]].forEach(([px, py]) => { // punaises
        const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.8, 10), mat(0x9aa0a6, { metalness: 0.7, roughness: 0.3 }));
        pin.rotation.x = PI / 2; pin.position.set(px, py, -d / 2 + 1.9); g.add(pin);
      });
    };
  }
  FURN.catalog.push(
    { id: 'flagkame', name: 'Drapeau Kame 亀 (mural)', group: 'Déco', w: 150, d: 3, h: 90, build: flagKame(150, 3, 90), wall: { y: 125 } },
    { id: 'swordwado', name: 'Sabre Wado Ichimonji (mural)', group: 'Déco', w: 104, d: 9, h: 14, build: swordWall(WADO, 8), wall: { y: 150 } },
    { id: 'swordzangetsu', name: 'Sabre Tensa Zangetsu (mural)', group: 'Déco', w: 105, d: 9, h: 26, build: swordWall(ZANGETSU, 19), wall: { y: 115 } },
    { id: 'swordrack', name: 'Support 2 sabres (Wado + Zangetsu)', group: 'Déco', w: 70, d: 26, h: 44, build: swordRack(70, 26), onTop: true } // les sabres (~105 cm) dépassent du support
  );

  FURN.byId = Object.fromEntries(FURN.catalog.map((c) => [c.id, c]));

  // Construit un meuble aux dimensions voulues (mise à l'échelle depuis les dimensions du catalogue)
  FURN.make = function (type, w, d, h) {
    const def = FURN.byId[type];
    const g = new THREE.Group();
    const inner = new THREE.Group();
    def.build(inner, def.w, def.d, def.h);
    inner.scale.set((w || def.w) / def.w, (h || def.h) / def.h, (d || def.d) / def.d);
    g.add(inner);
    return g;
  };

  // meubles sur mesure (def.dynamic) : construits directement aux bonnes dimensions, sans étirement
  const makeScaled = FURN.make;
  FURN.make = function (type, w, d, h) {
    const def = FURN.byId[type];
    if (!def || !def.dynamic) return makeScaled(type, w, d, h);
    const g = new THREE.Group(), inner = new THREE.Group();
    def.build(inner, w || def.w, d || def.d, h || def.h);
    g.add(inner);
    return g;
  };
})();
