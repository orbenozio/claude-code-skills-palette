'use strict';

/**
 * The rich Skills Palette as a Webview panel — chosen over QuickPick once the skill
 * count grows, because a Webview supports INTERACTIVE category filtering (a clickable
 * sidebar), real scrolling, theme colors, card layout, in-panel README preview, and
 * category assignment.
 *
 * Host owns all fs/link/manifest work; the webview renders state and posts intents.
 * User text in cards is rendered via textContent (never innerHTML). The README
 * preview renders Markdown to HTML, but escapes the source first and only emits a
 * known tag set, so file content can't inject executable markup.
 */

const os = require('os');
const path = require('path');

const hubReader = require('./hubReader');
const linker = require('./linker');
const manifest = require('./categoriesManifest');

// Single palette panel per window, so the footer button can TOGGLE it.
let activePanel = null;
let opening = false; // guards the await window between "decide to open" and panel creation

function projectSkillsDir(folderFsPath) { return path.join(folderFsPath, '.claude', 'skills'); }
function globalSkillsDir() { return path.join(os.homedir(), '.claude', 'skills'); }
function hubRootOf(deps) { return deps.hubRoot || hubReader.DEFAULT_HUB; }

function nonce() {
  let s = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return s;
}

// ── Markdown → HTML (shared by the webview client AND the unit tests) ────────────
// These are REAL functions: we ship their `.toString()` source into the webview (so
// there is one implementation, and no fragile backslash-escaping inside a template
// literal), and export them so tests can call them directly. Safety model: escape
// the source first; only ever emit a known tag set; for links also escape the URL as
// an ATTRIBUTE (quotes) and allow only safe schemes (no javascript:/data:).
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

/** The four md helpers as source, for embedding into the webview client script. */
function markdownClientSource() {
  return [esc, escAttr, inline, mdToHtml].map(function (f) { return f.toString(); }).join('\n');
}

/** Compute the full state object the webview renders from. */
async function computeState(deps, targetFolder) {
  const res = await hubReader.scan(deps.hubRoot ? { hubRoot: deps.hubRoot } : {});
  const projDir = targetFolder ? projectSkillsDir(targetFolder.fsPath) : null;
  const globDir = globalSkillsDir();
  const skills = res.skills.map((s) => ({
    name: s.name,
    title: s.title,
    summary: s.summary,
    category: s.category,
    proj: projDir ? linker.linkStatus(path.join(projDir, s.name), s.hubPath) : 'absent',
    glob: linker.linkStatus(path.join(globDir, s.name), s.hubPath),
  }));
  return {
    targetName: targetFolder ? targetFolder.name : null,
    hasProject: !!targetFolder,
    categories: res.categoryOrder,
    skills,
    warnings: res.warnings,
  };
}

/** The static HTML shell (theme-coloured CSS + embedded initial state + client script). */
function renderHtml(state, theNonce, cspSource) {
  const json = JSON.stringify(state)
    .replace(/</g, '\\u003c')
    .split(String.fromCharCode(0x2028)).join('\\u2028')
    .split(String.fromCharCode(0x2029)).join('\\u2029');
  const csp = [
    "default-src 'none'",
    `img-src ${cspSource} https: data:`,
    `style-src ${cspSource} 'unsafe-inline'`,
    `script-src 'nonce-${theNonce}'`,
  ].join('; ');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  :root { --gap: 12px; }
  * { box-sizing: border-box; }
  body { margin: 0; color: var(--vscode-foreground); font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); background: var(--vscode-editor-background); }
  .wrap { display: grid; grid-template-columns: 200px 1fr; grid-template-rows: auto 1fr; height: 100vh; }
  header { grid-column: 1 / 3; display: flex; gap: var(--gap); align-items: center; padding: 10px 14px; border-bottom: 1px solid var(--vscode-widget-border, rgba(128,128,128,.25)); }
  header h1 { font-size: 13px; font-weight: 600; margin: 0; opacity: .8; white-space: nowrap; }
  header .proj { font-size: 12px; opacity: .65; white-space: nowrap; }
  #search { flex: 1; min-width: 80px; padding: 5px 8px; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, transparent); border-radius: 4px; }
  #search:focus { outline: 1px solid var(--vscode-focusBorder); }
  nav { overflow-y: auto; padding: 8px; border-right: 1px solid var(--vscode-widget-border, rgba(128,128,128,.25)); }
  .cat { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 4px; cursor: pointer; font-size: 13px; }
  .cat:hover { background: var(--vscode-list-hoverBackground); }
  .cat.active { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
  .cat .cat-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cat .count { opacity: .6; font-variant-numeric: tabular-nums; }
  .cat .cat-actions { display: none; gap: 2px; }
  .cat:hover .cat-actions { display: inline-flex; }       /* swap count → actions on hover */
  .cat:hover .count.swap { display: none; }
  .cat-act { display: inline-flex; align-items: center; justify-content: center; background: transparent; border: none; cursor: pointer; color: inherit; opacity: .65; padding: 2px; border-radius: 3px; }
  .cat-act svg { width: 14px; height: 14px; display: block; }
  .cat-act:hover { opacity: 1; background: rgba(128,128,128,.28); }
  .cat-act.del:hover { color: var(--vscode-errorForeground, #e06c75); }
  .cat-add { opacity: .65; font-style: italic; margin-top: 4px; }
  .cat-add:hover { opacity: 1; background: var(--vscode-list-hoverBackground); }
  main { overflow-y: auto; padding: 0 var(--gap) var(--gap); }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: var(--gap); align-content: start; padding-top: var(--gap); }
  .card { display: flex; flex-direction: column; gap: 6px; padding: 12px; border: 1px solid var(--vscode-widget-border, rgba(128,128,128,.25)); border-radius: 8px; background: var(--vscode-editorWidget-background); }
  .card.linked { border-color: var(--vscode-charts-green, #4caf50); }
  .card .top { display: flex; align-items: center; gap: 6px; }
  .card .title { font-weight: 600; font-size: 13px; flex: 1; cursor: pointer; }
  .card .title:hover { text-decoration: underline; }
  .badge { font-size: 10px; padding: 1px 6px; border-radius: 10px; white-space: nowrap; }
  .badge.proj { background: color-mix(in srgb, var(--vscode-charts-green, #4caf50) 25%, transparent); color: var(--vscode-charts-green, #4caf50); }
  .badge.glob { background: color-mix(in srgb, var(--vscode-charts-blue, #4aa3ff) 25%, transparent); color: var(--vscode-charts-blue, #4aa3ff); }
  .badge.broken { background: color-mix(in srgb, var(--vscode-charts-yellow, #e6c000) 30%, transparent); color: var(--vscode-charts-yellow, #e6c000); }
  .card .summary { font-size: 12px; opacity: .75; line-height: 1.35; flex: 1; cursor: pointer; }
  .card .catrow { display: flex; align-items: center; gap: 6px; font-size: 11px; opacity: .85; }
  select { font-family: inherit; font-size: 11px; padding: 2px 4px; color: var(--vscode-dropdown-foreground); background: var(--vscode-dropdown-background); border: 1px solid var(--vscode-dropdown-border, transparent); border-radius: 4px; max-width: 100%; }
  .card .actions { display: flex; gap: 6px; flex-wrap: wrap; }
  button { font-family: inherit; font-size: 12px; padding: 4px 9px; border: none; border-radius: 4px; cursor: pointer; }
  button.primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  button.primary:hover { background: var(--vscode-button-hoverBackground); }
  button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
  button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
  button:disabled { opacity: .45; cursor: default; }
  .empty { opacity: .6; padding: 20px; }
  /* README preview */
  .preview { max-width: 820px; }
  .preview .bar { position: sticky; top: 0; z-index: 5; display: flex; align-items: center; gap: 10px; padding: var(--gap) 0 8px; margin-bottom: 6px; background: var(--vscode-editor-background); border-bottom: 1px solid var(--vscode-widget-border, rgba(128,128,128,.25)); }
  .readme h1,.readme h2,.readme h3,.readme h4 { line-height: 1.25; margin: 1em 0 .4em; }
  .readme h1 { font-size: 1.5em; border-bottom: 1px solid var(--vscode-widget-border, rgba(128,128,128,.25)); padding-bottom: .2em; }
  .readme h2 { font-size: 1.25em; }
  .readme code { background: var(--vscode-textCodeBlock-background, rgba(128,128,128,.15)); padding: .1em .35em; border-radius: 4px; font-family: var(--vscode-editor-font-family, monospace); font-size: .9em; }
  .readme pre { background: var(--vscode-textCodeBlock-background, rgba(128,128,128,.15)); padding: 10px 12px; border-radius: 6px; overflow-x: auto; }
  .readme pre code { background: none; padding: 0; }
  .readme a { color: var(--vscode-textLink-foreground); }
  .readme ul { padding-left: 1.4em; }
  .readme blockquote { border-left: 3px solid var(--vscode-widget-border, rgba(128,128,128,.3)); margin: .6em 0; padding: .2em .8em; opacity: .85; }
  /* In-panel modal (new category) */
  .modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.45); display: flex; align-items: center; justify-content: center; z-index: 50; }
  .modal-backdrop[hidden] { display: none; }
  .modal { width: 340px; max-width: 90%; display: flex; flex-direction: column; gap: 10px; padding: 16px; border-radius: 8px; background: var(--vscode-editorWidget-background); border: 1px solid var(--vscode-widget-border, rgba(128,128,128,.25)); box-shadow: 0 8px 30px rgba(0,0,0,.45); }
  .modal h2 { margin: 0; font-size: 13px; font-weight: 600; }
  .modal input { padding: 6px 8px; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, transparent); border-radius: 4px; }
  .modal input:focus { outline: 1px solid var(--vscode-focusBorder); }
  .modal .row { display: flex; gap: 8px; justify-content: flex-end; }
  .modal .msg { font-size: 12px; opacity: .85; line-height: 1.4; }
  button.danger { background: var(--vscode-errorForeground, #c0392b); color: #fff; }
  button.danger:hover { filter: brightness(1.12); }
</style>
</head>
<body>
  <div class="wrap">
    <header>
      <h1>Skills Palette</h1>
      <span class="proj" id="proj"></span>
      <input id="search" type="text" placeholder="Filter skills…">
    </header>
    <nav id="nav"></nav>
    <main id="main"></main>
  </div>
  <div id="modal" class="modal-backdrop" hidden>
    <div class="modal">
      <h2 id="modal-title">New category</h2>
      <input id="modal-input" type="text" placeholder="e.g. Content &amp; Posts" maxlength="30">
      <div class="row">
        <button class="secondary" id="modal-cancel">Cancel</button>
        <button class="primary" id="modal-add">Add</button>
      </div>
    </div>
  </div>
  <div id="confirm-modal" class="modal-backdrop" hidden>
    <div class="modal">
      <h2 id="confirm-title">Delete category</h2>
      <div class="msg" id="confirm-msg"></div>
      <div class="row">
        <button class="secondary" id="confirm-cancel">Cancel</button>
        <button class="danger" id="confirm-ok">Delete</button>
      </div>
    </div>
  </div>
  <script nonce="${theNonce}">
    const vscode = acquireVsCodeApi();
    let state = ${json};
    let activeCat = '__all__';
    let query = '';
    let view = 'list';        // 'list' | 'preview'
    let preview = null;       // { name, title, body }

    const navEl = document.getElementById('nav');
    const mainEl = document.getElementById('main');
    const projEl = document.getElementById('proj');
    const searchEl = document.getElementById('search');

    searchEl.addEventListener('input', () => { query = searchEl.value.trim().toLowerCase(); if (view === 'list') renderMain(); });

    function counts() {
      const m = new Map();
      for (const s of state.skills) m.set(s.category, (m.get(s.category) || 0) + 1);
      return m;
    }
    function renderNav() {
      const c = counts();
      navEl.textContent = '';
      const mk = (id, label, n, manageable) => {
        const d = document.createElement('div');
        d.className = 'cat' + (activeCat === id ? ' active' : '');
        const t = document.createElement('span'); t.className = 'cat-name'; t.textContent = label; d.appendChild(t);
        const k = document.createElement('span'); k.className = 'count' + (manageable ? ' swap' : ''); k.textContent = String(n); d.appendChild(k);
        if (manageable) {
          const acts = document.createElement('span'); acts.className = 'cat-actions';
          const PENCIL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>';
          const TRASH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>';
          const ren = document.createElement('button'); ren.className = 'cat-act'; ren.innerHTML = PENCIL; ren.title = 'Rename category';
          ren.addEventListener('click', (e) => {
            e.stopPropagation();
            openModal('Rename category “' + label + '”', label, function (v) { vscode.postMessage({ type: 'renameCategory', old: label, label: v }); });
          });
          const del = document.createElement('button'); del.className = 'cat-act del'; del.innerHTML = TRASH; del.title = 'Delete category (its skills become Uncategorized)';
          del.addEventListener('click', (e) => {
            e.stopPropagation();
            // Confirm ONLY when the category has skills; an empty one deletes directly.
            if (n > 0) {
              openConfirm('Delete category “' + label + '”? Its ' + n + ' skill' + (n === 1 ? '' : 's') + ' will become Uncategorized.',
                function () { vscode.postMessage({ type: 'deleteCategory', label: label }); });
            } else {
              vscode.postMessage({ type: 'deleteCategory', label: label });
            }
          });
          acts.appendChild(ren); acts.appendChild(del); d.appendChild(acts);
        }
        d.addEventListener('click', () => { activeCat = id; view = 'list'; renderNav(); renderMain(); });
        navEl.appendChild(d);
      };
      mk('__all__', 'All Skills', state.skills.length, false);
      for (const cat of state.categories) mk(cat, cat, c.get(cat) || 0, cat !== 'Uncategorized');
      // "+ New category" — create an empty category straight from the sidebar.
      const addRow = document.createElement('div');
      addRow.className = 'cat cat-add';
      const at = document.createElement('span'); at.className = 'cat-name'; at.textContent = '+ New category'; addRow.appendChild(at);
      addRow.addEventListener('click', () => {
        openModal('New category', '', function (v) { vscode.postMessage({ type: 'createCategory', label: v }); });
      });
      navEl.appendChild(addRow);
    }
    function visible() {
      return state.skills.filter((s) => {
        if (activeCat !== '__all__' && s.category !== activeCat) return false;
        if (query && !(s.title.toLowerCase().includes(query) || s.summary.toLowerCase().includes(query) || s.name.includes(query))) return false;
        return true;
      });
    }
    function renderProj() {
      projEl.textContent = state.hasProject ? ('→ ' + state.targetName) : '(no project open — project link disabled)';
    }
    function badge(cls, text) { const b = document.createElement('span'); b.className = 'badge ' + cls; b.textContent = text; return b; }
    function btn(cls, text, on, disabled) {
      const b = document.createElement('button'); b.className = cls; b.textContent = text; b.disabled = !!disabled;
      if (!disabled) b.addEventListener('click', on); return b;
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

    function renderMain() {
      mainEl.textContent = '';
      if (view === 'preview') return renderPreview();
      const wrap = document.createElement('div'); wrap.className = 'grid';
      const list = visible();
      if (!list.length) { const e = document.createElement('div'); e.className = 'empty'; e.textContent = 'No skills match.'; mainEl.appendChild(e); return; }
      for (const s of list) {
        const linked = s.proj === 'linked';
        const broken = s.proj === 'broken';
        const card = document.createElement('div'); card.className = 'card' + (linked ? ' linked' : '');
        const top = document.createElement('div'); top.className = 'top';
        const title = document.createElement('span'); title.className = 'title'; title.textContent = s.title;
        title.title = 'Open README preview';
        title.addEventListener('click', () => vscode.postMessage({ type: 'preview', name: s.name }));
        top.appendChild(title);
        const coveredByGlobal = s.glob === 'linked' && !linked;
        if (linked) top.appendChild(badge('proj', '✓ linked'));
        else if (broken) top.appendChild(badge('broken', 'broken'));
        if (s.glob === 'linked') {
          const gb = badge('glob', coveredByGlobal ? 'global · active here' : 'global');
          gb.title = 'Linked globally — available in every project automatically';
          top.appendChild(gb);
        }
        card.appendChild(top);
        const sum = document.createElement('div'); sum.className = 'summary'; sum.textContent = s.summary;
        sum.title = 'Open README preview';
        sum.addEventListener('click', () => vscode.postMessage({ type: 'preview', name: s.name }));
        card.appendChild(sum);
        const catrow = document.createElement('div'); catrow.className = 'catrow';
        const lbl = document.createElement('span'); lbl.textContent = 'Category:'; catrow.appendChild(lbl);
        catrow.appendChild(categorySelect(s));
        card.appendChild(catrow);
        const actions = document.createElement('div'); actions.className = 'actions';
        // A globally-linked skill is ALREADY available in every project, so linking it
        // per-project is redundant — disable that action and explain why.
        const projDisabled = !state.hasProject || coveredByGlobal;
        const projBtn = btn('primary', linked ? 'Unlink from project' : 'Link to project',
          () => vscode.postMessage({ type: 'toggleProject', name: s.name }), projDisabled);
        if (coveredByGlobal) projBtn.title = 'Already available here via the global link. Unlink global to make it per-project only.';
        else if (!state.hasProject) projBtn.title = 'Open a project folder first.';
        actions.appendChild(projBtn);
        actions.appendChild(btn('secondary', s.glob === 'linked' ? 'Unlink global' : 'Link globally',
          () => vscode.postMessage({ type: 'toggleGlobal', name: s.name })));
        actions.appendChild(btn('secondary', 'Preview', () => vscode.postMessage({ type: 'preview', name: s.name })));
        card.appendChild(actions);
        wrap.appendChild(card);
      }
      mainEl.appendChild(wrap);
    }

    // ── Markdown → HTML helpers (esc / escAttr / inline / mdToHtml) ───────────────
    // Injected as REAL function source (not a hand-escaped string) so the host and
    // the unit tests share one implementation. See markdownClientSource().
${markdownClientSource()}

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
        if (activeCat !== '__all__' && !state.categories.includes(activeCat)) activeCat = '__all__';
        renderProj(); renderNav(); if (view === 'list') renderMain();
      } else if (m.type === 'previewContent') {
        preview = { name: m.name, title: m.title, body: m.body };
        view = 'preview'; renderMain();
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
      openModal('New category for “' + name + '”', '', function (v) { vscode.postMessage({ type: 'setCategory', name: name, label: v }); });
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

    function renderAll() { renderProj(); renderNav(); renderMain(); }
    renderAll();
    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
}

/**
 * Open the webview palette.
 * @param {object} vscode
 * @param {object} deps  { output, getTargetFolder, hubRoot? }
 */
async function openWebviewPalette(vscode, deps) {
  // Strict toggle: if the palette is open, close it; otherwise create it. Strict
  // (rather than "reveal if backgrounded") keeps it in lockstep with the footer
  // button's optimistic lit state — every click flips the panel. Checked
  // synchronously, before any await, so rapid clicks can't open two panels.
  if (activePanel) { activePanel.dispose(); return; }
  if (opening) return; // a create is already in flight (e.g. awaiting a folder pick)
  opening = true;

  const output = deps.output || { appendLine() {} };
  let targetFolder;
  try {
    targetFolder = await deps.getTargetFolder();
  } finally {
    opening = false;
  }
  const hubRoot = hubRootOf(deps);

  const panel = vscode.window.createWebviewPanel(
    'skillsPalette',
    'Skills Palette' + (targetFolder ? ` — ${targetFolder.name}` : ''),
    vscode.ViewColumn.Active,
    { enableScripts: true, retainContextWhenHidden: true },
  );
  activePanel = panel;

  async function pushState() {
    const state = await computeState(deps, targetFolder);
    for (const w of state.warnings) output.appendLine(`[scan] ${w}`);
    panel.webview.postMessage({ type: 'state', state });
  }

  const initial = await computeState(deps, targetFolder);
  for (const w of initial.warnings) output.appendLine(`[scan] ${w}`);
  panel.webview.html = renderHtml(initial, nonce(), panel.webview.cspSource);

  async function skillFromHub(name) {
    const res = await hubReader.scan(deps.hubRoot ? { hubRoot: deps.hubRoot } : {});
    return res.skills.find((x) => x.name === name) || null;
  }

  panel.webview.onDidReceiveMessage(async (msg) => {
    if (!msg || !msg.type) return;
    try {
      if (msg.type === 'ready') return;

      if (msg.type === 'preview') {
        const s = await skillFromHub(msg.name);
        if (!s) return;
        const text = await require('fs').promises.readFile(path.join(s.hubPath, 'SKILL.md'), 'utf8');
        const { body } = hubReader.splitFrontmatter(text);
        panel.webview.postMessage({ type: 'previewContent', name: s.name, title: s.title, body });
        return;
      }

      if (msg.type === 'setCategory') {
        // label '' / 'Uncategorized' clears it; a new label creates the category.
        // The webview collects new-category text via an in-panel modal, so the host
        // no longer needs an InputBox here.
        manifest.setCategory(hubRoot, msg.name, msg.label || '');
        const to = (msg.label && msg.label.trim()) ? msg.label.trim() : 'Uncategorized';
        vscode.window.showInformationMessage(`Moved “${msg.name}” → ${to}.`);
        await pushState();
        return;
      }
      if (msg.type === 'createCategory') {
        manifest.createCategory(hubRoot, msg.label || '');
        await pushState();
        return;
      }
      if (msg.type === 'renameCategory') {
        manifest.renameCategory(hubRoot, msg.old, msg.label || '');
        await pushState();
        return;
      }
      if (msg.type === 'deleteCategory') {
        manifest.deleteCategory(hubRoot, msg.label);
        vscode.window.showInformationMessage(`Deleted category "${msg.label}" — its skills are now Uncategorized.`);
        await pushState();
        return;
      }

      // link actions need the hub path
      const s = await skillFromHub(msg.name);
      if (!s) { output.appendLine(`[webview] unknown skill: ${msg.name}`); return; }

      if (msg.type === 'toggleProject') {
        if (!targetFolder) { vscode.window.showWarningMessage('Skills Palette: open a project folder first.'); return; }
        const dir = projectSkillsDir(targetFolder.fsPath);
        const st = linker.linkStatus(path.join(dir, s.name), s.hubPath);
        if (st === 'linked') { linker.unlink(s.name, s.hubPath, dir); vscode.window.showInformationMessage(`Unlinked "${s.name}" from ${targetFolder.name}.`); }
        else { const r = linker.link(s.name, s.hubPath, dir); vscode.window.showInformationMessage(`${r === 'relinked' ? 'Re-linked' : 'Linked'} "${s.name}" → ${targetFolder.name}.`); }
      } else if (msg.type === 'toggleGlobal') {
        const dir = globalSkillsDir();
        const st = linker.linkStatus(path.join(dir, s.name), s.hubPath);
        if (st === 'linked') { linker.unlink(s.name, s.hubPath, dir); vscode.window.showInformationMessage(`Unlinked "${s.name}" globally.`); }
        else { linker.link(s.name, s.hubPath, dir); vscode.window.showInformationMessage(`Linked "${s.name}" globally.`); }
      }
      await pushState();
    } catch (e) {
      output.appendLine(`[webview] ${msg.type} ${msg.name || ''}: ${e.code || ''} ${e.message}`);
      vscode.window.showErrorMessage(`Skills Palette: ${e.message}`);
    }
  });

  panel.onDidDispose(() => { if (activePanel === panel) activePanel = null; });
}

module.exports = { openWebviewPalette, renderHtml, computeState, nonce, projectSkillsDir, globalSkillsDir, esc, escAttr, inline, mdToHtml, markdownClientSource };
