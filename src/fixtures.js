/*
 * fixtures.js — carte « Cuisine et salle d'eau » (#fixtures-card) : saisir les vraies cotes de la cuisine et de la
 * salle d'eau. Les cotes (APT.fixes, valeurs par défaut APT.fixesDefaults) sont validées par APT.cleanFixes
 * (apartment.js), communes à tous les scénarios et enregistrées dans localStorage (clé APT.FIXES_KEY), sauf en mode visite.
 * Chaque modification refait les éléments fixes en 3D sans recharger (__app.rebuildFixed → hook fixed).
 * API : window.__fixtures = { data(), setData(obj) } (utilisée par l'export / import JSON de scenarios.js).
 */
(function () {
  'use strict';
  const app = window.__app;
  if (!app || !window.APT || !APT.applyFixes) return;
  const visit = !!app.readOnly || !!(window.SCEN && SCEN.viewOnly); // mode visite : rien n'est lu ni écrit
  const $ = (id) => document.getElementById(id);
  let renderUI = () => {}; // remplacé par render() quand la carte existe

  function store() {
    if (visit) return;
    try { localStorage.setItem(APT.FIXES_KEY, JSON.stringify(APT.fixes)); } catch (e) {}
  }
  function apply(obj, save) {
    APT.applyFixes(obj);
    if (save) store();
    app.rebuildFixed();
    renderUI();
    return data();
  }
  const data = () => Object.assign({}, APT.fixes);
  window.__fixtures = {
    data,
    // remplace toutes les cotes (champs manquants = valeurs de départ), enregistre (sauf visite) et reconstruit
    setData: (obj) => apply(obj, true),
  };

  // ------------------------------------------------------------------ interface
  // le lien emporte les cotes modifiées ; la visite les applique (sans rien enregistrer)
  if (window.SCEN && SCEN.shareExtras) SCEN.shareExtras.push(() => {
    const f = {}, D = APT.fixesDefaults;
    Object.keys(APT.fixes).forEach((k) => { if (APT.fixes[k] !== D[k]) f[k] = APT.fixes[k]; });
    return Object.keys(f).length ? { f } : {};
  });
  const sp = visit && window.SCEN && SCEN.sharedPayload;
  if (sp && sp.f && typeof sp.f === 'object' && !Array.isArray(sp.f)) apply(Object.assign({}, APT.fixesDefaults, sp.f), false);

  const card = $('fixtures-card');
  if (!card) return;
  if (visit) { card.hidden = true; return; }

  const st = document.createElement('style');
  st.textContent = `
  #fixtures-card > details > summary { cursor:pointer; list-style:none; display:flex; justify-content:space-between; align-items:center; }
  #fixtures-card > details > summary::-webkit-details-marker { display:none; }
  #fixtures-card > details > summary h3::after { content:" ›"; display:inline-block; margin-left:4px; transition:transform .15s; }
  #fixtures-card > details[open] > summary h3::after { transform:rotate(90deg); }
  #fixtures-card .fx-intro { margin:8px 0 2px; }
  #fixtures-card h4 { margin:14px 0 6px; }
  #fixtures-card .fx-grid { display:grid; grid-template-columns:1fr 1fr; gap:7px 8px; }
  #fixtures-card .fx-grid label.field { justify-content:space-between; }
  #fixtures-card .fx-grid .fx-in { display:flex; align-items:center; gap:4px; }
  #fixtures-card .fx-grid .fx-in input { padding:5px 7px; }
  #fixtures-card .fx-grid .fx-in span { font-size:11px; color:var(--mute); }
  #fixtures-card .fx-info { font-size:12px; color:var(--mute); margin-top:6px; }
  #fixtures-card .fx-note { font-size:12px; color:#a0522d; margin-top:8px; }
  #fixtures-card .fx-note:empty { display:none; }
  `;
  document.head.appendChild(st);

  // champs : clé dans APT.fixes, libellé ; off : valeur affichée = valeur stockée − off
  const GROUPS = [
    { title: 'Cuisine — mur de l’évier', hint: 'Gauche / droite : vu face au mur.', fields: [
      ['wLen', 'Longueur du plan (depuis la gaine)'],
      ['sinkW', 'Largeur de l’évier + égouttoir'],
      ['sinkCab', 'Largeur du placard sous l’évier'],
      ['colW', 'Largeur de la colonne du chauffe-eau'],
    ], info: (K) => `Emplacement lave-vaisselle : ${fmt(K.west.dwSlot[1] - K.west.dwSlot[0])} cm` + (K.west.z0 - K.column.z1 > 0.05 ? ` · vide entre la colonne et le plan : ${fmt(K.west.z0 - K.column.z1)} cm` : '') },
    { title: 'Cuisine — mur du frigo', fields: [
      ['eLen', 'Longueur du plan côté frigo'],
      ['eCab', 'Largeur du placard sous les plaques'],
      ['hobW', 'Largeur des plaques'],
      ['upY', 'Bas des placards hauts (depuis le sol)'],
      ['upH', 'Hauteur des placards hauts'],
      ['upD', 'Profondeur des placards hauts'],
    ], info: (K) => `Place du frigo : ${fmt(K.east.open[1] - K.east.open[0])} cm` },
    { title: 'Cuisine — les deux côtés', fields: [
      ['kDepth', 'Profondeur des meubles bas'],
      ['kTop', 'Hauteur du plan de travail'],
    ] },
    { title: 'Salle d’eau', hint: 'Gauche / droite : vu depuis la porte, en entrant.', fields: [
      ['shL', 'Douche : longueur le long du mur de gauche'],
      ['shW', 'Douche : largeur le long du mur du fond'],
      ['shWall', 'Épaisseur de la cloison de douche'],
      ['wcAxis', 'Axe des WC depuis le mur de droite'],
      ['stepD', 'Profondeur de la marche'],
      ['stepH', 'Hauteur de la marche'],
      ['vanD', 'Profondeur du meuble vasque'],
      ['vanTop', 'Hauteur du plan vasque'],
      ['vanY', 'Bas du meuble vasque (depuis le sol)'],
      ['mirY0', 'Bas du miroir (depuis le sol)'],
      ['mirY1', 'Haut du miroir (depuis le sol)'],
      ['towelT', 'Sèche-serviettes : écart avec la porte', 88],
      ['towelW', 'Largeur du sèche-serviettes'],
      ['towelH', 'Hauteur du sèche-serviettes'],
      ['towelY', 'Bas du sèche-serviettes (depuis le sol)'],
    ], info: () => { const V = APT.bathLayout.vanity; return `Largeur du meuble vasque (de la cloison au mur de la porte) : ${fmt(V.s1 - V.s0)} cm`; } },
  ];
  const fmt = (v) => String(Math.round(v * 10) / 10).replace('.', ',');
  const OFF = {}, LABEL = {};

  card.innerHTML = `<details id="fx-details"><summary><h3>Cuisine et salle d'eau</h3><span class="pill">cotes</span></summary>
    <p class="legend fx-intro">Saisis tes mesures en cm : la 3D, les collisions, les passages et le plan suivent. Communes à tous les scénarios.</p>
    ${GROUPS.map((g, gi) => `<h4>${g.title}</h4>${g.hint ? `<div class="legend">${g.hint}</div>` : ''}
      <div class="fx-grid">${g.fields.map(([k, label, off]) => {
        OFF[k] = off || 0; LABEL[k] = label;
        return `<label class="field">${label}<span class="fx-in"><input type="number" step="0.5" inputmode="decimal" data-k="${k}"><span>cm</span></span></label>`;
      }).join('')}</div>${g.info ? `<div class="fx-info" id="fx-info-${gi}"></div>` : ''}`).join('')}
    <div class="fx-note" id="fx-note" role="status"></div>
    <div class="btns"><button id="fx-reset" title="Remet toutes les cotes de la cuisine et de la salle d'eau aux valeurs d'origine">Valeurs de départ</button></div>
  </details>`;

  const inputs = Array.from(card.querySelectorAll('input[data-k]'));
  function render() {
    const F = APT.fixes;
    inputs.forEach((i) => { i.value = String(Math.round((F[i.dataset.k] - OFF[i.dataset.k]) * 10) / 10); });
    GROUPS.forEach((g, gi) => { const el = $('fx-info-' + gi); if (el && g.info) el.textContent = g.info(APT.kitchen); });
  }
  inputs.forEach((inp) => {
    inp.addEventListener('change', () => {
      const k = inp.dataset.k, v = parseFloat(String(inp.value).replace(',', '.'));
      if (!isFinite(v)) { render(); return; }
      const want = v + OFF[k];
      if (Math.abs(want - APT.fixes[k]) < 0.05) { render(); return; } // rien de changé
      const next = Object.assign({}, APT.fixes, { [k]: want });
      const before = data();
      apply(next, true);
      // valeurs ramenées dans les bornes : on le dit (la cote saisie et celles qu'elle a obligé à changer)
      const notes = [];
      if (Math.abs(APT.fixes[k] - want) > 0.05) notes.push(`« ${LABEL[k]} » ramenée à ${fmt(APT.fixes[k] - OFF[k])} cm`);
      Object.keys(APT.fixes).forEach((o) => { if (o !== k && Math.abs(APT.fixes[o] - before[o]) > 0.05) notes.push(`« ${LABEL[o]} » ajustée à ${fmt(APT.fixes[o] - OFF[o])} cm`); });
      $('fx-note').textContent = notes.length ? notes.join(' · ') + ' (pour rester cohérent).' : '';
    });
  });
  $('fx-reset').addEventListener('click', () => {
    APT.applyFixes(null);
    try { localStorage.removeItem(APT.FIXES_KEY); } catch (e) {}
    app.rebuildFixed();
    render();
    $('fx-note').textContent = 'Cotes de départ remises.';
  });
  renderUI = render;
  render();
})();
