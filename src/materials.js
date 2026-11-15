/*
 * Matières procédurales (textures générées en canvas, rien à télécharger).
 * Couleurs calées sur les photos : carrelage gris anthracite, murs blanc cassé, plafond en crépi.
 */
(function () {
  const MATS = (window.MATS = {});

  const cvs = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h || w; return c; };
  function rng(seed) { let s = seed % 2147483647; if (s <= 0) s += 2147483646; return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646; }
  function texOf(c, srgb) {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    if (srgb) t.encoding = THREE.sRGBEncoding;
    return t;
  }
  const g = (v) => `rgb(${v | 0},${v | 0},${v | 0})`;

  // bruit en niveaux de gris : base + nuées de petits disques clairs/sombres
  function noiseCanvas(size, base, dots, rmin, rmax, alpha, seed) {
    const c = cvs(size), x = c.getContext('2d'), r = rng(seed);
    x.fillStyle = g(base); x.fillRect(0, 0, size, size);
    for (let i = 0; i < dots; i++) {
      const px = r() * size, py = r() * size, rad = rmin + r() * (rmax - rmin);
      x.fillStyle = r() > 0.5 ? `rgba(255,255,255,${alpha * r()})` : `rgba(0,0,0,${alpha * r()})`;
      // dessin "enroulé" pour que la texture se raccorde
      for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) {
        if (px + ox < -rad || px + ox > size + rad || py + oy < -rad || py + oy > size + rad) continue;
        x.beginPath(); x.arc(px + ox, py + oy, rad, 0, 6.283); x.fill();
      }
    }
    return c;
  }

  // ---------- carrelage 2x2 dalles de 60 cm (le motif couvre 120 cm)
  (function () {
    const S = 1024, half = S / 2, grout = 7;
    const col = cvs(S), bump = cvs(S), rough = cvs(S);
    const cx = col.getContext('2d'), bx = bump.getContext('2d'), rx = rough.getContext('2d'), r = rng(7);
    cx.fillStyle = '#9a9893'; cx.fillRect(0, 0, S, S); // joint clair
    bx.fillStyle = '#000'; bx.fillRect(0, 0, S, S);
    rx.fillStyle = g(235); rx.fillRect(0, 0, S, S);
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      const x0 = i * half + grout / 2, y0 = j * half + grout / 2, w = half - grout;
      const v = (r() - 0.5) * 9; // variation de teinte par dalle
      const gr = cx.createLinearGradient(x0, y0, x0 + w, y0 + w);
      // gris anthracite (un peu moins noir que la 1re version, comme en vrai)
      gr.addColorStop(0, `rgb(${92 + v | 0},${94 + v | 0},${99 + v | 0})`);
      gr.addColorStop(1, `rgb(${81 + v | 0},${83 + v | 0},${88 + v | 0})`);
      cx.fillStyle = gr; cx.fillRect(x0, y0, w, w);
      // veinage / stries fines horizontales + mouchetis
      for (let k = 0; k < 260; k++) {
        const yy = y0 + r() * w, xx = x0 + r() * w, ll = 20 + r() * 140;
        cx.fillStyle = r() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.07)';
        cx.fillRect(xx, yy, Math.min(ll, x0 + w - xx), 1 + (r() > 0.8 ? 1 : 0));
      }
      for (let k = 0; k < 900; k++) {
        cx.fillStyle = r() > 0.5 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.12)';
        cx.fillRect(x0 + r() * w, y0 + r() * w, 1 + r() * 2, 1 + r() * 2);
      }
      bx.fillStyle = '#d8d8d8'; bx.fillRect(x0, y0, w, w);
      for (let k = 0; k < 500; k++) { bx.fillStyle = `rgba(${r() > 0.5 ? 255 : 0},${r() > 0.5 ? 255 : 0},0,0.06)`; bx.fillStyle = r() > 0.5 ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)'; bx.fillRect(x0 + r() * w, y0 + r() * w, 2, 2); }
      rx.fillStyle = g(95 + (r() - 0.5) * 20); rx.fillRect(x0, y0, w, w); // dalle assez brillante
    }
    MATS.tile = { map: texOf(col, true), bump: texOf(bump), rough: texOf(rough), size: 120 };
  })();

  // ---------- salle d'eau : petits carreaux clairs
  (function () {
    const S = 512, n = 4, cell = S / n, grout = 5;
    const col = cvs(S), bump = cvs(S), r = rng(11);
    const cx = col.getContext('2d'), bx = bump.getContext('2d');
    cx.fillStyle = '#c9c8c3'; cx.fillRect(0, 0, S, S);
    bx.fillStyle = '#000'; bx.fillRect(0, 0, S, S);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const v = (r() - 0.5) * 8;
      cx.fillStyle = `rgb(${226 + v | 0},${228 + v | 0},${229 + v | 0})`;
      cx.fillRect(i * cell + grout / 2, j * cell + grout / 2, cell - grout, cell - grout);
      bx.fillStyle = '#ddd'; bx.fillRect(i * cell + grout / 2, j * cell + grout / 2, cell - grout, cell - grout);
    }
    MATS.bathTile = { map: texOf(col, true), bump: texOf(bump), size: 60 };
  })();

  // ---------- faïence murale : grands carreaux blancs 30 × 60 (posés en hauteur), motif de 60 × 120 cm
  (function () {
    const S = 512, cw = S / 2, ch = S / 2, grout = 3;
    const col = cvs(S), bump = cvs(S), r = rng(17);
    const cx = col.getContext('2d'), bx = bump.getContext('2d');
    cx.fillStyle = '#cfcdc7'; cx.fillRect(0, 0, S, S);
    bx.fillStyle = '#000'; bx.fillRect(0, 0, S, S);
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      const v = (r() - 0.5) * 5;
      cx.fillStyle = `rgb(${240 + v | 0},${239 + v | 0},${235 + v | 0})`;
      cx.fillRect(i * cw + grout / 2, j * ch + grout / 2, cw - grout, ch - grout);
      bx.fillStyle = '#e0e0e0'; bx.fillRect(i * cw + grout / 2, j * ch + grout / 2, cw - grout, ch - grout);
    }
    const t = (c, s) => { const x = texOf(c, s); return x; };
    MATS.wallTile = { map: t(col, true), bump: t(bump), size: 60, sizeY: 120 };
  })();

  // ---------- crépi (plafond, comme sur tes photos) et enduit mural
  MATS.roughcast = { bump: texOf(noiseCanvas(512, 128, 2600, 1, 3.4, 0.32, 3)), size: 70 }; // crépi discret (relief réduit)
  MATS.plaster = { bump: texOf(noiseCanvas(512, 128, 5000, 0.7, 2.2, 0.35, 5)), size: 70 };
  // peinture des murs : teinte UNIE (l'ancienne version, faite de grands disques flous, donnait des taches rondes, « murs sales »)
  MATS.plasterColor = texOf(noiseCanvas(64, 250, 0, 0, 0, 0, 9), true);

  // ---------- bois (veines) : niveaux de gris multipliés par la couleur du matériau
  (function () {
    const S = 512, c = cvs(S), x = c.getContext('2d'), r = rng(21);
    x.fillStyle = g(215); x.fillRect(0, 0, S, S);
    for (let i = 0; i < 420; i++) {
      const y = r() * S, len = 60 + r() * 380, xs = r() * S;
      x.strokeStyle = r() > 0.5 ? `rgba(0,0,0,${0.02 + r() * 0.05})` : `rgba(255,255,255,${0.02 + r() * 0.04})`;
      x.lineWidth = 0.6 + r() * 1.8;
      x.beginPath(); x.moveTo(xs, y);
      x.bezierCurveTo(xs + len * 0.3, y + (r() - 0.5) * 6, xs + len * 0.6, y + (r() - 0.5) * 6, xs + len, y + (r() - 0.5) * 4);
      x.stroke();
    }
    MATS.wood = { map: texOf(c, true), bump: texOf(c), size: 90 };
  })();

  // ---------- cuir / simili : grain fin
  MATS.leather = { map: null, bump: texOf(noiseCanvas(256, 128, 1800, 0.6, 1.8, 0.7, 31)), size: 25 };

  // ---------- tissu : trame
  (function () {
    const S = 128, c = cvs(S), x = c.getContext('2d'), r = rng(41);
    x.fillStyle = g(140); x.fillRect(0, 0, S, S);
    for (let i = 0; i < S; i += 4) {
      x.fillStyle = 'rgba(255,255,255,0.35)'; x.fillRect(i, 0, 2, S);
      x.fillStyle = 'rgba(0,0,0,0.30)'; x.fillRect(0, i, S, 2);
    }
    for (let k = 0; k < 800; k++) { x.fillStyle = `rgba(0,0,0,${r() * 0.15})`; x.fillRect(r() * S, r() * S, 1, 1); }
    MATS.fabric = { map: null, bump: texOf(c), size: 12 };
  })();

  // Met à l'échelle les UV d'une boîte pour que la texture garde une taille réelle (en cm)
  MATS.scaleBoxUV = function (geo, w, h, d, size) {
    const uv = geo.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]]; // +x -x +y -y +z -z
    for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, (uv.getX(i) * dims[f][0]) / size, (uv.getY(i) * dims[f][1]) / size);
    }
    uv.needsUpdate = true;
  };

  // Applique une matière à un MeshStandardMaterial
  MATS.apply = function (m, kind, bumpScale) {
    const t = MATS[kind];
    if (!t) return;
    if (t.map) m.map = t.map;
    if (t.bump) { m.bumpMap = t.bump; m.bumpScale = bumpScale != null ? bumpScale : 1; }
    if (t.rough) { m.roughnessMap = t.rough; m.roughness = 1; }
    m.needsUpdate = true;
  };
})();
