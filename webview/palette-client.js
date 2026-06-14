'use strict';

/*
 * Skills Palette webview client.
 *
 * Shipped as a STATIC file and loaded via webview.asWebviewUri (a nonce'd external
 * script reference), NOT generated inline from function .toString(). That keeps the
 * packaged extension free of dynamically-assembled script-tag source, which a content
 * scanner reads as code generation. Initial state arrives as a JSON data block
 * (#palette-initial-state, type="application/json" - data, not executable code); all
 * later updates come over postMessage.
 *
 * The four Markdown helpers + normLayout are defined here directly. The host
 * (src/webviewPalette.js) keeps its own copies for computeState + the unit tests;
 * the two must stay behaviourally identical (the markdown-security tests guard the
 * host copy, and webviewPalette.test.js parses this file).
 */

// ── Shared helpers (mirror of the host copies in src/webviewPalette.js) ───────────
function normLayout(v) { return v === 'list' ? 'list' : 'grid'; }
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escAttr(s) {
  return esc(s).replace(/"/g, '&quot;');
}
function inline(t) {
  t = esc(t);
  t = t.replace(/`([^`]+)`/g, function (_, c) { return '<code>' + c + '</code>'; });
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, function (_, txt, url) {
    var u = String(url).trim();
    var safe = /^(https?:|mailto:|#|\/|\.)/i.test(u) ? u : '#';
    return '<a href="' + escAttr(safe) + '" title="' + escAttr(safe) + '">' + txt + '</a>';
  });
  return t;
}
function mdToHtml(md) {
  var lines = String(md || '').replace(/\r\n/g, '\n').split('\n');
  var html = '', inCode = false, inList = false, para = [];
  function flushPara() { if (para.length) { html += '<p>' + inline(para.join(' ')) + '</p>'; para = []; } }
  function flushList() { if (inList) { html += '</ul>'; inList = false; } }
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (/^```/.test(line)) { if (inCode) { html += '</code></pre>'; inCode = false; } else { flushPara(); flushList(); html += '<pre><code>'; inCode = true; } continue; }
    if (inCode) { html += esc(line) + '\n'; continue; }
    var h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) { flushPara(); flushList(); var lvl = h[1].length; html += '<h' + lvl + '>' + inline(h[2]) + '</h' + lvl + '>'; continue; }
    var q = /^>\s?(.*)$/.exec(line);
    if (q) { flushPara(); flushList(); html += '<blockquote>' + inline(q[1]) + '</blockquote>'; continue; }
    var li = /^\s*[-*]\s+(.*)$/.exec(line);
    if (li) { flushPara(); if (!inList) { html += '<ul>'; inList = true; } html += '<li>' + inline(li[1]) + '</li>'; continue; }
    if (/^\s*$/.test(line)) { flushPara(); flushList(); continue; }
    para.push(line);
  }
  if (inCode) html += '</code></pre>';
  flushPara(); flushList();
  return html;
}

// ── Client state, seeded from the JSON data block ─────────────────────────────────
const vscode = acquireVsCodeApi();
const stateEl = document.getElementById('palette-initial-state');
let state = JSON.parse(stateEl ? stateEl.textContent : '{}');
let activeCat = '__all__';
let query = '';
let tab = 'hub';          // top-level scope: 'hub' (whole hub) | 'project' (linked here)
let view = 'list';        // main area: 'list' (skills) | 'preview' (readme)
let layout = normLayout(state.layout); // skill layout within the list: 'grid' | 'list'
let preview = null;       // { name, title, body }

const navEl = document.getElementById('nav');
const mainEl = document.getElementById('main');
const projEl = document.getElementById('proj');
const searchEl = document.getElementById('search');

searchEl.addEventListener('input', () => { query = searchEl.value.trim().toLowerCase(); if (view === 'list') renderMain(); });

const gridBtn = document.getElementById('layout-grid');
const listBtn = document.getElementById('layout-list');
function applyLayoutButtons() {
  gridBtn.classList.toggle('active', layout === 'grid');
  listBtn.classList.toggle('active', layout === 'list');
  // expose the active layout to screen readers (the visual .active class alone is silent)
  gridBtn.setAttribute('aria-pressed', String(layout === 'grid'));
  listBtn.setAttribute('aria-pressed', String(layout === 'list'));
}
// grid/list differ only by classes on the wrapper + cards, so switch in place instead
// of rebuilding the DOM. Faster, and it preserves the scroll position.
function applyLayout() {
  const wraps = mainEl.querySelectorAll('.grid, .list');
  if (!wraps.length) { if (view === 'list') renderMain(); return; }
  for (const wrap of wraps) {
    wrap.className = (layout === 'list') ? 'list' : 'grid';
    for (const card of wrap.children) card.classList.toggle('rowitem', layout === 'list');
  }
}
function setLayout(v) {
  layout = normLayout(v);
  applyLayoutButtons();
  applyLayout();
  vscode.postMessage({ type: 'setLayout', layout: layout });
}
gridBtn.addEventListener('click', () => setLayout('grid'));
listBtn.addEventListener('click', () => setLayout('list'));
applyLayoutButtons();

// Top-level tabs. The project tab is disabled until a project folder is open,
// since "linked here" has no meaning without one.
const hubTabBtn = document.getElementById('tab-hub');
const projTabBtn = document.getElementById('tab-project');
function applyTabButtons() {
  hubTabBtn.classList.toggle('active', tab === 'hub');
  projTabBtn.classList.toggle('active', tab === 'project');
  hubTabBtn.setAttribute('aria-selected', String(tab === 'hub'));
  projTabBtn.setAttribute('aria-selected', String(tab === 'project'));
  projTabBtn.disabled = !state.hasProject;
  projTabBtn.title = state.hasProject ? '' : 'Open a project folder to see its linked skills.';
}
function setTab(t) {
  const next = (t === 'project' && state.hasProject) ? 'project' : 'hub';
  if (next === tab) return;
  tab = next;
  view = 'list';            // leave any open README preview when switching scope
  applyTabButtons();
  renderNav();              // counts are scoped to the active tab
  renderMain();
}
hubTabBtn.addEventListener('click', () => setTab('hub'));
projTabBtn.addEventListener('click', () => setTab('project'));

// Location scope. A skill linked globally is "global" even if also linked locally
// (global wins - it's already active everywhere), so Local excludes those.
function isGlobal(s) { return s.glob === 'linked' || s.glob === 'broken'; }
function isLocal(s) { return s.proj === 'linked' || s.proj === 'broken'; }
function projectSkills() { return state.skills.filter((s) => isLocal(s) || isGlobal(s)); }
function tabSkills() { return tab === 'project' ? projectSkills() : state.skills; }

function counts() {
  const m = new Map();
  for (const s of tabSkills()) m.set(s.category, (m.get(s.category) || 0) + 1);
  return m;
}
var PENCIL = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>';
var TRASH = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>';
var PIN = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg>';
var FOLDER = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>';
var EYE = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>';

function navSep() { const s = document.createElement('div'); s.className = 'nav-sep'; navEl.appendChild(s); }

function mkCat(id, label, n, opts) {
  opts = opts || {};
  const d = document.createElement('div');
  d.className = 'cat' + (activeCat === id ? ' active' : '');
  const t = document.createElement('span'); t.className = 'cat-name'; t.textContent = label; d.appendChild(t);
  const k = document.createElement('span'); k.className = 'count' + (opts.manageable ? ' swap' : ''); k.textContent = String(n); d.appendChild(k);
  if (opts.manageable) {
    const acts = document.createElement('span'); acts.className = 'cat-actions';
    const pin = document.createElement('button'); pin.className = 'cat-act pin' + (opts.pinned ? ' pinned' : ''); pin.innerHTML = PIN;
    pin.title = opts.pinned ? 'Unpin' : 'Pin to top'; pin.setAttribute('aria-label', pin.title);
    pin.addEventListener('click', (e) => { e.stopPropagation(); vscode.postMessage({ type: 'setPinned', label: label, pinned: !opts.pinned }); });
    const ren = document.createElement('button'); ren.className = 'cat-act'; ren.innerHTML = PENCIL; ren.title = 'Rename category'; ren.setAttribute('aria-label', ren.title);
    ren.addEventListener('click', (e) => { e.stopPropagation(); openModal('Rename category "' + label + '"', label, function (v) { vscode.postMessage({ type: 'renameCategory', old: label, label: v }); }); });
    const del = document.createElement('button'); del.className = 'cat-act del'; del.innerHTML = TRASH; del.title = 'Delete category (its skills become Uncategorized)'; del.setAttribute('aria-label', del.title);
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      if (n > 0) openConfirm('Delete category "' + label + '"? Its ' + n + ' skill' + (n === 1 ? '' : 's') + ' will become Uncategorized.', function () { vscode.postMessage({ type: 'deleteCategory', label: label }); });
      else vscode.postMessage({ type: 'deleteCategory', label: label });
    });
    acts.appendChild(pin); acts.appendChild(ren); acts.appendChild(del); d.appendChild(acts);
  }
  d.addEventListener('click', () => { activeCat = id; view = 'list'; renderNav(); renderMain(); });
  navEl.appendChild(d);
}

function renderNav() {
  const c = counts();
  navEl.textContent = '';
  // Fixed top items, always present. "All Skills" counts the active tab's scope.
  mkCat('__all__', 'All Skills', tabSkills().length, {});
  mkCat('Uncategorized', 'Uncategorized', c.get('Uncategorized') || 0, {});
  const addRow = document.createElement('div'); addRow.className = 'cat cat-add';
  const at = document.createElement('span'); at.className = 'cat-name'; at.textContent = '+ New category'; addRow.appendChild(at);
  addRow.addEventListener('click', () => openModal('New category', '', function (v) { vscode.postMessage({ type: 'createCategory', label: v }); }));
  navEl.appendChild(addRow);

  // state.categories is already A→Z; split into pinned and the rest (order kept).
  const pinned = state.categories.filter((x) => state.pinned.indexOf(x) >= 0);
  const rest = state.categories.filter((x) => state.pinned.indexOf(x) < 0);
  if (state.categories.length) {
    navSep();
    for (const cat of pinned) mkCat(cat, cat, c.get(cat) || 0, { manageable: true, pinned: true });
    if (pinned.length && rest.length) navSep();
    for (const cat of rest) mkCat(cat, cat, c.get(cat) || 0, { manageable: true, pinned: false });
  }
}
function matchFilters(s) {
  if (activeCat !== '__all__' && s.category !== activeCat) return false;
  if (query && !(s.title.toLowerCase().includes(query) || s.summary.toLowerCase().includes(query) || s.name.includes(query))) return false;
  return true;
}
function visible(list) { return (list || state.skills).filter(matchFilters); }
function renderProj() {
  projEl.textContent = state.hasProject ? ('-> ' + state.targetName) : '(no project open - project link disabled)';
}
function badge(cls, text) { const b = document.createElement('span'); b.className = 'badge ' + cls; b.textContent = text; return b; }
function btn(cls, text, on, disabled) {
  const b = document.createElement('button'); b.className = cls; b.textContent = text; b.disabled = !!disabled;
  if (!disabled) b.addEventListener('click', on); return b;
}
function iconBtn(cls, svg, title, on) {
  const b = document.createElement('button'); b.className = cls; b.type = 'button'; b.innerHTML = svg;
  b.title = title; b.setAttribute('aria-label', title);
  b.addEventListener('click', on); return b;
}

function categorySelect(skill) {
  const sel = document.createElement('select');
  const add = (val, label, selected) => { const o = document.createElement('option'); o.value = val; o.textContent = label; if (selected) o.selected = true; sel.appendChild(o); };
  const cur = skill.category;
  const isUncat = !cur || cur === 'Uncategorized';
  add('__uncat__', 'Uncategorized', isUncat);
  for (const cat of state.categories) { if (cat === 'Uncategorized') continue; add(cat, cat, cat === cur); }
  add('__new__', '+ New category…', false);
  sel.addEventListener('change', () => {
    const v = sel.value;
    if (v === '__new__') { openNewCategoryModal(skill.name); sel.value = isUncat ? '__uncat__' : cur; }
    else if (v === '__uncat__') vscode.postMessage({ type: 'setCategory', name: skill.name, label: '' });
    else vscode.postMessage({ type: 'setCategory', name: skill.name, label: v });
  });
  return sel;
}

function makeCard(s) {
  const linked = s.proj === 'linked';
  const broken = s.proj === 'broken';
  const card = document.createElement('div'); card.className = 'card' + (linked ? ' linked' : '') + (layout === 'list' ? ' rowitem' : '');
  const top = document.createElement('div'); top.className = 'top';
  const title = document.createElement('span'); title.className = 'title'; title.textContent = s.title;
  title.title = s.title; // full name on hover (the row truncates long names to one line)
  title.addEventListener('click', () => vscode.postMessage({ type: 'preview', name: s.name }));
  top.appendChild(title);
  const coveredByGlobal = s.glob === 'linked' && !linked;
  if (linked) top.appendChild(badge('proj', '✓ linked'));
  else if (broken) top.appendChild(badge('broken', 'broken'));
  if (s.glob === 'linked') {
    const gb = badge('glob', coveredByGlobal ? 'global · active here' : 'global');
    gb.title = 'Linked globally - available in every project automatically';
    top.appendChild(gb);
  }
  card.appendChild(top);
  const sum = document.createElement('div'); sum.className = 'summary'; sum.textContent = s.summary;
  sum.title = 'Open README preview';
  sum.addEventListener('click', () => vscode.postMessage({ type: 'preview', name: s.name }));
  card.appendChild(sum);
  // Row 3: every control on one line — category picker, link/preview buttons, and an
  // open-folder icon that reveals the skill's hub folder so its files (and the folder
  // name itself) can be edited.
  const controls = document.createElement('div'); controls.className = 'controls';
  const catpick = document.createElement('span'); catpick.className = 'catpick';
  const lbl = document.createElement('span'); lbl.className = 'catlbl'; lbl.textContent = 'Category:'; catpick.appendChild(lbl);
  catpick.appendChild(categorySelect(s));
  controls.appendChild(catpick);
  // A globally-linked skill is ALREADY available in every project, so linking it
  // per-project is redundant — disable that action and explain why.
  const projDisabled = !state.hasProject || coveredByGlobal;
  const projBtn = btn('primary', linked ? 'Unlink from project' : 'Link to project',
    () => vscode.postMessage({ type: 'toggleProject', name: s.name }), projDisabled);
  if (coveredByGlobal) projBtn.title = 'Already available here via the global link. Unlink global to make it per-project only.';
  else if (!state.hasProject) projBtn.title = 'Open a project folder first.';
  controls.appendChild(projBtn);
  controls.appendChild(btn('secondary', s.glob === 'linked' ? 'Unlink global' : 'Link globally',
    () => vscode.postMessage({ type: 'toggleGlobal', name: s.name })));
  // Preview + open-folder are icon-only (with tooltips) so the controls row stays
  // narrow and never overflows the card.
  controls.appendChild(iconBtn('iconbtn', EYE, 'Preview README', () => vscode.postMessage({ type: 'preview', name: s.name })));
  controls.appendChild(iconBtn('iconbtn', FOLDER, 'Open skill folder (edit its files / name)',
    () => vscode.postMessage({ type: 'openFolder', name: s.name })));
  card.appendChild(controls);
  return card;
}

function buildList(list) {
  const wrap = document.createElement('div'); wrap.className = (layout === 'list') ? 'list' : 'grid';
  for (const s of list) wrap.appendChild(makeCard(s));
  return wrap;
}
function emptyEl(text) { const e = document.createElement('div'); e.className = 'empty'; e.textContent = text; return e; }

// One labelled section (used by the project view to split Local from Global).
function section(first, title, sub, list, emptyText) {
  const h = document.createElement('div'); h.className = 'section-h' + (first ? ' first' : '');
  const t = document.createElement('span'); t.className = 'section-title'; t.textContent = title; h.appendChild(t);
  if (sub) { const s = document.createElement('span'); s.className = 'section-sub'; s.textContent = sub; h.appendChild(s); }
  const c = document.createElement('span'); c.className = 'section-count'; c.textContent = String(list.length); h.appendChild(c);
  mainEl.appendChild(h);
  mainEl.appendChild(list.length ? buildList(list) : emptyEl(emptyText));
}

// No skills at all in the hub (missing/empty folder) → an actionable prompt to set
// the hub, instead of a bare "No skills match." that leaves a new user stuck.
function hubEmptyState() {
  const box = document.createElement('div'); box.className = 'empty-cta';
  const h = document.createElement('div'); h.className = 'headline';
  h.textContent = state.hubUnreadable ? 'Skills Hub folder not found' : 'No skills in your Skills Hub yet';
  box.appendChild(h);
  const d = document.createElement('div'); d.className = 'detail';
  d.textContent = state.hubUnreadable
    ? 'Point the palette at the folder where your skills live (one sub-folder per skill, each with a SKILL.md), then they show up here.'
    : 'Add skill folders to your hub, or point the palette at a different folder.';
  box.appendChild(d);
  const p = document.createElement('div'); p.className = 'detail';
  const lbl = document.createElement('span'); lbl.textContent = 'Current hub: '; p.appendChild(lbl);
  const code = document.createElement('code'); code.textContent = state.hubPath || '(default)'; p.appendChild(code);
  box.appendChild(p);
  box.appendChild(btn('primary', 'Set hub folder…', openSettings));
  return box;
}

function renderMain() {
  mainEl.textContent = '';
  if (view === 'preview') return renderPreview();
  if (!state.skills.length) { mainEl.appendChild(hubEmptyState()); return; }
  if (tab === 'project') return renderProjectMain();
  const list = visible(state.skills);
  if (!list.length) { mainEl.appendChild(emptyEl('No skills match.')); return; }
  mainEl.appendChild(buildList(list));
}

// Project view: everything linked here, split into Local (this project only) and
// Global (linked globally, active in every project - wins over a local link).
function renderProjectMain() {
  const base = visible(projectSkills());
  const localList = base.filter((s) => isLocal(s) && !isGlobal(s));
  const globalList = base.filter(isGlobal);
  section(true, 'Local', state.targetName ? '· ' + state.targetName : '· this project', localList,
    'No skills linked to this project. Use the Hub tab to link some.');
  section(false, 'Global', '· all projects', globalList,
    'No globally-linked skills.');
}

function renderPreview() {
  mainEl.textContent = '';
  const box = document.createElement('div'); box.className = 'preview';
  const bar = document.createElement('div'); bar.className = 'bar';
  bar.appendChild(btn('secondary', '← Back', () => { view = 'list'; renderMain(); }));
  const h = document.createElement('strong'); h.textContent = preview ? preview.title : ''; bar.appendChild(h);
  box.appendChild(bar);
  const body = document.createElement('div'); body.className = 'readme';
  body.innerHTML = preview ? mdToHtml(preview.body) : 'Loading…';
  box.appendChild(body);
  mainEl.appendChild(box);
}

window.addEventListener('message', (e) => {
  const m = e.data;
  if (!m) return;
  if (m.type === 'state') {
    state = m.state;
    if (activeCat !== '__all__' && activeCat !== 'Uncategorized' && !state.categories.includes(activeCat)) activeCat = '__all__';
    if (tab === 'project' && !state.hasProject) tab = 'hub'; // project closed → fall back
    renderProj(); applyTabButtons(); renderNav(); if (view === 'list') renderMain();
  } else if (m.type === 'previewContent') {
    preview = { name: m.name, title: m.title, body: m.body };
    view = 'preview'; renderMain();
  } else if (m.type === 'hubChanged') {
    // The host applied a new hub folder (via Browse or Save). Reflect it in the
    // settings field and close the modal; the refreshed skill list follows in a
    // separate 'state' message.
    if (typeof m.hubPath === 'string') settingsInput.value = m.hubPath;
    closeSettings();
  }
});

// ── In-panel text modal (new category / rename), keeps focus in the webview ────
const modal = document.getElementById('modal');
const modalInput = document.getElementById('modal-input');
const modalTitle = document.getElementById('modal-title');
let modalSubmit = null;
function openModal(title, value, onSubmit) {
  modalTitle.textContent = title;
  modalInput.value = value || '';
  modalSubmit = onSubmit;
  modal.hidden = false;
  modalInput.focus(); modalInput.select();
}
function openNewCategoryModal(name) {
  openModal('New category for "' + name + '"', '', function (v) { vscode.postMessage({ type: 'setCategory', name: name, label: v }); });
}
function closeModal() { modal.hidden = true; modalSubmit = null; }
function submitModal() {
  const v = modalInput.value.trim();
  if (!v) { modalInput.focus(); return; }
  const fn = modalSubmit; closeModal(); if (fn) fn(v);
}
document.getElementById('modal-add').addEventListener('click', submitModal);
document.getElementById('modal-cancel').addEventListener('click', closeModal);
modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
modalInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitModal(); else if (e.key === 'Escape') closeModal(); });

// ── Confirm modal (used for deleting a non-empty category) ────────────────────
const confirmModal = document.getElementById('confirm-modal');
const confirmMsg = document.getElementById('confirm-msg');
let confirmYes = null;
function openConfirm(message, onYes) {
  confirmMsg.textContent = message;
  confirmYes = onYes;
  confirmModal.hidden = false;
  document.getElementById('confirm-ok').focus();
}
function closeConfirm() { confirmModal.hidden = true; confirmYes = null; }
document.getElementById('confirm-ok').addEventListener('click', function () { const fn = confirmYes; closeConfirm(); if (fn) fn(); });
document.getElementById('confirm-cancel').addEventListener('click', closeConfirm);
confirmModal.addEventListener('click', (e) => { if (e.target === confirmModal) closeConfirm(); });
document.addEventListener('keydown', (e) => { if (!confirmModal.hidden && e.key === 'Escape') closeConfirm(); });

// ── Settings modal (Skills Hub folder) ────────────────────────────────────────
const settingsModal = document.getElementById('settings-modal');
const settingsInput = document.getElementById('settings-hub-input');
function openSettings() {
  settingsInput.value = state.hubPath || '';
  settingsModal.hidden = false;
  settingsInput.focus(); settingsInput.select();
}
function closeSettings() { settingsModal.hidden = true; }
function saveSettings() { vscode.postMessage({ type: 'setHub', path: settingsInput.value.trim() }); closeSettings(); }
document.getElementById('open-settings').addEventListener('click', openSettings);
document.getElementById('settings-cancel').addEventListener('click', closeSettings);
document.getElementById('settings-save').addEventListener('click', saveSettings);
document.getElementById('settings-browse').addEventListener('click', () => vscode.postMessage({ type: 'browseHub' }));
settingsModal.addEventListener('click', (e) => { if (e.target === settingsModal) closeSettings(); });
settingsInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveSettings(); else if (e.key === 'Escape') closeSettings(); });

function renderAll() { renderProj(); applyTabButtons(); renderNav(); renderMain(); }
renderAll();
vscode.postMessage({ type: 'ready' });
