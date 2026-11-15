/*
 * Géométrie de l'appartement — T1 n°15, Anglet.
 * Unités : centimètres. Repère : x = vers la droite, z = vers le bas du plan,
 * y = hauteur. L'origine (0,0) est le coin nord-ouest du séjour (côté baie vitrée).
 *
 * Cotes relevées sur le plan (pivoté de 90°) :
 *   séjour/cuisine/entrée ≈ 25,3 m² (reconstruit : 25,96 m²), salle d'eau 4,75 m² (reconstruit : 4,68 m²)
 *   largeur du séjour 622, alcôve cuisine 285 x 215, terrasse 316 x 198.
 * Tout ce qui est marqué "estimé" n'est pas sur le plan : à corriger ici si besoin.
 */
(function () {
  const APT = (window.APT = {});

  APT.H = 250; // hauteur sous plafond (estimé, non indiqué sur le plan)
  APT.T = 12; // épaisseur des murs

  // --- Salle d'eau : rectangle tourné, défini par son coin haut-gauche et deux axes
  // remontée de 18 cm par rapport au plan pour coller aux mesures : angle baie → porte de la salle d'eau = 340 cm
  // (15 cm + radiateur 60 cm + 265 cm libres)
  const TL = [-209, 411];
  const u = [201 / 218.2, -85 / 218.2];
  const v = [85 / 218.2, 201 / 218.2];
  const BW = 218.2, BD = 214.7;
  const bp = (s, t) => [TL[0] + u[0] * s + v[0] * t, TL[1] + u[1] * s + v[1] * t];
  APT.bath = { origin: TL, u, v, w: BW, d: BD, toWorld: bp };
  APT.bathPoly = [bp(0, 0), bp(BW, 0), bp(BW, BD), bp(0, BD)];

  // --- Pièce principale (séjour + cuisine + entrée), tracé des faces intérieures des murs
  const I = bp(BW, 0), Hh = bp(BW, BD);
  APT.main = [
    [0, 0], //          A  coin nord-ouest (baie)
    [319, 0], //        B  fin du mur de la baie
    [319, -213], //     C  alcôve cuisine, angle nord-ouest
    [620.5, -213], //   D  alcôve cuisine, angle nord-est (mesuré : 227 cm du bourrelet au mur côté frigo)
    [620.5, 147], //    E  mur est, début du mur en biais
    [147, 349], //      F  fin du mur en biais
    [200, 532], //      G  mur droit de l'entrée
    Hh, //               H  fond de l'entrée
    I, //                I  angle entrée / séjour (mur ouest)
  ];

  // Ouvertures par arête (arête i = point i -> point i+1). s = distance depuis le début de l'arête.
  APT.openings = {
    0: [{ kind: 'baie', s: 6.5, w: 237, sill: 0, h: 215, panels: 2 }], // baie coulissante 2 vantaux : 237 cm mesurés jointures comprises, à 6,5 cm de l'angle
    2: [{ kind: 'doorwin', s: 102, w: 82, sill: 0, h: 215 }], // porte-fenêtre de la cuisine (largeur d'après le plan, hauteur estimée)
    6: [{ kind: 'door', s: 16, w: 93, sill: 0, h: 204 }], // porte d'entrée
    7: [{ kind: 'door', s: 127, w: 73, sill: 0, h: 204 }], // porte salle d'eau
  };

  APT.terrace = { x: 0, z: -200, w: 316, d: 200 };

  APT.switches = []; // les interrupteurs, prises, etc. sont gérés par src/electric.js (mode Électricité)

  APT.bulbs = []; // les points lumineux sont gérés par src/electric.js (mode Électricité)

  // --- Éléments fixes (pour les collisions et l'affichage)
  function rectPoly(cx, cz, w, d, rotDeg) {
    const a = ((rotDeg || 0) * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
    return [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([lx, lz]) => [
      cx + lx * c + lz * s,
      cz - lx * s + lz * c,
    ]);
  }
  APT.rectPoly = rectPoly;

  const bathRect = (s, t, w, d) => {
    const c = bp(s, t);
    const ang = Math.atan2(-u[1], u[0]) * (180 / Math.PI); // angle de la salle d'eau
    return { c, poly: rectPoly(c[0], c[1], w, d, ang), ang };
  };

  // --- Salle d'eau (15/11/2026, ta description + photo 5). Repère local : s le long de u (0 = mur du fond,
  // BW = mur de la porte), t le long de v (0 = mur de droite en entrant, BD = mur de gauche). La porte est en t 15 → 88.
  //  · douche d'angle au fond à gauche : ~100 (le long du mur de gauche) × 80 (le long du fond), cloison carrelée
  //    côté vasque (7 cm, jusqu'au plafond), paroi vitrée côté pièce ;
  //  · WC au fond à droite, tournés vers la porte ; derrière eux, une marche de 15 cm le long du mur du fond (mur de droite → douche) ;
  //  · sèche-serviettes sur le mur de la porte, à gauche de la porte, entre la porte et le meuble vasque ;
  //  · meuble vasque suspendu (2 tiroirs) sur le mur de gauche, de la cloison de la douche jusqu'au sèche-serviettes,
  //    miroir + frise grise + applique au-dessus. Dimensions estimées : réglables dans l'appli (carte « Cuisine et salle d'eau »),
  //    valeurs de départ dans APT.fixesDefaults ci-dessous.
  // Attention : le mur de la porte (12 cm) est compté DANS ce rectangle (il est extrudé depuis le séjour) :
  // sa face côté salle d'eau est en s = BW − APT.T, c'est là qu'on accroche le sèche-serviettes.
  const DOORFACE = BW - APT.T;

  // --- Cuisine (alcôve x 319 → 620,5, z −213 → 0), d'après ta description du 15/11/2026 (longueurs estimées, à mesurer).
  // Gauche / droite = vu face au mur, debout dans la cuisine.
  //  · mur côté évier (x 319, face vers l'est), libre de z −37 (bourrelet) à z −213 (mur de la porte-fenêtre) = 176 cm :
  //    contre le bourrelet, plan de 126 cm (évier à gauche + égouttoir, puis plan ; dessous : placard sous évier, puis
  //    emplacement vide de 60 cm pour lave-vaisselle / lave-linge, sans socle ni fond), puis colonne blanche du chauffe-eau
  //    ~50 cm, du sol au plafond, une seule porte plate avec un petit bouton rond (photo 6).
  //  · mur côté frigo (x 620,5, face vers l'ouest), depuis le coin de la porte-fenêtre : plan de ~140 cm, plaques domino
  //    (~30 cm) à gauche ; dessous, placard sur la moitié gauche, espace ouvert sur la moitié droite (petit frigo dedans) ;
  //    2 placards hauts sur toute la longueur. Façades bois clair, plan noir avec rebord contre le mur.

  // --- Cotes réglables depuis l'interface (carte « Cuisine et salle d'eau », src/fixtures.js) : APT.fixes.
  // Valeurs en cm, communes à tous les scénarios (comme l'électricité), enregistrées dans localStorage
  // (clé APT.FIXES_KEY), jamais lues ni écrites en mode visite (?view). Champs manquants = valeurs de départ.
  // APT.kitchen, APT.bathLayout, APT.fixed et APT.kitchenAccess en sont déduits par APT.applyFixes().
  const WEST_Z0 = -213, WEST_Z1 = -37; // mur côté évier : de la porte-fenêtre au bourrelet (176 cm libres)
  const EAST_Z0 = -213; // mur côté frigo : le plan part du coin de la porte-fenêtre
  APT.FIXES_KEY = 'amenagement-anglet-fixes';
  APT.fixesDefaults = Object.freeze({
    // cuisine
    kDepth: 60, // profondeur des meubles bas
    kTop: 88, // hauteur du dessus du plan de travail
    colW: 50, // largeur de la colonne du chauffe-eau (contre la porte-fenêtre)
    wLen: 126, // longueur du plan côté évier (depuis le bourrelet)
    sinkCab: 66, // placard sous l'évier (le reste du plan = emplacement lave-vaisselle)
    sinkW: 78, // évier + égouttoir (cuve ≈ 40/78, égouttoir le reste)
    eLen: 140, // longueur du plan côté frigo (depuis le coin de la porte-fenêtre)
    eCab: 70, // placard sous les plaques (le reste = place du frigo)
    hobW: 30, // largeur des plaques (domino)
    upY: 145, upH: 70, upD: 35, // placards hauts : bas, hauteur, profondeur
    // salle d'eau
    shL: 100, // douche : longueur le long du mur de gauche (s)
    shW: 80, // douche : largeur le long du mur du fond (t)
    shWall: 7, // cloison carrelée entre douche et vasque
    wcAxis: 40, // axe des WC depuis le mur de droite
    stepD: 15, stepH: 15, // marche derrière les WC : profondeur, hauteur
    towelT: 104, towelW: 50, towelY: 20, towelH: 150, // sèche-serviettes : début (depuis le mur de droite), largeur, bas, hauteur
    vanD: 46, vanTop: 85, vanY: 30, // meuble vasque : profondeur, dessus, bas
    mirY0: 92, mirY1: 195, // miroir : bas, haut
  });
  // bornes simples [min, max] (les contraintes entre cotes sont appliquées ensuite dans cleanFixes)
  const FIX_RANGE = {
    kDepth: [50, 70], kTop: [75, 100], colW: [30, 80], wLen: [40, 146], sinkCab: [30, 146], sinkW: [40, 142],
    eLen: [60, 250], eCab: [30, 220], hobW: [20, 90], upY: [120, 200], upH: [30, 100], upD: [20, 50],
    shL: [60, 150], shW: [60, 140], shWall: [2, 15], wcAxis: [20, 120], stepD: [5, 40], stepH: [5, 40],
    towelT: [89, 170], towelW: [20, 80], towelY: [0, 100], towelH: [40, 200],
    vanD: [30, 60], vanTop: [60, 100], vanY: [0, 70], mirY0: [60, 197], mirY1: [80, 217],
  };
  APT.fixesRange = FIX_RANGE;
  // valide et borne un objet de cotes (n'importe quoi en entrée : objet partiel, valeurs texte, null…)
  APT.cleanFixes = function (o) {
    const D = APT.fixesDefaults, r = {};
    o = o && typeof o === 'object' ? o : {};
    const lim = (v, a, b) => Math.round(Math.min(Math.max(v, a), b) * 10) / 10;
    Object.keys(D).forEach((k) => {
      const v = typeof o[k] === 'string' ? parseFloat(o[k].replace(',', '.')) : o[k];
      r[k] = lim(typeof v === 'number' && isFinite(v) ? v : D[k], FIX_RANGE[k][0], FIX_RANGE[k][1]);
    });
    // cuisine, mur côté évier : colonne + plan ≤ 176 cm (le plan, collé au bourrelet, raccourcit)
    r.wLen = lim(r.wLen, 0, WEST_Z1 - WEST_Z0 - r.colW);
    r.sinkCab = lim(r.sinkCab, 0, r.wLen);
    r.sinkW = lim(r.sinkW, 0, r.wLen - 4);
    // mur côté frigo : au moins 30 cm pour le frigo, plaques dans le plan
    r.eCab = lim(r.eCab, 0, r.eLen - 30);
    r.hobW = lim(r.hobW, 0, r.eLen - 6);
    r.upH = lim(r.upH, 0, APT.H - r.upY);
    // salle d'eau : il reste au moins 30 cm de meuble vasque ; les WC (38 cm de large) ne touchent pas la douche
    r.shL = lim(r.shL, 0, DOORFACE - 0.5 - 30 - r.shWall);
    r.wcAxis = lim(r.wcAxis, 0, BD - r.shW - 20);
    // sèche-serviettes entre la porte (t ≤ 88) et le meuble vasque
    r.towelW = lim(r.towelW, 0, BD - r.vanD - 1 - 89);
    r.towelT = lim(r.towelT, 89, BD - r.vanD - 1 - r.towelW);
    r.towelH = lim(r.towelH, 0, APT.H - 5 - r.towelY);
    r.vanY = lim(r.vanY, 0, r.vanTop - 30);
    r.mirY0 = lim(r.mirY0, r.vanTop, 197);
    r.mirY1 = lim(r.mirY1, r.mirY0 + 20, 217);
    return r;
  };

  // recalcule APT.kitchen, APT.bathLayout, APT.fixed et APT.kitchenAccess depuis les cotes (nettoyées).
  // APT.fixed et APT.kitchenAccess sont mis à jour EN PLACE (mêmes objets, mêmes tableaux) : un module qui en garde
  // une référence voit les nouvelles valeurs. Les maillages 3D sont refaits par __app.rebuildFixed().
  APT.applyFixes = function (o) {
    const F = (APT.fixes = APT.cleanFixes(o));
    const BL = (APT.bathLayout = {
      shower: { s0: 0, s1: F.shL, t0: BD - F.shW, t1: BD, wall: F.shWall }, // wall : cloison carrelée côté vasque
      wc: { s0: 0, s1: 66, tc: F.wcAxis, w: 38 },
      // petite marche (coffrage) le long du mur du fond, du mur de droite jusqu'à la douche, derrière les WC
      step: { s0: 0, s1: F.stepD, t0: 0, h: F.stepH },
      // sèche-serviettes : sur le mur de la porte, entre la porte (t ≤ 88) et le meuble vasque (t ≥ BD − vanity.d)
      towel: { s0: DOORFACE - 8, s1: DOORFACE, t0: F.towelT, t1: F.towelT + F.towelW, y0: F.towelY, h: F.towelH },
      vanity: { s0: F.shL + F.shWall, s1: DOORFACE - 0.5, d: F.vanD, y0: F.vanY, top: F.vanTop }, // de la cloison de la douche jusqu'au mur de la porte
      mirror: { y0: F.mirY0, y1: F.mirY1 },
    });
    const rectST = (s0, s1, t0, t1) => bathRect((s0 + s1) / 2, (t0 + t1) / 2, s1 - s0, t1 - t0);
    const shower = rectST(BL.shower.s0, BL.shower.s1 + BL.shower.wall, BL.shower.t0, BL.shower.t1);
    const wc = rectST(BL.wc.s0, BL.wc.s1, BL.wc.tc - BL.wc.w / 2, BL.wc.tc + BL.wc.w / 2);
    const step = rectST(BL.step.s0, BL.step.s1, BL.step.t0, BL.shower.t0);
    const towel = rectST(BL.towel.s0, BL.towel.s1, BL.towel.t0, BL.towel.t1);
    const basin = rectST(BL.vanity.s0, BL.vanity.s1, BD - BL.vanity.d, BD);

    const wz0 = WEST_Z1 - F.wLen, sinkEnd = WEST_Z1 - 2, sk = Math.round(((F.sinkW * 40) / 78) * 10) / 10;
    const ez1 = EAST_Z0 + F.eLen, open0 = EAST_Z0 + F.eCab;
    const K = (APT.kitchen = {
      depth: F.kDepth, worktop: F.kTop, // profondeur des meubles, dessus du plan de travail (cm)
      west: {
        x: 319, z0: wz0, z1: WEST_Z1, sinkCab: [WEST_Z1 - F.sinkCab, WEST_Z1], dwSlot: [wz0, WEST_Z1 - F.sinkCab],
        sink: [sinkEnd - sk, sinkEnd], drainer: [sinkEnd - F.sinkW, sinkEnd - sk],
      },
      column: { x: 319, z0: WEST_Z0, z1: WEST_Z0 + F.colW }, // colonne du chauffe-eau
      east: {
        x: 620.5, z0: EAST_Z0, z1: ez1, hob: [EAST_Z0 + 3, EAST_Z0 + 3 + F.hobW], cab: [EAST_Z0, open0], open: [open0, ez1],
        fridge: [open0 + 0.5, ez1 - 0.5], uppers: { y: F.upY, h: F.upH, d: F.upD }, // le frigo occupe tout l'espace ouvert
      },
    });
    const fixed = [
      // l'ordre des deux premiers est historique (lu par d'autres modules via leur id, pas par l'index)
      { id: 'kitchen-east', name: 'Plaques + frigo', kind: 'kitchen', poly: rectPoly(K.east.x - K.depth / 2, (K.east.z0 + K.east.z1) / 2, K.depth, K.east.z1 - K.east.z0, 0) },
      { id: 'kitchen-west', name: 'Évier', kind: 'kitchen', poly: rectPoly(K.west.x + K.depth / 2, (K.west.z0 + K.west.z1) / 2, K.depth, K.west.z1 - K.west.z0, 0) },
      { id: 'water-heater', name: 'Chauffe-eau', kind: 'column', poly: rectPoly(K.column.x + K.depth / 2, (K.column.z0 + K.column.z1) / 2, K.depth, K.column.z1 - K.column.z0, 0) },
      { name: 'Radiateur', kind: 'radiator', poly: rectPoly(5, 45, 10, 60, 0) }, // mesuré : z 15 → 75
      { name: 'Gaine / pilier', kind: 'pillar', poly: [[306.5, -37], [393.5, -37], [393.5, 25], [306.5, 25]] }, // bourrelet 87 cm après 6,5 + baie 237 + 63 cm de mur
      { id: 'wc', name: 'WC', kind: 'wc', poly: wc.poly, c: wc.c, ang: wc.ang },
      { id: 'shower', name: 'Douche', kind: 'shower', poly: shower.poly, c: shower.c, ang: shower.ang },
      { id: 'basin', name: 'Vasque', kind: 'basin', poly: basin.poly, c: basin.c, ang: basin.ang },
      { id: 'step', name: 'Marche', kind: 'step', poly: step.poly, c: step.c, ang: step.ang },
      { id: 'towel', name: 'Sèche-serviettes', kind: 'radiator', poly: towel.poly, c: towel.c, ang: towel.ang },
    ];
    if (!APT.fixed) APT.fixed = fixed;
    else fixed.forEach((f, i) => { if (APT.fixed[i]) Object.assign(APT.fixed[i], f); else APT.fixed.push(f); });

    // points d'accès devant les éléments de cuisine (utilisés par l'outil Passages) : tableaux modifiés en place
    const acc = {
      sink: [K.west.x + K.depth + 35, (K.west.sink[0] + K.west.sink[1]) / 2],
      hob: [K.east.x - K.depth - 35, (K.east.hob[0] + K.east.hob[1]) / 2],
      fridge: [K.east.x - K.depth - 35, (K.east.fridge[0] + K.east.fridge[1]) / 2],
    };
    if (!APT.kitchenAccess) APT.kitchenAccess = acc;
    else Object.keys(acc).forEach((k) => { const a = APT.kitchenAccess[k]; if (a) { a[0] = acc[k][0]; a[1] = acc[k][1]; } else APT.kitchenAccess[k] = acc[k]; });
    return F;
  };

  // lecture des cotes enregistrées AVANT la construction de la scène (SCEN n'existe pas encore : même test que scenarios.js)
  {
    let saved = null;
    if (!(/(^\?|&)view(=1)?(&|$)/.test(location.search) || /^#v=/.test(location.hash || ''))) {
      try { saved = JSON.parse(localStorage.getItem(APT.FIXES_KEY) || 'null'); } catch (e) { saved = null; }
    }
    APT.applyFixes(saved);
  }

  // --- Utilitaires géométriques partagés
  APT.pointInPoly = function (p, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], zi = poly[i][1], xj = poly[j][0], zj = poly[j][1];
      if (zi > p[1] !== zj > p[1] && p[0] < ((xj - xi) * (p[1] - zi)) / (zj - zi) + xi) inside = !inside;
    }
    return inside;
  };

  // SAT sur deux polygones convexes
  APT.polyOverlap = function (A, B, eps) {
    eps = eps || 0;
    for (const poly of [A, B]) {
      for (let i = 0; i < poly.length; i++) {
        const j = (i + 1) % poly.length;
        const nx = poly[j][1] - poly[i][1], nz = poly[i][0] - poly[j][0];
        let minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity;
        for (const p of A) { const d = p[0] * nx + p[1] * nz; minA = Math.min(minA, d); maxA = Math.max(maxA, d); }
        for (const p of B) { const d = p[0] * nx + p[1] * nz; minB = Math.min(minB, d); maxB = Math.max(maxB, d); }
        const len = Math.hypot(nx, nz) || 1;
        if (maxA - minB <= eps * len || maxB - minA <= eps * len) return false;
      }
    }
    return true;
  };

  APT.fixedById = (id) => APT.fixed.find((f) => f.id === id);

  APT.inside = function (poly) {
    // tous les coins + milieux d'arêtes dans la pièce principale OU dans la salle d'eau
    const pts = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      pts.push(a, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
    }
    return (
      pts.every((p) => APT.pointInPoly(p, APT.main)) || pts.every((p) => APT.pointInPoly(p, APT.bathPoly))
    );
  };
})();
