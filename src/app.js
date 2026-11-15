(function () {
  const { H, T } = APT;
  const $ = (id) => document.getElementById(id);

  // ---------------------------------------------------------------- scène
  const view = $('view');
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // ombres calculées seulement quand quelque chose change (meuble, lumière, murs), pas à chaque image :
  // se déplacer (Marcher, tourner la vue) ne modifie pas les ombres, d'où un gros gain sans perte visuelle
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  // rendu à la demande (ADR 0007) : aucune image n'est calculée tant que rien ne change (processeur au repos).
  // invalidate(ms) demande une image, et en option de continuer à rendre pendant ms millisecondes.
  let needFrame = false, renderUntil = 0, rafId = 0, last = 0;
  function invalidate(ms) {
    needFrame = true;
    if (ms) renderUntil = Math.max(renderUntil, performance.now() + ms);
    if (!rafId) rafId = requestAnimationFrame(loop);
  }
  // par convention tous les modules l'appellent après avoir changé lumières / objets : elle demande aussi une image
  const markShadows = () => { renderer.shadowMap.needsUpdate = true; invalidate(); };
  view.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xe4e9ee);
  const camera = new THREE.PerspectiveCamera(45, 1, 8, 4000);
  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.12;
  controls.maxPolarAngle = Math.PI / 2 - 0.02;
  controls.minDistance = 20;
  controls.maxDistance = 2500;

  // lumière d'ambiance chaude (ampoules à incandescence / soleil bas), moins blanche qu'avant
  const hemi = new THREE.HemisphereLight(0xfff0d6, 0x9c917f, 0.75);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe7bf, 0.55);
  sun.position.set(-150, 700, 500);
  sun.target.position.set(200, 0, 200);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -600, right: 600, top: 600, bottom: -600, near: 100, far: 1800 });
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  const bulbLights = APT.bulbs.map(([x, z]) => {
    const l = new THREE.PointLight(0xffc474, 0.3, 700, 2);
    l.position.set(x, H - 12, z);
    l.shadow.mapSize.set(1024, 1024);
    l.shadow.bias = -0.003;
    scene.add(l);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(3.5, 12, 8), new THREE.MeshBasicMaterial({ color: 0xfff1cf }));
    bulb.position.copy(l.position);
    scene.add(bulb);
    l.userData.mesh = bulb;
    return l;
  });

  // environnement (reflets / lumière ambiante douce) pour le rendu réaliste
  const envTex = (() => {
    const c = document.createElement('canvas');
    c.width = 4; c.height = 256;
    const q = c.getContext('2d'), g = q.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, '#f2e6cf'); g.addColorStop(0.5, '#f6ead3'); g.addColorStop(1, '#9a8e79');
    q.fillStyle = g; q.fillRect(0, 0, 4, 256);
    const s = new THREE.Scene();
    s.add(new THREE.Mesh(new THREE.SphereGeometry(50, 16, 16), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), side: THREE.BackSide })));
    const rt = new THREE.PMREMGenerator(renderer).fromScene(s, 0.04);
    return rt.texture;
  })();

  const walk = { on: false, yaw: 0, pitch: 0, keys: {}, drag: false };
  // Marcher active le rendu réaliste, sauf sur écran tactile (téléphone) où il serait trop lourd
  const lowPower = window.matchMedia && matchMedia('(pointer: coarse)').matches;
  function realistic() { return $('real').checked || (walk.on && !lowPower); }

  // post-traitement : anticrénelage (cible multi-échantillons) + occlusion ambiante (SSAO) + correction gamma
  let composer = null, ssaoPass = null;
  function ensureComposer() {
    if (composer || !THREE.SSAOPass) return;
    const sz = renderer.getSize(new THREE.Vector2()), pr = renderer.getPixelRatio();
    const rt = new THREE.WebGLMultisampleRenderTarget(sz.x * pr, sz.y * pr, { format: THREE.RGBAFormat });
    rt.samples = 4;
    composer = new THREE.EffectComposer(renderer, rt);
    composer.setPixelRatio(pr);
    composer.setSize(sz.x, sz.y);
    composer.addPass(new THREE.RenderPass(scene, camera));
    ssaoPass = new THREE.SSAOPass(scene, camera, sz.x, sz.y);
    ssaoPass.kernelRadius = 22; // cm
    ssaoPass.minDistance = 0.0009;
    ssaoPass.maxDistance = 0.007;
    composer.addPass(ssaoPass);
    composer.addPass(new THREE.ShaderPass(THREE.GammaCorrectionShader));
  }
  // les matières sombres reflètent moins l'environnement (sinon le cuir noir paraît gris)
  function envFor(m) {
    const c = m.color, lum = c ? 0.3 * c.r + 0.59 * c.g + 0.11 * c.b : 1;
    return m.metalness > 0.3 ? 0.8 : lum < 0.12 ? 0.12 : lum < 0.3 ? 0.25 : 0.5;
  }
  let lastRigReal = null;
  function applyRig() {
    const real = realistic();
    // recompiler les matières seulement si on passe de normal à réaliste (ou l'inverse) : sinon c'est instantané
    const recompile = real !== lastRigReal;
    lastRigReal = real;
    renderer.toneMapping = real ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
    renderer.toneMappingExposure = 1.0;
    scene.environment = real ? envTex : null;
    hemi.intensity = real ? 0.16 : 0.75;
    if (real) {
      sun.color.set(0xffd9a0); // soleil bas, doré
      sun.intensity = 1.9;
      sun.position.set(230, 380, -520); // soleil bas côté baie, passe par les ouvertures
      sun.target.position.set(230, 0, 150);
    } else {
      sun.color.set(0xffe7bf);
      sun.intensity = 0.55;
      sun.position.set(-150, 700, 500);
      sun.target.position.set(200, 0, 200);
    }
    bulbLights.forEach((l) => { l.intensity = real ? 0.8 : 0.3; l.decay = real ? 1.4 : 2; l.distance = real ? 900 : 700; l.castShadow = real; });
    scene.traverse((o) => {
      if (o.material && o.material.isMeshStandardMaterial) { o.material.envMapIntensity = real ? envFor(o.material) : 1; if (recompile) o.material.needsUpdate = true; }
    });
    hooks.rig.forEach((f) => { try { f(real); } catch (e) { console.error(e); } }); // ex. lights.js : moment de la journée
    markShadows();
  }

  // ---------------------------------------------------------------- appartement
  const apt = new THREE.Group();
  scene.add(apt);
  const walls = []; // { mesh, n, y0, y1 }
  const polyArea = (p) => Math.abs(p.reduce((s, a, i) => s + a[0] * p[(i + 1) % p.length][1] - p[(i + 1) % p.length][0] * a[1], 0)) / 2;

  function tileTexture(base, grout, size, light) {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const x = c.getContext('2d');
    x.fillStyle = grout;
    x.fillRect(0, 0, 256, 256);
    x.fillStyle = base;
    x.fillRect(3, 3, 250, 250);
    if (!light) {
      x.globalAlpha = 0.07;
      for (let i = 0; i < 400; i++) { x.fillStyle = Math.random() > 0.5 ? '#fff' : '#000'; x.fillRect(Math.random() * 250, Math.random() * 250, 2, 1); }
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1 / size, 1 / size);
    t.anisotropy = 4;
    t.encoding = THREE.sRGBEncoding;
    return t;
  }

  // matière de surface à l'échelle réelle (les UV du sol/plafond sont en cm)
  function surfMat(kind, extra) {
    const t = MATS[kind];
    [t.map, t.bump, t.rough].forEach((x) => x && x.repeat.set(1 / t.size, 1 / (t.sizeY || t.size))); // sizeY : motif non carré (faïence)
    const m = new THREE.MeshStandardMaterial(Object.assign({ color: 0xffffff, roughness: 0.6 }, extra));
    if (t.map) m.map = t.map;
    if (t.bump) m.bumpMap = t.bump;
    if (t.rough) { m.roughnessMap = t.rough; m.roughness = 1; }
    return m;
  }

  function floorFor(poly, material, y) {
    const shape = new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z)));
    const g = new THREE.ShapeGeometry(shape);
    g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, material);
    m.position.y = y || 0;
    m.receiveShadow = true;
    apt.add(m);
    return m;
  }

  function outward(poly, i) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz);
    const d = { x: dx / L, z: dz / L };
    let n = { x: d.z, z: -d.x };
    const mid = [(a[0] + b[0]) / 2 + n.x * 2, (a[1] + b[1]) / 2 + n.z * 2];
    if (APT.pointInPoly(mid, poly)) n = { x: -n.x, z: -n.z };
    return { a, b, L, d, n };
  }

  // enduit blanc cassé (légèrement chaud), avec un faible relief
  const wallMat = () => new THREE.MeshStandardMaterial({ color: 0xfdf8ee, map: MATS.plasterColor, bumpMap: MATS.plaster.bump, bumpScale: 0.2, roughness: 0.92 }); // peinture lisse, grain très léger

  function wallPiece(e, s0, s1, y0, y1, extA, extB) {
    const len = s1 - s0 + extA + extB, h = y1 - y0;
    if (s1 - s0 < 0.5 || h < 0.5) return;
    const sc = (s0 + s1) / 2 + (extB - extA) / 2;
    const cx = e.a[0] + e.d.x * sc + e.n.x * (T / 2);
    const cz = e.a[1] + e.d.z * sc + e.n.z * (T / 2);
    const geo = new THREE.BoxGeometry(len, h, T);
    MATS.scaleBoxUV(geo, len, h, T, 140);
    const m = new THREE.Mesh(geo, wallMat());
    m.position.set(cx, y0 + h / 2, cz);
    m.rotation.y = Math.atan2(-e.d.z, e.d.x);
    m.castShadow = true;
    m.receiveShadow = true;
    apt.add(m);
    walls.push({ mesh: m, n: new THREE.Vector3(e.n.x, 0, e.n.z), y0, y1, cx, cz });
  }

  function buildEdgeWalls(poly, i, openings) {
    const e = outward(poly, i);
    const n = poly.length;
    const prev = outward(poly, (i + n - 1) % n);
    const sgn = Math.sign(poly.reduce((s, a, k) => s + a[0] * poly[(k + 1) % n][1] - poly[(k + 1) % n][0] * a[1], 0));
    const cross = (p, q) => p.d.x * q.d.z - p.d.z * q.d.x;
    const next = outward(poly, (i + 1) % n);
    const extA = Math.sign(cross(prev, e)) === sgn ? T : 0;
    const extB = Math.sign(cross(e, next)) === sgn ? T : 0;
    const ops = (openings || []).slice().sort((p, q) => p.s - q.s);
    let cur = 0;
    ops.forEach((o) => {
      wallPiece(e, cur, o.s, 0, H, cur === 0 ? extA : 0, 0);
      if (o.sill > 0) wallPiece(e, o.s, o.s + o.w, 0, o.sill, 0, 0);
      wallPiece(e, o.s, o.s + o.w, o.sill + o.h, H, 0, 0);
      cur = o.s + o.w;
    });
    wallPiece(e, cur, e.L, 0, H, cur === 0 ? extA : 0, extB);

    // plinthes blanches, interrompues au droit des portes et de la baie
    const skirt = (s0, s1) => {
      if (s1 - s0 < 3) return;
      const sc = (s0 + s1) / 2;
      const m = new THREE.Mesh(new THREE.BoxGeometry(s1 - s0, 8, 1.4), new THREE.MeshStandardMaterial({ color: 0xfbfaf7, roughness: 0.45 }));
      m.position.set(e.a[0] + e.d.x * sc - e.n.x * 0.7, 4, e.a[1] + e.d.z * sc - e.n.z * 0.7);
      m.rotation.y = Math.atan2(-e.d.z, e.d.x);
      m.castShadow = true; m.receiveShadow = true;
      apt.add(m);
    };
    let c2 = 0;
    ops.filter((o) => o.sill === 0).forEach((o) => { skirt(c2, o.s); c2 = o.s + o.w; });
    skirt(c2, e.L);

    // vitrages, portes, caisson de volet
    ops.forEach((o) => {
      const sc = o.s + o.w / 2;
      const px = e.a[0] + e.d.x * sc, pz = e.a[1] + e.d.z * sc;
      const rot = Math.atan2(-e.d.z, e.d.x);
      const place = (m, y, off) => {
        m.position.set(px + e.n.x * (off || T / 2), y, pz + e.n.z * (off || T / 2));
        m.rotation.y = rot;
        m.castShadow = false;
        apt.add(m);
      };
      if (o.kind === 'baie' || o.kind === 'window' || o.kind === 'doorwin') {
        const glass = new THREE.Mesh(
          new THREE.BoxGeometry(o.w, o.h, 1),
          new THREE.MeshStandardMaterial({ color: 0xbfe0f2, transparent: true, opacity: 0.28, roughness: 0.1 })
        );
        place(glass, o.sill + o.h / 2);
        const fr = (w, h, x, y) => {
          const f = new THREE.Mesh(new THREE.BoxGeometry(w, h, 5), new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.5 }));
          const lx = x, p = new THREE.Vector3(px + e.d.x * lx + e.n.x * (T / 2), y, pz + e.d.z * lx + e.n.z * (T / 2));
          f.position.copy(p); f.rotation.y = rot; apt.add(f);
        };
        fr(o.w, 4, 0, o.sill + 2); fr(o.w, 4, 0, o.sill + o.h - 2);
        fr(4, o.h, -o.w / 2 + 2, o.sill + o.h / 2); fr(4, o.h, o.w / 2 - 2, o.sill + o.h / 2);
        if (o.kind === 'doorwin') {
          // vraie porte-fenêtre : un vantail vitré sur toute la hauteur (pas d'allège), qui s'ouvre entièrement
          const hd = new THREE.Mesh(new THREE.BoxGeometry(2.5, 14, 4), new THREE.MeshStandardMaterial({ color: 0xdadde0, metalness: 0.5, roughness: 0.4 }));
          hd.position.set(px - e.d.x * (o.w / 2 - 7) - e.n.x * 1, 105, pz - e.d.z * (o.w / 2 - 7) - e.n.z * 1);
          hd.rotation.y = rot; apt.add(hd); // poignée à gauche vue de l'intérieur (côté ouest), paumelles côté frigo
        }
        if (o.kind === 'baie' || o.kind === 'doorwin') {
          const panels = o.kind === 'baie' ? o.panels || 2 : 1;
          for (let k = 1; k < panels; k++) fr(3, o.h, -o.w / 2 + (o.w / panels) * k, o.sill + o.h / 2);
          // caisson du volet roulant, côté intérieur
          const c = new THREE.Mesh(new THREE.BoxGeometry(o.w + 6, 26, 20), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }));
          c.position.set(px - e.n.x * 9, H - 26 - 8 + 13, pz - e.n.z * 9);
          c.rotation.y = rot; c.castShadow = true; apt.add(c);
        }
      } else if (o.kind === 'door') {
        const leaf = new THREE.Mesh(new THREE.BoxGeometry(o.w - 4, o.h - 2, 4), new THREE.MeshStandardMaterial({ color: 0xf7f6f2, roughness: 0.6 }));
        place(leaf, (o.h - 2) / 2 + 1);
        leaf.castShadow = true;
        const hd = new THREE.Mesh(new THREE.BoxGeometry(12, 1.6, 8), new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 0.6, roughness: 0.4 }));
        hd.position.set(px + e.d.x * (o.w / 2 - 12) + e.n.x * (T / 2), 100, pz + e.d.z * (o.w / 2 - 12) + e.n.z * (T / 2));
        hd.rotation.y = rot; apt.add(hd);
        // rainures horizontales du vantail (comme sur la porte de la photo)
        [35, 80, 125, 170].forEach((yy) => [-1, 1].forEach((sd) => {
          const gl = new THREE.Mesh(new THREE.BoxGeometry(o.w - 18, 1.1, 0.8), new THREE.MeshStandardMaterial({ color: 0xd9d5cc, roughness: 0.7 }));
          gl.position.set(0, yy - ((o.h - 2) / 2 + 1), sd * 2.1);
          leaf.add(gl);
        }));
      }
    });
  }

  // sol + murs
  floorFor(APT.main, surfMat('tile', { bumpScale: 3.5 }));
  floorFor(APT.bathPoly, surfMat('tile', { bumpScale: 3.5 }), 0.2); // même carrelage que le séjour
  // plafond en crépi (comme sur tes photos) : visible seulement quand la caméra est dans la pièce
  const ceilings = [APT.main, APT.bathPoly].map((poly) => {
    const m = floorFor(poly, surfMat('roughcast', { color: 0xf8f6f1, roughness: 0.97, bumpScale: 2, side: THREE.BackSide }), H);
    m.castShadow = true;
    return m;
  });
  for (let i = 0; i < APT.main.length; i++) buildEdgeWalls(APT.main, i, APT.openings[i]);
  [0, 2, 3].forEach((i) => buildEdgeWalls(APT.bathPoly, i, null)); // 0 haut, 2 bas, 3 gauche (l'arête 1 = mur partagé)

  // terrasse
  {
    const t = APT.terrace;
    const m = new THREE.Mesh(new THREE.BoxGeometry(t.w, 8, t.d), new THREE.MeshStandardMaterial({ map: tileTexture('#b9b3a7', '#9d978b', 40, true), roughness: 0.9 }));
    m.position.set(t.x + t.w / 2, -4.2, t.z + t.d / 2 - T);
    m.receiveShadow = true;
    apt.add(m);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(t.w, 100, 2), new THREE.MeshStandardMaterial({ color: 0xbfe0f2, transparent: true, opacity: 0.22 }));
    rail.position.set(t.x + t.w / 2, 50, t.z - T);
    apt.add(rail);
  }

  // éléments fixes
  function fixedMeshes() {
    const g = new THREE.Group();
    const B = FURN.box;
    // cuisine (dimensions dans APT.kitchen, apartment.js ; aspect d'après la photo 6) : meubles bas 85 cm + plan 3 cm
    {
      const K = APT.kitchen, D = K.depth, WT = K.worktop, P = WT - 3; // WT : dessus du plan (88), P : dessous du plan (85)
      const OAK = 0xd9c9ad, CARC = 0xe9e5dc, TOP = 0x1a1a1d, WHITE = 0xf6f5f1, STEEL = { metalness: 0.75, roughness: 0.3 };
      const oak = { kind: 'wood', roughness: 0.6, bumpScale: 0.3 };
      const span = (a) => ({ c: (a[0] + a[1]) / 2, l: a[1] - a[0] });
      // poignée barre inox horizontale (façade face à +x si s = 1, face à −x si s = −1)
      const bar = (fx, s, y, zc, len) => {
        B(g, 2.2, 1.2, len, 0xc9cdd1, fx + s * 3, y, zc, STEEL);
        [-1, 1].forEach((k) => B(g, 2.4, 1, 1, 0xc9cdd1, fx + s * 1.6, y + 0.1, zc + k * (len / 2 - 1.5), STEEL));
      };
      // --- mur côté évier (x = K.west.x, façades vers +x)
      const wx = K.west.x, fx = wx + D - 2; // fx : nu des façades
      const sc = span(K.west.sinkCab), all = span([K.west.z0, K.west.z1]);
      B(g, D - 6, 10, sc.l, 0x3b3833, wx + (D - 6) / 2, 0, sc.c); // socle en retrait, sous le placard d'évier seulement
      B(g, D - 3, P - 10, sc.l, CARC, wx + (D - 3) / 2, 10, sc.c); // caisson sous évier
      B(g, 1.8, P - 11, sc.l - 0.6, OAK, fx + 0.9, 10.5, sc.c, oak); // porte bois clair
      bar(fx + 1.8, 1, P - 7, sc.c, Math.min(40, sc.l - 14));
      // emplacement lave-vaisselle / lave-linge : vide jusqu'au carrelage (ni socle ni fond)
      B(g, D + 2, 3, all.l, TOP, wx + (D + 2) / 2, P, all.c, { roughness: 0.35 }); // plan de travail noir
      B(g, 1.5, 9, all.l, TOP, wx + 0.75, WT, all.c, { roughness: 0.35 }); // rebord contre le mur
      // évier inox (cuve à gauche, contre le bourrelet) + égouttoir rainuré, mitigeur
      const sk = span(K.west.sink), dr = span(K.west.drainer), sx = wx + D / 2 + 3;
      B(g, 46, 0.6, sk.l + dr.l, 0xc2c7cc, sx, WT, (sk.c * sk.l + dr.c * dr.l) / (sk.l + dr.l), STEEL); // plaque inox
      B(g, 36, 0.4, sk.l - 6, 0x5f656c, sx, WT + 0.5, sk.c, STEEL); // cuve (fond sombre)
      for (let k = 0; k < 7; k++) B(g, 32, 0.3, 0.8, 0x9ea4aa, sx, WT + 0.6, dr.c - dr.l / 2 + 5 + k * ((dr.l - 10) / 6), STEEL); // rainures
      B(g, 4, 6, 4, 0xd0d4d8, wx + 9, WT, sk.c, STEEL); B(g, 2.4, 14, 2.4, 0xd0d4d8, wx + 9, WT + 6, sk.c, STEEL);
      B(g, 15, 2, 2, 0xd0d4d8, wx + 16, WT + 18, sk.c, STEEL); // bec du mitigeur
      // colonne blanche du chauffe-eau : un seul bloc, une seule porte plate, un petit bouton rond
      const col = span([K.column.z0, K.column.z1]);
      B(g, D - 2, H - 4, col.l, WHITE, wx + (D - 2) / 2, 0, col.c, { roughness: 0.45 });
      B(g, 0.6, H - 10, col.l - 1.5, 0xfbfbf8, fx + 0.3, 3, col.c, { roughness: 0.4 }); // porte (léger joint)
      const knob = new THREE.Mesh(new THREE.SphereGeometry(1.7, 16, 12), new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.35 }));
      knob.scale.set(0.8, 1, 1); knob.position.set(fx + 1.6, 105, col.c + col.l / 2 - 6); g.add(knob);
      // --- mur côté frigo (x = K.east.x, façades vers −x)
      const ex = K.east.x, gx = ex - D + 2;
      const cb = span(K.east.cab), fr = span(K.east.fridge), ea = span([K.east.z0, K.east.z1]), hb = span(K.east.hob);
      B(g, D - 6, 10, cb.l, 0x3b3833, ex - (D - 6) / 2, 0, cb.c); // socle sous le placard
      B(g, D - 3, P - 10, cb.l, CARC, ex - (D - 3) / 2, 10, cb.c); // placard sous les plaques : moitié gauche du plan
      B(g, 1.8, P - 11, cb.l - 0.6, OAK, gx - 0.9, 10.5, cb.c, oak);
      bar(gx - 1.8, -1, P - 7, cb.c, Math.min(40, cb.l - 14));
      // moitié droite : le frigo occupe tout l'espace sous le plan de travail
      const fd = D - 4, fh = P - 0.5;
      B(g, fd, fh, fr.l, 0xf2f2f0, ex - 2 - fd / 2, 0, fr.c, { roughness: 0.35 });
      B(g, 0.6, fh - 6, fr.l - 2, 0xe6e6e3, ex - 2 - fd - 0.3, 3, fr.c); // porte
      B(g, 1.6, 34, 2, 0xb0b4b8, ex - 2 - fd - 1.4, 40, fr.c + fr.l / 2 - 5, STEEL); // poignée
      B(g, D + 2, 3, ea.l, TOP, ex - (D + 2) / 2, P, ea.c, { roughness: 0.35 }); // plan de travail noir
      B(g, 1.5, 9, ea.l, TOP, ex - 0.75, WT, ea.c, { roughness: 0.35 }); // rebord contre le mur
      // plaques : domino 2 feux en vitrocéramique noire (avant / arrière), dans le coin
      B(g, 50, 0.6, hb.l - 1, 0x0b0b0d, ex - D / 2 + 1, WT, hb.c, { roughness: 0.15, metalness: 0.2 });
      [-11, 11].forEach((dx) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(8.5, 8.5, 0.15, 32), new THREE.MeshStandardMaterial({ color: 0x3a3a40, roughness: 0.4 })); m.position.set(ex - D / 2 + 1 + dx, WT + 0.7, hb.c); g.add(m); });
      // 2 placards hauts sur toute la longueur (bois clair, poignée barre en bas)
      const U = K.east.uppers, half = ea.l / 2;
      [ea.c - half / 2, ea.c + half / 2].forEach((zc) => {
        B(g, U.d - 2, U.h, half - 0.6, CARC, ex - (U.d - 2) / 2, U.y, zc);
        B(g, 1.8, U.h - 1, half - 1.2, OAK, ex - U.d + 0.9, U.y + 0.5, zc, oak);
        bar(ex - U.d, -1, U.y + 5, zc, Math.min(30, half - 8));
      });
    }
    // radiateur : 60 cm de large, à 15 cm de l'angle de la baie (mesuré)
    B(g, 10, 160, 60, 0xffffff, 5, 15, 45);
    // bourrelet (gaine) entre baie et cuisine : 87 cm de large, après 63 cm de mur plat (mesuré)
    B(g, 87, H, 62, 0xf1efe9, 350, 0, -6);
    // interrupteur + prise sur le mur ouest, à 230 cm du radiateur (juste avant la porte de la salle d'eau)
    APT.switches.forEach(([sx, sz]) => {
      B(g, 1.2, 15, 8.5, 0xfbfbf9, sx + 0.6, 98, sz, { roughness: 0.4 });
      B(g, 0.8, 3, 2.2, 0xe6e6e2, sx + 1.4, 108, sz, { roughness: 0.4 });
    });
    // salle d'eau (dimensions dans APT.bathLayout ; aspect d'après la photo 5). Groupe dans le repère local de la pièce :
    // x local = s (vers la porte), z local = t (vers le mur de gauche en entrant), origine au coin du fond à droite.
    // (rotation identique à celle des empreintes APT.rectPoly : local x → u, local z → v)
    {
      const L = APT.bathLayout, BW = APT.bath.w, BD = APT.bath.d;
      const gb = new THREE.Group();
      gb.position.set(APT.bath.origin[0], 0, APT.bath.origin[1]);
      gb.rotation.y = Math.atan2(-APT.bath.u[1], APT.bath.u[0]);
      const WHITE = 0xfbfbf9, CHROME = { metalness: 0.85, roughness: 0.2 }, GLASS = { transparent: true, opacity: 0.22, roughness: 0.05 };
      const bx = (w, h, d, c, s0, y, t0, o) => B(gb, w, h, d, c, s0 + w / 2, y, t0 + d / 2, o); // boîte posée depuis son coin (s0, t0)
      // douche d'angle : receveur extra-plat, cloison carrelée côté vasque jusqu'au plafond, paroi vitrée côté pièce
      const S = L.shower, sw = S.s1 - S.s0, sd = S.t1 - S.t0;
      bx(sw, 4, sd, 0xeef1f3, S.s0, 0, S.t0, { roughness: 0.4 });
      const drain = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 0.3, 24), new THREE.MeshStandardMaterial({ color: 0xb8bcc0, metalness: 0.7, roughness: 0.3 }));
      drain.position.set(S.s0 + sw / 2, 4.1, S.t0 + sd / 2); gb.add(drain);
      // faïence : grands carreaux blancs 30 × 60 sur la cloison et sur les deux murs de la douche, jusqu'au plafond
      const tiles = surfMat('wallTile', { color: 0xffffff, bumpScale: 0.6, roughness: 0.25 });
      const tiled = (w, h, d, sc, y, tcn) => { const geo = new THREE.BoxGeometry(w, h, d); MATS.scaleBoxUV(geo, w, h, d, 1); const m = new THREE.Mesh(geo, tiles); m.position.set(sc, y + h / 2, tcn); m.castShadow = m.receiveShadow = true; gb.add(m); };
      tiled(S.wall, H - 1, sd, S.s1 + S.wall / 2, 0, S.t0 + sd / 2); // cloison côté vasque
      tiled(0.8, H - 1, sd, S.s0 + 0.4, 0, S.t0 + sd / 2); // mur du fond (dans la douche)
      tiled(sw, H - 1, 0.8, S.s0 + sw / 2, 0, S.t1 - 0.4); // mur de gauche (dans la douche)
      bx(sw * 0.55, 195, 0.8, 0xbfe0f2, S.s0 + 2, 4, S.t0 - 0.4, GLASS); // paroi fixe
      bx(sw * 0.5, 195, 0.8, 0xbfe0f2, S.s1 - sw * 0.5, 4, S.t0 - 2.2, GLASS); // vantail coulissant
      bx(sw - 2, 1.5, 1.4, 0xd8dcdf, S.s0 + 1, 199, S.t0 - 2, CHROME); // rail haut
      bx(2, 2, sd - 20, 0xd8dcdf, S.s0 + 4, 195, S.t0 + 10, CHROME); // barre de douche (fond)
      // marche (coffrage) le long du mur du fond, du mur de droite jusqu'à la douche, en faïence
      { const P = L.step; bx(P.s1 - P.s0, P.h, S.t0 - P.t0, WHITE, P.s0, 0, P.t0, { roughness: 0.4 }); } // blanche
      // WC au fond à droite, tournés vers la porte : réservoir arrondi contre le mur, corps en porcelaine d'une pièce
      // (ovale qui s'affine vers le sol), lunette et abattant fermé
      const W = L.wc, tc = W.tc, porc = new THREE.MeshStandardMaterial({ color: WHITE, roughness: 0.18 });
      FURN.rbox(gb, 17, 38, 36, WHITE, W.s0 + 9.5, 40, tc, 3.5, { roughness: 0.18 }); // réservoir (17 le long de s, 36 le long de t)
      bx(8, 1.2, 4, 0xdcdcdc, W.s0 + 5.5, 78, tc - 2, CHROME); // bouton de chasse
      const body = new THREE.Mesh(new THREE.CylinderGeometry(18, 11.5, 39, 40), porc);
      body.scale.set(1.3, 1, 1); body.position.set(W.s0 + 40, 19.5, tc); body.castShadow = body.receiveShadow = true; gb.add(body);
      const seatMat = new THREE.MeshStandardMaterial({ color: 0xf7f7f5, roughness: 0.3 });
      const seat = new THREE.Mesh(new THREE.TorusGeometry(14.5, 2.2, 12, 40), seatMat);
      seat.rotation.x = Math.PI / 2; seat.scale.set(1.3, 1, 0.6); seat.position.set(W.s0 + 40, 40.3, tc); gb.add(seat);
      const lid = new THREE.Mesh(new THREE.CylinderGeometry(16.8, 16.8, 1.6, 40), seatMat);
      lid.scale.set(1.3, 1, 1); lid.position.set(W.s0 + 40, 42.6, tc); lid.castShadow = true; gb.add(lid);
      // sèche-serviettes (barreaux horizontaux blancs) sur le mur de la porte
      const T = L.towel, tw = T.t1 - T.t0;
      [T.t0 + 2, T.t1 - 2].forEach((tt) => bx(3, T.h, 3, WHITE, T.s0 + 2, T.y0, tt - 1.5, { roughness: 0.3 }));
      for (let y = T.y0 + 6; y < T.y0 + T.h - 4; y += (y - T.y0) % 45 > 33 ? 10 : 5) bx(1.8, 1.8, tw - 2, WHITE, T.s0 + 3, y, T.t0 + 1, { roughness: 0.3 });
      // meuble vasque suspendu, 2 tiroirs, plan-vasque blanc
      const V = L.vanity, vw = V.s1 - V.s0, vt0 = BD - V.d;
      bx(vw, V.top - 4 - V.y0, V.d - 2, WHITE, V.s0, V.y0, vt0 + 2, { roughness: 0.2 });
      const hf = (V.top - 4 - V.y0) / 2;
      [0, 1].forEach((k) => {
        bx(vw - 1, hf - 0.8, 1.2, 0xffffff, V.s0 + 0.5, V.y0 + k * hf + 0.4, vt0 + 0.8, { roughness: 0.15 }); // façade de tiroir
        bx(16, 1.2, 1.4, 0xd5d9dc, V.s0 + vw / 2 - 8, V.y0 + k * hf + hf - 7, vt0, CHROME); // poignée
      });
      bx(vw + 1, 4, V.d, 0xfdfdfb, V.s0 - 0.5, V.top - 4, vt0, { roughness: 0.15 }); // plan-vasque
      bx(vw - 22, 0.5, V.d - 18, 0xe9ebec, V.s0 + 11, V.top + 0.05, vt0 + 6, { roughness: 0.1 }); // cuve
      bx(3, 13, 3, 0xd5d9dc, V.s0 + vw / 2 - 1.5, V.top, BD - 9, CHROME); bx(3, 2, 9, 0xd5d9dc, V.s0 + vw / 2 - 1.5, V.top + 11, BD - 12, CHROME); // mitigeur
      // miroir, frise de carrelage gris au-dessus (l'applique est un point électrique)
      const M = L.mirror;
      bx(vw - 2, M.y1 - M.y0, 0.6, 0xd7e1e6, V.s0 + 1, M.y0, BD - 0.8, { metalness: 0.15, roughness: 0.08 }); // miroir (clair : pas de vrai reflet)
      bx(vw + 6, 30, 0.8, 0x8f8a83, V.s0 - 3, M.y1 + 3, BD - 0.9, { roughness: 0.5 });
      g.add(gb);
    }
    return g;
  }
  let fixedGroup = fixedMeshes();
  apt.add(fixedGroup);
  // cotes de la cuisine / salle d'eau modifiées (src/fixtures.js) : recalcule APT.fixed / APT.kitchenAccess depuis
  // APT.fixes, refait les maillages fixes, recalcule les collisions puis prévient les modules (hook fixed)
  function rebuildFixed() {
    APT.applyFixes(APT.fixes);
    apt.remove(fixedGroup);
    fixedGroup.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) [].concat(o.material).forEach((m) => m.dispose()); // matières propres à ces maillages (textures partagées : gardées)
    });
    fixedGroup = fixedMeshes();
    apt.add(fixedGroup);
    applyRig(); // reflets du rendu réaliste sur les nouvelles matières (sans recompilation : même mode)
    refreshStates(); // collisions (meubles en rouge), ombres, hooks change
    hooks.fixed.forEach((f) => { try { f(); } catch (e) { console.error(e); } });
    markShadows();
  }

  // cotes (longueurs des murs)
  const dimGroup = new THREE.Group();
  function label(text, x, z) {
    const c = document.createElement('canvas');
    c.width = 192; c.height = 64;
    const q = c.getContext('2d');
    q.fillStyle = 'rgba(255,255,255,.92)'; q.strokeStyle = '#2a5db0'; q.lineWidth = 3;
    q.beginPath(); q.roundRect ? q.roundRect(4, 8, 184, 48, 12) : q.rect(4, 8, 184, 48); q.fill(); q.stroke();
    q.fillStyle = '#1d3f7a'; q.font = '600 30px system-ui,Segoe UI,Arial'; q.textAlign = 'center'; q.textBaseline = 'middle';
    q.fillText(text, 96, 33);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }));
    s.scale.set(96, 32, 1);
    s.position.set(x, 6, z);
    s.renderOrder = 10;
    dimGroup.add(s);
  }
  [APT.main, APT.bathPoly].forEach((poly, pi) => {
    poly.forEach((a, i) => {
      if (pi === 1 && i === 1) return;
      const e = outward(poly, i);
      if (e.L < 40) return;
      label((e.L / 100).toFixed(2).replace('.', ',') + ' m', (e.a[0] + e.b[0]) / 2 - e.n.x * 28, (e.a[1] + e.b[1]) / 2 - e.n.z * 28);
    });
  });
  dimGroup.visible = false;
  scene.add(dimGroup);

  // ---------------------------------------------------------------- meubles
  const items = [];
  let selected = null;
  let nextId = 1;
  const decalGeo = new THREE.PlaneGeometry(1, 1);
  decalGeo.rotateX(-Math.PI / 2);

  function addItem(type, o) {
    const def = FURN.byId[type];
    o = o || {};
    const it = {
      id: nextId++, type, name: (o.meta && o.meta.name) || def.name,
      // données libres attachées au meuble (prix, lien, "déjà à moi", couleur, nom perso...) : sauvegardées avec le scénario
      meta: o.meta ? JSON.parse(JSON.stringify(o.meta)) : {},
      x: o.x ?? 300, z: o.z ?? 150, rot: o.rot ?? 0,
      w: o.w ?? def.w, d: o.d ?? def.d, h: o.h ?? def.h,
      // réglage d'une lampe : allumée, puissance (%), température de couleur (K)
      light: def.light ? Object.assign({ on: true, p: def.light.p, k: def.light.k }, o.light || {}) : null,
    };
    it.group = new THREE.Group();
    it.group.userData.item = it;
    it.decal = new THREE.Mesh(decalGeo, new THREE.MeshBasicMaterial({ color: 0xffc400, transparent: true, opacity: 0.0, depthWrite: false }));
    it.decal.position.y = 0.6;
    it.decal.renderOrder = 2;
    scene.add(it.group, it.decal);
    rebuild(it);
    items.push(it);
    return it;
  }

  function rebuild(it) {
    while (it.group.children.length) {
      const c = it.group.children.pop();
      c.traverse((m) => { if (m.geometry) m.geometry.dispose(); });
    }
    it.group.add(FURN.make(it.type, it.w, it.d, it.h));
    hooks.build.forEach((f) => { try { f(it); } catch (e) { console.error(e); } }); // ex. couleur personnalisée
    if (realistic()) it.group.traverse((m) => { if (m.material && m.material.isMeshStandardMaterial) m.material.envMapIntensity = envFor(m.material); });
    sync(it);
  }

  function poly(it) { return APT.rectPoly(it.x, it.z, it.w, it.d, it.rot); }

  // objets "à poser" (lampe de bureau, de chevet) : ne heurtent que les autres objets à poser
  const onTop = (it) => !!FURN.byId[it.type].onTop;
  // objets muraux (drapeau, sabres…) : accrochés contre un mur, à une hauteur réglable (meta.y = hauteur du bas, cm)
  const onWall = (it) => !!FURN.byId[it.type].wall;
  const wallY = (it) => (it.meta && Number.isFinite(it.meta.y) ? it.meta.y : FURN.byId[it.type].wall.y);
  // hauteur fixée à la main (champ « Hauteur du bas », Page↑/Page↓) ; sinon : objet à poser = suit le meuble dessous, meuble = au sol
  const manualY = (it) => (!onWall(it) && it.meta && Number.isFinite(it.meta.y) ? it.meta.y : null);
  // dessus du meuble (ou du plan de travail) sous le centre de l'objet : { y, by } (0 / null = le sol)
  function surfaceBelow(it) {
    const pt = [it.x, it.z];
    let y = 0, by = null;
    items.forEach((o) => {
      const d = FURN.byId[o.type];
      if (o === it || onTop(o) || onWall(o) || !d.top || !APT.pointInPoly(pt, poly(o))) return;
      const t = (manualY(o) || 0) + d.top * (o.h / d.h);
      if (t > y) { y = t; by = o.name; }
    });
    APT.fixed.forEach((f) => { if (f.kind === 'kitchen' && APT.pointInPoly(pt, f.poly) && APT.kitchen.worktop > y) { y = APT.kitchen.worktop; by = 'plan de travail'; } });
    return { y, by };
  }
  function isInvalid(it) {
    const p = poly(it);
    if (!APT.inside(p)) return true;
    if (!onTop(it) && !onWall(it) && APT.fixed.some((f) => APT.polyOverlap(p, f.poly, 0.5))) return true;
    // deux objets ne se gênent que si leurs empreintes ET leurs hauteurs se recouvrent (objet posé au-dessus = libre)
    const ea = elevation(it), vOverlap = (o) => { const eb = elevation(o); return ea < eb + o.h - 0.5 && eb < ea + it.h - 0.5; };
    if (onWall(it)) { // mural : dans la pièce ; gêné par ce qui occupe le même mur à la même hauteur (armoire, autre objet mural…)
      return items.some((o) => o !== it && !onTop(o) && APT.polyOverlap(p, poly(o), 0.5) && vOverlap(o));
    }
    return items.some((o) => {
      if (o === it || !APT.polyOverlap(p, poly(o), 0.5)) return false;
      if (onWall(o)) return !onTop(it) && vOverlap(o); // un objet mural ne gêne que ce qui monte jusqu'à lui
      if (!vOverlap(o)) return false; // l'un est au-dessus de l'autre
      // objet posé sur un plateau : les chaises rangées sous ce plateau ne le gênent pas (et inversement)
      if ((onTop(it) && ea > 0 && FURN.byId[o.type].seat) || (onTop(o) && elevation(o) > 0 && FURN.byId[it.type].seat)) return false;
      if (canNest(it, o) || canNest(o, it)) return false; // chaise sous la table, bureau sous la mezzanine...
      if (onTop(o) === onTop(it)) return true;
      // un objet à poser ne peut chevaucher qu'un meuble à plateau (bureau, table, chevet...)
      const lamp = onTop(it) ? it : o, under = lamp === it ? o : it;
      return !FURN.byId[under.type].top || !APT.pointInPoly([lamp.x, lamp.z], poly(under));
    });
  }

  // a peut-il se glisser sous b ?
  function canNest(a, b) {
    const da = FURN.byId[a.type], db = FURN.byId[b.type];
    if (da.seat && db.under) return true;
    if (db.clearance && !onTop(a)) return a.h <= db.clearance * (b.h / db.h);
    return false;
  }

  // hauteur à laquelle poser un objet "à poser" : plateau du meuble (ou plan de travail) sous son centre
  function elevation(it) {
    if (onWall(it)) return wallY(it);
    const m = manualY(it);
    if (m != null) return m;
    return onTop(it) ? surfaceBelow(it).y : 0; // objet à poser : sur le meuble / plan de travail dessous (magnétisme en hauteur)
  }

  function sync(it) {
    it.group.position.set(it.x, elevation(it), it.z);
    it.group.rotation.y = (it.rot * Math.PI) / 180;
    it.decal.position.set(it.x, 0.6, it.z);
    it.decal.rotation.y = (it.rot * Math.PI) / 180;
    it.decal.scale.set(it.w, 1, it.d);
  }

  function refreshStates() {
    items.forEach((it) => {
      it.group.position.y = elevation(it); // suit le meuble sur lequel il est posé (objets à poser), ou sa hauteur fixée
      const bad = isInvalid(it);
      it.bad = bad;
      it.decal.material.color.set(bad ? 0xe5392b : 0xffc400);
      it.decal.material.opacity = bad ? 0.55 : it === selected ? 0.45 : 0;
    });
    $('warn').hidden = !items.some((i) => i.bad);
    // la mention "ne rentre pas" de la liste suit les déplacements
    document.querySelectorAll('#list li').forEach((li, k) => { if (items[k]) li.classList.toggle('bad', !!items[k].bad); });
    updatePanel();
    save();
    markShadows(); // un meuble a bougé / changé : ombres à recalculer
    hooks.change.forEach((f) => { try { f(); } catch (e) { console.error(e); } });
  }
  // points d'accroche pour les modules externes (mesure, éclairage...) : voir window.__app en bas du fichier
  // change : après chaque modification ; frame : chaque image rendue (dt), rien au repos ; rig : après réglage de l'éclairage (real) ;
  // build : après (re)construction du modèle 3D d'un meuble (it) ; drag : pendant un glisser, peut corriger it.x/it.z/it.rot
  // fixed : après reconstruction des éléments fixes (cotes de la cuisine / salle d'eau changées, __app.rebuildFixed)
  const hooks = { change: [], frame: [], rig: [], build: [], drag: [], fixed: [] };

  function select(it) {
    const changed = it !== selected;
    selected = it;
    // la carte Sélection passe en tête (classe has-sel, posée par updatePanel) : remonter le panneau pour la voir
    if (it && changed) { const card = $('sel-card'), box = card && card.parentElement; if (box) box.scrollTop = 0; }
    refreshStates();
    renderList();
  }

  // libère la mémoire graphique de meubles retirés. Les textures ne sont jamais libérées (partagées : MATS,
  // caches de furniture.js) ; une matière ne l'est que si aucun meuble restant ne l'utilise (cache.paper, dos de mangas...)
  function disposeItems(gone) {
    const used = new Set();
    items.forEach((o) => { if (!gone.includes(o)) o.group.traverse((m) => { if (m.material) [].concat(m.material).forEach((x) => used.add(x)); }); });
    gone.forEach((it) => {
      it.group.traverse((m) => {
        if (m.geometry) m.geometry.dispose();
        if (m.material) [].concat(m.material).forEach((x) => { if (!used.has(x)) { used.add(x); x.dispose(); } });
      });
      it.decal.material.dispose(); // decalGeo est partagée : on la garde
    });
  }

  function removeItem(it) {
    disposeItems([it]);
    scene.remove(it.group, it.decal);
    items.splice(items.indexOf(it), 1);
    if (selected === it) selected = null;
    refreshStates();
    renderList();
  }

  // placement initial d'un nouveau meuble : première position libre trouvée sur une grille
  // place libre la plus proche d'un point (par défaut le milieu du séjour), en s'éloignant progressivement
  const SEJOUR_CENTER = [190, 150];
  let spotGrid = null;
  function freeSpot(it, near) {
    const [cx, cz] = near || SEJOUR_CENTER;
    if (!spotGrid) {
      spotGrid = [];
      for (let z = -210; z <= 620; z += 10) for (let x = -200; x <= 620; x += 10) spotGrid.push([x, z]);
    }
    const cands = spotGrid
      .map(([x, z]) => [x, z, (x - cx) * (x - cx) + (z - cz) * (z - cz)])
      .sort((a, b) => a[2] - b[2]);
    const rots = [it.rot || 0, (it.rot || 0) + 90];
    for (const [x, z] of cands) {
      for (const r of rots) {
        it.x = x; it.z = z; it.rot = r % 360;
        if (!isInvalid(it)) return;
      }
    }
    it.x = cx; it.z = cz; it.rot = rots[0]; // aucune place libre : posé au centre (il apparaîtra en rouge)
  }

  // ---------------------------------------------------------------- interactions souris
  const ray = new THREE.Raycaster();
  const ptr = new THREE.Vector2();
  const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  let drag = null;

  function setPtr(e) {
    const r = renderer.domElement.getBoundingClientRect();
    ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ptr, camera);
  }
  function pickItem() {
    const hits = ray.intersectObjects(items.map((i) => i.group), true);
    for (const h of hits) {
      let o = h.object;
      while (o && !o.userData.item) o = o.parent;
      if (o) return o.userData.item;
    }
    return null;
  }
  const snap = (v) => ($('snap').checked ? Math.round(v / 5) * 5 : v);

  renderer.domElement.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    if (walk.on || (window.__app && (window.__app.tool || window.__app.readOnly))) return; // un outil (ex. mesure) a la main, ou mode visite
    setPtr(e);
    const it = pickItem();
    if (!it) { if (selected) select(null); return; }
    e.stopImmediatePropagation();
    const p = new THREE.Vector3();
    ray.ray.intersectPlane(floorPlane, p);
    drag = { it, dx: it.x - p.x, dz: it.z - p.z };
    renderer.domElement.setPointerCapture(e.pointerId);
    if (selected !== it) select(it);
    renderer.domElement.style.cursor = 'grabbing';
  }, true);

  renderer.domElement.addEventListener('pointermove', (e) => {
    setPtr(e);
    if (drag) {
      const p = new THREE.Vector3();
      if (ray.ray.intersectPlane(floorPlane, p)) {
        // Maj (ou Alt) maintenue pendant le glisser : aucun aimant (ni pas de 5 cm, ni murs, ni alignement)
        const free = e.shiftKey || e.altKey;
        drag.it.x = free ? p.x + drag.dx : snap(p.x + drag.dx);
        drag.it.z = free ? p.z + drag.dz : snap(p.z + drag.dz);
        hooks.drag.forEach((f) => { try { f(drag.it); } catch (e) { console.error(e); } }); // ex. aimant aux murs
        sync(drag.it);
        refreshStates();
      }
    } else {
      renderer.domElement.style.cursor = pickItem() ? 'grab' : 'default';
    }
  });
  const endDrag = (e) => { if (drag) { drag = null; renderer.domElement.style.cursor = 'default'; } };
  renderer.domElement.addEventListener('pointerup', endDrag);
  renderer.domElement.addEventListener('pointercancel', endDrag);

  window.addEventListener('keydown', (e) => {
    if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName) && document.activeElement.type !== 'checkbox') return;
    if (panKeyDown(e)) return; // ZQSD (AZERTY) / WASD (QWERTY) : toujours la vue
    if (!selected || (window.__app && window.__app.readOnly)) { panKeyDown(e, true); return; } // sans meuble sélectionné (ou en visite), les flèches déplacent la vue
    const step = e.shiftKey ? 1 : 5;
    const k = e.key;
    if (k === 'Delete' || k === 'Backspace') { removeItem(selected); e.preventDefault(); return; }
    if (k === 'PageUp' || k === 'PageDown') { setHeight(selected, elevation(selected) + (k === 'PageUp' ? 1 : -1) * (e.shiftKey ? 5 : 1)); e.preventDefault(); return; } // monter / descendre
    if (k === 'r' || k === 'R') rotateSel(e.shiftKey ? -90 : 90);
    else if (k === 'ArrowLeft') selected.x -= step;
    else if (k === 'ArrowRight') selected.x += step;
    else if (k === 'ArrowUp') selected.z -= step;
    else if (k === 'ArrowDown') selected.z += step;
    else return;
    e.preventDefault();
    sync(selected);
    refreshStates();
  });

  // déplacer la vue au clavier, en continu tant que la touche est enfoncée (droite/gauche, avant/arrière à l'écran) :
  // ZQSD / WASD (position physique des touches : e.code) à tout moment, flèches quand aucun meuble n'est sélectionné.
  // Maj = plus vite. Ignoré en Marcher (qui a ses propres touches) et avec Ctrl/Alt/Cmd (Ctrl+Z, Ctrl+S…).
  const PAN_LETTERS = { KeyW: [0, 1], KeyS: [0, -1], KeyA: [-1, 0], KeyD: [1, 0] };
  const PAN_ARROWS = { ArrowUp: [0, 1], ArrowDown: [0, -1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
  const panHeld = {}; // code → direction
  let panFast = false;
  function panKeyDown(e, arrows) {
    if (walk.on || e.ctrlKey || e.metaKey || e.altKey) return false;
    const dir = arrows ? PAN_ARROWS[e.key] : PAN_LETTERS[e.code];
    if (!dir) return false;
    e.preventDefault();
    panHeld[arrows ? e.key : e.code] = dir;
    panFast = e.shiftKey;
    invalidate();
    return true;
  }
  window.addEventListener('keyup', (e) => { delete panHeld[e.code]; delete panHeld[e.key]; if (e.key === 'Shift') panFast = false; });
  window.addEventListener('blur', () => { Object.keys(panHeld).forEach((k) => delete panHeld[k]); });
  const panR = new THREE.Vector3(), panU = new THREE.Vector3();
  function panStep(dt) {
    let dx = 0, dy = 0;
    Object.values(panHeld).forEach(([a, b]) => { dx += a; dy += b; });
    if (!dx && !dy) return false;
    const n = Math.hypot(dx, dy), speed = camera.position.distanceTo(controls.target) * (panFast ? 1.1 : 0.4) * dt; // ~0,4 distance de vue par seconde (Maj : 1,1)
    panR.set(1, 0, 0).applyQuaternion(camera.quaternion).setY(0).normalize();
    panU.set(0, 1, 0).applyQuaternion(camera.quaternion).setY(0);
    if (panU.lengthSq() < 1e-6) panU.set(0, 0, -1);
    panU.normalize();
    const mv = panR.multiplyScalar((dx / n) * speed).add(panU.multiplyScalar((dy / n) * speed));
    camera.position.add(mv);
    controls.target.add(mv);
    return true;
  }
  const panning = () => !walk.on && Object.keys(panHeld).length > 0;

  function rotateSel(deg) {
    if (!selected) return;
    selected.rot = (((selected.rot + deg) % 360) + 360) % 360;
    sync(selected);
    refreshStates();
  }

  // ---------------------------------------------------------------- panneau UI
  function renderCatalog() {
    const box = $('catalog');
    box.innerHTML = '';
    const groups = {};
    FURN.catalog.forEach((c) => (groups[c.group] = groups[c.group] || []).push(c));
    Object.entries(groups).forEach(([g, list]) => {
      const h = document.createElement('h4');
      h.textContent = g;
      box.appendChild(h);
      list.forEach((c) => {
        const b = document.createElement('button');
        b.className = 'cat';
        b.innerHTML = `<span>${c.name}</span><small>${c.w} × ${c.d} × ${c.h} cm</small>`;
        b.onclick = () => addFromCatalog(c.id);
        box.appendChild(b);
      });
    });
  }

  function renderList() {
    const ul = $('list');
    ul.innerHTML = '';
    items.forEach((it) => {
      const li = document.createElement('li');
      li.className = (it === selected ? 'sel ' : '') + (it.bad ? 'bad' : '');
      li.textContent = it.name;
      li.onclick = () => select(it);
      ul.appendChild(li);
    });
    $('count').textContent = items.length;
  }

  const fields = { x: 'f-x', z: 'f-z', rot: 'f-rot', w: 'f-w', d: 'f-d', h: 'f-h' };
  Object.entries(fields).forEach(([k, id]) => {
    $(id).addEventListener('input', () => {
      if (!selected) return;
      const v = parseFloat($(id).value);
      if (!isFinite(v)) return;
      selected[k] = k === 'w' || k === 'd' || k === 'h' ? Math.max(5, v) : v;
      if (k === 'w' || k === 'd' || k === 'h') rebuild(selected);
      else sync(selected);
      refreshStatesNoPanel();
    });
  });
  function refreshStatesNoPanel() { const keep = updatePanel; updatePanel = () => {}; refreshStates(); updatePanel = keep; renderList(); }

  // ajout depuis le catalogue : place libre la plus proche du séjour ; un objet mural va directement contre le mur le plus proche
  function addFromCatalog(type, o) {
    const it = addItem(type, o);
    freeSpot(it);
    sync(it);
    if (onWall(it) && window.__snap && __snap.snapToWall) { __snap.snapToWall(it); sync(it); }
    select(it);
    return it;
  }
  // hauteur du bas de l'objet : saisie = hauteur fixée (l'objet ne suit plus les meubles)
  function setHeight(it, v, keepPanel) {
    it.meta.y = Math.max(0, Math.min(H - Math.min(it.h, H - 1), Math.round(v * 10) / 10));
    sync(it);
    if (keepPanel) refreshStatesNoPanel(); else refreshStates();
  }
  $('f-y').addEventListener('input', () => {
    if (!selected) return;
    const v = parseFloat($('f-y').value);
    if (isFinite(v)) setHeight(selected, v, true);
  });
  // ⤓ : objet à poser → revient en automatique (suit le meuble dessous) ; meuble → posé sur ce qu'il y a dessous (ou au sol) ;
  // objet mural → juste au-dessus du meuble dessous
  $('f-y-snap').onclick = () => {
    const it = selected;
    if (!it) return;
    const s = surfaceBelow(it);
    if (onWall(it)) {
      if (!s.by) { SCEN.toast("Rien sous l'objet : sa hauteur ne change pas."); return; }
      it.meta.y = Math.round(s.y + 3);
    } else if (onTop(it) || !s.by) delete it.meta.y;
    else it.meta.y = Math.round(s.y * 10) / 10;
    sync(it);
    refreshStates();
    SCEN.toast(s.by ? (onWall(it) ? 'Placé juste au-dessus de : ' : 'Posé sur : ') + s.by + ' (' + Math.round(elevation(it)) + ' cm)' : 'Posé au sol.');
  };

  let updatePanel = function () {
    const p = $('props');
    p.hidden = !selected;
    $('props-empty').hidden = !!selected;
    document.documentElement.classList.toggle('has-sel', !!selected);
    if (!selected) return;
    $('sel-name').textContent = selected.name;
    Object.entries(fields).forEach(([k, id]) => {
      if (document.activeElement !== $(id)) $(id).value = Math.round(selected[k] * 10) / 10;
    });
    if (document.activeElement !== $('f-y')) $('f-y').value = Math.round(elevation(selected) * 10) / 10;
    const m = manualY(selected), s = surfaceBelow(selected);
    $('f-y-info').textContent = onWall(selected) ? 'Accroché au mur. ⤓ le place juste au-dessus du meuble en dessous.'
      : m != null ? "Hauteur fixée. ⤓ le repose sur ce qu'il y a dessous."
      : onTop(selected) ? (s.by ? 'Posé sur : ' + s.by + ' (suit le meuble en dessous).' : 'Posé au sol (se pose tout seul sur un meuble en dessous).')
      : 'Au sol. Saisis une hauteur pour le soulever, ou ⤓ pour le poser sur le meuble en dessous.';
  };

  $('btn-rl').onclick = () => rotateSel(-15);
  $('btn-rr').onclick = () => rotateSel(15);
  $('btn-r90').onclick = () => rotateSel(90);
  $('btn-del').onclick = () => selected && removeItem(selected);
  $('btn-dup').onclick = () => {
    if (!selected) return;
    const s = selected;
    const it = addItem(s.type, { x: s.x, z: s.z, rot: s.rot, w: s.w, d: s.d, h: s.h, light: s.light, meta: s.meta });
    freeSpot(it, [s.x, s.z]); sync(it); select(it); // la copie se pose à côté de l'original
  };

  // ---------------------------------------------------------------- vues
  const center = new THREE.Vector3(200, 0, 190);
  // vue "Dessus" façon plan : glisser au clic gauche = faire défiler, pas de rotation
  function setMapMode(on) {
    controls.enableRotate = !on;
    controls.mouseButtons.LEFT = on ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
    controls.screenSpacePanning = true;
  }
  function goto(pos, target, fov, map) {
    setMapMode(!!map);
    camera.fov = fov || 45;
    camera.updateProjectionMatrix();
    camera.position.set(...pos);
    controls.target.set(...target);
    controls.update();
  }
  const views = {
    iso: () => goto([300, 860, 1020], [200, 0, 210], 42),
    top: () => goto([205, 1500, 245], [205, 0, 230], 40, true),
    entry: () => goto([125, 160, 505], [70, 140, 300], 70),
    baie: () => goto([560, 165, 100], [60, 110, 40], 70),
  };
  document.querySelectorAll('[data-view]').forEach((b) => (b.onclick = () => { if (walk.on) setWalk(false); views[b.dataset.view](); }));
  $('cotes').onchange = (e) => { dimGroup.visible = e.target.checked; invalidate(); };
  $('low').onchange = (e) => {
    markShadows(); // murs plus bas : ombres à recalculer (et image à refaire)
    const low = e.target.checked, cut = 100;
    walls.forEach((w) => {
      const h = w.y1 - w.y0;
      if (low) {
        if (w.y0 >= cut) { w.mesh.visible = false; return; }
        const top = Math.min(w.y1, cut);
        w.mesh.scale.y = (top - w.y0) / h;
        w.mesh.position.y = w.y0 + (top - w.y0) / 2;
      } else {
        w.mesh.visible = true; w.mesh.scale.y = 1; w.mesh.position.y = w.y0 + h / 2;
      }
    });
  };

  // murs "devant" la caméra rendus translucides
  const tmp = new THREE.Vector3();
  // fadeWalls ne dépend que de la caméra, de sa cible et de la marche : ne la refaire que si l'un d'eux a changé
  const camKey = [NaN, 0, 0, 0, 0, 0, 0];
  function cameraMoved() {
    const p = camera.position, t = controls.target, k = [p.x, p.y, p.z, t.x, t.y, t.z, walk.on ? 1 : 0];
    let moved = false;
    for (let i = 0; i < k.length; i++) if (camKey[i] !== k[i]) { camKey[i] = k[i]; moved = true; }
    return moved;
  }
  function fadeWalls() {
    const inside = walk.on || camera.position.y < H - 5;
    ceilings.forEach((c) => (c.visible = inside));
    walls.forEach((w) => {
      tmp.set(camera.position.x - w.cx, 0, camera.position.z - w.cz);
      // un mur ne gêne que si la caméra est derrière lui ET qu'on regarde assez à plat
      const horiz = Math.hypot(camera.position.x - controls.target.x, camera.position.z - controls.target.z);
      const steep = Math.atan2(camera.position.y - controls.target.y, horiz) > 1.05; // ~60° au-dessus de l'horizon
      const out = tmp.dot(w.n) > 0 && !steep && !inside;
      const m = w.mesh.material;
      const target = out ? 0.12 : 1;
      // pas de needsUpdate : en r128, transparent / opacity / depthWrite sont des états de rendu, pas des options du shader
      if (m.opacity !== target) { m.opacity = target; m.transparent = target < 1; m.depthWrite = target === 1; }
      // appelée juste avant le rendu : l'image en cours recalcule les ombres, inutile d'en redemander une
      if (w.mesh.castShadow !== !out) { w.mesh.castShadow = !out; renderer.shadowMap.needsUpdate = true; }
    });
  }

  // ---------------------------------------------------------------- mode marche (vue à la première personne)
  const doorway = (() => {
    const a = APT.main[7], b = APT.main[8], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const d = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], n = [-d[1], d[0]];
    const p = (s, t) => [a[0] + d[0] * s + n[0] * t, a[1] + d[1] * s + n[1] * t];
    const o = APT.openings[7][0];
    return [p(o.s + 2, -22), p(o.s + o.w - 2, -22), p(o.s + o.w - 2, 22), p(o.s + 2, 22)];
  })();
  const R = 14; // rayon du corps
  function canStand(x, z) {
    const okPt = (px, pz) => {
      const p = [px, pz];
      return APT.pointInPoly(p, APT.main) || APT.pointInPoly(p, APT.bathPoly) || APT.pointInPoly(p, doorway);
    };
    if (!okPt(x + R, z) || !okPt(x - R, z) || !okPt(x, z + R) || !okPt(x, z - R)) return false;
    const body = [[x - R, z - R], [x + R, z - R], [x + R, z + R], [x - R, z + R]];
    if (APT.fixed.some((f) => APT.polyOverlap(body, f.poly, 0))) return false;
    return !items.some((it) => !onWall(it) && APT.polyOverlap(body, poly(it), 0)); // on passe sous un objet mural
  }

  let savedView = null;
  function setWalk(on) {
    if (on === walk.on) return;
    if (on) {
      savedView = { pos: camera.position.clone(), target: controls.target.clone(), fov: camera.fov };
      walk.on = true;
      controls.enabled = false;
      walk.x = 125; walk.z = 500; walk.yaw = 0.34; walk.pitch = 0; // face au couloir d'entrée (de biais)
      camera.fov = 72; camera.near = 3; camera.updateProjectionMatrix();
      items.forEach((it) => (it.decal.visible = false));
      select(null);
    } else {
      walk.on = false;
      if (document.pointerLockElement) document.exitPointerLock();
      camera.rotation.set(0, 0, 0);
      camera.up.set(0, 1, 0);
      camera.fov = savedView.fov; camera.near = 5; camera.updateProjectionMatrix();
      camera.position.copy(savedView.pos);
      controls.target.copy(savedView.target);
      controls.enabled = true;
      controls.update();
      items.forEach((it) => (it.decal.visible = true));
    }
    $('btn-walk').classList.toggle('on', walk.on);
    $('walkhint').hidden = !walk.on;
    applyRig();
  }
  $('btn-walk').onclick = () => setWalk(!walk.on);
  $('real').onchange = applyRig;

  const keyMap = { z: 'f', w: 'f', ArrowUp: 'f', s: 'b', ArrowDown: 'b', q: 'l', a: 'l', d: 'r' };
  window.addEventListener('keydown', (e) => {
    if (!walk.on) return;
    if (e.key === 'Escape') return;
    const k = keyMap[e.key] || keyMap[e.key.toLowerCase()];
    if (k) { walk.keys[k] = true; e.preventDefault(); }
    if (e.key === 'ArrowLeft') walk.keys.tl = true;
    if (e.key === 'ArrowRight') walk.keys.tr = true;
    if (e.key === 'Shift') walk.keys.run = true;
  });
  window.addEventListener('keyup', (e) => {
    const k = keyMap[e.key] || keyMap[e.key.toLowerCase()];
    if (k) walk.keys[k] = false;
    if (e.key === 'ArrowLeft') walk.keys.tl = false;
    if (e.key === 'ArrowRight') walk.keys.tr = false;
    if (e.key === 'Shift') walk.keys.run = false;
  });
  renderer.domElement.addEventListener('click', () => {
    if (walk.on && !document.pointerLockElement && renderer.domElement.requestPointerLock) {
      try { renderer.domElement.requestPointerLock(); } catch (e) {}
    }
  });
  renderer.domElement.addEventListener('mousedown', () => { walk.drag = true; });
  window.addEventListener('mouseup', () => { walk.drag = false; });
  window.addEventListener('mousemove', (e) => {
    if (!walk.on || !(document.pointerLockElement || walk.drag)) return;
    walk.yaw -= e.movementX * 0.0024;
    walk.pitch = Math.max(-1.3, Math.min(1.3, walk.pitch - e.movementY * 0.0024));
  });

  function updateWalk(dt) {
    const k = walk.keys;
    walk.yaw += ((k.tl ? 1 : 0) - (k.tr ? 1 : 0)) * 1.6 * dt;
    const sp = (k.run ? 260 : 140) * dt;
    const fwd = (k.f ? 1 : 0) - (k.b ? 1 : 0), str = (k.r ? 1 : 0) - (k.l ? 1 : 0);
    if (fwd || str) {
      const s = Math.sin(walk.yaw), c = Math.cos(walk.yaw);
      const dx = (-s * fwd + c * str) * sp, dz = (-c * fwd - s * str) * sp;
      if (canStand(walk.x + dx, walk.z + dz)) { walk.x += dx; walk.z += dz; }
      else if (canStand(walk.x + dx, walk.z)) walk.x += dx;
      else if (canStand(walk.x, walk.z + dz)) walk.z += dz;
    }
    camera.position.set(walk.x, 160, walk.z);
    camera.rotation.set(walk.pitch, walk.yaw, 0, 'YXZ');
  }

  // ---------------------------------------------------------------- persistance
  // l'enregistrement, les scénarios et l'annulation sont gérés par src/scenarios.js
  const snapshotItems = () => items.map(({ type, x, z, rot, w, d, h, light, meta }) => {
    const o = { type, x, z, rot, w, d, h };
    if (light) o.light = Object.assign({}, light);
    if (meta && Object.keys(meta).length) o.meta = JSON.parse(JSON.stringify(meta));
    return o;
  });
  function save() { if (window.SCEN) SCEN.changed(); }
  // proposition de départ = ta composition du 15/11/2026 (export « amenagement-proposition-de-depart_2026-11-15_03h37.json »)
  const DEFAULT_LAYOUT = [
    {type: "bed1", x: 49, z: 186, rot: -1.4, w: 90, d: 200, h: 68}, // lit 1 place contre le mur ouest
    {type: "kallaxmanga", x: 350, z: 44.7, rot: 0, w: 77, d: 39, h: 147, meta: {color: "#2a2a2c"}}, // KALLAX contre le bourrelet
    {type: "wardrobe", x: 592.8, z: 96.9, rot: -90, w: 100, d: 55, h: 200}, // armoire contre le mur est
    {type: "table", x: 448.7, z: -6, rot: 0, w: 110, d: 60, h: 75, meta: {color: "#2a2a2c"}}, // table noire dans l'alcôve
    {type: "chair", x: 440, z: -32, rot: 0, w: 42, d: 42, h: 85, meta: {color: "#2a2a2c", owned: true}},
    {type: "chair", x: 440, z: 13.2, rot: 180, w: 42, d: 42, h: 85, meta: {color: "#2a2a2c", owned: true}},
    {type: "deskpc", x: 367.4, z: 216.7, rot: 203.1, w: 140, d: 70, h: 118, meta: {color: "#2a2a2c"}}, // bureau PC le long du mur en biais
    {type: "chair", x: 356.9, z: 192.1, rot: 23.1, w: 42, d: 42, h: 85, meta: {color: "#2a2a2c", owned: true}},
    {type: "armchair", x: 260, z: 50, rot: 323.1, w: 70, d: 66, h: 75, meta: {color: "#2a2a2c"}}, // fauteuil
    {type: "lampdesk", x: 428, z: 214, rot: 225, w: 18, d: 22, h: 42, light: {on: true, p: 55, k: 4000}}, // lampe de bureau
    {type: "lampfloor", x: 29.8, z: 45.3, rot: 90, w: 30, d: 30, h: 160, light: {on: true, p: 70, k: 2700}}, // lampadaire près de la baie
  ];
  function load(layout) {
    disposeItems(items.slice());
    items.slice().forEach((i) => scene.remove(i.group, i.decal));
    items.length = 0;
    selected = null;
    layout.forEach((o) => addItem(o.type, o));
    refreshStates();
    renderList();
  }
  // plus besoin de confirmation : Ctrl+Z annule
  $('btn-reset').onclick = () => { load(DEFAULT_LAYOUT); SCEN.toast('Proposition de départ appliquée à ce scénario. Ctrl+Z pour annuler.'); };
  $('btn-clear').onclick = () => { load([]); SCEN.toast('Pièce vidée. Ctrl+Z pour annuler.'); };

  // ---------------------------------------------------------------- démarrage
  function resize() {
    const w = view.clientWidth, h = view.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    if (composer) composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    invalidate(); // setSize efface le canevas
  }
  window.addEventListener('resize', resize);
  new ResizeObserver(resize).observe(view);
  resize();

  renderCatalog();
  const firstLayout = SCEN.init(
    { getItems: snapshotItems, setItems: (list) => load(list), isBusy: () => !!drag },
    DEFAULT_LAYOUT
  );
  load(firstLayout);
  views.iso();
  $('area').textContent = `${((polyArea(APT.main) + polyArea(APT.bathPoly)) / 1e4).toFixed(1).replace('.', ',')} m² (hors terrasse)`;

  applyRig();

  function draw() {
    if (realistic()) ensureComposer();
    if (realistic() && composer) composer.render(); else renderer.render(scene, camera);
  }
  // Boucle à la demande : on ne rend que si une image a été demandée (invalidate, markShadows...), si la caméra
  // bouge encore (inertie des OrbitControls), en mode Marcher, ou avant renderUntil (filet de sécurité après une
  // action). Les hooks frame ne sont appelés que pour une image rendue : ils placent des étiquettes qui suivent la
  // caméra ou surveillent un état (marche, sélection, outil) qui ne change que sur une action, laquelle demande
  // toujours des images.
  function loop(now) {
    rafId = 0;
    if (document.hidden) { last = 0; return; } // reprise par visibilitychange
    // après une pause, pas de grand saut : on repart avec le pas d'une image
    const dt = last && now - last < 200 ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    let moving = walk.on;
    if (walk.on) updateWalk(dt);
    else {
      if (panning() && panStep(dt)) moving = true; // ZQSD / flèches tenues
      if (controls.update()) moving = true;
    } // rotation / zoom, ou inertie (damping) encore en cours
    if (!needFrame && !moving && now >= renderUntil) { last = 0; return; }
    needFrame = false;
    if (cameraMoved()) fadeWalls();
    hooks.frame.forEach((f) => { try { f(dt); } catch (e) { console.error(e); } });
    draw();
    // (une image peut déjà avoir été demandée pendant ce tour, ex. événement 'change' des controls : ne pas doubler)
    if (moving || needFrame || now < renderUntil) { if (!rafId) rafId = requestAnimationFrame(loop); }
    else last = 0;
  }
  controls.addEventListener('change', () => invalidate());
  document.addEventListener('visibilitychange', () => { if (!document.hidden) invalidate(); });
  // filet de sécurité : des images pendant 0,4 s après toute action (un module peut modifier la scène sans
  // prévenir, ou après un court délai, ex. Passages recalculés 150 ms après un changement)
  const poke = () => invalidate(400);
  ['pointerdown', 'pointerup', 'click', 'wheel', 'keydown', 'keyup', 'input', 'change'].forEach((t) => window.addEventListener(t, poke, { capture: true, passive: true }));
  // simple survol : seulement si un bouton est enfoncé ou si un outil (mesure, électricité) affiche un aperçu
  window.addEventListener('pointermove', (e) => { if (e.buttons || (window.__app && window.__app.tool)) poke(); }, { capture: true, passive: true });
  renderer.domElement.addEventListener('pointerleave', poke);
  // capture de la vue (export.js) : le canevas n'est pas conservé entre deux images → rendre juste avant de lire
  {
    const cvs = renderer.domElement, toDataURL = cvs.toDataURL.bind(cvs);
    cvs.toDataURL = (...a) => { draw(); return toDataURL(...a); };
  }
  invalidate();

  window.__app = {
    items, scene, camera, controls, renderer, views, select, load, DEFAULT_LAYOUT,
    hooks, // hooks.change : après chaque modification des meubles ; hooks.frame : à chaque image rendue (dt)
    poly, isInvalid, refreshStates, realistic,
    rebuildFixed, // après APT.applyFixes(...) ou pour relire APT.fixes : refait les éléments fixes, collisions, hook fixed
    getSelected: () => selected,
    elevation,
    markShadows, // à appeler après avoir bougé / allumé une lumière ou modifié la scène hors meubles (demande aussi une image)
    invalidate, // demande une image ; invalidate(ms) : des images pendant ms (changement visuel sans effet sur les ombres)
    rig: { hemi, sun, bulbLights, envTex, applyRig }, // éclairage de base (utilisé par lights.js)
    isWalking: () => walk.on,
    tool: null, // mettre une valeur non nulle pour empêcher la sélection/le glisser des meubles à la souris
    readOnly: !!(window.SCEN && SCEN.viewOnly), // mode visite (lien partagé en lecture seule) : aucune modification possible
    addItem, removeItem, rebuild, sync, freeSpot, renderCatalog, renderList,
    // ajout d'un meuble comme depuis le catalogue (posé dans la place libre la plus proche du séjour, sélectionné)
    addFromCatalog: (type, o) => addFromCatalog(type, o),
    onWall, wallY, surfaceBelow,
  };
})();
