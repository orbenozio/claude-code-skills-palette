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

// The skill layout is always one of two values; anything else (legacy/unknown) → 'grid'.
// This is the single source of truth: the host uses it, AND its source is shipped into
// the webview client (see the script below), so both sides normalise identically.
function normLayout(v) { return v === 'list' ? 'list' : 'grid'; }

// ── Markdown → HTML (host copy, for the unit tests) ──────────────────────────────
// The webview client (webview/palette-client.js) carries its OWN identical copies of
// these - they must stay behaviourally in sync. We keep this host copy so the
// markdown-security tests can call the logic directly without a DOM. Safety model:
// escape the source first; only ever emit a known tag set; for links also escape the
// URL as an ATTRIBUTE (quotes) and allow only safe schemes (no javascript:/data:).
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

/** Compute the full state object the webview renders from. */
async function computeState(deps, targetFolder, layout, hubRoot) {
  const hub = hubRoot || hubRootOf(deps);
  const res = await hubReader.scan({ hubRoot: hub });
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
  // Real user categories (exclude the fixed "Uncategorized" bucket), sorted A→Z.
  const real = res.categoryOrder
    .filter((c) => c !== hubReader.UNCATEGORIZED)
    .sort((a, b) => a.localeCompare(b));
  return {
    targetName: targetFolder ? targetFolder.name : null,
    hasProject: !!targetFolder,
    categories: real,
    pinned: (res.pinned || []).filter((p) => real.includes(p)),
    skills,
    layout: normLayout(layout), // every state push carries the layout, so a refresh never drops it
    warnings: res.warnings,
    hubPath: hub, // shown in the in-panel Settings so the user can see/change where skills come from
    hubUnreadable: res.warnings.some((w) => /^Cannot read hub/.test(w)),
  };
}

/**
 * The static HTML shell (theme-coloured CSS + an initial-state JSON data block + a
 * reference to the static client script). The client JS is NOT inlined/generated here
 * - it ships as webview/palette-client.js and is loaded via a nonce'd <script src>
 * (clientUri = webview.asWebviewUri(...)). Escaping `<` to < keeps the JSON valid
 * while preventing a literal `</script>` from closing the data block early.
 */
function renderHtml(state, theNonce, cspSource, clientUri) {
  const json = JSON.stringify(state).replace(/</g, '\\u003c');
  const csp = [
    "default-src 'none'",
    `img-src ${cspSource} https: data:`,
    `style-src ${cspSource} 'unsafe-inline'`,
    `script-src ${cspSource} 'nonce-${theNonce}'`,
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
  header { grid-column: 1 / 3; display: flex; flex-wrap: wrap; gap: var(--gap); align-items: center; padding: 10px 14px; border-bottom: 1px solid var(--vscode-widget-border, rgba(128,128,128,.25)); }
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
  .cat-add { opacity: .8; }
  .cat-add .cat-name { color: var(--vscode-textLink-foreground); }
  .cat-add:hover { background: var(--vscode-list-hoverBackground); }
  .nav-sep { height: 1px; margin: 6px 6px; background: var(--vscode-widget-border, rgba(128,128,128,.28)); }
  .cat-act.pin.pinned { opacity: 1; color: var(--vscode-textLink-foreground); }
  .layout-switch { display: inline-flex; gap: 2px; flex: 0 0 auto; }
  .vbtn { display: inline-flex; align-items: center; justify-content: center; padding: 6px; background: transparent; border: none; border-radius: 4px; cursor: pointer; color: var(--vscode-foreground); opacity: .55; }
  .vbtn svg { width: 16px; height: 16px; display: block; }
  .vbtn:hover { opacity: 1; background: var(--vscode-list-hoverBackground); }
  /* active carries a non-colour cue (inset ring) too, so it's distinguishable from hover
     and for users who don't perceive the colour shift. */
  .vbtn.active { opacity: 1; background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); box-shadow: inset 0 0 0 1px var(--vscode-focusBorder); }
  /* Visible keyboard focus for every interactive control in the panel (the webview
     default outline is often suppressed). */
  .vbtn:focus-visible, button:focus-visible, select:focus-visible, .cat:focus-visible, .cat-act:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 1px; }
  /* Top-level view tabs: Hub (whole hub) vs This project (what's linked here). */
  .tabs { display: inline-flex; gap: 2px; flex: 0 0 auto; }
  .tab { font-family: inherit; font-size: 12px; padding: 5px 10px; background: transparent; border: none; border-radius: 5px; cursor: pointer; color: var(--vscode-foreground); opacity: .6; white-space: nowrap; }
  .tab:hover:not(:disabled) { opacity: 1; background: var(--vscode-list-hoverBackground); }
  .tab.active { opacity: 1; background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); box-shadow: inset 0 0 0 1px var(--vscode-focusBorder); }
  .tab:disabled { opacity: .35; cursor: default; }
  /* Section headers used in the project view to split Local from Global. */
  .section-h { display: flex; align-items: baseline; gap: 8px; padding-top: var(--gap); margin-top: 4px; }
  .section-h.first { margin-top: 0; }
  .section-title { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; opacity: .7; }
  .section-sub { font-size: 11px; opacity: .5; }
  .section-count { margin-left: auto; font-size: 11px; opacity: .5; font-variant-numeric: tabular-nums; }
  main { overflow-y: auto; padding: 0 var(--gap) var(--gap); }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: var(--gap); align-content: start; padding-top: var(--gap); }
  .list { display: flex; flex-direction: column; gap: 8px; padding-top: var(--gap); }
  /* List cards keep the SAME 3-row block as grid cards; they just span the full width
     (one per row) instead of sitting in a responsive column track. Nothing is laid out
     horizontally, so long names, summaries and buttons never collide or overflow. */
  .card { display: flex; flex-direction: column; gap: 6px; padding: 12px; border: 1px solid var(--vscode-widget-border, rgba(128,128,128,.25)); border-radius: 8px; background: var(--vscode-editorWidget-background); }
  .card.linked { border-color: var(--vscode-charts-green, #4caf50); }
  .card .top { display: flex; align-items: center; gap: 6px; }
  /* Title stays on a single line (badges keep their space); long names truncate with
     an ellipsis and show in full on hover. Keeps row 1 to one line, always. */
  .card .title { font-weight: 600; font-size: 13px; flex: 1; min-width: 0; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .card .title:hover { text-decoration: underline; }
  .badge { font-size: 10px; padding: 1px 6px; border-radius: 10px; white-space: nowrap; }
  .badge.proj { background: color-mix(in srgb, var(--vscode-charts-green, #4caf50) 25%, transparent); color: var(--vscode-charts-green, #4caf50); }
  .badge.glob { background: color-mix(in srgb, var(--vscode-charts-blue, #4aa3ff) 25%, transparent); color: var(--vscode-charts-blue, #4aa3ff); }
  .badge.broken { background: color-mix(in srgb, var(--vscode-charts-yellow, #e6c000) 30%, transparent); color: var(--vscode-charts-yellow, #e6c000); }
  /* Summary is always a single line (truncated) so every card keeps the same
     3-row shape: title+badges / summary / controls. */
  .card .summary { font-size: 12px; opacity: .75; line-height: 1.35; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  /* Controls row: category picker + link/preview buttons + open-folder icon, all together. */
  .card .controls { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }
  .card .catpick { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; opacity: .85; }
  .card .catlbl { white-space: nowrap; }
  select { font-family: inherit; font-size: 11px; padding: 2px 4px; color: var(--vscode-dropdown-foreground); background: var(--vscode-dropdown-background); border: 1px solid var(--vscode-dropdown-border, transparent); border-radius: 4px; max-width: 100%; }
  button { font-family: inherit; font-size: 12px; padding: 4px 9px; border: none; border-radius: 4px; cursor: pointer; }
  button.primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  button.primary:hover { background: var(--vscode-button-hoverBackground); }
  button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
  button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
  button:disabled { opacity: .45; cursor: default; }
  /* Icon-only action button (open skill folder). Matches the secondary buttons' colour. */
  .iconbtn { display: inline-flex; align-items: center; justify-content: center; padding: 4px 6px; background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
  .iconbtn:hover { background: var(--vscode-button-secondaryHoverBackground); }
  .iconbtn svg { width: 15px; height: 15px; display: block; }
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
  .modal .modal-foot { display: flex; gap: 8px; align-items: center; justify-content: space-between; }
  .modal .msg { font-size: 12px; opacity: .85; line-height: 1.4; }
  .modal .msg code { background: var(--vscode-textCodeBlock-background, rgba(128,128,128,.15)); padding: .1em .35em; border-radius: 4px; }
  /* Actionable empty state (no hub configured / hub empty). */
  .empty-cta { display: flex; flex-direction: column; align-items: flex-start; gap: 10px; padding: 24px; max-width: 560px; }
  .empty-cta .headline { font-size: 14px; font-weight: 600; opacity: .9; }
  .empty-cta .detail { font-size: 12px; opacity: .7; line-height: 1.5; }
  .empty-cta code { background: var(--vscode-textCodeBlock-background, rgba(128,128,128,.15)); padding: .1em .35em; border-radius: 4px; word-break: break-all; }
  button.danger { background: var(--vscode-errorForeground, #c0392b); color: #fff; }
  button.danger:hover { filter: brightness(1.12); }
</style>
</head>
<body>
  <div class="wrap">
    <header>
      <h1>Skills Palette</h1>
      <div class="tabs" role="tablist" aria-label="View">
        <button class="tab" id="tab-hub" type="button" role="tab">Hub</button>
        <button class="tab" id="tab-project" type="button" role="tab">This project</button>
      </div>
      <span class="proj" id="proj"></span>
      <input id="search" type="text" placeholder="Filter skills...">
      <div class="layout-switch" role="group" aria-label="Skill layout">
        <button class="vbtn" id="layout-grid" type="button" aria-label="Grid view" title="Grid view"><svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/></svg></button>
        <button class="vbtn" id="layout-list" type="button" aria-label="List view" title="List view"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg></button>
      </div>
      <button class="vbtn" id="open-settings" type="button" aria-label="Settings" title="Settings (Skills Hub folder)"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></button>
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
  <div id="settings-modal" class="modal-backdrop" hidden>
    <div class="modal">
      <h2>Skills Palette settings</h2>
      <div class="msg">Skills Hub folder - the directory that holds one sub-folder per skill (each with a <code>SKILL.md</code>). Leave empty to use the default <code>~/.claude/SkillsHub</code>.</div>
      <input id="settings-hub-input" type="text" placeholder="C:\\path\\to\\your\\SkillsHub" spellcheck="false">
      <div class="modal-foot">
        <button class="secondary" id="settings-browse" type="button">Browse…</button>
        <span class="row">
          <button class="secondary" id="settings-cancel" type="button">Cancel</button>
          <button class="primary" id="settings-save" type="button">Save</button>
        </span>
      </div>
    </div>
  </div>
  <script type="application/json" id="palette-initial-state">${json}</script>
  <script nonce="${theNonce}" src="${clientUri}"></script>
</body>
</html>`;
}

/**
 * Open the webview palette.
 * @param {object} vscode
 * @param {object} deps  { output, getTargetFolder, hubRoot?, resolveHubRoot? }
 *   resolveHubRoot - re-reads the hubPath setting; called after the in-panel Settings
 *   changes the hub folder, so the running panel picks up the new location.
 */
async function openWebviewPalette(vscode, deps) {
  // Reconcile to the footer button's DESIRED state (deps.desiredOn) when provided,
  // otherwise plain toggle (status-bar/command path). The button tracks its own lit
  // state and tells us what it wants; making reality match that avoids the inversion
  // that independent toggling caused when the user closed the palette via its tab.
  //   desiredOn === true  → ensure open  (reveal if already open)
  //   desiredOn === false → ensure closed (no-op if already closed → clears stale lit)
  //   desiredOn undefined → toggle
  const desiredOn = deps.desiredOn;
  if (activePanel) {
    if (desiredOn === true) { activePanel.reveal(); return; }
    activePanel.dispose();
    return;
  }
  if (desiredOn === false) return; // wants closed and already is
  if (opening) return; // a create is already in flight (e.g. awaiting a folder pick)
  opening = true;

  const output = deps.output || { appendLine() {} };
  let targetFolder;
  try {
    targetFolder = await deps.getTargetFolder();
  } finally {
    opening = false;
  }

  const panel = vscode.window.createWebviewPanel(
    'claudeCodeSkillsPalette',
    'Skills Palette' + (targetFolder ? ` - ${targetFolder.name}` : ''),
    vscode.ViewColumn.Active,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      // Allow loading the static client script from the extension's webview/ folder.
      localResourceRoots: [vscode.Uri.file(path.join(__dirname, '..', 'webview'))],
    },
  );
  activePanel = panel;

  // Current skill layout, seeded from the persisted preference. Tracked here so every
  // pushState carries it (a refresh after link/category edits keeps the user's choice).
  let currentLayout = normLayout(deps.layout);
  // Live hub root: starts from deps, but the user can change it from the in-panel
  // Settings, so it must be mutable and reflected in every scan this panel does.
  let currentHubRoot = hubRootOf(deps);

  async function pushState() {
    const state = await computeState(deps, targetFolder, currentLayout, currentHubRoot);
    for (const w of state.warnings) output.appendLine(`[scan] ${w}`);
    panel.webview.postMessage({ type: 'state', state });
  }

  // Persist a new hub folder (Global setting), re-resolve it, and refresh the panel.
  async function applyHub(raw) {
    const value = (raw || '').trim();
    try {
      await vscode.workspace
        .getConfiguration('claudeCodeSkillsPalette')
        .update('hubPath', value, vscode.ConfigurationTarget.Global);
    } catch (e) {
      output.appendLine(`[settings] hubPath update failed: ${e.message}`);
    }
    currentHubRoot = (deps.resolveHubRoot && deps.resolveHubRoot()) || hubReader.DEFAULT_HUB;
    panel.webview.postMessage({ type: 'hubChanged', hubPath: currentHubRoot });
    await pushState();
    vscode.window.showInformationMessage(`Skills Palette: hub set to ${currentHubRoot}`);
  }

  const initial = await computeState(deps, targetFolder, currentLayout, currentHubRoot);
  for (const w of initial.warnings) output.appendLine(`[scan] ${w}`);
  // Load the client as a static, nonce'd <script src> (see renderHtml). __dirname is
  // <ext>/src, so the client sits at <ext>/webview/palette-client.js.
  const clientUri = panel.webview.asWebviewUri(
    vscode.Uri.file(path.join(__dirname, '..', 'webview', 'palette-client.js')),
  );
  panel.webview.html = renderHtml(initial, nonce(), panel.webview.cspSource, clientUri);

  async function skillFromHub(name) {
    const res = await hubReader.scan({ hubRoot: currentHubRoot });
    return res.skills.find((x) => x.name === name) || null;
  }

  panel.webview.onDidReceiveMessage(async (msg) => {
    if (!msg || !msg.type) return;
    try {
      if (msg.type === 'ready') return;
      if (msg.type === 'setLayout') {
        currentLayout = normLayout(msg.layout);
        if (deps.saveLayout) deps.saveLayout(currentLayout);
        return;
      }
      if (msg.type === 'browseHub') {
        const opts = { canSelectFolders: true, canSelectFiles: false, canSelectMany: false, openLabel: 'Use this folder', title: 'Select your Skills Hub folder' };
        try { if (require('fs').existsSync(currentHubRoot)) opts.defaultUri = vscode.Uri.file(currentHubRoot); } catch (_) { /* best effort */ }
        const picked = await vscode.window.showOpenDialog(opts);
        if (picked && picked.length) await applyHub(picked[0].fsPath);
        return;
      }
      if (msg.type === 'setHub') {
        await applyHub(typeof msg.path === 'string' ? msg.path : '');
        return;
      }

      if (msg.type === 'preview') {
        const s = await skillFromHub(msg.name);
        if (!s) return;
        const text = await require('fs').promises.readFile(path.join(s.hubPath, 'SKILL.md'), 'utf8');
        const { body } = hubReader.splitFrontmatter(text);
        panel.webview.postMessage({ type: 'previewContent', name: s.name, title: s.title, body });
        return;
      }

      if (msg.type === 'openFolder') {
        // Reveal the skill's hub folder in the OS file manager so the user can edit its
        // files (SKILL.md, assets) or rename the folder itself.
        const s = await skillFromHub(msg.name);
        if (!s) { output.appendLine(`[webview] openFolder: unknown skill ${msg.name}`); return; }
        await vscode.env.openExternal(vscode.Uri.file(s.hubPath));
        return;
      }

      if (msg.type === 'setCategory') {
        // label '' / 'Uncategorized' clears it; a new label creates the category.
        // The webview collects new-category text via an in-panel modal, so the host
        // no longer needs an InputBox here.
        manifest.setCategory(currentHubRoot, msg.name, msg.label || '');
        const to = (msg.label && msg.label.trim()) ? msg.label.trim() : 'Uncategorized';
        vscode.window.showInformationMessage(`Moved "${msg.name}" -> ${to}.`);
        await pushState();
        return;
      }
      if (msg.type === 'createCategory') {
        manifest.createCategory(currentHubRoot, msg.label || '');
        await pushState();
        return;
      }
      if (msg.type === 'setPinned') {
        manifest.setPinned(currentHubRoot, msg.label, !!msg.pinned);
        await pushState();
        return;
      }
      if (msg.type === 'renameCategory') {
        manifest.renameCategory(currentHubRoot, msg.old, msg.label || '');
        await pushState();
        return;
      }
      if (msg.type === 'deleteCategory') {
        manifest.deleteCategory(currentHubRoot, msg.label);
        vscode.window.showInformationMessage(`Deleted category "${msg.label}" - its skills are now Uncategorized.`);
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

module.exports = { openWebviewPalette, renderHtml, computeState, nonce, normLayout, projectSkillsDir, globalSkillsDir, esc, escAttr, inline, mdToHtml };
