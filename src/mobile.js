/*
 * Version téléphone (et petits écrans / écrans tactiles).
 * - Petit écran (≤ 900 px) : en-tête compact + menu « ☰ », vue 3D plein écran, tiroir du bas à onglets
 *   (les cartes des panneaux latéraux y sont déplacées, puis remises en place si l'écran redevient large),
 *   barre d'actions du meuble sélectionné, commandes tactiles du mode Marcher.
 * - Écran tactile : glisser un meuble au doigt sans faire tourner la caméra, un doigt fait défiler en vue Dessus.
 * Rien ne change sur ordinateur (> 900 px, souris) : tout le CSS est sous media query + classe html.m-ui.
 */
(function () {
  const A = window.__app;
  if (!A) { console.warn('mobile.js : application introuvable'); return; }
  const $ = (id) => document.getElementById(id);
  const html = document.documentElement;
  const NARROW = '(max-width: 900px)';
  const mqNarrow = window.matchMedia(NARROW);
  const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  const viewOnly = html.classList.contains('view-mode') || !!A.readOnly;

  // ------------------------------------------------------------------ styles (uniquement petit écran / tactile)
  const css = document.createElement('style');
  css.textContent = `
  #m-more-btn, #m-more, #m-sheet, #m-actbar, #m-touchhint, #m-walkui { display:none; }
  @media (pointer: coarse) {
    #view canvas { touch-action:none; -webkit-user-select:none; user-select:none; -webkit-touch-callout:none; }
    #hint { display:none !important; }
    /* Élec, point sélectionné : la consigne parle de flèches du clavier (inutiles au doigt) */
    html.m-ui #elec-card #el-sel .legend { display:none; }
  }
  @media ${NARROW} {
    html.m-ui, html.m-ui body { height:100%; overflow:hidden; overscroll-behavior:none; touch-action:manipulation; }
    html.m-ui { --m-head:52px; --m-peek:calc(62px + env(safe-area-inset-bottom)); --m-open:58%; }
    html.m-ui #app { position:fixed; inset:0; display:block; height:auto; }
    html.m-ui #left, html.m-ui #right { display:none !important; }
    html.m-ui #view canvas { touch-action:none; }

    /* en-tête compact */
    html.m-ui header { position:absolute; left:0; right:0; top:0; height:var(--m-head); flex-wrap:nowrap; gap:6px;
      padding:0 8px; padding-left:max(8px, env(safe-area-inset-left)); padding-right:max(8px, env(safe-area-inset-right)); overflow:hidden; z-index:25; }
    /* [vues (place restante, défilent si besoin)] [Marcher] [☰] : Marcher et ☰ ne sortent jamais de l'écran,
       quelle que soit la largeur (iPhone SE / zoom d'affichage = 320 px, grande police Android…) */
    html.m-ui header .sep, html.m-ui header .grow, html.m-ui .brand { display:none; }
    html.m-ui header .toolbar { gap:6px; min-width:0; }
    html.m-ui header .toolbar:has(.seg) { flex:1 1 auto; }
    html.m-ui header .toolbar.m-views { flex:1 1 auto; }
    html.m-ui .seg { flex:1 1 auto; min-width:0; overflow-x:auto; scrollbar-width:none; -webkit-overflow-scrolling:touch; }
    html.m-ui .seg::-webkit-scrollbar { display:none; }
    html.m-ui .seg button { flex:1 0 auto; min-height:38px; min-width:38px; padding:0 8px; font-size:13px; }
    html.m-ui header button { min-height:40px; }
    html.m-ui #btn-walk { flex:none; min-width:42px; justify-content:center; padding:0 10px; }
    html.m-ui #m-more-btn { display:inline-flex; align-items:center; justify-content:center; min-width:44px; min-height:40px; padding:0 10px; font-size:18px; flex:none; }
    @media (max-width: 359px) { html.m-ui .seg button { padding:0 6px; font-size:12px; } }
    html.m-ui #m-more-btn.on { background:var(--accent); border-color:var(--accent); color:#fff; }

    /* menu « ☰ » (outils) */
    html.m-ui #m-more { display:flex; flex-direction:column; gap:12px; position:absolute; top:calc(var(--m-head) + 6px); right:8px; z-index:40;
      width:min(330px, calc(100% - 16px)); max-height:calc(100% - var(--m-head) - 16px); overflow:auto; background:var(--card);
      border:1px solid var(--line); border-radius:12px; box-shadow:0 10px 30px rgba(30,25,15,.22); padding:12px; }
    html.m-ui #m-more[hidden] { display:none; }
    html.m-ui #m-more .m-sec { font-size:11px; text-transform:uppercase; letter-spacing:.07em; color:var(--mute); font-weight:600; margin-bottom:-4px; }
    html.m-ui #m-more .toolbar { display:flex; flex-wrap:wrap; gap:8px; }
    html.m-ui #m-more .toolbar > button, html.m-ui #m-more .dd > button { min-height:42px; flex:1 1 auto; justify-content:center; }
    html.m-ui #m-more #btn-undo, html.m-ui #m-more #btn-redo { border:1px solid var(--line-strong); background:var(--card); }
    html.m-ui #m-more .hide-md { display:inline; }
    html.m-ui #m-more .switch { min-height:40px; font-size:14px; }
    html.m-ui #m-more .dd { flex:1 1 100%; }
    html.m-ui #m-more .dd > button { width:100%; }
    html.m-ui #m-more .dd-panel { position:static; box-shadow:none; margin-top:8px; padding:6px 10px; min-width:0; }
    html.m-ui #m-more .dd-panel .switch { min-height:38px; }

    /* vue 3D */
    html.m-ui #view { position:absolute; left:0; right:0; top:var(--m-head); bottom:var(--m-peek); height:auto !important; min-height:0 !important; }
    html.m-ui.m-walk #view { bottom:0; }
    html.m-ui #walkhint { display:none !important; }

    /* mode visite (export.js) : l'en-tête compact garde vues, Marcher et Réaliste ; le bandeau (à gauche) et Image/Plan (à droite)
       sont posés en haut de la vue ; la légende tactile en bas */
    html.m-ui.view-mode #visit-banner { position:absolute; left:8px; top:8px; z-index:6; max-width:calc(100% - 112px); padding:4px 10px; font-size:12px;
      background:rgba(251,250,247,.94); border:1px solid var(--line); box-shadow:var(--shadow); }
    html.m-ui.view-mode.m-walk #visit-banner { display:none; }
    html.m-ui.view-mode #visit-tools { position:absolute; right:8px; top:4px; z-index:6; gap:6px; }
    html.m-ui.view-mode #visit-tools button { min-width:42px; min-height:40px; padding:0 8px; justify-content:center; background:rgba(251,250,247,.94); box-shadow:var(--shadow); }
    html.m-ui.view-mode #visit-tools .hide-md { display:none; }
    /* marche : en bas à droite, à l'opposé du joystick (la bulle d'aide de la marche occupe le haut) */
    html.m-ui.view-mode.m-walk #visit-tools { top:auto; right:max(12px, env(safe-area-inset-right)); bottom:calc(22px + env(safe-area-inset-bottom)); }
    html.m-ui.view-mode #visit-legend { left:8px; right:8px; bottom:calc(8px + env(safe-area-inset-bottom)); max-width:none; text-align:center; }
    html.m-ui.view-mode #visit-legend[hidden] { display:none; }
    html.m-ui.view-mode #warn { top:44px; }
    html.m-ui #warn { left:8px; top:8px; bottom:auto; max-width:calc(100% - 16px); font-size:12px; }
    html.m-ui #toast { top:auto; bottom:66px; max-width:calc(100% - 24px); }
    html.m-ui #m-hint, html.m-ui #el-hint { white-space:normal; max-width:calc(100% - 24px); text-align:center; }
    html.m-ui #m-hint.touch { width:max-content; text-align:left; }
    html.m-ui #m-hint.touch span { flex:1 1 auto; min-width:0; }
    /* « Effacer les mesures » : en bas à droite (en haut, les bulles d'aide le recouvrent), au-dessus de la barre du meuble */
    html.m-ui #m-clear { top:auto; right:8px; bottom:66px; }

    /* onglet Élec compact : la bulle d'aide dans la vue remplace la consigne, types de points en 4 colonnes,
       liste des points dans un cadre défilant, vérifications plus serrées */
    html.m-ui #elec-card { padding:10px; }
    html.m-ui #elec-card .card-head { margin-bottom:4px; }
    html.m-ui #elec-card > .card-head + .legend { display:none; }
    html.m-ui #elec-card .el-types { grid-template-columns:repeat(4, minmax(0, 1fr)); gap:4px; padding:6px; margin-top:4px; border-radius:9px; }
    html.m-ui #elec-card .el-types::before { font-size:10px; margin-bottom:-1px; }
    html.m-ui #elec-card .el-types button { justify-content:center; min-height:44px; padding:3px 2px; font-size:11.5px; line-height:1.2;
      text-align:center; white-space:normal; overflow-wrap:anywhere; }
    html.m-ui #elec-card #el-sel { margin-top:8px !important; padding-top:6px !important; }
    html.m-ui #elec-card #el-sel .group-label { margin-bottom:2px; }
    html.m-ui #elec-card #el-sel .row { gap:6px; margin-top:4px; }
    html.m-ui #elec-card #el-sel .legend { font-size:11.5px; margin-top:4px; }
    html.m-ui #elec-card .el-list { max-height:min(30vh, 220px); margin-top:6px; border:1px solid var(--line); border-radius:8px; padding:2px; }
    html.m-ui #elec-card .el-list li { min-height:36px; padding:2px 8px; font-size:13px; }
    html.m-ui #elec-card .btns { margin-top:6px; }
    html.m-ui #elec-card .el-checks li { font-size:12.5px; padding:4px; }
    html.m-ui #pass-panel { width:min(236px, calc(100% - 28px)); }

    /* aide tactile */
    html.m-ui #m-touchhint { display:block; left:50%; top:10px; transform:translateX(-50%); z-index:6; width:max-content; max-width:calc(100% - 20px); padding:7px 36px 7px 11px; color:var(--ink); font-size:12px; }
    html.m-ui #m-touchhint[hidden] { display:none; }
    html.m-ui #m-touchhint button { position:absolute; top:2px; right:2px; width:32px; height:32px; padding:0; border:none; background:transparent; color:var(--mute); font-size:17px; }

    /* barre d'actions du meuble sélectionné */
    html.m-ui #m-actbar { display:flex; position:absolute; left:8px; right:8px; bottom:8px; z-index:7; gap:4px; align-items:center;
      background:rgba(251,250,247,.97); border:1px solid var(--line); border-radius:12px; box-shadow:0 4px 18px rgba(30,25,15,.16); padding:4px; }
    html.m-ui #m-actbar[hidden] { display:none; }
    html.m-ui #m-actbar button { min-width:40px; min-height:40px; padding:0 6px; flex:none; font-size:14px; }
    html.m-ui #m-actbar .m-name { flex:1 1 auto; min-width:0; text-align:left; border:none; background:transparent; font-weight:600; font-size:13px;
      overflow:hidden; text-overflow:ellipsis; white-space:nowrap; padding:0 6px; }

    /* tiroir du bas */
    html.m-ui #m-sheet { display:flex; flex-direction:column; position:absolute; left:0; right:0; bottom:0; z-index:20; height:var(--m-peek);
      background:var(--panel); border-top:1px solid var(--line); border-radius:14px 14px 0 0; box-shadow:0 -6px 24px rgba(30,25,15,.12);
      transition:height .2s ease; padding-bottom:env(safe-area-inset-bottom); }
    html.m-ui #m-sheet.open { height:var(--m-open); }
    html.m-ui #m-sheet.dragging { transition:none; }
    html.m-ui.m-walk #m-sheet { display:none; }
    html.m-ui #m-grip { flex:none; height:16px; display:flex; align-items:center; justify-content:center; touch-action:none; cursor:grab; }
    html.m-ui #m-grip::before { content:""; width:40px; height:5px; border-radius:99px; background:var(--line-strong); }
    html.m-ui #m-tabs { flex:none; display:flex; gap:2px; padding:0 6px; height:44px; border-bottom:1px solid transparent; }
    html.m-ui #m-sheet.open #m-tabs { border-bottom-color:var(--line); }
    html.m-ui #m-tabs button { flex:1 1 0; min-width:0; min-height:40px; border:none; background:transparent; border-radius:8px; padding:0 2px;
      color:var(--mute); font-size:13px; font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    html.m-ui #m-tabs button.active { color:var(--accent); background:var(--accent-soft); font-weight:600; }
    html.m-ui #m-body { flex:1 1 auto; min-height:0; position:relative; }
    html.m-ui #m-sheet:not(.open) #m-body { display:none; }
    html.m-ui aside.m-pane { position:absolute; inset:0; border:none; overscroll-behavior:contain; -webkit-overflow-scrolling:touch; }
    html.m-ui aside.m-pane[hidden] { display:none; }

    /* cibles tactiles et champs (16 px : pas de zoom automatique sur iPhone) */
    html.m-ui aside.m-pane button { min-height:40px; }
    html.m-ui aside.m-pane input[type=text], html.m-ui aside.m-pane input[type=number], html.m-ui aside.m-pane input[type=search],
    html.m-ui aside.m-pane select, html.m-ui #m-more select { font-size:16px; min-height:40px; }
    html.m-ui aside.m-pane ul#list li { min-height:40px; }
    html.m-ui aside.m-pane .switch { min-height:36px; }
    html.m-ui aside.m-pane .scen summary { min-height:40px; }
    html.m-ui aside.m-pane #hist-list li button { min-height:36px; }
    html.m-ui aside.m-pane .lt-colors .sw { width:30px; height:30px; min-height:0; }
    html.m-ui aside.m-pane input[type=range] { height:28px; }

    /* marche : joystick + zone pour regarder */
    html.m-ui.m-walk #m-walkui { display:block; position:absolute; inset:0; z-index:6; pointer-events:none; }
    html.m-ui #m-joy { position:absolute; left:max(18px, env(safe-area-inset-left)); bottom:calc(22px + env(safe-area-inset-bottom)); width:132px; height:132px; border-radius:50%;
      background:rgba(31,35,40,.28); border:2px solid rgba(255,255,255,.55); pointer-events:auto; touch-action:none; }
    html.m-ui #m-joy i { position:absolute; left:50%; top:50%; width:56px; height:56px; margin:-28px 0 0 -28px; border-radius:50%;
      background:rgba(255,255,255,.9); box-shadow:0 2px 8px rgba(0,0,0,.3); }
    html.m-ui #m-walktip { position:absolute; left:50%; top:10px; transform:translateX(-50%); width:max-content; max-width:calc(100% - 20px); text-align:center;
      background:rgba(31,35,40,.86); color:#f3f1ec; border:none; animation:m-fade .6s 7s forwards; }
    @keyframes m-fade { to { opacity:0; visibility:hidden; } }
  }
  /* paysage (téléphone couché) : tiroir à droite, vue sur toute la hauteur */
  @media ${NARROW} and (orientation: landscape) and (max-height: 560px) {
    html.m-ui { --m-head:48px; --m-peek:calc(58px + env(safe-area-inset-bottom)); }
    html.m-ui #view { bottom:0; }
    html.m-ui #m-sheet { left:auto; right:max(0px, env(safe-area-inset-right)); width:min(370px, 46%); border-left:1px solid var(--line); border-radius:14px 0 0 0; }
    html.m-ui #m-sheet.open { height:calc(100% - var(--m-head)); }
    html.m-ui #m-actbar { right:calc(min(370px, 46%) + 10px); }
    html.m-ui #toast { bottom:62px; }
    /* bulles centrées sur la partie de la vue non couverte par le tiroir */
    html.m-ui:not(.view-mode):not(.m-walk) :is(#m-touchhint, #toast, #m-hint, #el-hint) { left:calc((100% - min(370px, 46%)) / 2); max-width:calc(100% - min(370px, 46%) - 20px); }
  }
  @media ${NARROW} and (orientation: portrait) {
    html.m-ui.m-open #m-actbar { display:none; }
  }
  @media ${NARROW} {
    html.m-ui.view-mode #view { bottom:0; }
  }
  @media (max-width: 420px) {
    html.m-ui .brand h1 { display:none; }
    html.m-ui.view-mode .brand { display:none; }
    html.m-ui.view-mode header .switch { font-size:12.5px; gap:5px; }
    html.m-ui #btn-walk .m-wlbl { display:none; }
    html.m-ui .seg button { padding:0 8px; font-size:12.5px; }
  }`;
  document.head.appendChild(css);

  // ------------------------------------------------------------------ outils
  const el = (tag, props, kids) => {
    const e = document.createElement(tag);
    Object.assign(e, props || {});
    (kids || []).forEach((k) => e.appendChild(typeof k === 'string' ? document.createTextNode(k) : k));
    return e;
  };
  const cardOf = (id) => { const n = $(id); return n ? n.closest('section.card') || n : null; };
  // en visite (lien en lecture seule), rien n'est lu ni écrit dans le navigateur (ADR 0009)
  const store = viewOnly ? { get() { return null; }, set() {} }
    : { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };

  // ------------------------------------------------------------------ tactile (tous écrans tactiles)
  // OrbitControls (r128) gère le doigt via touchstart, que l'appui sur un meuble n'arrête pas (app.js n'arrête que pointerdown) :
  // si le pointerdown a été « pris » (meuble saisi, repère électrique...), on empêche OrbitControls de tourner en même temps.
  const view = $('view');
  const cvs = A.renderer.domElement;
  let grabbed = null; // identifiant du pointeur tactile qui déplace un objet
  if (isTouch) {
    view.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch' && e.target === cvs && grabbed === null) grabbed = e.pointerId; }, true);
    view.addEventListener('pointerdown', (e) => { if (grabbed === e.pointerId) grabbed = null; }); // parvenu jusqu'ici : personne ne l'a pris
    const release = (e) => { if (grabbed === e.pointerId) grabbed = null; };
    window.addEventListener('pointerup', release, true);
    window.addEventListener('pointercancel', release, true);
    view.addEventListener('touchstart', (e) => {
      if (e.target !== cvs || walkOn) return;
      // outil Mesurer : le 1er doigt pose un point ; un 2e doigt rend la main à la caméra (zoom / déplacement à 2 doigts)
      if (grabbed !== null && A.tool === 'measure' && e.touches.length > 1) grabbed = null;
      if (grabbed !== null) { e.stopPropagation(); e.preventDefault(); }
    }, { capture: true, passive: false });
    view.addEventListener('touchmove', (e) => {
      if (e.target === cvs && grabbed !== null && !walkOn) { e.stopPropagation(); e.preventDefault(); }
    }, { capture: true, passive: false });
    // vue Dessus (rotation désactivée) : un doigt fait défiler le plan
    A.hooks.frame.push(() => {
      const one = A.controls.enableRotate ? THREE.TOUCH.ROTATE : THREE.TOUCH.PAN;
      if (A.controls.touches.ONE !== one) A.controls.touches.ONE = one;
    });
    // encoches / coins arrondis
    const vp = document.querySelector('meta[name=viewport]');
    if (vp && !/viewport-fit/.test(vp.content)) vp.content += ', viewport-fit=cover';
  }

  // ------------------------------------------------------------------ marche au doigt (joystick + glisser pour regarder)
  // app.js n'expose pas l'état de la marche : on le pilote par des événements clavier (Z Q S D, Maj)
  // et souris (mousedown + mousemove avec movementX/Y) synthétiques, exactement comme au clavier/à la souris.
  let walkOn = false;
  const keyState = {};
  function key(k, down) {
    if (!!keyState[k] === down) return;
    keyState[k] = down;
    window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { key: k, bubbles: true, cancelable: true }));
  }
  const releaseKeys = () => ['z', 's', 'q', 'd', 'Shift'].forEach((k) => key(k, false));
  function mouse(type, target, mx, my) {
    const ev = new MouseEvent(type, { bubbles: true, cancelable: true, movementX: mx || 0, movementY: my || 0 });
    if (ev.movementX !== (mx || 0)) Object.defineProperty(ev, 'movementX', { value: mx || 0 });
    if (ev.movementY !== (my || 0)) Object.defineProperty(ev, 'movementY', { value: my || 0 });
    target.dispatchEvent(ev);
  }

  const walkUI = el('div', { id: 'm-walkui' });
  const joy = el('div', { id: 'm-joy', title: 'Glisse pour marcher' }, [el('i')]);
  const walkTip = el('div', { id: 'm-walktip', className: 'bubble', textContent: 'Joystick : marcher · glisser dans la vue : regarder · « 🚶 » pour sortir' });
  walkUI.append(walkTip, joy);
  view.appendChild(walkUI);

  let joyId = null;
  const knob = joy.firstChild;
  function joyMove(e) {
    const r = joy.getBoundingClientRect(), R = r.width / 2;
    let dx = e.clientX - (r.left + R), dy = e.clientY - (r.top + R);
    const d = Math.hypot(dx, dy), max = R - 10;
    if (d > max) { dx *= max / d; dy *= max / d; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const nx = dx / max, ny = dy / max, T = 0.35;
    key('z', ny < -T); key('s', ny > T); key('q', nx < -T); key('d', nx > T);
    key('Shift', Math.hypot(nx, ny) > 0.92);
  }
  function joyEnd() { joyId = null; knob.style.transform = ''; releaseKeys(); }
  joy.addEventListener('pointerdown', (e) => {
    e.preventDefault(); e.stopPropagation();
    joyId = e.pointerId;
    try { joy.setPointerCapture(e.pointerId); } catch (err) {}
    joyMove(e);
  });
  joy.addEventListener('pointermove', (e) => { if (e.pointerId === joyId) joyMove(e); });
  joy.addEventListener('pointerup', (e) => { if (e.pointerId === joyId) joyEnd(); });
  joy.addEventListener('pointercancel', (e) => { if (e.pointerId === joyId) joyEnd(); });

  // regarder : un doigt glissé sur la vue (le contenu suit le doigt)
  let look = null;
  const LOOK = 1.6;
  view.addEventListener('touchstart', (e) => {
    if (!walkOn || e.target !== cvs) return;
    e.preventDefault(); // pas de clic -> pas de demande de verrouillage du pointeur
    if (look) return;
    const t = e.changedTouches[0];
    look = { id: t.identifier, x: t.clientX, y: t.clientY };
    mouse('mousedown', cvs);
  }, { capture: true, passive: false });
  view.addEventListener('touchmove', (e) => {
    if (!walkOn || !look) return;
    const t = Array.from(e.changedTouches).find((x) => x.identifier === look.id);
    if (!t) return;
    e.preventDefault();
    const dx = t.clientX - look.x, dy = t.clientY - look.y;
    look.x = t.clientX; look.y = t.clientY;
    mouse('mousemove', window, -dx * LOOK, -dy * LOOK);
  }, { capture: true, passive: false });
  const lookEnd = (e) => {
    if (!look || !Array.from(e.changedTouches).some((x) => x.identifier === look.id)) return;
    look = null;
    mouse('mouseup', window);
  };
  view.addEventListener('touchend', lookEnd, true);
  view.addEventListener('touchcancel', lookEnd, true);
  document.addEventListener('visibilitychange', () => { if (document.hidden) { releaseKeys(); joyEnd(); } });

  // ------------------------------------------------------------------ interface petit écran
  let built = false, active = false;
  const moved = []; // { node, ph } : nœuds déplacés et leur place d'origine
  function moveTo(node, parent) {
    if (!node) return;
    const ph = document.createComment('m-place');
    node.parentNode.insertBefore(ph, node);
    moved.push({ node, ph });
    parent.appendChild(node);
  }

  let header, moreBtn, more, sheet, tabsBar, body, actbar, actName, touchHint;
  const TABS = [
    { id: 'meubles', label: 'Meubles', nodes: () => [cardOf('scen-select'), cardOf('catalog'), $('custom-card')] },
    { id: 'piece', label: 'Pièce', nodes: () => [cardOf('list'), cardOf('props'), (() => { const s = cardOf('props'); const n = s && s.nextElementSibling; return n && n.classList.contains('legend') ? n : null; })(), $('fixtures-card')] },
    { id: 'lumiere', label: 'Lumière', nodes: () => [$('lights-card')] },
    { id: 'budget', label: 'Budget', nodes: () => [$('budget-card')] },
    { id: 'elec', label: 'Élec', nodes: () => [$('elec-card')] },
  ];
  const panes = {};
  let curTab = 'meubles';

  function build() {
    built = true;
    header = document.querySelector('header');
    moreBtn = el('button', { id: 'm-more-btn', type: 'button', title: 'Outils : mesurer, électricité, affichage, annuler', textContent: '☰' });
    moreBtn.setAttribute('aria-haspopup', 'true');
    moreBtn.setAttribute('aria-expanded', 'false');
    more = el('div', { id: 'm-more', hidden: true });
    more.setAttribute('role', 'menu');

    sheet = el('div', { id: 'm-sheet' });
    const grip = el('div', { id: 'm-grip', title: 'Ouvrir / fermer le panneau' });
    tabsBar = el('nav', { id: 'm-tabs' });
    tabsBar.setAttribute('role', 'tablist');
    body = el('div', { id: 'm-body' });
    TABS.forEach((t) => {
      const b = el('button', { type: 'button', textContent: t.label });
      b.dataset.tab = t.id;
      b.setAttribute('role', 'tab');
      b.onclick = () => { if (curTab === t.id && sheet.classList.contains('open')) setOpen(false); else { showTab(t.id); setOpen(true); } };
      tabsBar.appendChild(b);
      panes[t.id] = el('aside', { className: 'm-pane', hidden: true });
      body.appendChild(panes[t.id]);
    });
    sheet.append(grip, tabsBar, body);

    // poignée : toucher = ouvrir/fermer ; glisser = régler la hauteur
    let gd = null;
    grip.addEventListener('pointerdown', (e) => {
      gd = { y: e.clientY, h: sheet.getBoundingClientRect().height, moved: false };
      try { grip.setPointerCapture(e.pointerId); } catch (err) {}
    });
    grip.addEventListener('pointermove', (e) => {
      if (!gd) return;
      const dy = e.clientY - gd.y;
      if (!gd.moved && Math.abs(dy) < 6) return;
      gd.moved = true;
      const appH = $('app').getBoundingClientRect().height;
      const h = Math.max(50, Math.min(appH - 60, gd.h - dy));
      sheet.classList.add('dragging', 'open');
      html.classList.add('m-open');
      sheet.style.height = h + 'px';
    });
    const gEnd = () => {
      if (!gd) return;
      const wasMove = gd.moved;
      gd = null;
      sheet.classList.remove('dragging');
      if (!wasMove) { setOpen(!sheet.classList.contains('open')); return; }
      const h = sheet.getBoundingClientRect().height;
      if (h < 130) { sheet.style.height = ''; setOpen(false); }
      else setOpen(true, true);
    };
    grip.addEventListener('pointerup', gEnd);
    grip.addEventListener('pointercancel', gEnd);

    // barre d'actions du meuble sélectionné
    actbar = el('div', { id: 'm-actbar', hidden: true });
    actName = el('button', { type: 'button', className: 'm-name', title: 'Détails du meuble' });
    actName.onclick = () => { showTab('piece'); setOpen(true); };
    const ab = (txt, title, fn, cls) => { const b = el('button', { type: 'button', textContent: txt, title, className: cls || '' }); b.setAttribute('aria-label', title); b.onclick = fn; return b; };
    const clickId = (id) => () => { const b = $(id); if (b) b.click(); };
    actbar.append(actName,
      ab('⟲', 'Pivoter de 15° à gauche', clickId('btn-rl')),
      ab('⟳', 'Pivoter de 15° à droite', clickId('btn-rr')),
      ab('90°', 'Pivoter de 90°', clickId('btn-r90')),
      ab('⧉', 'Dupliquer', clickId('btn-dup')),
      ab('🗑', 'Supprimer', clickId('btn-del'), 'danger'),
      ab('✕', 'Désélectionner', () => A.select(null)));

    // aide tactile
    touchHint = el('div', { id: 'm-touchhint', className: 'bubble', hidden: true });
    touchHint.appendChild(el('span', { textContent: viewOnly
      ? 'Visite en lecture seule · 1 doigt : tourner (défiler en vue Dessus) · 2 doigts : zoomer / déplacer'
      : '1 doigt sur un meuble : le déplacer · 1 doigt ailleurs : tourner (défiler en vue Dessus) · 2 doigts : zoomer / déplacer' }));
    const thx = el('button', { type: 'button', textContent: '×', title: "Masquer l'aide" });
    thx.setAttribute('aria-label', "Masquer l'aide");
    thx.onclick = () => { touchHint.hidden = true; store.set('amenagement-touchhint-off', '1'); };
    touchHint.appendChild(thx);

    moreBtn.addEventListener('click', (e) => { e.stopPropagation(); setMore(more.hidden); });
    document.addEventListener('click', (e) => {
      if (!active || more.hidden) return;
      if (!more.contains(e.target) && e.target !== moreBtn) setMore(false);
    });
    // les outils ferment le menu (on veut voir la vue)
    more.addEventListener('click', (e) => { if (e.target.closest('#m-tool, #elec-btn')) setTimeout(() => setMore(false), 0); });
    // un meuble ajouté depuis le catalogue : refermer le tiroir pour le voir posé
    document.addEventListener('click', (e) => { if (active && e.target.closest('#catalog button.cat, #custom-card button.primary')) setOpen(false); });
  }

  function setMore(open) {
    more.hidden = !open;
    moreBtn.classList.toggle('on', open);
    moreBtn.setAttribute('aria-expanded', String(open));
  }
  function showTab(id) {
    curTab = id;
    tabsBar.querySelectorAll('button').forEach((b) => { const on = b.dataset.tab === id; b.classList.toggle('active', on); b.setAttribute('aria-selected', String(on)); });
    Object.entries(panes).forEach(([k, p]) => (p.hidden = k !== id));
  }
  function setOpen(open, keepHeight) {
    if (!sheet) return;
    if (!keepHeight) sheet.style.height = '';
    sheet.classList.toggle('open', open);
    html.classList.toggle('m-open', open);
    updateActbar();
  }

  function updateActbar() {
    if (!actbar) return;
    const s = A.getSelected();
    const show = active && !viewOnly && !walkOn && !!s;
    actbar.hidden = !show;
    if (show) actName.textContent = s.name;
  }

  let walkBtnHTML = null;
  function enter() {
    { const sg = document.querySelector('header .seg'); if (sg && sg.closest('.toolbar')) sg.closest('.toolbar').classList.add('m-views'); } // barre des vues : prend la place restante
    if (active) return;
    if (!built) build();
    active = true;
    html.classList.add('m-ui');
    // en-tête : « Marcher » réduit à l'icône en portrait
    const wb = $('btn-walk');
    if (wb && walkBtnHTML === null) { walkBtnHTML = wb.innerHTML; wb.innerHTML = '🚶 <span class="m-wlbl">Marcher</span>'; }
    // outils de l'en-tête rangés dans le menu « ☰ » (sauf en visite : seulement vues, Marcher, Réaliste)
    const realBar = $('real') && $('real').closest('.toolbar');
    if (!viewOnly) {
      header.appendChild(moreBtn);
      const sec = (t) => more.appendChild(el('div', { className: 'm-sec', textContent: t }));
      const undoBar = $('btn-undo') && $('btn-undo').closest('.toolbar');
      sec('Modifications'); moveTo(undoBar, more);
      sec('Outils'); moveTo($('tools-slot'), more); moveTo($('elec-slot'), more);
      sec('Affichage'); moveTo(realBar, more);
      header.after(more);
      // tiroir
      TABS.forEach((t) => t.nodes().forEach((n) => n && moveTo(n, panes[t.id])));
      $('app').appendChild(sheet);
      view.appendChild(actbar);
      showTab(curTab);
      setOpen(false);
    } else {
      const dd = $('disp-dd');
      if (dd) dd.style.display = 'none';
      // bandeau « Visite · lecture seule » et boutons Image/Plan : en haut de la vue (l'en-tête compact n'a pas la place)
      ['visit-banner', 'visit-tools'].forEach((id) => { const n = $(id); if (n) moveTo(n, view); });
    }
    // aide tactile : en visite, la légende d'export.js (version tactile) en tient lieu
    if (!viewOnly) view.appendChild(touchHint);
    if (!viewOnly && store.get('amenagement-touchhint-off') !== '1' && !walkOn) {
      touchHint.hidden = false;
      const hide = () => { touchHint.hidden = true; };
      setTimeout(hide, 15000);
      // dès le premier geste dans la vue, l'aide s'efface peu après
      cvs.addEventListener('touchstart', () => setTimeout(hide, 2500), { once: true, passive: true });
    }
    updateActbar();
  }
  function exit() {
    if (!active) return;
    active = false;
    html.classList.remove('m-ui', 'm-open', 'm-walk');
    setMore(false);
    // remettre chaque nœud à sa place d'origine (ordre inverse)
    while (moved.length) { const { node, ph } = moved.pop(); ph.parentNode.insertBefore(node, ph); ph.remove(); }
    more.textContent = '';
    [moreBtn, more, sheet, actbar, touchHint].forEach((n) => n && n.remove());
    const wb = $('btn-walk');
    if (wb && walkBtnHTML !== null) { wb.innerHTML = walkBtnHTML; walkBtnHTML = null; }
    const dd = $('disp-dd');
    if (dd) dd.style.display = '';
  }

  // ------------------------------------------------------------------ suivi de l'état de l'application
  let lastSel = undefined, lastTool = null;
  A.hooks.change.push(updateActbar);
  A.hooks.frame.push(() => {
    const w = !!A.isWalking();
    if (w !== walkOn) {
      walkOn = w;
      html.classList.toggle('m-walk', w);
      if (!w) { releaseKeys(); joyEnd(); if (look) { look = null; mouse('mouseup', window); } }
      else if (active) { setMore(false); setOpen(false); if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); }
      updateActbar();
    }
    const s = A.getSelected();
    if (s !== lastSel) { lastSel = s; updateActbar(); }
    else if (s && actbar && !actbar.hidden && actName.textContent !== s.name) actName.textContent = s.name;
    if (touchHint && !touchHint.hidden && (walkOn || A.tool)) touchHint.hidden = true; // ne pas couvrir les bulles des outils
    if (A.tool !== lastTool) {
      // mode Électricité : ouvrir son onglet (les types de points à poser y sont)
      if (active && !viewOnly && A.tool === 'elec') { showTab('elec'); setOpen(true); }
      lastTool = A.tool;
    }
  });

  // ------------------------------------------------------------------ démarrage
  function init() {
    if (isTouch && mqNarrow.matches) {
      // rendu réaliste lourd : jamais actif d'office sur téléphone (le navigateur peut restaurer la case cochée)
      const r = $('real');
      if (r && r.checked) { r.checked = false; r.dispatchEvent(new Event('change')); }
    }
    if (mqNarrow.matches) enter();
    const onChange = () => (mqNarrow.matches ? enter() : exit());
    if (mqNarrow.addEventListener) mqNarrow.addEventListener('change', onChange); else mqNarrow.addListener(onChange);
  }
  // après le script en ligne d'index.html (qui range les interrupteurs de measure.js dans le menu Affichage)
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
