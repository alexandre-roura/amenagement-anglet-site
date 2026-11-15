/*
 * budget.js — budget et liste de courses.
 * - prix indicatifs par type de meuble (meta.price prime), "déjà à moi" (meta.owned prime), lien (meta.url)
 * - bloc #sel-budget dans le panneau Sélection (onglet « Pièce » sur téléphone), carte #budget-card (totaux, liste à acheter, copie, comparaison des scénarios)
 */
(function () {
  'use strict';
  const app = window.__app;
  const card = document.getElementById('budget-card');
  const extra = document.getElementById('sel-extra');
  if (!app || !card) return;

  // ------------------------------------------------------------------ prix indicatifs (€, gamme IKEA / entrée de gamme)
  const PRICES = {
    bed1: 149, // lit 90×200 + sommier à lattes
    bed2: 249, // lit 140×200 + sommier
    loftbed: 199, // lit mezzanine 1 place
    nightstand: 25,
    clothesrack: 20,
    wardrobe: 99, // armoire 2 portes type KLEPPSTAD
    bookshelf: 35,
    dresser: 79,
    kallax: 39.99, // prix vu sur l'étiquette
    kallaxmanga: 39.99, // le meuble seul (les mangas ne sont pas comptés)
    column: 49,
    shoebench: 39,
    deskpc: 1200, // bureau + tour + 2 écrans (valeur estimée)
    desk: 59,
    gamingchair: 149,
    pedestal: 59,
    table: 79,
    chair: 35,
    armchair: 99, // type POÄNG
    sofa: 299,
    coffeetable: 29.99,
    tvstand: 69,
    pouf: 29,
    plant: 35,
    mirror: 49,
    lampfloor: 39,
    lampdesk: 19,
    lampbedside: 19.99,
  };
  const OWNED_DEFAULT = new Set(['bed1', 'deskpc', 'table', 'armchair', 'kallaxmanga']);

  const hasPrice = (m) => m && typeof m.price === 'number' && isFinite(m.price) && m.price >= 0;
  function priceOf(o) {
    const m = o.meta || {};
    if (hasPrice(m)) return { v: m.price, set: true };
    const p = PRICES[o.type];
    return p != null ? { v: p, set: false, def: true } : { v: 0, set: false, def: false };
  }
  const isOwned = (o) => (o.meta && typeof o.meta.owned === 'boolean' ? o.meta.owned : OWNED_DEFAULT.has(o.type));
  function safeUrl(u) {
    if (typeof u !== 'string' || !u.trim()) return null;
    try {
      const x = new URL(u.trim());
      return x.protocol === 'http:' || x.protocol === 'https:' ? x.href : null;
    } catch (e) { return null; }
  }
  const fmtEur = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const eur = (v) => fmtEur.format(v).replace(/ /g, ' ');
  const nameOf = (o) => o.name || (o.meta && o.meta.name) || (window.FURN && FURN.byId[o.type] && FURN.byId[o.type].name) || 'Meuble';
  const dims = (o) => `${Math.round(o.w)} × ${Math.round(o.d)} × ${Math.round(o.h)} cm`;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function totals(list) {
    let buy = 0, own = 0, nBuy = 0, nOwn = 0, missing = 0;
    list.forEach((o) => {
      const p = priceOf(o);
      if (isOwned(o)) { own += p.v; nOwn++; }
      else { buy += p.v; nBuy++; if (!p.set && !p.def) missing++; }
    });
    return { buy, own, nBuy, nOwn, missing };
  }

  // ------------------------------------------------------------------ style
  const css = document.createElement('style');
  css.textContent = `
  #budget-card .bud-total { display:flex; justify-content:space-between; align-items:baseline; gap:8px; padding:8px 10px; background:var(--accent-soft); border-radius:8px; }
  #budget-card .bud-total span { font-size:12px; color:var(--accent); font-weight:600; }
  #budget-card .bud-total strong { font-size:20px; color:var(--accent); font-weight:700; font-variant-numeric:tabular-nums; letter-spacing:-.01em; }
  #budget-card .bud-sub { display:flex; justify-content:space-between; margin-top:6px; font-variant-numeric:tabular-nums; }
  #budget-card .bud-warn { color:var(--bad); font-size:12px; margin-top:4px; }
  #budget-card ul.bud-list { list-style:none; margin:8px 0 0; padding:0; max-height:240px; overflow:auto; }
  #budget-card ul.bud-list li { display:flex; align-items:center; gap:6px; padding:5px 6px; border-radius:6px; font-size:12.5px; border-top:1px solid var(--line); }
  #budget-card ul.bud-list li:first-child { border-top:none; }
  #budget-card ul.bud-list li.click { cursor:pointer; }
  #budget-card ul.bud-list li.click:hover { background:var(--soft); }
  #budget-card ul.bud-list li.sel { background:var(--accent-soft); }
  #budget-card ul.bud-list li .n { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  #budget-card ul.bud-list li .p { font-variant-numeric:tabular-nums; white-space:nowrap; }
  #budget-card ul.bud-list li .p.def { color:var(--mute); }
  #budget-card ul.bud-list li .p.none { color:var(--bad); font-size:11.5px; }
  #budget-card ul.bud-list li.empty { color:var(--mute); cursor:default; border:none; }
  .bud-link { display:inline-flex; align-items:center; justify-content:center; width:20px; height:20px; border-radius:5px; color:var(--accent); text-decoration:none; font-size:12px; flex:none; }
  .bud-link:hover { background:var(--accent-soft); }
  #budget-card .bud-copybox { width:100%; margin-top:8px; font:12px/1.4 ui-monospace, Consolas, monospace; height:120px; resize:vertical; border:1px solid var(--line-strong); border-radius:8px; padding:6px; }
  #budget-card .bud-scen { margin:0; padding:0; list-style:none; }
  #budget-card .bud-scen li { font-size:12px; padding:3px 0; color:var(--mute); }
  #budget-card .bud-scen li .t { display:flex; justify-content:space-between; gap:8px; }
  #budget-card .bud-scen li .t span:first-child { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0; }
  #budget-card .bud-scen li .t span:last-child { font-variant-numeric:tabular-nums; white-space:nowrap; }
  #budget-card .bud-scen li .bar { height:4px; background:var(--soft); border-radius:99px; margin-top:3px; overflow:hidden; }
  #budget-card .bud-scen li .bar i { display:block; height:100%; background:var(--line-strong); border-radius:99px; }
  #budget-card .bud-scen li.cur { color:var(--ink); font-weight:600; }
  #budget-card .bud-scen li.cur .bar i { background:var(--accent); }
  #sel-budget { margin-top:4px; }
  #sel-budget .bud-row { display:grid; grid-template-columns:1fr auto; gap:8px; align-items:end; }
  #sel-budget label.f { display:flex; flex-direction:column; font-size:11.5px; color:var(--mute); gap:3px; }
  #sel-budget input[type=number] { padding:6px 7px; font-variant-numeric:tabular-nums; }
  #sel-budget input[type=text] { padding:6px 7px; font-size:12.5px; }
  #sel-budget .switch { padding-bottom:7px; }
  #sel-budget .bud-url { display:flex; gap:6px; align-items:center; margin-top:8px; }
  #sel-budget .bud-url input { flex:1; min-width:0; }
  #sel-budget .bud-url .bud-link { width:30px; height:30px; border:1px solid var(--line-strong); border-radius:8px; }
  #sel-budget .bud-url .bud-link.off { color:var(--line-strong); pointer-events:none; }
  #sel-budget .legend { margin-top:4px; }
  `;
  document.head.appendChild(css);

  // ------------------------------------------------------------------ carte Budget
  card.innerHTML = `
    <div class="card-head"><h3>Budget</h3><span class="pill" id="bud-count"></span></div>
    <div class="bud-total"><span>À acheter</span><strong id="bud-buy"></strong></div>
    <div class="bud-sub legend"><span>Déjà à moi</span><span id="bud-own"></span></div>
    <div class="bud-warn" id="bud-missing" hidden></div>
    <ul class="bud-list" id="bud-list"></ul>
    <div class="btns fill"><button id="bud-copy" title="Copier la liste des achats (texte) dans le presse-papiers">Copier la liste</button></div>
    <textarea class="bud-copybox" id="bud-copybox" readonly hidden aria-label="Liste de courses"></textarea>
    <div id="bud-scen-wrap" hidden>
      <div class="group-label">À acheter par scénario</div>
      <ul class="bud-scen" id="bud-scen"></ul>
    </div>
    <div class="legend" style="margin-top:8px" id="bud-legend"></div>`;
  const $ = (id) => document.getElementById(id);
  // aides adaptées : sur téléphone (≤ 900 px, mobile.js) le panneau Sélection est l'onglet « Pièce » ; au doigt, pas de Ctrl+C
  const mq = (q) => !!(window.matchMedia && matchMedia(q).matches);
  const isTouch = () => mq('(pointer: coarse)');
  const NARROW = '(max-width: 900px)';
  function renderLegend() {
    $('bud-legend').textContent = app.readOnly ? 'Prix en gris : indicatifs.'
      : 'Prix en gris : indicatifs. Saisis le vrai prix ' + (mq(NARROW) ? 'dans l’onglet Pièce (meuble sélectionné).' : 'dans le panneau Sélection.');
  }
  renderLegend();
  if (window.matchMedia) { const m = matchMedia(NARROW); if (m.addEventListener) m.addEventListener('change', renderLegend); else if (m.addListener) m.addListener(renderLegend); }

  function scenData() {
    try {
      const d = window.SCEN && SCEN._debug ? SCEN._debug().db : null;
      return d && Array.isArray(d.scenarios) ? d : null;
    } catch (e) { return null; }
  }

  let lastSig = '';
  function renderCard(force) {
    const items = app.items;
    const sel = app.getSelected();
    const ro = !!app.readOnly;
    const t = totals(items);
    const db = scenData();
    const scen = db ? db.scenarios.map((s) => ({ id: s.id, name: s.name, buy: s.id === db.current ? t.buy : totals(s.items || []).buy, cur: s.id === db.current })) : [];
    const sig = JSON.stringify([ro, sel ? sel.id : 0, scen, items.map((o) => [o.id, o.type, o.name, Math.round(o.w), Math.round(o.d), Math.round(o.h), o.meta && o.meta.price, o.meta && o.meta.url, o.meta && o.meta.owned])]);
    if (!force && sig === lastSig) return;
    lastSig = sig;

    $('bud-count').textContent = `${t.nBuy} à acheter`;
    $('bud-buy').textContent = eur(t.buy);
    $('bud-own').textContent = `${eur(t.own)} · ${t.nOwn} article${t.nOwn > 1 ? 's' : ''}`;
    $('bud-missing').hidden = !t.missing;
    $('bud-missing').textContent = t.missing ? `${t.missing} article${t.missing > 1 ? 's' : ''} sans prix (à renseigner)` : '';

    const ul = $('bud-list');
    ul.innerHTML = '';
    const buy = items.filter((o) => !isOwned(o));
    if (!buy.length) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = items.length ? 'Rien à acheter : tout est déjà à toi.' : 'Aucun meuble dans la pièce.';
      ul.appendChild(li);
    }
    buy.forEach((o) => {
      const p = priceOf(o);
      const url = safeUrl(o.meta && o.meta.url);
      const li = document.createElement('li');
      li.className = (ro ? '' : 'click') + (o === sel ? ' sel' : '');
      const pCls = p.set ? '' : p.def ? 'def' : 'none';
      const pTxt = p.set || p.def ? eur(p.v) : 'prix à renseigner';
      li.innerHTML = `<span class="n" title="${esc(nameOf(o) + ' — ' + dims(o))}">${esc(nameOf(o))}</span>` +
        `<span class="p ${pCls}" title="${p.set ? 'Prix saisi' : p.def ? 'Prix indicatif' : ''}">${pTxt}</span>` +
        (url ? `<a class="bud-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer" title="Ouvrir le lien">↗</a>` : '<span class="bud-link"></span>');
      if (!ro) li.addEventListener('click', (e) => { if (e.target.closest('a')) return; app.select(o); });
      ul.appendChild(li);
    });

    const wrap = $('bud-scen-wrap');
    wrap.hidden = scen.length < 2;
    if (scen.length >= 2) {
      const max = Math.max(1, ...scen.map((s) => s.buy));
      $('bud-scen').innerHTML = scen.map((s) =>
        `<li class="${s.cur ? 'cur' : ''}"><div class="t"><span title="${esc(s.name)}">${esc(s.name)}</span><span>${eur(s.buy)}</span></div>` +
        `<div class="bar"><i style="width:${((s.buy / max) * 100).toFixed(1)}%"></i></div></li>`).join('');
    }
  }

  // ------------------------------------------------------------------ copie de la liste
  function listText() {
    const items = app.items.filter((o) => !isOwned(o));
    const db = scenData();
    const cur = db && db.scenarios.find((s) => s.id === db.current);
    const lines = [`Liste de courses${cur ? ' — ' + cur.name : ''}`, ''];
    // regroupe les articles identiques (ex. plusieurs chaises)
    const groups = [];
    items.forEach((o) => {
      const p = priceOf(o), url = safeUrl(o.meta && o.meta.url) || '';
      const key = [nameOf(o), dims(o), p.v, p.set || p.def, url].join('|');
      const g = groups.find((x) => x.key === key);
      if (g) g.n++; else groups.push({ key, o, p, url, n: 1 });
    });
    groups.forEach(({ o, p, url, n }) => {
      const price = p.set || p.def ? eur(p.v * n) + (n > 1 ? ` (${eur(p.v)} pièce)` : '') + (p.set ? '' : ' (indicatif)') : 'prix à renseigner';
      lines.push(`- ${n > 1 ? n + ' × ' : ''}${nameOf(o)} (${dims(o)}) : ${price}${url ? '\n  ' + url : ''}`);
    });
    if (!items.length) lines.push('(rien à acheter)');
    const t = totals(app.items);
    lines.push('', `Total à acheter : ${eur(t.buy)} (${t.nBuy} article${t.nBuy > 1 ? 's' : ''})`);
    if (t.missing) lines.push(`${t.missing} article${t.missing > 1 ? 's' : ''} sans prix, non compté${t.missing > 1 ? 's' : ''}.`);
    return lines.join('\n');
  }
  function toast(msg) { if (window.SCEN && SCEN.toast) SCEN.toast(msg); }
  function showBox(txt) {
    const box = $('bud-copybox');
    box.value = txt;
    box.hidden = false;
    box.focus();
    box.select();
  }
  $('bud-copy').addEventListener('click', () => {
    const txt = listText();
    const fallback = () => {
      showBox(txt);
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e) {}
      toast(ok ? 'Liste copiée dans le presse-papiers.' : isTouch()
        ? 'Copie impossible ici : appuie longuement sur le texte ci-dessous, puis « Copier ».'
        : 'Copie impossible ici : sélectionne le texte ci-dessous et copie-le (Ctrl+C).');
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(() => { $('bud-copybox').hidden = true; toast('Liste copiée dans le presse-papiers.'); }, fallback);
    } else fallback();
  });

  // ------------------------------------------------------------------ bloc dans le panneau Sélection
  let sb = null;
  if (extra) {
    sb = document.createElement('div');
    sb.id = 'sel-budget';
    sb.innerHTML = `
      <div class="group-label">Budget</div>
      <div class="bud-row">
        <label class="f">Prix (€)<input id="bud-price" type="number" min="0" step="0.01" inputmode="decimal"></label>
        <label class="switch" title="Ce meuble est déjà à toi : il ne compte pas dans « À acheter »"><input type="checkbox" id="bud-owned"> Déjà à moi</label>
      </div>
      <div class="bud-url">
        <input id="bud-url" type="text" maxlength="300" placeholder="Lien vers le produit (https://…)" aria-label="Lien vers le produit">
        <a id="bud-open" class="bud-link off" target="_blank" rel="noopener noreferrer" title="Ouvrir le lien dans un nouvel onglet">↗</a>
      </div>
      <div class="legend" id="bud-hint"></div>`;
    extra.appendChild(sb);
  }
  let selShown = null;
  function renderSel() {
    if (!sb) return;
    const it = app.getSelected();
    const show = !!it && !app.readOnly;
    sb.hidden = !show;
    if (!show) { selShown = null; return; }
    const fresh = selShown !== it;
    selShown = it;
    const m = it.meta || {};
    const p = priceOf(it);
    const pr = $('bud-price'), ow = $('bud-owned'), ur = $('bud-url');
    const active = document.activeElement;
    pr.placeholder = p.def ? String(PRICES[it.type]).replace('.', ',') + ' (indicatif)' : 'à renseigner';
    if (fresh || active !== pr) pr.value = hasPrice(m) ? String(m.price) : '';
    ow.checked = isOwned(it);
    if (fresh || active !== ur) ur.value = typeof m.url === 'string' ? m.url : '';
    const url = safeUrl(ur.value);
    const op = $('bud-open');
    op.classList.toggle('off', !url);
    if (url) op.href = url; else op.removeAttribute('href');
    const hint = $('bud-hint');
    if (ur.value.trim() && !url) hint.textContent = 'Le lien doit commencer par http:// ou https://';
    else if (!hasPrice(m)) hint.textContent = p.def ? `Prix indicatif : ${eur(p.v)}. Saisis le vrai prix si tu le connais.` : 'Pas de prix indicatif pour ce meuble : saisis-le.';
    else hint.textContent = '';
  }
  function edit(fn) {
    const it = app.getSelected();
    if (!it || app.readOnly) return;
    it.meta = it.meta || {};
    fn(it.meta);
    app.refreshStates();
  }
  if (sb) {
    $('bud-price').addEventListener('input', (e) => {
      const raw = e.target.value.trim();
      const v = parseFloat(raw.replace(',', '.'));
      if (raw && !(isFinite(v) && v >= 0)) return;
      edit((m) => { if (!raw) delete m.price; else m.price = Math.round(v * 100) / 100; });
    });
    $('bud-owned').addEventListener('change', (e) => edit((m) => { m.owned = e.target.checked; }));
    $('bud-url').addEventListener('input', (e) => {
      const v = e.target.value.trim().slice(0, 300);
      edit((m) => { if (v) m.url = v; else delete m.url; });
    });
  }

  // ------------------------------------------------------------------ branchements
  function update() { renderSel(); renderCard(false); }
  app.hooks.change.push(update);
  // renommer / changer de scénario sans modifier les meubles
  ['scen-name', 'scen-select'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) { el.addEventListener('input', () => setTimeout(update, 0)); el.addEventListener('change', () => setTimeout(update, 0)); }
  });
  ['scen-new', 'scen-dup', 'scen-del', 'imp-file'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener(id === 'imp-file' ? 'change' : 'click', () => setTimeout(update, 50));
  });
  update();

  window.BUDGET = { PRICES, OWNED_DEFAULT, priceOf, isOwned, totals, listText, refresh: () => renderCard(true) };
})();
