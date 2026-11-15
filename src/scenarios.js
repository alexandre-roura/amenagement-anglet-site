/*
 * Scénarios (variantes d'aménagement), annuler / rétablir, historique, export / import, lien de partage.
 * Indépendant de la 3D : app.js fournit un adaptateur { getItems, setItems, isBusy }.
 *
 * Stockage (navigateur) : localStorage['amenagement-anglet-v3'] =
 *   { version: 3, current: id, scenarios: [{ id, name, items, created, updated, history: [{ t, label, items }] }] }
 */
(function () {
  const KEY = 'amenagement-anglet-v3';
  const OLD_KEYS = ['amenagement-anglet-v2', 'amenagement-anglet-v1'];
  const MAX_UNDO = 100, MAX_HISTORY = 25, AUTO_SNAPSHOT_MS = 3 * 60 * 1000;
  const SCEN = (window.SCEN = {});
  const $ = (id) => document.getElementById(id);
  // mode visite : index.html?view#s=... -> on affiche le scénario partagé, sans rien lire ni écrire dans le navigateur
  SCEN.viewOnly = /(^\?|&)view(=1)?(&|$)/.test(location.search);
  if (SCEN.viewOnly) document.documentElement.classList.add('view-mode');

  let db = null, adapter = null, commitTimer = null, persistTimer = null, defaultLayout = [];
  const stacks = {}; // id -> { undo: [], redo: [], base: string } (en mémoire, pour la session)

  // ------------------------------------------------------------------ données
  const r1 = (v) => Math.round(v * 10) / 10;
  const has = (o, k) => !!o && typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);
  // nombre fini (nombre ou texte numérique), sinon NaN ; null, '' ou un objet ne valent pas 0
  const num = (v) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? +v : NaN);
  const fin = (v, def) => { v = num(v); return Number.isFinite(v) ? v : def; };
  const dim = (v, def) => { v = num(v); return Number.isFinite(v) && v >= 1 && v <= 1000 ? v : def; }; // cm, sinon dimension du catalogue
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const txt = (v, max, def) => { const t = typeof v === 'string' ? v.trim() : typeof v === 'number' && Number.isFinite(v) ? String(v) : ''; return t ? t.slice(0, max) : def; };
  const date = (v) => { v = num(v); return Number.isFinite(v) && v > 946684800000 && v < Date.now() + 864e5 ? v : null; }; // après 2000, pas dans le futur
  // position valable : nombre fini, dans une large zone autour du logement (sinon le meuble est replacé, voir placeLost)
  const pos = (v) => { v = num(v); return Number.isFinite(v) && Math.abs(v) <= 5000 ? v : NaN; };
  function clean(items) {
    const lost = [];
    const out = (Array.isArray(items) ? items : [])
      .filter((o) => o && typeof o === 'object' && has(FURN.byId, o.type))
      .map((o) => {
        const def = FURN.byId[o.type];
        const x = pos(o.x), z = pos(o.z);
        const c = { type: o.type, x: r1(fin(x, 0)), z: r1(fin(z, 0)), rot: r1(fin(o.rot, 0) % 360), w: r1(dim(o.w, def.w)), d: r1(dim(o.d, def.d)), h: r1(dim(o.h, def.h)) };
        if (!Number.isFinite(x) || !Number.isFinite(z)) lost.push(c);
        if (o.light && typeof o.light === 'object' && def.light) { // réglage d'une lampe (m/c : mode couleur des ampoules connectées)
          c.light = { on: !!o.light.on, p: Math.round(clamp(fin(o.light.p, 0), 0, 100)), k: Math.round(clamp(fin(o.light.k, 2700), 2200, 6500)) };
          if (o.light.m === 'color') c.light.m = 'color';
          if (typeof o.light.c === 'string' && /^#[0-9a-f]{6}$/i.test(o.light.c)) c.light.c = o.light.c;
        }
        const m = cleanMeta(o.meta);
        if (m) c.meta = m;
        return c;
      });
    if (lost.length) placeLost(out, lost);
    return out;
  }
  // Meubles importés sans position valable (x / z absents ou absurdes) : au lieu de l'origine (coin de la baie), place
  // libre la plus proche du milieu du séjour, comme un ajout depuis le catalogue (__app.freeSpot n'existe pas encore
  // quand scenarios.js nettoie le scénario de départ : même recherche ici, avec les règles de base — dans la pièce,
  // hors éléments fixes, sans chevaucher les autres meubles ; un objet « à poser » peut aller sur un meuble).
  function placeLost(all, lost) {
    const foot = (o) => APT.rectPoly(o.x, o.z, o.w, o.d, o.rot);
    const placed = all.filter((o) => lost.indexOf(o) < 0);
    const C = [190, 150], cands = [];
    for (let z = -210; z <= 620; z += 10) for (let x = -200; x <= 620; x += 10) cands.push([x, z, (x - C[0]) ** 2 + (z - C[1]) ** 2]);
    cands.sort((a, b) => a[2] - b[2]);
    lost.forEach((o) => {
      const onTop = !!FURN.byId[o.type].onTop;
      const fits = () => {
        const p = foot(o);
        if (!APT.inside(p) || APT.fixed.some((f) => APT.polyOverlap(p, f.poly, 0.5))) return false;
        return onTop || !placed.some((q) => !FURN.byId[q.type].onTop && APT.polyOverlap(p, foot(q), 0.5));
      };
      const rots = [o.rot, (o.rot + 90) % 360];
      for (const [x, z] of cands) {
        let ok = false;
        for (const r of rots) { o.x = x; o.z = z; o.rot = r; if (fits()) { ok = true; break; } }
        if (ok) break;
      }
      if (!fits()) { o.x = C[0]; o.z = C[1]; o.rot = rots[0]; } // aucune place : au milieu du séjour (il apparaîtra en rouge)
      placed.push(o);
    });
  }
  // historique importé : { t, label, items } nettoyés
  function cleanHistory(list) {
    return (Array.isArray(list) ? list : [])
      .filter((h) => h && typeof h === 'object' && Array.isArray(h.items))
      .map((h) => ({ t: date(h.t) || Date.now(), label: txt(h.label, 60, null), items: clean(h.items) }))
      .slice(-MAX_HISTORY);
  }
  // données libres d'un meuble (prix, lien, possédé, couleur, nom...) : valeurs simples uniquement, taille bornée
  function cleanMeta(meta) {
    if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return null;
    const out = {};
    Object.keys(meta).slice(0, 24).forEach((k) => {
      const v = meta[k];
      if (typeof v === 'string') out[k] = v.slice(0, 300);
      else if (typeof v === 'number' && isFinite(v)) out[k] = v;
      else if (typeof v === 'boolean') out[k] = v;
    });
    return Object.keys(out).length ? out : null;
  }
  SCEN.cleanMeta = cleanMeta;
  const ser = (items) => JSON.stringify(clean(items));
  const uid = () => 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const cur = () => db.scenarios.find((s) => s.id === db.current) || db.scenarios[0];
  const stack = (id) => (stacks[id] = stacks[id] || { undo: [], redo: [], base: null });

  function uniqueName(name) {
    const names = new Set(db.scenarios.map((s) => s.name));
    if (!names.has(name)) return name;
    for (let i = 2; ; i++) if (!names.has(`${name} (${i})`)) return `${name} (${i})`;
  }
  function addScen(name, items) {
    const now = Date.now();
    const s = { id: uid(), name: uniqueName(txt(name, 60, 'Scénario')), items: clean(items), created: now, updated: now, history: [] };
    db.scenarios.push(s);
    return s;
  }

  function read() {
    try {
      const v = JSON.parse(localStorage.getItem(KEY));
      if (v && Array.isArray(v.scenarios) && v.scenarios.length) return v;
    } catch (e) {}
    return null;
  }
  function persistNow() {
    clearTimeout(persistTimer);
    if (SCEN.viewOnly) return;
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { toast("Impossible d'enregistrer dans le navigateur (stockage plein ou bloqué). Pense à exporter."); }
    renderStatus();
  }
  function persist() { clearTimeout(persistTimer); persistTimer = setTimeout(persistNow, 250); }

  // ------------------------------------------------------------------ initialisation
  SCEN.init = function (ad, layout) {
    adapter = ad;
    defaultLayout = layout;
    if (SCEN.viewOnly) { // visite : uniquement le scénario du lien (ou la proposition de départ), rien n'est enregistré
      const shared = readShareHash();
      db = { version: 3, current: null, scenarios: [] };
      db.current = addScen(shared ? shared.name : 'Proposition de départ', shared ? shared.items : layout).id;
      stack(db.current).base = ser(cur().items);
      bindUI();
      renderAll();
      return clean(cur().items);
    }
    db = read();
    if (!db) {
      db = { version: 3, current: null, scenarios: [] };
      let old = null;
      for (const k of OLD_KEYS) { try { old = JSON.parse(localStorage.getItem(k)); } catch (e) {} if (Array.isArray(old) && old.length) break; old = null; }
      if (old) addScen('Mon aménagement', old);
      addScen('Proposition de départ', layout);
      db.current = db.scenarios[0].id;
    }
    // lien partagé (#s=...) : importé comme nouveau scénario
    const shared = readShareHash();
    if (shared) {
      const s = addScen(shared.name + ' (lien partagé)', shared.items);
      db.current = s.id;
      try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
      setTimeout(() => toast(`Scénario partagé « ${shared.name} » ajouté à tes scénarios.`), 300);
    }
    persistNow();
    stack(db.current).base = ser(cur().items);
    bindUI();
    renderAll();
    return clean(cur().items);
  };

  // ------------------------------------------------------------------ appelé par app.js à chaque modification
  SCEN.changed = function () {
    if (!db) return;
    const s = cur();
    const items = clean(adapter.getItems());
    // date de modification seulement si le contenu change (ex. simple changement de scénario, import : dates conservées)
    if (JSON.stringify(items) !== JSON.stringify(s.items)) s.updated = Date.now();
    s.items = items;
    persist();
    scheduleCommit();
    $('btn-undo').disabled = false;
  };

  // ------------------------------------------------------------------ annuler / rétablir
  function scheduleCommit() { clearTimeout(commitTimer); commitTimer = setTimeout(commit, 450); }
  function commit() {
    clearTimeout(commitTimer);
    commitTimer = null;
    if (adapter.isBusy()) { scheduleCommit(); return; } // pendant un glisser, on attend la fin
    const st = stack(db.current), now = ser(adapter.getItems());
    if (st.base === null) { st.base = now; renderUndo(); return; }
    if (now === st.base) { renderUndo(); return; }
    st.undo.push(st.base);
    if (st.undo.length > MAX_UNDO) st.undo.shift();
    st.redo.length = 0;
    st.base = now;
    autoSnapshot();
    renderUndo();
  }
  function flush() { if (commitTimer) commit(); }

  function applyState(json) {
    stack(db.current).base = json; // évite que le rechargement soit compté comme une nouvelle modification
    adapter.setItems(JSON.parse(json));
    const s = cur();
    s.items = JSON.parse(json);
    s.updated = Date.now();
    persist();
    renderUndo();
  }
  SCEN.undo = function () {
    flush();
    const st = stack(db.current);
    if (!st.undo.length) return;
    st.redo.push(st.base);
    applyState(st.undo.pop());
  };
  SCEN.redo = function () {
    flush();
    const st = stack(db.current);
    if (!st.redo.length) return;
    st.undo.push(st.base);
    applyState(st.redo.pop());
  };

  // ------------------------------------------------------------------ historique (points de sauvegarde)
  function autoSnapshot() {
    const s = cur(), last = s.history[s.history.length - 1];
    if (!last || Date.now() - last.t > AUTO_SNAPSHOT_MS) snapshot(null);
  }
  function snapshot(label) {
    const s = cur();
    s.history.push({ t: Date.now(), label: label || null, items: clean(s.items) });
    // on garde tous les points nommés + les plus récents automatiques
    while (s.history.length > MAX_HISTORY) {
      const i = s.history.findIndex((h) => !h.label);
      s.history.splice(i === -1 ? 0 : i, 1);
    }
    persist();
    renderHistory();
  }
  function restore(index) {
    flush();
    const h = cur().history[index];
    if (!h) return;
    adapter.setItems(clean(h.items)); // modification normale : annulable
    toast('Version restaurée. Ctrl+Z pour revenir en arrière.');
  }

  // ------------------------------------------------------------------ gestion des scénarios
  function select(id) {
    if (id === db.current) return;
    flush();
    cur().items = clean(adapter.getItems());
    db.current = id;
    const st = stack(id);
    st.base = ser(cur().items);
    adapter.setItems(clean(cur().items));
    persistNow();
    renderAll();
  }
  function createScen(items, name) {
    flush();
    cur().items = clean(adapter.getItems());
    const s = addScen(name, items);
    persistNow();
    select(s.id);
    const input = $('scen-name');
    if (input) { input.focus(); input.select(); }
  }
  function removeScen() {
    if (db.scenarios.length <= 1) { toast('Il faut garder au moins un scénario.'); return; }
    const s = cur();
    if (!confirm(`Supprimer le scénario « ${s.name} » ? (pense à l'exporter si tu veux le garder)`)) return;
    const idx = db.scenarios.indexOf(s);
    db.scenarios.splice(idx, 1);
    delete stacks[s.id];
    const next = db.scenarios[Math.max(0, idx - 1)];
    db.current = next.id;
    stack(next.id).base = ser(next.items);
    adapter.setItems(clean(next.items));
    persistNow();
    renderAll();
  }
  function rename(name) {
    name = (name || '').trim();
    if (!name) return;
    cur().name = name;
    persist();
    renderSelect();
  }

  // ------------------------------------------------------------------ export / import
  function stamp() {
    const d = new Date(), p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}h${p(d.getMinutes())}`;
  }
  const safe = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
  function download(filename, text) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function pack(list) {
    return JSON.stringify({ app: 'amenagement-anglet', version: 3, exported: new Date().toISOString(),
      elec: window.ELEC ? ELEC.data() : undefined, // prises, interrupteurs, points lumineux (communs à tous les scénarios)
      ambiance: window.__lights && __lights.amb ? JSON.parse(JSON.stringify(__lights.amb())) : undefined, // moment + plafond (commun)
      models: window.__custom ? __custom.models() : undefined, // « Mes meubles » (modèles sur mesure)
      fixes: window.__fixtures ? __fixtures.data() : undefined, // cotes de la cuisine et de la salle d'eau (communes)
      scenarios: list.map((s) => ({ name: s.name, items: clean(s.items), created: s.created, updated: s.updated, history: s.history })) }, null, 1);
  }
  function exportCurrent() {
    flush();
    cur().items = clean(adapter.getItems());
    download(`amenagement-${safe(cur().name) || 'scenario'}_${stamp()}.json`, pack([cur()]));
  }
  function exportAll() {
    flush();
    cur().items = clean(adapter.getItems());
    download(`amenagement-anglet_tous-les-scenarios_${stamp()}.json`, pack(db.scenarios));
  }
  function importText(text, filename) {
    let data;
    try { data = JSON.parse(text); } catch (e) { toast("Ce fichier n'est pas un export valide (JSON illisible)."); return; }
    let list = [];
    if (Array.isArray(data)) list = [{ name: (filename || 'Import').replace(/\.json$/i, ''), items: data }];
    else if (data && Array.isArray(data.scenarios)) list = data.scenarios;
    else if (data && Array.isArray(data.items)) list = [data];
    list = list.filter((s) => s && typeof s === 'object' && Array.isArray(s.items));
    // données du logement (communes à tous les scénarios) : on demande avant de remplacer
    const done = [];
    if (data && Array.isArray(data.elec) && data.elec.length && window.ELEC &&
      confirm("Ce fichier contient aussi l'électricité (prises, interrupteurs, points lumineux). La remplacer par celle du fichier ?")) { ELEC.setData(data.elec); done.push('électricité'); }
    const L = window.__lights;
    if (data && data.ambiance && typeof data.ambiance === 'object' && !Array.isArray(data.ambiance) && L && L.setAmb &&
      JSON.stringify(L.check(data.ambiance)) !== JSON.stringify(L.amb()) &&
      confirm("Ce fichier contient aussi l'ambiance lumineuse (jour/soir/nuit, réglages du plafond). La remplacer par celle du fichier ?")) { L.setAmb(data.ambiance); done.push('ambiance'); }
    if (data && Array.isArray(data.models) && window.__custom) {
      const n = __custom.addModels(data.models);
      if (n) done.push(`${n} modèle${n > 1 ? 's' : ''} « Mes meubles »`);
    }
    if (data && data.fixes && typeof data.fixes === 'object' && !Array.isArray(data.fixes) && window.__fixtures &&
      confirm("Ce fichier contient aussi les cotes de la cuisine et de la salle d'eau. Les remplacer par celles du fichier ?")) { __fixtures.setData(data.fixes); done.push("cotes cuisine / salle d'eau"); }
    const extra = done.length ? ` (+ ${done.join(', ')})` : '';
    if (!list.length) { toast(done.length ? `Importé : ${done.join(', ')}. Aucun scénario dans ce fichier.` : 'Aucun scénario trouvé dans ce fichier.'); return; }
    flush();
    cur().items = clean(adapter.getItems());
    let first = null;
    list.forEach((s) => {
      const n = addScen(txt(s.name, 60, 'Scénario importé'), s.items);
      n.history = cleanHistory(s.history);
      const c = date(s.created), u = date(s.updated); // dates d'origine conservées si valides
      if (c) n.created = c;
      if (u) n.updated = Math.max(u, n.created);
      first = first || n;
    });
    persistNow();
    select(first.id);
    toast(`${list.length} scénario${list.length > 1 ? 's' : ''} importé${list.length > 1 ? 's' : ''}${extra}.`);
  }

  // ------------------------------------------------------------------ lien de partage (#s=...)
  const b64e = (str) => btoa(unescape(encodeURIComponent(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const b64d = (str) => decodeURIComponent(escape(atob(str.replace(/-/g, '+').replace(/_/g, '/'))));
  function shareLink() {
    flush();
    const s = cur();
    const payload = { n: s.name, i: clean(adapter.getItems()).map((o) => [o.type, o.x, o.z, o.rot, o.w, o.d, o.h,
      o.light ? [o.light.on ? 1 : 0, o.light.p, o.light.k, o.light.m === 'color' ? 1 : 0, o.light.c || ''] : 0, o.meta || 0]) };
    if (SCEN.extraShare) Object.assign(payload, SCEN.extraShare()); // ex. électricité
    return location.href.split('#')[0] + '#s=' + b64e(JSON.stringify(payload));
  }
  function readShareHash() {
    const m = /[#&]s=([A-Za-z0-9_-]+)/.exec(location.hash || '');
    if (!m) return null;
    try {
      const p = JSON.parse(b64d(m[1]));
      if (!p || typeof p !== 'object' || (p.i !== undefined && !Array.isArray(p.i))) return null;
      const items = (p.i || []).filter(Array.isArray).map(([type, x, z, rot, w, d, h, L, M]) => {
        const o = { type, x, z, rot, w, d, h };
        if (Array.isArray(L)) o.light = { on: !!L[0], p: L[1], k: L[2], m: L[3] ? 'color' : 'white', c: L[4] || undefined };
        if (M) o.meta = M;
        return o;
      });
      const res = { name: txt(p.n, 60, 'Scénario partagé'), items: clean(items) };
      SCEN.sharedPayload = p; // exposé seulement si les meubles sont lisibles (ex. électricité partagée, lue par electric.js)
      return res;
    } catch (e) { return null; }
  }
  async function copyShare() {
    const link = shareLink();
    let ok = false;
    try { await navigator.clipboard.writeText(link); ok = true; } catch (e) {}
    const box = $('share-box');
    box.hidden = false;
    box.value = link;
    box.select();
    if (!ok) { try { ok = document.execCommand('copy'); } catch (e) {} }
    const local = location.protocol === 'file:';
    toast((ok ? 'Lien copié. ' : 'Copie le lien ci-dessous. ') +
      (local ? "Attention : tant que le site n'est pas en ligne, ce lien ne marche que sur ce PC." : "Celui qui l'ouvre récupère ce scénario."));
  }

  // ------------------------------------------------------------------ interface
  function rel(t) {
    const s = Math.round((Date.now() - t) / 1000);
    if (s < 10) return "à l'instant";
    if (s < 60) return `il y a ${s} s`;
    if (s < 3600) return `il y a ${Math.round(s / 60)} min`;
    const d = new Date(t), p = (n) => String(n).padStart(2, '0');
    const today = new Date().toDateString() === d.toDateString();
    return (today ? "aujourd'hui" : `le ${p(d.getDate())}/${p(d.getMonth() + 1)}`) + ` à ${p(d.getHours())}h${p(d.getMinutes())}`;
  }
  function renderSelect() {
    const sel = $('scen-select');
    sel.innerHTML = '';
    db.scenarios.forEach((s) => {
      const o = document.createElement('option');
      o.value = s.id;
      o.textContent = `${s.name} (${s.items.length})`;
      o.selected = s.id === db.current;
      sel.appendChild(o);
    });
    if (document.activeElement !== $('scen-name')) $('scen-name').value = cur().name;
    $('scen-del').disabled = db.scenarios.length <= 1;
  }
  function renderUndo() {
    const st = stack(db.current);
    $('btn-undo').disabled = !st.undo.length && !commitTimer;
    $('btn-redo').disabled = !st.redo.length;
  }
  function renderHistory() {
    const ul = $('hist-list');
    ul.innerHTML = '';
    const h = cur().history;
    if (!h.length) { ul.innerHTML = '<li class="muted">Aucune version pour l\'instant. Une version est enregistrée automatiquement toutes les 3 minutes de travail.</li>'; return; }
    h.slice().reverse().forEach((v, k) => {
      const index = h.length - 1 - k;
      const li = document.createElement('li');
      li.innerHTML = `<span>${v.label ? '<b></b> · ' : ''}<span class="t"></span> · ${v.items.length} meubles</span>`;
      if (v.label) li.querySelector('b').textContent = v.label;
      li.querySelector('.t').textContent = rel(v.t);
      const b = document.createElement('button');
      b.textContent = 'Restaurer';
      b.onclick = () => restore(index);
      li.appendChild(b);
      ul.appendChild(li);
    });
  }
  function renderStatus() {
    const el = $('save-status');
    if (el && db) el.textContent = 'Enregistré automatiquement ' + rel(cur().updated);
  }
  function renderAll() { renderSelect(); renderUndo(); renderHistory(); renderStatus(); }

  let toastTimer = null;
  function toast(msg) {
    const t = $('toast');
    if (!t) return;
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), 4500);
  }
  SCEN.toast = toast;

  function bindUI() {
    $('scen-select').onchange = (e) => select(e.target.value);
    $('scen-name').oninput = (e) => rename(e.target.value);
    $('scen-name').onblur = () => { if (!$('scen-name').value.trim()) $('scen-name').value = cur().name; renderSelect(); };
    $('scen-name').onkeydown = (e) => { if (e.key === 'Enter') e.target.blur(); };
    $('scen-new').onclick = () => createScen([], 'Nouveau scénario');
    $('scen-dup').onclick = () => createScen(adapter.getItems(), cur().name + ' (copie)');
    $('scen-del').onclick = removeScen;
    $('btn-undo').onclick = SCEN.undo;
    $('btn-redo').onclick = SCEN.redo;
    $('snap-save').onclick = () => {
      flush();
      const label = ($('snap-label').value || '').trim() || 'Point de sauvegarde';
      snapshot(label);
      $('snap-label').value = '';
      toast(`Version « ${label} » enregistrée.`);
    };
    $('exp-cur').onclick = exportCurrent;
    $('exp-all').onclick = exportAll;
    $('imp').onclick = () => $('imp-file').click();
    $('imp-file').onchange = (e) => {
      const f = e.target.files[0];
      if (!f) return;
      f.text().then((t) => importText(t, f.name));
      e.target.value = '';
    };
    $('share').onclick = copyShare;
    window.addEventListener('keydown', (e) => {
      const tag = document.activeElement && document.activeElement.tagName;
      if (/INPUT|TEXTAREA|SELECT/.test(tag) && document.activeElement.type !== 'checkbox') return;
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); SCEN.undo(); }
      else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); SCEN.redo(); }
      else if (k === 's') { e.preventDefault(); flush(); persistNow(); toast('Tout est déjà enregistré automatiquement. Pour une copie de sécurité : « Exporter ».'); }
    });
    setInterval(() => { renderStatus(); renderUndo(); }, 15000);
    window.addEventListener('beforeunload', () => { if (SCEN.viewOnly) return; flush(); try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {} });
    SCEN.shareLink = shareLink; // utilisé par export.js (lien de visite)
  }

  // pour les tests / la console
  SCEN._debug = () => ({ db, stacks });
})();
