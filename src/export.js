/*
 * Exports et mode visite :
 *  - image PNG de la vue 3D (y compris en rendu réaliste) ;
 *  - plan 2D à l'échelle (SVG généré depuis APT et les meubles), dans une fenêtre imprimable A4 paysage ;
 *  - lien de visite en lecture seule (index.html?view#s=...) ;
 *  - interface allégée du mode visite (html.view-mode).
 * Ne modifie aucun autre fichier : tout passe par window.__app, window.APT, window.SCEN et le DOM.
 */
(function () {
  const app = window.__app;
  if (!app || !window.APT || !window.SCEN) { console.warn('export.js : application introuvable'); return; }
  const $ = (id) => document.getElementById(id);
  const viewOnly = !!SCEN.viewOnly;

  // ------------------------------------------------------------------ utilitaires
  const pad2 = (n) => String(n).padStart(2, '0');
  function stamp() {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}_${pad2(d.getHours())}h${pad2(d.getMinutes())}`;
  }
  const dateFr = () => { const d = new Date(); return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`; };
  const safe = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const scenName = () => {
    const v = ($('scen-name') && $('scen-name').value.trim()) || '';
    if (v) return v;
    const sel = $('scen-select');
    return (sel && sel.selectedOptions[0] && sel.selectedOptions[0].textContent.replace(/\s*\(\d+\)$/, '')) || 'Scénario';
  };
  const toast = (m) => (SCEN.toast ? SCEN.toast(m) : alert(m));
  const fmtM = (cm) => (cm / 100).toFixed(2).replace('.', ',') + ' m';
  const r0 = (v) => Math.round(v);

  // ------------------------------------------------------------------ styles
  const css = document.createElement('style');
  css.textContent = `
    #export-slot { margin-top:10px; border-top:1px solid var(--line); padding-top:8px; }
    #export-slot .x-title { font-size:12px; color:var(--mute); font-weight:600; }
    #files #export-slot .btns button { flex:1 1 calc(50% - 6px); }
    #files #export-slot .btns button.x-wide { flex-basis:100%; }
    #x-visit-box { margin-top:8px; font-size:12px; }
    #x-visit-box[hidden] { display:none; }
    #visit-banner, #visit-tools, #visit-legend { display:none; }

    /* ---------- mode visite (lecture seule) */
    html.view-mode #app { grid-template-columns:1fr; grid-template-rows:58px 1fr; height:100vh; }
    html.view-mode header { grid-column:1 / -1; }
    html.view-mode #left, html.view-mode #right { display:none !important; }
    /* aucun :has() ici : un navigateur qui ne le connaît pas ignorerait toute la règle ; les conteneurs sans id sont marqués en JS (.x-edit-only) */
    html.view-mode .x-edit-only, html.view-mode #btn-undo, html.view-mode #btn-redo { display:none !important; }
    html.view-mode #tools-slot, html.view-mode #elec-slot, html.view-mode #snap-slot, html.view-mode #disp-moved,
    html.view-mode #budget-card, html.view-mode #custom-card, html.view-mode #fixtures-card, html.view-mode #elec-card, html.view-mode #lights-card,
    html.view-mode #sel-extra, html.view-mode #export-slot, html.view-mode #hint,
    html.view-mode #m-clear, html.view-mode #m-hint, html.view-mode #m-labels, html.view-mode #pass-panel { display:none !important; }
    html.view-mode #view { height:auto; }
    html.view-mode #visit-banner { display:inline-flex; align-items:center; gap:7px; min-width:0; max-width:42vw; padding:4px 11px;
      border-radius:99px; background:var(--accent-soft); color:var(--accent); font-size:12.5px; font-weight:500; white-space:nowrap; flex:0 1 auto; }
    html.view-mode #visit-banner span { overflow:hidden; text-overflow:ellipsis; }
    html.view-mode #visit-banner::before { content:""; width:7px; height:7px; border-radius:50%; background:var(--accent); flex:none; }
    html.view-mode #visit-tools { display:flex; }
    html.view-mode #visit-legend { display:block; right:14px; bottom:14px; z-index:5; max-width:360px; }
    html.view-mode #visit-legend[hidden] { display:none; }
    #visit-legend b { color:var(--ink); font-weight:600; }
    @media (max-width: 900px) {
      html.view-mode #app { grid-template-rows:auto 1fr; }
      html.view-mode #view { height:auto; min-height:70vh; }
      html.view-mode #visit-banner { max-width:100%; }
    }`;
  document.head.appendChild(css);

  // ------------------------------------------------------------------ 1. image PNG de la vue 3D
  // Le canevas WebGL n'est pas conservé entre deux images : on lit le canevas dans le même tour que le rendu.
  // La boucle d'app.js a toujours sa prochaine image déjà demandée ; une demande faite ici passe juste après
  // elle, donc juste après le rendu (EffectComposer compris en mode réaliste), avant l'affichage.
  function grabView() {
    return new Promise((resolve, reject) => {
      requestAnimationFrame(() => {
        try { resolve(app.renderer.domElement.toDataURL('image/png')); } catch (e) { reject(e); }
      });
    });
  }
  async function savePng() {
    try {
      const url = await grabView();
      const a = document.createElement('a');
      a.href = url;
      a.download = `amenagement-${safe(scenName()) || 'scenario'}_vue${app.realistic() ? '-realiste' : ''}_${stamp()}.png`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => a.remove(), 500);
      toast('Image de la vue enregistrée (dossier Téléchargements).');
    } catch (e) {
      console.error(e);
      toast("Impossible de créer l'image de la vue.");
    }
  }

  // ------------------------------------------------------------------ 2. plan 2D à l'échelle
  const T = APT.T;
  function edgeOf(poly, i) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const d = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
    let n = [d[1], -d[0]];
    const mid = [(a[0] + b[0]) / 2 + n[0] * 2, (a[1] + b[1]) / 2 + n[1] * 2];
    if (APT.pointInPoly(mid, poly)) n = [-n[0], -n[1]];
    const at = (s, t) => [a[0] + d[0] * s + n[0] * t, a[1] + d[1] * s + n[1] * t];
    return { a, b, L, d, n, at };
  }
  const signedArea = (p) => p.reduce((s, a, k) => s + a[0] * p[(k + 1) % p.length][1] - p[(k + 1) % p.length][0] * a[1], 0);

  // morceaux de mur d'une arête (même logique que app.js : épaisseur vers l'extérieur, angles saillants complétés)
  function wallPieces(poly, i, openings) {
    const n = poly.length, e = edgeOf(poly, i);
    const prev = edgeOf(poly, (i + n - 1) % n), next = edgeOf(poly, (i + 1) % n);
    const sgn = Math.sign(signedArea(poly));
    const cross = (p, q) => p.d[0] * q.d[1] - p.d[1] * q.d[0];
    const extA = Math.sign(cross(prev, e)) === sgn ? T : 0;
    const extB = Math.sign(cross(e, next)) === sgn ? T : 0;
    const ops = (openings || []).slice().sort((p, q) => p.s - q.s);
    const out = [];
    const piece = (s0, s1, ea, eb) => {
      if (s1 - s0 < 0.5) return;
      out.push([e.at(s0 - ea, 0), e.at(s1 + eb, 0), e.at(s1 + eb, T), e.at(s0 - ea, T)]);
    };
    let c = 0;
    ops.forEach((o) => { piece(c, o.s, c === 0 ? extA : 0, 0); c = o.s + o.w; });
    piece(c, e.L, c === 0 ? extA : 0, extB);
    return out;
  }

  // sens d'ouverture des portes : côté des paumelles (début ou fin de l'ouverture le long de l'arête), toujours vers l'intérieur
  //  arête 6 (porte d'entrée, G -> H) : paumelles côté mur droit de l'entrée (G), le vantail se rabat vers le séjour ;
  //  arête 7 (salle d'eau, H -> I) : s'ouvre côté séjour, vers l'entrée (paumelles côté H), poignée à droite vue de l'entrée ;
  //  arête 2 (porte-fenêtre, C -> D) : vers l'intérieur, poignée à gauche, s'ouvre vers le mur du frigo (paumelles côté D).
  const HINGE = { 6: 'start', 7: 'start', 2: 'end' };

  function buildPlan() {
    const items = app.items.slice();
    const pts = []; // pour l'encombrement
    const ext = (p, r) => { r = r || 0; pts.push([p[0] - r, p[1] - r], [p[0] + r, p[1] + r]); };
    const P = (p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`;
    const polyStr = (poly) => poly.map(P).join(' ');
    const angOf = (dx, dz) => {
      let a = (Math.atan2(dz, dx) * 180) / Math.PI;
      if (a > 90.01) a -= 180;
      if (a <= -89.99) a += 180;
      return a;
    };

    // échelle : la plus grande échelle usuelle qui tient dans la zone du plan (mm)
    const AREA_W = 188, AREA_H = 170;
    const layers = { floor: [], terrace: [], walls: [], open: [], fixed: [], furn: [], dims: [], labels: [] };
    const swings = []; // débattements des portes (quart de disque) : pour que les cotes les évitent

    // -------- sols
    layers.floor.push(`<polygon points="${polyStr(APT.main)}" class="floor"/>`, `<polygon points="${polyStr(APT.bathPoly)}" class="floor bath"/>`);
    APT.main.forEach((p) => ext(p, T));
    APT.bathPoly.forEach((p) => ext(p, T));
    const tr = APT.terrace;
    if (tr) {
      const z0 = tr.z - T, z1 = tr.z + tr.d - T; // comme dans la 3D
      layers.terrace.push(`<rect x="${tr.x}" y="${z0}" width="${tr.w}" height="${z1 - z0}" class="terrace"/>`);
      ext([tr.x, z0]); ext([tr.x + tr.w, z1]);
    }

    // -------- murs
    const wallPolys = [];
    for (let i = 0; i < APT.main.length; i++) wallPolys.push(...wallPieces(APT.main, i, APT.openings[i]));
    [0, 2, 3].forEach((i) => wallPolys.push(...wallPieces(APT.bathPoly, i, null)));
    wallPolys.forEach((q) => layers.walls.push(`<polygon points="${polyStr(q)}" class="wall"/>`));

    // -------- ouvertures
    Object.keys(APT.openings).forEach((k) => {
      const i = +k, e = edgeOf(APT.main, i);
      APT.openings[k].forEach((o) => {
        const s0 = o.s, s1 = o.s + o.w;
        if (o.kind === 'baie' || o.kind === 'window' || o.kind === 'doorwin') {
          layers.open.push(`<polygon points="${polyStr([e.at(s0, 0), e.at(s1, 0), e.at(s1, T), e.at(s0, T)])}" class="frame"/>`);
          if (o.kind === 'doorwin') {
            layers.open.push(`<line x1="${P(e.at(s0, T / 2)).replace(',', '" y1="')}" x2="${P(e.at(s1, T / 2)).replace(',', '" y2="')}" class="glass"/>`);
          } else { // coulissant : vantaux décalés
            const panels = o.kind === 'baie' ? o.panels || 2 : 2;
            for (let p = 0; p < panels; p++) {
              const a = s0 + (o.w / panels) * p - (p ? 4 : 0), b = s0 + (o.w / panels) * (p + 1) + (p < panels - 1 ? 4 : 0);
              const t = p % 2 ? T * 0.33 : T * 0.67;
              layers.open.push(`<line x1="${P(e.at(a, t)).replace(',', '" y1="')}" x2="${P(e.at(b, t)).replace(',', '" y2="')}" class="glass"/>`);
            }
          }
        }
        if (o.kind === 'door' || o.kind === 'doorwin') {
          const hingeAtStart = (HINGE[i] || 'start') === 'start';
          const sh = hingeAtStart ? s0 : s1, sf = hingeAtStart ? s1 : s0;
          const ph = e.at(sh, 0), pc = e.at(sf, 0);
          const po = [ph[0] - e.n[0] * o.w, ph[1] - e.n[1] * o.w]; // vantail ouvert à 90°, vers l'intérieur
          const vc = [pc[0] - ph[0], pc[1] - ph[1]], vo = [po[0] - ph[0], po[1] - ph[1]];
          const sweep = vc[0] * vo[1] - vc[1] * vo[0] > 0 ? 1 : 0;
          layers.open.push(`<path d="M${P(pc)} A${o.w},${o.w} 0 0 ${sweep} ${P(po)}" class="swing"/>`);
          swings.push({ c: ph, r: o.w, n: [-e.n[0], -e.n[1]], d: [(pc[0] - ph[0]) / o.w, (pc[1] - ph[1]) / o.w] });
          layers.open.push(`<line x1="${P(ph).replace(',', '" y1="')}" x2="${P(po).replace(',', '" y2="')}" class="leaf${o.kind === 'doorwin' ? ' leafwin' : ''}"/>`);
          ext(po);
        }
      });
    });

    // -------- éléments fixes (APT.fixed relu à chaque génération : les cotes de la cuisine / salle d'eau sont réglables)
    const fixedLabel = { radiator: '', pillar: 'Gaine', column: 'Ch.-eau', step: '' };
    const fixedList = APT.fixed.map((f) => {
      const name = f.kind in fixedLabel ? fixedLabel[f.kind] : f.name.replace(' (kitchenette)', '');
      layers.fixed.push(`<polygon points="${polyStr(f.poly)}" class="fixed ${f.kind}"/>`);
      return { poly: f.poly, name };
    });

    return { items, pts, layers, ext, P, polyStr, angOf, fixedList, swings, AREA_W, AREA_H };
  }

  function planDocument() {
    const B = buildPlan();
    const { items, pts, layers, ext, P, angOf, fixedList, swings } = B;

    // encombrement provisoire (sans les cotes) pour l'échelle
    const SCALES = [50, 60, 75, 100, 125];
    // les cotes et le texte prennent de la place : on estime l'encombrement final avec une marge fixe
    const bb0 = bbox(pts);
    const marginCm = { l: 75, r: 75, t: 110, b: 115 };
    const wcm = bb0.x1 - bb0.x0 + marginCm.l + marginCm.r, hcm = bb0.z1 - bb0.z0 + marginCm.t + marginCm.b;
    let scale = SCALES.find((s) => (wcm * 10) / s <= B.AREA_W && (hcm * 10) / s <= B.AREA_H) || 150;
    const u = scale / 10; // cm de plan par mm de papier
    const fs = { dim: 2.5 * u, furn: 2.3 * u, small: 2.0 * u, room: 3 * u };
    const avoid = []; // éléments déjà posés (cercles : symboles électriques, textes de cote dans les pièces) que les étiquettes évitent

    // -------- cotes des murs (faces intérieures)
    const dimOff = 5 * u; // 5 mm au-delà de la face extérieure du mur
    function dimLine(p0, p1, nrm, off, text, cls) {
      const a = [p0[0] + nrm[0] * off, p0[1] + nrm[1] * off], b = [p1[0] + nrm[0] * off, p1[1] + nrm[1] * off];
      const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz), d = [dx / L, dz / L];
      const tk = 1.4 * u, tick = (p) => `<line x1="${p[0] - (d[0] + nrm[0]) * tk}" y1="${p[1] - (d[1] + nrm[1]) * tk}" x2="${p[0] + (d[0] + nrm[0]) * tk}" y2="${p[1] + (d[1] + nrm[1]) * tk}" class="tick"/>`;
      const extL = (p, q) => `<line x1="${P(p).replace(',', '" y1="')}" x2="${P(q).replace(',', '" y2="')}" class="extl"/>`;
      const startExt = Math.min(off, T + 1.5 * u);
      const out = [
        extL([p0[0] + nrm[0] * startExt, p0[1] + nrm[1] * startExt], [a[0] + nrm[0] * 1.2 * u, a[1] + nrm[1] * 1.2 * u]),
        extL([p1[0] + nrm[0] * startExt, p1[1] + nrm[1] * startExt], [b[0] + nrm[0] * 1.2 * u, b[1] + nrm[1] * 1.2 * u]),
        `<line x1="${P(a).replace(',', '" y1="')}" x2="${P(b).replace(',', '" y2="')}" class="dim"/>`, tick(a), tick(b),
      ];
      const c = [(a[0] + b[0]) / 2 + nrm[0] * fs.dim * 0.75, (a[1] + b[1]) / 2 + nrm[1] * fs.dim * 0.75];
      if (APT.pointInPoly(c, APT.main) || APT.pointInPoly(c, APT.bathPoly)) avoid.push({ c, r: text.length * fs.dim * 0.3 });
      out.push(`<text x="${c[0].toFixed(1)}" y="${c[1].toFixed(1)}" transform="rotate(${angOf(dx, dz).toFixed(2)} ${P(c).replace(',', ' ')})" class="dimtxt ${cls || ''}">${esc(text)}</text>`);
      ext(a); ext(b); ext(c, fs.dim * 1.3);
      layers.dims.push(...out);
    }
    // une cote (segment p0-p1 décalé de off selon nrm, texte compris) coupe-t-elle le débattement d'une porte ?
    function hitsSwing(p0, p1, nrm, off) {
      const tOff = off + fs.dim * 1.5, marg = 1.5 * u;
      for (let k = 0; k <= 40; k++) {
        const f = k / 40;
        for (const o of [off, tOff]) {
          const q = [p0[0] + (p1[0] - p0[0]) * f + nrm[0] * o, p0[1] + (p1[1] - p0[1]) * f + nrm[1] * o];
          if (swings.some((s) => {
            const v = [q[0] - s.c[0], q[1] - s.c[1]];
            return Math.hypot(v[0], v[1]) < s.r + marg && v[0] * s.n[0] + v[1] * s.n[1] > -marg && v[0] * s.d[0] + v[1] * s.d[1] > -marg;
          })) return true;
        }
      }
      return false;
    }
    const dimEdges = (poly, skip, inwardIf) => {
      for (let i = 0; i < poly.length; i++) {
        if (skip.includes(i)) continue;
        const e = edgeOf(poly, i);
        if (e.L < 40) continue;
        let nrm = e.n, off = T + dimOff;
        // si l'extérieur est une autre pièce (mur partagé), la cote passe à l'intérieur…
        const mid = e.at(e.L / 2, T + dimOff);
        if (inwardIf.some((q) => APT.pointInPoly(mid, q))) {
          nrm = [-e.n[0], -e.n[1]]; off = dimOff;
          // …sauf si elle y coupe le débattement d'une porte : on la met alors dans l'autre pièce (ex. H–I, côté salle d'eau)
          // (au plus près du mur, pour ne pas traverser toute la pièce)
          const offB = T + 2 * u;
          if (hitsSwing(e.a, e.b, nrm, off) && !hitsSwing(e.a, e.b, e.n, offB)) { nrm = e.n; off = offB; }
        }
        dimLine(e.a, e.b, nrm, off, fmtM(e.L));
      }
    };
    dimEdges(APT.main, [], [APT.bathPoly]);
    dimEdges(APT.bathPoly, [1], [APT.main]);
    // largeur totale du séjour (x = 0 -> mur est)
    const xs = APT.main.map((p) => p[0]), zs = APT.main.map((p) => p[1]);
    const xMin = 0, xMax = Math.max(...xs), zTop = Math.min(...zs);
    dimLine([xMin, zTop], [xMax, zTop], [0, -1], T + dimOff + 9 * u, `${fmtM(xMax - xMin)} · largeur du séjour`, 'strong');

    // -------- points électriques (facultatif : si electric.js est chargé)
    const elec = [];
    const ELEC_SYM = { ceiling: 'L', 'wall-light': 'A', outlet: 'P', switch: 'I', rj45: 'R', tv: 'TV', meter: 'C', heating: 'H' };
    const elecUsed = new Set();
    try {
      const list = window.ELEC && typeof ELEC.points === 'function' ? ELEC.points() || [] : [];
      const r = 1.5 * u;
      list.forEach((q) => {
        if (!q || !isFinite(q.x) || !isFinite(q.z)) return;
        const sym = ELEC_SYM[q.type] || '•';
        elecUsed.add(q.type);
        const c = [q.x + (q.nx || 0) * (r + 1), q.z + (q.nz || 0) * (r + 1)];
        avoid.push({ c, r });
        elec.push(`<g class="elec ${esc(q.type)}"><title>${esc(q.label || q.type)}</title><circle cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" r="${r.toFixed(1)}"/>` +
          `<text x="${c[0].toFixed(1)}" y="${c[1].toFixed(1)}" style="font-size:${(r * (sym.length > 1 ? 0.95 : 1.25)).toFixed(1)}px">${sym}</text></g>`);
      });
    } catch (e) { console.warn('export.js : points électriques ignorés', e); }
    const ELEC_NAMES = { ceiling: 'L point lumineux', 'wall-light': 'A applique', outlet: 'P prise', switch: 'I interrupteur', rj45: 'R prise RJ45', tv: 'TV prise TV', meter: 'C tableau / compteur', heating: 'H chauffage' };
    const elecLegend = [...elecUsed].filter((t) => ELEC_NAMES[t]).map((t) => ELEC_NAMES[t]).join(' · ');

    // -------- étiquettes : position libre la plus proche du centre (sans couvrir un symbole électrique)
    // c : centre souhaité, ang : angle du texte, hw/hh : demi-largeur/hauteur du texte, maxU/maxV : décalage possible
    function freeSpot(c, ang, hw, hh, maxU, maxV) {
      const a = (ang * Math.PI) / 180, ux = [Math.cos(a), Math.sin(a)], vy = [-Math.sin(a), Math.cos(a)];
      const marg = 0.4 * u;
      const free = (p) => avoid.every((o) => {
        const dx = o.c[0] - p[0], dz = o.c[1] - p[1];
        return Math.abs(dx * ux[0] + dz * ux[1]) >= hw + o.r + marg || Math.abs(dx * vy[0] + dz * vy[1]) >= hh + o.r + marg;
      });
      if (free(c)) return c;
      const step = 0.8 * u, cand = [];
      const nu = Math.floor(Math.max(0, maxU) / step), nv = Math.floor(Math.max(0, maxV) / step);
      for (let i = -nu; i <= nu; i++) for (let j = -nv; j <= nv; j++) if (i || j) cand.push([i * step, j * step]);
      cand.sort((p, q) => Math.hypot(p[0], p[1]) - Math.hypot(q[0], q[1]));
      for (const [du, dv] of cand) {
        const p = [c[0] + ux[0] * du + vy[0] * dv, c[1] + ux[1] * du + vy[1] * dv];
        if (free(p)) return p;
      }
      return c; // pas de place : au centre (le texte est dessiné par-dessus les symboles, avec un liseré blanc)
    }

    // -------- éléments fixes : libellés
    function rectLabel(poly, lines, size, cls, layer) {
      const c = poly.reduce((s, p) => [s[0] + p[0] / poly.length, s[1] + p[1] / poly.length], [0, 0]);
      const e0 = [poly[1][0] - poly[0][0], poly[1][1] - poly[0][1]], e1 = [poly[2][0] - poly[1][0], poly[2][1] - poly[1][1]];
      const l0 = Math.hypot(...e0), l1 = Math.hypot(...e1);
      const along = l0 >= l1 ? e0 : e1, long = Math.max(l0, l1), short = Math.min(l0, l1);
      const ang = angOf(along[0], along[1]);
      const lh = size * 1.18, padC = size * 0.35;
      const tw = (s, k) => s.length * size * (k || 0.56);
      let fit = lines.filter(Boolean);
      while (fit.length && (fit.length * lh + padC > short || fit.some((l, k) => tw(l, k ? 0.5 : 0.58) + 2 * padC > long))) fit.pop();
      if (!fit.length) return false;
      const y0 = -((fit.length - 1) * lh) / 2;
      const hw = Math.max(...fit.map((l, k) => tw(l, k ? 0.5 : 0.58))) / 2, hh = (fit.length * lh) / 2;
      // l'axe du texte suit le grand côté du rectangle
      const pc = freeSpot(c, ang, hw, hh, long / 2 - hw - padC, short / 2 - hh - padC / 2);
      const spans = fit.map((l, k) => `<tspan x="0" y="${(y0 + k * lh).toFixed(1)}" class="${k ? 'l2' : 'l1'}">${esc(l)}</tspan>`).join('');
      layer.push(`<text transform="translate(${P(pc).replace(',', ' ')}) rotate(${ang.toFixed(2)})" class="${cls}" style="font-size:${size.toFixed(1)}px">${spans}</text>`);
      return true;
    }
    fixedList.forEach((f) => { if (f.name) rectLabel(f.poly, [f.name], fs.small, 'fixtxt', layers.labels); });

    // -------- meubles
    const isTop = (it) => !!(window.FURN && FURN.byId[it.type] && FURN.byId[it.type].onTop);
    const order = items.map((it, k) => ({ it, k })).sort((p, q) => isTop(p.it) - isTop(q.it));
    const furnLabels = [];
    order.forEach(({ it, k }) => {
      const poly = app.poly(it), num = k + 1;
      const bad = typeof app.isInvalid === 'function' ? (() => { try { return app.isInvalid(it); } catch (e) { return !!it.bad; } })() : !!it.bad;
      layers.furn.push(`<polygon points="${B.polyStr(poly)}" class="furn${isTop(it) ? ' ontop' : ''}${bad ? ' bad' : ''}"/>`);
      poly.forEach((p) => ext(p));
      const ok = rectLabel(poly, [`${num}. ${it.name}`, `${r0(it.w)} × ${r0(it.d)}`], fs.furn, 'furntxt', furnLabels) ||
        rectLabel(poly, [String(num)], fs.furn, 'furntxt num', furnLabels);
      if (!ok) { // trop petit : numéro dans une pastille à côté
        const rb = fs.furn * 0.75, c = freeSpot([it.x, it.z], 0, rb, rb, rb * 2, rb * 2);
        avoid.push({ c, r: rb });
        furnLabels.push(`<circle cx="${c[0]}" cy="${c[1]}" r="${(fs.furn * 0.75).toFixed(1)}" class="badge"/><text x="${c[0]}" y="${c[1]}" class="badgetxt" style="font-size:${(fs.furn * 0.85).toFixed(1)}px">${num}</text>`);
      }
      it._bad = bad;
    });

    // -------- libellés des pièces
    const tr = APT.terrace;
    if (tr) {
      const c = [tr.x + tr.w / 2, tr.z - T + (tr.d - T) / 2 - 18];
      layers.labels.push(`<text x="${c[0]}" y="${c[1]}" class="room" style="font-size:${fs.room.toFixed(1)}px">Terrasse</text>`);
    }
    if (APT.bath && APT.bath.toWorld) {
      const ang = angOf(APT.bath.u[0], APT.bath.u[1]);
      const fz = fs.room * 0.8, txt = "Salle d'eau";
      const c = freeSpot(APT.bath.toWorld(APT.bath.w * 0.6, APT.bath.d * 0.42), ang, txt.length * fz * 0.42, fz * 0.6, 12 * u, 6 * u);
      layers.labels.push(`<text transform="translate(${P(c).replace(',', ' ')}) rotate(${ang.toFixed(2)})" class="room" style="font-size:${fz.toFixed(1)}px">${txt}</text>`);
    }

    // -------- encombrement final + échelle graphique
    let bb = bbox(pts);
    const sbLen = 200, sbX = bb.x0 + 4 * u, sbY = bb.z1 + 9 * u;
    const sb = [];
    for (let k = 0; k < 4; k++) sb.push(`<rect x="${sbX + k * 50}" y="${sbY}" width="50" height="${1.6 * u}" class="${k % 2 ? 'sbw' : 'sbb'}"/>`);
    [0, 100, 200].forEach((v) => sb.push(`<text x="${sbX + v}" y="${sbY + 1.6 * u + fs.small * 1.1}" class="sbtxt" style="font-size:${fs.small.toFixed(1)}px">${v / 100} m</text>`));
    sb.push(`<text x="${sbX + sbLen + 4 * u}" y="${sbY + 1.4 * u}" class="sbtxt left" style="font-size:${fs.small.toFixed(1)}px">Échelle 1:${scale}</text>`);
    ext([sbX, sbY]); ext([sbX + sbLen + 30 * u, sbY + 1.6 * u + fs.small * 1.6]);
    bb = bbox(pts);
    const padCm = 2 * u;
    const vx = bb.x0 - padCm, vz = bb.z0 - padCm, vw = bb.x1 - bb.x0 + 2 * padCm, vh = bb.z1 - bb.z0 + 2 * padCm;
    // si l'estimation était trop juste, on passe à l'échelle suivante en gardant la proportion exacte
    let wmm = (vw * 10) / scale, hmm = (vh * 10) / scale;
    if (wmm > B.AREA_W + 0.5 || hmm > B.AREA_H + 0.5) {
      const f = Math.min(B.AREA_W / wmm, B.AREA_H / hmm);
      wmm *= f; hmm *= f;
      scale = Math.round(scale / f);
      sb[sb.length - 1] = sb[sb.length - 1].replace(/Échelle 1:\d+/, `Échelle ≈ 1:${scale}`);
    }

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vx.toFixed(1)} ${vz.toFixed(1)} ${vw.toFixed(1)} ${vh.toFixed(1)}" width="${wmm.toFixed(2)}mm" height="${hmm.toFixed(2)}mm" data-scale="${scale}">
<style>
  .floor { fill:#faf8f3; stroke:none; } .floor.bath { fill:#f2f5f6; }
  .terrace { fill:#f1efea; stroke:#b9b3a7; stroke-width:${(0.2 * u).toFixed(2)}; stroke-dasharray:${2 * u} ${1.2 * u}; }
  .wall { fill:#3b3d40; stroke:#3b3d40; stroke-width:0.6; stroke-linejoin:round; }
  .frame { fill:#fff; stroke:#3b3d40; stroke-width:${(0.18 * u).toFixed(2)}; }
  .glass { stroke:#4b86a8; stroke-width:${(0.3 * u).toFixed(2)}; }
  .swing { fill:none; stroke:#6f6a60; stroke-width:${(0.15 * u).toFixed(2)}; stroke-dasharray:${1.2 * u} ${0.8 * u}; }
  .leaf { stroke:#3b3d40; stroke-width:${(0.55 * u).toFixed(2)}; stroke-linecap:butt; } .leafwin { stroke:#4b86a8; }
  .fixed { fill:#e9e6df; stroke:#8d877b; stroke-width:${(0.18 * u).toFixed(2)}; } .fixed.pillar { fill:#cfcac0; } .fixed.radiator { fill:#d9d4ca; }
  .fixed.shower { fill:#e4edf1; }
  .furn { fill:rgba(255,255,255,.93); stroke:#1f5f5b; stroke-width:${(0.3 * u).toFixed(2)}; stroke-linejoin:round; }
  .furn.ontop { stroke-dasharray:${1 * u} ${0.6 * u}; fill:rgba(255,255,255,.7); }
  .furn.bad { stroke:#c2402f; fill:rgba(251,234,230,.9); }
  text { font-family:Inter, "Segoe UI", Arial, sans-serif; text-anchor:middle; dominant-baseline:central; }
  .dim, .extl, .tick { stroke:#2a5db0; stroke-width:${(0.15 * u).toFixed(2)}; } .tick { stroke-width:${(0.25 * u).toFixed(2)}; }
  .dimtxt { font-size:${fs.dim.toFixed(1)}px; fill:#1d3f7a; font-weight:600; } .dimtxt.strong { font-weight:700; }
  .fixtxt { fill:#6f6a60; }
  .furntxt { fill:#1f2328; paint-order:stroke; stroke:rgba(255,255,255,.9); stroke-width:${(0.5 * u).toFixed(2)}; stroke-linejoin:round; } .furntxt .l1 { font-weight:600; } .furntxt .l2 { fill:#6f6a60; font-size:0.88em; }
  .badge { fill:#1f5f5b; } .badgetxt { fill:#fff; font-weight:700; }
  .room { fill:#a39d92; font-weight:600; letter-spacing:.06em; text-transform:uppercase; }
  .sbb { fill:#1f2328; stroke:#1f2328; stroke-width:${(0.15 * u).toFixed(2)}; } .sbw { fill:#fff; stroke:#1f2328; stroke-width:${(0.15 * u).toFixed(2)}; }
  .sbtxt { fill:#1f2328; } .sbtxt.left { text-anchor:start; font-weight:600; }
  .elec circle { fill:#fff8e1; stroke:#b7791f; stroke-width:${(0.18 * u).toFixed(2)}; } .elec text { fill:#8a5a12; font-weight:700; }
</style>
<g>${layers.floor.join('')}</g><g>${layers.terrace.join('')}</g><g>${layers.open.filter((s) => s.includes('swing')).join('')}</g>
<g>${layers.fixed.join('')}</g><g>${layers.furn.join('')}</g><g>${layers.walls.join('')}</g>
<g>${layers.open.filter((s) => !s.includes('swing')).join('')}</g>
<g>${elec.join('')}</g><g>${layers.labels.join('')}</g><g>${furnLabels.join('')}</g><g>${layers.dims.join('')}</g><g>${sb.join('')}</g>
</svg>`;

    // -------- liste des meubles
    const n = items.length;
    const rowMm = Math.max(3.2, Math.min(5.6, 150 / Math.max(1, n + 1)));
    const rows = items.map((it, k) => `<tr${it._bad ? ' class="bad"' : ''}><td class="n">${k + 1}</td><td>${esc(it.name)}${it._bad ? ' <em>(ne rentre pas)</em>' : ''}</td><td class="d">${r0(it.w)} × ${r0(it.d)} × ${r0(it.h)}</td></tr>`).join('');
    items.forEach((it) => delete it._bad);
    const name = scenName(), area = ($('area') && $('area').textContent) || '';
    const title = `Plan T1 Anglet - ${name} - ${stamp().slice(0, 10)}`;

    return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
  @page { size:A4 landscape; margin:10mm; }
  * { box-sizing:border-box; }
  html, body { margin:0; font:13px/1.4 Inter, "Segoe UI", Arial, sans-serif; color:#1f2328; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  body { background:#e9e6df; }
  .bar { position:sticky; top:0; z-index:2; display:flex; gap:12px; align-items:center; justify-content:center; flex-wrap:wrap; padding:10px 16px; background:#fbfaf7; border-bottom:1px solid #e3dfd6; }
  .bar button { font:inherit; font-weight:600; cursor:pointer; border:1px solid #1f5f5b; background:#1f5f5b; color:#fff; border-radius:8px; padding:7px 14px; }
  .bar button:hover { background:#184d4a; }
  .bar span { color:#6f6a60; font-size:12px; max-width:620px; }
  .sheet { width:297mm; height:210mm; padding:10mm; margin:16px auto; background:#fff; box-shadow:0 2px 14px rgba(30,25,15,.15); overflow:hidden; }
  .page { width:277mm; height:190mm; display:flex; flex-direction:column; overflow:hidden; }
  .head { display:flex; align-items:baseline; justify-content:space-between; gap:12px; border-bottom:0.4mm solid #1f5f5b; padding-bottom:1.6mm; margin-bottom:2.5mm; height:12mm; }
  .head h1 { margin:0; font-size:5mm; font-weight:700; letter-spacing:-.01em; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .head .meta { color:#6f6a60; font-size:2.9mm; text-align:right; white-space:nowrap; }
  .body { flex:1; display:flex; gap:5mm; min-height:0; }
  .plan { width:${B.AREA_W}mm; height:${B.AREA_H}mm; display:flex; align-items:center; justify-content:center; flex:none; }
  .plan svg { display:block; }
  .side { flex:1; min-width:0; display:flex; flex-direction:column; font-size:${(rowMm * 0.58).toFixed(2)}mm; }
  .side h2 { margin:0 0 1.5mm; font-size:3.2mm; text-transform:uppercase; letter-spacing:.07em; color:#6f6a60; }
  table { width:100%; border-collapse:collapse; }
  td { padding:0 1mm; height:${rowMm.toFixed(2)}mm; border-bottom:0.2mm solid #e3dfd6; vertical-align:middle; }
  td.n { width:6mm; color:#1f5f5b; font-weight:700; text-align:right; padding-right:1.5mm; }
  td.d { white-space:nowrap; text-align:right; font-variant-numeric:tabular-nums; color:#3b3d40; }
  tr.bad td { color:#c2402f; } tr.bad em { font-style:normal; font-size:.9em; }
  .note { margin-top:auto; padding-top:2mm; color:#6f6a60; font-size:2.5mm; line-height:1.4; }
  .note b { color:#1f2328; }
  .key { display:inline-block; width:3mm; height:2mm; border:0.3mm solid #1f5f5b; vertical-align:-0.2mm; margin-right:1mm; }
  .key.bad { border-color:#c2402f; background:#fbeae6; } .key.fix { border-color:#8d877b; background:#e9e6df; border-width:0.2mm; }
  @media print {
    body { background:none; }
    .bar { display:none; }
    .sheet { width:auto; height:auto; padding:0; margin:0; box-shadow:none; }
  }
</style></head>
<body>
<div class="bar"><button type="button" onclick="window.print()">Imprimer / Enregistrer en PDF</button>
<span>Dans la fenêtre d'impression : choisir « Enregistrer au format PDF » (ou ton imprimante), A4 paysage, échelle 100 % / taille réelle pour garder l'échelle du plan.</span></div>
<div class="sheet"><div class="page">
  <div class="head"><h1>${esc(name)}</h1><div class="meta">T1 n°15 · Anglet${area ? ' · ' + esc(area) : ''}<br>Plan du ${dateFr()} · échelle 1:${scale} (A4, impression à 100 %)</div></div>
  <div class="body">
    <div class="plan">${svg}</div>
    <div class="side">
      <h2>Meubles (${n})</h2>
      ${n ? `<table><tbody>${rows}</tbody></table>` : '<p>Aucun meuble dans ce scénario.</p>'}
      <div class="note"><b>Dimensions</b> en cm : largeur × profondeur × hauteur. <b>Cotes des murs</b> en mètres, mesurées sur les faces intérieures.<br>
      <span class="key"></span>meuble · <span class="key bad"></span>dépasse d'un mur ou en chevauche un autre · <span class="key fix"></span>élément fixe<br>
      Arcs pointillés : débattement des portes.${elecLegend ? `<br><b>Électricité</b> : ${esc(elecLegend)}` : ''}</div>
    </div>
  </div>
</div></div>
</body></html>`;
  }

  function bbox(pts) {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    pts.forEach(([x, z]) => { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); });
    return { x0, z0, x1, z1 };
  }

  function openPlan() {
    let html;
    try { html = planDocument(); } catch (e) { console.error(e); toast('Impossible de générer le plan.'); return; }
    const w = window.open('', '_blank');
    if (!w) { toast("La fenêtre du plan a été bloquée par le navigateur : autorise les fenêtres surgissantes pour cette page."); return; }
    w.document.open();
    w.document.write(html);
    w.document.close();
    try { w.focus(); } catch (e) {}
  }

  // ------------------------------------------------------------------ 3. lien de visite (lecture seule)
  function visitLink() {
    const link = SCEN.shareLink();
    const hash = link.slice(link.indexOf('#'));
    const base = link.split('#')[0];
    const q = base.indexOf('?');
    const path = q < 0 ? base : base.slice(0, q);
    const params = (q < 0 ? '' : base.slice(q + 1)).split('&').filter((p) => p && !/^view(=|$)/.test(p));
    return path + '?' + ['view'].concat(params).join('&') + hash;
  }
  async function copyVisit() {
    if (typeof SCEN.shareLink !== 'function') { toast('Lien indisponible pour le moment.'); return; }
    const link = visitLink();
    let ok = false;
    try { await navigator.clipboard.writeText(link); ok = true; } catch (e) {}
    const box = $('x-visit-box');
    box.hidden = false;
    box.value = link;
    box.focus();
    box.select();
    if (!ok) { try { ok = document.execCommand('copy'); } catch (e) {} }
    const local = location.protocol === 'file:';
    toast((ok ? 'Lien de visite copié. ' : 'Copie le lien de visite ci-dessous. ') +
      (local ? "Attention : tant que le site n'est pas en ligne, ce lien ne marche que sur ce PC." : "La personne qui l'ouvre voit ce scénario sans pouvoir le modifier."));
  }

  // ------------------------------------------------------------------ interface (mode normal)
  const slot = $('export-slot');
  if (slot) {
    slot.innerHTML = `
      <div class="x-title">Image, plan et visite</div>
      <div class="btns">
        <button id="x-png" title="Télécharge une image PNG de la vue 3D actuelle">📷 Image de la vue</button>
        <button id="x-plan" title="Plan 2D à l'échelle, à imprimer ou enregistrer en PDF (A4 paysage)">🖨 Plan 2D / PDF</button>
        <button id="x-visit" class="x-wide" title="Lien qui ouvre ce scénario en visite, sans pouvoir le modifier">🔗 Lien de visite (lecture seule)</button>
      </div>
      <input id="x-visit-box" type="text" readonly hidden aria-label="Lien de visite">
      <div class="legend">Le lien de visite montre le scénario tel quel (vues, marche, rendu réaliste), sans rien modifier ni enregistrer chez la personne.${location.protocol === 'file:' ? " Tant que le site n'est pas en ligne, il ne marche que sur ce PC." : ''}</div>`;
    $('x-png').onclick = savePng;
    $('x-plan').onclick = openPlan;
    $('x-visit').onclick = copyVisit;
  }

  // ------------------------------------------------------------------ 4. mode visite
  if (viewOnly) {
    const header = document.querySelector('header');
    // conteneurs de l'interface d'édition sans id propre : marqués pour le CSS du mode visite (pas de :has)
    [$('btn-undo') && $('btn-undo').closest('.toolbar'), $('snap') && $('snap').closest('label')]
      .forEach((n) => n && n.classList.add('x-edit-only'));
    const name = scenName();
    document.title = `Visite · ${name} · T1 Anglet`;

    const banner = document.createElement('div');
    banner.id = 'visit-banner';
    banner.title = 'Ce scénario est affiché en lecture seule : rien ne peut être modifié ni enregistré.';
    const txt = document.createElement('span');
    txt.textContent = `Visite · ${name} · lecture seule`;
    banner.appendChild(txt);
    const sep = header && header.querySelector('.sep');
    if (sep) sep.after(banner); else if (header) header.appendChild(banner);

    // image et plan restent utiles au visiteur (rien n'est modifié)
    const tools = document.createElement('div');
    tools.id = 'visit-tools';
    tools.className = 'toolbar';
    tools.innerHTML = `<button id="v-png" class="icon" title="Télécharger une image de la vue">📷 <span class="hide-md">Image</span></button>
      <button id="v-plan" class="icon" title="Plan 2D à imprimer ou enregistrer en PDF">🖨 <span class="hide-md">Plan</span></button>`;
    const walkBtn = $('btn-walk');
    if (walkBtn && walkBtn.parentNode) walkBtn.parentNode.after(tools); else if (header) header.appendChild(tools);
    $('v-png').onclick = savePng;
    $('v-plan').onclick = openPlan;

    const legend = document.createElement('div');
    legend.id = 'visit-legend';
    legend.className = 'bubble';
    const coarse = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
    legend.innerHTML = coarse
      ? '<b>1 doigt</b> : tourner · <b>2 doigts</b> : zoomer / déplacer<br>' +
        'Vue <b>Dessus</b> : 1 doigt pour faire défiler · <b>🚶</b> : visiter à hauteur d\'yeux (joystick)'
      : '<b>Glisser</b> : tourner · <b>Clic droit + glisser</b> : déplacer · <b>Molette</b> : zoomer<br>' +
        'Vue <b>Dessus</b> : glisser pour faire défiler · <b>🚶 Marcher</b> : visiter à hauteur d\'yeux (Z Q S D)';
    const view = $('view');
    if (view) view.appendChild(legend);
    // écran tactile : la légende couvre une partie de la vue → elle se referme d'un toucher, ou seule après 20 s
    let dismissed = false;
    if (coarse) {
      legend.title = 'Toucher pour masquer';
      const hide = () => { dismissed = true; legend.hidden = true; };
      legend.addEventListener('click', hide);
      setTimeout(hide, 20000);
    }
    // pendant la marche, la bulle d'aide de la marche remplace la légende
    let walking = null;
    app.hooks.frame.push(() => {
      const w = !!(app.isWalking && app.isWalking());
      if (w !== walking) { walking = w; legend.hidden = w || dismissed; }
    });
  }

  window.__export = { savePng, openPlan, planDocument, visitLink, grabView };
})();
