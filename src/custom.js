/*
 * Meubles sur mesure et couleurs personnalisées.
 * - carte « Meuble sur mesure » (#custom-card) : crée un bloc, une table ou une étagère aux dimensions et à la couleur voulues,
 *   et garde ces créations comme modèles réutilisables (« Mes meubles », dans ce navigateur) ;
 * - bloc #sel-custom (panneau Sélection) : couleur de n'importe quel meuble, nom des meubles sur mesure ;
 * - hooks.build : réapplique meta.color à chaque (re)construction du modèle 3D (chargement, annulation...).
 */
(function () {
  const app = window.__app;
  if (!app || !window.FURN) return;
  const $ = (id) => document.getElementById(id);
  const HEX = /^#[0-9a-f]{6}$/i;
  const SHAPES = ['custom', 'customtable', 'customshelf'];
  const SHORT = { custom: 'Bloc', customtable: 'Table', customshelf: 'Étagère' };
  const SWATCHES = [
    ['#f4f2ee', 'Blanc'], ['#d9bf94', 'Chêne clair'], ['#7a5236', 'Noyer'], ['#2a2a2c', 'Noir'],
    ['#8d9196', 'Gris'], ['#9caf88', 'Vert sauge'], ['#2f3e55', 'Bleu nuit'], ['#c0673f', 'Terracotta'],
  ];
  const MODELS_KEY = 'anglet-custom-models-v1';

  // ------------------------------------------------------------------ application de la couleur
  // Teinte la « matière principale » : les couleurs qui couvrent le plus de surface (les surfaces texturées bois/tissu/cuir comptent davantage).
  // Exclus : écrans et LED (emissive), abat-jour et ampoules, vitres et glaces, métal, textures dessinées, mangas (matériaux multiples).
  const woodMap = () => (window.MATS && MATS.wood ? MATS.wood.map : null);
  function eligible(m) {
    const mt = m.material;
    if (!m.isMesh || !mt || Array.isArray(mt) || !mt.isMeshStandardMaterial) return false;
    if (m.userData.glow || m.userData.bulb) return false;
    if (mt.transparent || mt.opacity < 1 || mt.metalness > 0.3) return false;
    if (mt.emissiveMap || (mt.emissive && mt.emissive.getHex() !== 0)) return false;
    if (mt.map && mt.map !== woodMap()) return false;
    return true;
  }
  // lits : la couleur choisie est celle de la structure (bois), pas de la literie (matelas, couette, oreiller) qui couvre
  // autant de surface ; seules les couleurs en bois sont candidates
  const PREFER = { bed1: 'wood', bed2: 'wood', loftbed: 'wood' };
  const isWood = (mt) => !!(mt.map && mt.map === woodMap());
  const tmpBox = new THREE.Box3(), tmpS = new THREE.Vector3(), tmpW = new THREE.Vector3();
  function area(m) {
    const g = m.geometry;
    if (!g) return 0;
    if (!g.boundingBox) g.computeBoundingBox();
    tmpBox.copy(g.boundingBox).getSize(tmpS);
    m.getWorldScale(tmpW);
    const x = tmpS.x * Math.abs(tmpW.x), y = tmpS.y * Math.abs(tmpW.y), z = tmpS.z * Math.abs(tmpW.z);
    return 2 * (x * y + y * z + z * x);
  }
  // la texture bois est un gris (~0,68 en linéaire) multiplié par la couleur : on compense pour obtenir la teinte choisie
  const WOOD_GAIN = 1 / 0.68;
  function tint(it, hex) {
    it.group.updateMatrixWorld(true);
    const groups = new Map();
    it.group.traverse((m) => {
      if (!eligible(m)) return;
      const k = m.material.color.getHex();
      const gr = groups.get(k) || { score: 0, meshes: [], wood: isWood(m.material) };
      gr.score += area(m) * (m.material.bumpMap ? 1.5 : 1);
      gr.meshes.push(m);
      groups.set(k, gr);
    });
    if (!groups.size) return;
    let cands = [...groups.values()];
    if (PREFER[it.type] === 'wood' && cands.some((g) => g.wood)) cands = cands.filter((g) => g.wood);
    const best = Math.max(...cands.map((g) => g.score));
    const target = new THREE.Color(hex).convertSRGBToLinear();
    const clones = new Map();
    groups.forEach((gr) => {
      if (gr.score < best * 0.4 || cands.indexOf(gr) < 0) return;
      gr.meshes.forEach((m) => {
        let c = clones.get(m.material);
        if (!c) {
          c = m.material.clone(); // les matériaux peuvent être partagés : on ne modifie qu'une copie
          if (c.map && c.map === woodMap()) {
            const boosted = target.clone().multiplyScalar(WOOD_GAIN);
            if (Math.max(boosted.r, boosted.g, boosted.b) > 1) { c.map = null; c.color.copy(target); } // teinte très claire : laque unie (le relief reste)
            else c.color.copy(boosted);
          } else c.color.copy(target);
          c.needsUpdate = true;
          clones.set(m.material, c);
        }
        m.material = c;
        m.userData.tinted = true;
      });
    });
  }
  app.hooks.build.push((it) => {
    const col = it.meta && it.meta.color;
    if (typeof col === 'string' && HEX.test(col)) tint(it, col);
  });
  // les meubles du scénario sont déjà construits : on applique leurs couleurs
  app.items.forEach((it) => { if (it.meta && HEX.test(it.meta.color || '')) app.rebuild(it); });

  // ------------------------------------------------------------------ « Mes meubles » : stockage (jamais en mode visite, ADR 0009)
  const viewOnly = !!((window.SCEN && SCEN.viewOnly) || app.readOnly);
  // modèle validé : forme sur mesure connue, nom texte, dimensions 5-600 cm (sinon celles du catalogue), couleur #rrggbb
  function normModel(m) {
    if (!m || typeof m !== 'object' || typeof m.type !== 'string' || !SHAPES.includes(m.type)) return null;
    const def = FURN.byId[m.type];
    const dimOk = (v, d) => (typeof v === 'number' && Number.isFinite(v) && v >= 5 && v <= 600 ? Math.round(v * 10) / 10 : d);
    const out = { type: m.type, name: typeof m.name === 'string' ? m.name.trim().slice(0, 60) : '', w: dimOk(m.w, def.w), d: dimOk(m.d, def.d), h: dimOk(m.h, def.h) };
    if (typeof m.color === 'string' && HEX.test(m.color)) out.color = m.color.toLowerCase();
    return out;
  }
  const sameModel = (a, m) => a.type === m.type && a.name === m.name && a.w === m.w && a.d === m.d && a.h === m.h && (a.color || '') === (m.color || '');
  function readModels() {
    if (viewOnly) return [];
    try { const v = JSON.parse(localStorage.getItem(MODELS_KEY)); return Array.isArray(v) ? v.map(normModel).filter(Boolean) : []; } catch (e) { return []; }
  }
  function writeModels(list) { if (viewOnly) return; try { localStorage.setItem(MODELS_KEY, JSON.stringify(list.slice(0, 40))); } catch (e) {} }
  // API pour l'export / import JSON (scenarios.js)
  window.__custom = {
    models: () => readModels(),
    // ajoute des modèles importés (validés, sans doublon) ; renvoie le nombre ajouté
    addModels(list) {
      if (viewOnly || !Array.isArray(list)) return 0;
      const cur = readModels();
      let n = 0;
      list.map(normModel).filter(Boolean).forEach((m) => { if (!cur.some((a) => sameModel(a, m))) { cur.push(m); n++; } });
      if (n) { writeModels(cur); renderModels(); }
      return n;
    },
  };

  if (app.readOnly) { const c = $('custom-card'); if (c) c.hidden = true; return; } // mode visite : rien d'éditable

  // ------------------------------------------------------------------ styles
  const st = document.createElement('style');
  st.textContent = `
  #custom-card .seg { display:flex; width:100%; margin:8px 0 2px; }
  #custom-card .seg button { flex:1; }
  #custom-card .field { margin-top:2px; }
  #custom-card .row { margin-top:8px; }
  .cu-colors { display:flex; flex-wrap:wrap; align-items:center; gap:6px; }
  .cu-colors input[type=color] { width:34px; height:26px; padding:0 2px; border:1px solid var(--line-strong); border-radius:7px; background:#fff; cursor:pointer; flex:none; }
  .cu-sw { width:22px; height:22px; padding:0; border-radius:50%; border:1px solid rgba(0,0,0,.18); flex:none; }
  .cu-sw:hover { transform:scale(1.1); background-color:inherit; }
  .cu-sw.on { outline:2px solid var(--accent); outline-offset:2px; }
  .cu-reset { font-size:12px; padding:3px 8px; margin-left:auto; }
  #cu-models { list-style:none; margin:0; padding:0; }
  #cu-models li { display:flex; align-items:center; gap:8px; padding:5px 0; border-top:1px solid var(--line); font-size:13px; }
  #cu-models li:first-child { border-top:none; }
  #cu-models .dot { width:12px; height:12px; border-radius:3px; border:1px solid rgba(0,0,0,.18); flex:none; }
  #cu-models .txt { flex:1; min-width:0; display:flex; flex-direction:column; }
  #cu-models .txt span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-weight:500; }
  #cu-models .txt small { color:var(--mute); font-size:11px; font-variant-numeric:tabular-nums; }
  #cu-models button { padding:3px 8px; font-size:12px; flex:none; }
  #sel-custom .field { margin-top:4px; }
  `;
  document.head.appendChild(st);

  // ------------------------------------------------------------------ outils
  const el = (tag, props, kids) => {
    const e = document.createElement(tag);
    if (props) Object.entries(props).forEach(([k, v]) => { if (k === 'style') e.style.cssText = v; else if (k in e) e[k] = v; else e.setAttribute(k, v); });
    (kids || []).forEach((c) => e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
    return e;
  };
  const clampDim = (v, def) => { v = parseFloat(String(v).replace(',', '.')); return isFinite(v) ? Math.min(600, Math.max(5, Math.round(v * 10) / 10)) : def; };
  const fmt = (v) => String(Math.round(v * 10) / 10).replace('.', ',');

  // palette de couleurs (sélecteur + teintes rapides) ; onPick(hex, final)
  function palette(initial, onPick, extra) {
    const wrap = el('div', { className: 'cu-colors' });
    const input = el('input', { type: 'color', value: initial || '#d9bf94', title: 'Choisir une couleur' });
    const sws = SWATCHES.map(([hex, name]) => {
      const b = el('button', { type: 'button', className: 'cu-sw', title: name, 'aria-label': name, style: `background:${hex}` });
      b.onclick = () => { input.value = hex; mark(hex); onPick(hex, true); };
      return b;
    });
    function mark(hex) { sws.forEach((b, i) => b.classList.toggle('on', !!hex && SWATCHES[i][0] === hex.toLowerCase())); }
    input.addEventListener('input', () => { mark(input.value); onPick(input.value, false); });
    input.addEventListener('change', () => { mark(input.value); onPick(input.value, true); });
    wrap.appendChild(input);
    sws.forEach((b) => wrap.appendChild(b));
    if (extra) wrap.appendChild(extra);
    mark(initial);
    return { wrap, input, mark };
  }

  // ------------------------------------------------------------------ « Mes meubles » (modèles réutilisables)
  function remember(m) {
    const list = readModels().filter((a) => !sameModel(a, m));
    list.unshift(m);
    writeModels(list);
    renderModels();
  }
  function addModel(m) {
    const meta = {};
    if (m.name) meta.name = m.name;
    if (HEX.test(m.color || '')) meta.color = m.color;
    app.addFromCatalog(m.type, { w: m.w, d: m.d, h: m.h, meta });
    app.renderList();
  }

  // ------------------------------------------------------------------ carte « Meuble sur mesure »
  const card = $('custom-card');
  const form = { type: 'custom', color: '#d9bf94' };
  let modelsUl = null;
  function renderModels() {
    if (!modelsUl) return;
    const list = readModels();
    modelsUl.innerHTML = '';
    if (!list.length) {
      modelsUl.appendChild(el('li', { className: 'legend', style: 'border:none' }, ['Les meubles que tu crées ici sont gardés dans cette liste pour les réajouter en un clic.']));
      return;
    }
    list.forEach((m, i) => {
      const label = m.name || FURN.byId[m.type].name;
      const add = el('button', { type: 'button', title: 'Ajouter ce meuble dans la pièce' }, ['Ajouter']);
      add.onclick = () => addModel(m);
      const del = el('button', { type: 'button', className: 'ghost', title: 'Oublier ce modèle (ne retire rien de la pièce)', 'aria-label': 'Oublier ' + label }, ['×']);
      del.onclick = () => { const l = readModels(); l.splice(i, 1); writeModels(l); renderModels(); };
      modelsUl.appendChild(el('li', null, [
        el('span', { className: 'dot', style: `background:${HEX.test(m.color || '') ? m.color : '#c9ad88'}` }),
        el('div', { className: 'txt' }, [el('span', { title: label }, [label]), el('small', null, [`${SHORT[m.type]} · ${fmt(m.w)} × ${fmt(m.d)} × ${fmt(m.h)} cm`])]),
        add, del,
      ]));
    });
  }
  if (card) {
    const name = el('input', { type: 'text', id: 'cu-name', maxLength: 60, placeholder: 'ex. Caisson de l’entrée' });
    const seg = el('div', { className: 'seg', role: 'group', 'aria-label': 'Forme' });
    const dims = {};
    const dimRow = el('div', { className: 'row three' }, [['w', 'Largeur'], ['d', 'Profondeur'], ['h', 'Hauteur']].map(([k, lab]) => {
      dims[k] = el('input', { type: 'number', min: 5, max: 600, step: 1, id: 'cu-' + k });
      return el('label', null, [lab + ' (cm)', dims[k]]);
    }));
    const setShape = (t) => {
      form.type = t;
      [...seg.children].forEach((b) => b.classList.toggle('active', b.dataset.t === t));
      const def = FURN.byId[t];
      dims.w.value = def.w; dims.d.value = def.d; dims.h.value = def.h;
    };
    SHAPES.forEach((t) => {
      const b = el('button', { type: 'button', title: FURN.byId[t].name }, [SHORT[t]]);
      b.dataset.t = t;
      b.onclick = () => setShape(t);
      seg.appendChild(b);
    });
    const pal = palette(form.color, (hex) => { form.color = hex; });
    const addBtn = el('button', { type: 'button', className: 'primary', id: 'cu-add' }, ['Ajouter']);
    addBtn.onclick = () => {
      const def = FURN.byId[form.type];
      const m = {
        type: form.type, name: name.value.trim().slice(0, 60),
        w: clampDim(dims.w.value, def.w), d: clampDim(dims.d.value, def.d), h: clampDim(dims.h.value, def.h),
        color: HEX.test(form.color) ? form.color.toLowerCase() : '#d9bf94',
      };
      addModel(m);
      remember(m);
    };
    modelsUl = el('ul', { id: 'cu-models' });
    card.append(
      el('div', { className: 'card-head' }, [el('h3', null, ['Meuble sur mesure'])]),
      el('label', { className: 'field' }, ['Nom', name]),
      seg, dimRow,
      el('div', { className: 'group-label' }, ['Couleur']), pal.wrap,
      el('div', { className: 'btns fill' }, [addBtn]),
      el('div', { className: 'group-label' }, ['Mes meubles']), modelsUl
    );
    setShape('custom');
    renderModels();
  }

  // ------------------------------------------------------------------ bloc du meuble sélectionné (#sel-custom)
  const extra = $('sel-extra');
  const box = el('div', { id: 'sel-custom' });
  if (extra) extra.appendChild(box);
  let shown = null, pal2 = null, nameIn = null;
  function setColor(it, hex, final) {
    if (!it || !app.items.includes(it)) return;
    if (hex) it.meta.color = hex.toLowerCase(); else delete it.meta.color;
    app.rebuild(it);
    if (final) app.refreshStates();
  }
  function renderSel() {
    const it = app.getSelected();
    if (!it || app.readOnly || (app.isWalking && app.isWalking())) { box.hidden = true; shown = null; return; }
    box.hidden = false;
    const col = HEX.test(it.meta.color || '') ? it.meta.color : null;
    if (shown === it) { // même meuble : on met à jour sans recréer (ne casse pas le sélecteur ouvert)
      if (document.activeElement !== pal2.input) { pal2.input.value = col || '#d9bf94'; pal2.mark(col); }
      if (nameIn && document.activeElement !== nameIn) nameIn.value = it.meta.name || '';
      return;
    }
    shown = it;
    box.innerHTML = '';
    const reset = el('button', { type: 'button', className: 'cu-reset', title: 'Revenir à la couleur du modèle' }, ['Couleur d’origine']);
    reset.onclick = () => { pal2.mark(null); setColor(it, null, true); };
    pal2 = palette(col || '#d9bf94', (hex, final) => setColor(it, hex, final), reset);
    if (!col) pal2.mark(null);
    nameIn = null;
    if (FURN.byId[it.type] && FURN.byId[it.type].custom) {
      nameIn = el('input', { type: 'text', maxLength: 60, value: it.meta.name || '', placeholder: FURN.byId[it.type].name });
      const apply = () => {
        const v = nameIn.value.trim().slice(0, 60);
        if ((it.meta.name || '') === v) return;
        if (v) it.meta.name = v; else delete it.meta.name;
        it.name = v || FURN.byId[it.type].name;
        app.renderList();
        app.refreshStates();
      };
      nameIn.addEventListener('change', apply);
      nameIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { apply(); nameIn.blur(); } });
      box.append(el('div', { className: 'group-label' }, ['Nom']), nameIn);
    }
    box.append(el('div', { className: 'group-label' }, ['Couleur']), pal2.wrap);
  }
  app.hooks.change.push(renderSel);
  renderSel();
})();
