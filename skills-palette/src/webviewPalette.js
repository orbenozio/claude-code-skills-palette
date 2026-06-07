'use strict';

/**
 * The rich Skills Palette as a Webview panel — chosen over QuickPick once the skill
 * count grows, because a Webview supports INTERACTIVE category filtering (a clickable
 * sidebar that shows only one category), real scrolling, theme colors, and card
 * layout. QuickPick separators can only label groups inside one flat list.
 *
 * Host side owns all fs/link logic; the webview only renders state and posts intents
 * back over the message bridge. User text is rendered via textContent in the client
 * script (never innerHTML), so no HTML-injection surface.
 */

const os = require('os');
const path = require('path');

const hubReader = require('./hubReader');
const linker = require('./linker');

function projectSkillsDir(folderFsPath) { return path.join(folderFsPath, '.claude', 'skills'); }
function globalSkillsDir() { return path.join(os.homedir(), '.claude', 'skills'); }

function nonce() {
  let s = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return s;
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
  const json = JSON.stringify(state).replace(/</g, '\\u003c');
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
  .cat { display: flex; justify-content: space-between; gap: 8px; padding: 6px 8px; border-radius: 4px; cursor: pointer; font-size: 13px; }
  .cat:hover { background: var(--vscode-list-hoverBackground); }
  .cat.active { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
  .cat .count { opacity: .6; font-variant-numeric: tabular-nums; }
  main { overflow-y: auto; padding: var(--gap); display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: var(--gap); align-content: start; }
  .card { display: flex; flex-direction: column; gap: 6px; padding: 12px; border: 1px solid var(--vscode-widget-border, rgba(128,128,128,.25)); border-radius: 8px; background: var(--vscode-editorWidget-background); }
  .card.linked { border-color: var(--vscode-charts-green, #4caf50); }
  .card .top { display: flex; align-items: center; gap: 6px; }
  .card .title { font-weight: 600; font-size: 13px; flex: 1; }
  .badge { font-size: 10px; padding: 1px 6px; border-radius: 10px; white-space: nowrap; }
  .badge.proj { background: color-mix(in srgb, var(--vscode-charts-green, #4caf50) 25%, transparent); color: var(--vscode-charts-green, #4caf50); }
  .badge.glob { background: color-mix(in srgb, var(--vscode-charts-blue, #4aa3ff) 25%, transparent); color: var(--vscode-charts-blue, #4aa3ff); }
  .badge.broken { background: color-mix(in srgb, var(--vscode-charts-yellow, #e6c000) 30%, transparent); color: var(--vscode-charts-yellow, #e6c000); }
  .card .summary { font-size: 12px; opacity: .75; line-height: 1.35; flex: 1; }
  .card .actions { display: flex; gap: 6px; flex-wrap: wrap; }
  button { font-family: inherit; font-size: 12px; padding: 4px 9px; border: none; border-radius: 4px; cursor: pointer; }
  button.primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  button.primary:hover { background: var(--vscode-button-hoverBackground); }
  button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
  button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
  button:disabled { opacity: .45; cursor: default; }
  .empty { opacity: .6; padding: 20px; grid-column: 1 / -1; }
</style>
</head>
<body>
  <div class="wrap">
    <header>
      <h1>Skills Palette</h1>
      <span class="proj" id="proj"></span>
      <input id="search" type="text" placeholder="Filter skills…" autofocus>
    </header>
    <nav id="nav"></nav>
    <main id="main"></main>
  </div>
  <script nonce="${theNonce}">
    const vscode = acquireVsCodeApi();
    let state = ${json};
    let activeCat = '__all__';
    let query = '';

    const navEl = document.getElementById('nav');
    const mainEl = document.getElementById('main');
    const projEl = document.getElementById('proj');
    const searchEl = document.getElementById('search');

    searchEl.addEventListener('input', () => { query = searchEl.value.trim().toLowerCase(); renderMain(); });

    function counts() {
      const m = new Map();
      for (const s of state.skills) m.set(s.category, (m.get(s.category) || 0) + 1);
      return m;
    }

    function renderNav() {
      const c = counts();
      navEl.textContent = '';
      const mk = (id, label, n) => {
        const d = document.createElement('div');
        d.className = 'cat' + (activeCat === id ? ' active' : '');
        const t = document.createElement('span'); t.textContent = label; d.appendChild(t);
        const k = document.createElement('span'); k.className = 'count'; k.textContent = String(n); d.appendChild(k);
        d.addEventListener('click', () => { activeCat = id; renderNav(); renderMain(); });
        navEl.appendChild(d);
      };
      mk('__all__', 'All Skills', state.skills.length);
      for (const cat of state.categories) mk(cat, cat, c.get(cat) || 0);
    }

    function visible() {
      return state.skills.filter((s) => {
        if (activeCat !== '__all__' && s.category !== activeCat) return false;
        if (query && !(s.title.toLowerCase().includes(query) || s.summary.toLowerCase().includes(query) || s.name.includes(query))) return false;
        return true;
      });
    }

    function renderProj() {
      projEl.textContent = state.hasProject ? ('→ ' + state.targetName) : '(no project open — Enter/Link disabled)';
    }

    function badge(cls, text) { const b = document.createElement('span'); b.className = 'badge ' + cls; b.textContent = text; return b; }
    function btn(cls, text, on, disabled) {
      const b = document.createElement('button'); b.className = cls; b.textContent = text; b.disabled = !!disabled;
      if (!disabled) b.addEventListener('click', on); return b;
    }

    function renderMain() {
      mainEl.textContent = '';
      const list = visible();
      if (!list.length) { const e = document.createElement('div'); e.className = 'empty'; e.textContent = 'No skills match.'; mainEl.appendChild(e); return; }
      for (const s of list) {
        const linked = s.proj === 'linked';
        const broken = s.proj === 'broken';
        const card = document.createElement('div'); card.className = 'card' + (linked ? ' linked' : '');
        const top = document.createElement('div'); top.className = 'top';
        const title = document.createElement('span'); title.className = 'title'; title.textContent = s.title; top.appendChild(title);
        if (linked) top.appendChild(badge('proj', '✓ linked'));
        else if (broken) top.appendChild(badge('broken', 'broken'));
        if (s.glob === 'linked') top.appendChild(badge('glob', 'global'));
        card.appendChild(top);
        const sum = document.createElement('div'); sum.className = 'summary'; sum.textContent = s.summary; card.appendChild(sum);
        const actions = document.createElement('div'); actions.className = 'actions';
        actions.appendChild(btn('primary', linked ? 'Unlink' : 'Link to project',
          () => vscode.postMessage({ type: 'toggleProject', name: s.name }), !state.hasProject));
        actions.appendChild(btn('secondary', s.glob === 'linked' ? 'Unlink global' : 'Link globally',
          () => vscode.postMessage({ type: 'toggleGlobal', name: s.name })));
        actions.appendChild(btn('secondary', 'Open', () => vscode.postMessage({ type: 'open', name: s.name })));
        card.appendChild(actions);
        mainEl.appendChild(card);
      }
    }

    window.addEventListener('message', (e) => {
      const m = e.data;
      if (m && m.type === 'state') { state = m.state; if (!state.categories.includes(activeCat) && activeCat !== '__all__') activeCat = '__all__'; renderAll(); }
    });

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
  const output = deps.output || { appendLine() {} };
  const targetFolder = await deps.getTargetFolder();

  const panel = vscode.window.createWebviewPanel(
    'skillsPalette',
    'Skills Palette' + (targetFolder ? ` — ${targetFolder.name}` : ''),
    vscode.ViewColumn.Active,
    { enableScripts: true, retainContextWhenHidden: true },
  );

  async function pushState() {
    const state = await computeState(deps, targetFolder);
    for (const w of state.warnings) output.appendLine(`[scan] ${w}`);
    panel.webview.postMessage({ type: 'state', state });
  }

  const initial = await computeState(deps, targetFolder);
  for (const w of initial.warnings) output.appendLine(`[scan] ${w}`);
  panel.webview.html = renderHtml(initial, nonce(), panel.webview.cspSource);

  function findSkill(name) { return initial.skills.find((s) => s.name === name); }

  async function hubPathOf(name) {
    // Re-scan lazily to get hubPath (state intentionally omits absolute paths).
    const res = await hubReader.scan(deps.hubRoot ? { hubRoot: deps.hubRoot } : {});
    const s = res.skills.find((x) => x.name === name);
    return s ? s.hubPath : null;
  }

  panel.webview.onDidReceiveMessage(async (msg) => {
    if (!msg || !msg.type) return;
    try {
      if (msg.type === 'ready') return;
      const hubPath = await hubPathOf(msg.name);
      if (!hubPath && msg.type !== 'refresh') { output.appendLine(`[webview] unknown skill: ${msg.name}`); return; }

      if (msg.type === 'toggleProject') {
        if (!targetFolder) { vscode.window.showWarningMessage('Skills Palette: open a project folder first.'); return; }
        const dir = projectSkillsDir(targetFolder.fsPath);
        const st = linker.linkStatus(path.join(dir, msg.name), hubPath);
        if (st === 'linked') { linker.unlink(msg.name, hubPath, dir); vscode.window.showInformationMessage(`Unlinked "${msg.name}" from ${targetFolder.name}.`); }
        else { const r = linker.link(msg.name, hubPath, dir); vscode.window.showInformationMessage(`${r === 'relinked' ? 'Re-linked' : 'Linked'} "${msg.name}" → ${targetFolder.name}.`); }
      } else if (msg.type === 'toggleGlobal') {
        const dir = globalSkillsDir();
        const st = linker.linkStatus(path.join(dir, msg.name), hubPath);
        if (st === 'linked') { linker.unlink(msg.name, hubPath, dir); vscode.window.showInformationMessage(`Unlinked "${msg.name}" globally.`); }
        else { linker.link(msg.name, hubPath, dir); vscode.window.showInformationMessage(`Linked "${msg.name}" globally.`); }
      } else if (msg.type === 'open') {
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(path.join(hubPath, 'SKILL.md')));
        await vscode.window.showTextDocument(doc, { preview: true, viewColumn: vscode.ViewColumn.Beside });
        return;
      }
      await pushState();
    } catch (e) {
      output.appendLine(`[webview] ${msg.type} ${msg.name || ''}: ${e.code || ''} ${e.message}`);
      vscode.window.showErrorMessage(`Skills Palette: ${e.message}`);
    }
  });

  panel.onDidDispose(() => { /* nothing to clean up */ });
}

module.exports = { openWebviewPalette, renderHtml, computeState, nonce, projectSkillsDir, globalSkillsDir };
