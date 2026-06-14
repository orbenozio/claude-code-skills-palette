'use strict';

// Pure-render checks for the webview HTML shell + the static client script.
// The client JS now ships as webview/palette-client.js (loaded via a nonce'd
// <script src>), not generated inline - so we read that file directly for the
// client-logic assertions. Run: node test/webviewPalette.test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const wp = require('../src/webviewPalette.js');

let passed = 0;
function ok(cond, msg) { assert(cond, msg); passed++; }

const state = {
  targetName: 'demo',
  hasProject: true,
  categories: ['Content & Posts', 'Release & Shipping'],
  pinned: ['Release & Shipping'],
  skills: [
    { name: 'add-idea', title: 'Add Idea', summary: 'Log an idea.', category: 'Content & Posts', proj: 'linked', glob: 'absent' },
    // A hostile summary trying to break out of the embedded data block.
    { name: 'evil', title: 'Evil</script><script>alert(1)', summary: 'x</script>', category: 'Release & Shipping', proj: 'absent', glob: 'linked' },
  ],
  warnings: [],
};

const N = 'TESTNONCE123';
const CLIENT_URI = 'vscode-resource://ext/webview/palette-client.js';
const html = wp.renderHtml(state, N, 'vscode-resource:', CLIENT_URI);

// The client script lives on disk and is what actually ships + runs in the webview.
const clientSrc = fs.readFileSync(path.join(__dirname, '..', 'webview', 'palette-client.js'), 'utf8');

ok(html.startsWith('<!DOCTYPE html>'), 'is an HTML document');
ok(html.includes(`'nonce-${N}'`), 'CSP pins the script nonce');
ok(html.includes('vscode-resource:'), 'CSP uses the webview cspSource');

// The client is loaded as a static, nonce'd external script (NOT inline-generated).
ok(html.includes(`<script nonce="${N}" src="${CLIENT_URI}"></script>`), 'client loaded via nonce\'d <script src>');
// No inline executable script is generated into the shell - the only nonce'd script
// is the external one above (key reason: avoid the Marketplace "suspicious content" scan).
ok(!/<script nonce="[^"]*">[^<]/.test(html), 'no inline executable script body in the shell');
ok(!html.includes('.toString()'), 'no function .toString() shipped into the HTML');
ok(!html.includes('fromCharCode'), 'no fromCharCode escaping in the shell');
// The client itself never builds/injects a <script> element or evals.
ok(!/createElement\(\s*['"]script/i.test(clientSrc), 'client does not create <script> elements');
ok(!clientSrc.includes('<script>'), 'client does not build a literal <script> tag');
ok(!/\beval\s*\(|new Function/.test(clientSrc), 'client script has no eval / new Function');

// Initial state ships as a NON-executable JSON data block, not inline code.
ok(html.includes('<script type="application/json" id="palette-initial-state">'), 'initial state is a JSON data block');
const dataBlock = html.split('id="palette-initial-state">')[1].split('</script>')[0];
ok(dataBlock.includes('\\u003c'), 'state JSON escapes < as \\u003c');
ok(!dataBlock.includes('</script>'), 'no raw </script> survives in the data block');
ok(dataBlock.includes('add-idea') && dataBlock.includes('Release & Shipping'), 'skills + categories embedded');
ok(JSON.parse(dataBlock).skills.length === 2, 'data block is valid JSON the client can parse');

// nonce() should be reasonably long and alphanumeric.
const n = wp.nonce();
ok(/^[A-Za-z0-9]{32}$/.test(n), 'nonce() is 32 alphanumerics');

// The static client script must be syntactically valid JS (new Function parses
// without running). Catches escaping bugs in the regex-heavy markdown renderer.
let parsed = true;
try { new Function(clientSrc); } catch (e) { parsed = false; console.error('client script parse error:', e.message); }
ok(parsed, 'static client script parses as valid JS');
ok(clientSrc.includes('function mdToHtml'), 'markdown renderer present in client');
ok(clientSrc.includes('function categorySelect'), 'category selector present in client');
ok(clientSrc.includes('coveredByGlobal'), 'global-covers-project logic present in client');
ok(clientSrc.includes("JSON.parse"), 'client reads its initial state from the data block');
ok(clientSrc.includes('function normLayout'), 'normLayout defined in client');

// In-panel Settings for the Skills Hub folder: a gear button, the settings modal,
// and the browse/save wiring (so the hub path is configurable from the UI, not only
// from VS Code settings.json).
ok(html.includes('id="open-settings"'), 'settings (gear) button present in header');
ok(html.includes('id="settings-modal"'), 'settings modal present');
ok(html.includes('id="settings-browse"'), 'settings has a Browse button');
ok(clientSrc.includes('function openSettings'), 'openSettings wired in client');
ok(clientSrc.includes("type: 'browseHub'") && clientSrc.includes("type: 'setHub'"), 'browse/save post messages wired');
ok(clientSrc.includes('function hubEmptyState'), 'actionable empty-hub state present');

// Card shape: a single controls row (category + buttons together) plus an open-folder
// icon that asks the host to reveal the skill's hub folder for editing.
ok(clientSrc.includes("controls.className = 'controls'"), 'card builds one combined controls row');
ok(clientSrc.includes("type: 'openFolder'"), 'open-folder action posts openFolder to the host');
ok(html.includes('.iconbtn'), 'icon-button styling present');

// ── Markdown renderer security (the README preview path) ───────────────────────
// Attribute-breakout via a link URL containing a quote must NOT inject attributes.
{
  const out = wp.inline('[x](http://e.com" onmouseover="alert(1))');
  ok(out.includes('&quot;'), 'quote in URL is escaped to &quot;');
  ok(!/"\s+onmouseover=/.test(out), 'no UNescaped quote opens an onmouseover attribute');
  ok(!/<a[^>]*\son\w+=["']/.test(out), 'no real event-handler attribute on the anchor');
}
// javascript:/data: schemes are dropped to a safe '#'.
ok(wp.inline('[x](javascript:alert(1))').includes('href="#"'), 'javascript: URL neutralised to #');
ok(wp.inline('[x](data:text/html,<b>)').includes('href="#"'), 'data: URL neutralised to #');
ok(wp.inline('[ok](https://example.com)').includes('href="https://example.com"'), 'https URL preserved');
// Raw HTML / script in the body is escaped, not emitted as live markup.
{
  const out = wp.mdToHtml('# Title\n\n<script>alert(1)</script>\n\n- item');
  ok(!out.includes('<script>'), 'raw <script> in markdown is escaped');
  ok(out.includes('&lt;script&gt;'), 'script tag rendered as text');
  ok(out.includes('<h1>Title</h1>') && out.includes('<li>item</li>'), 'known markdown still renders');
}
// The host copy and the client copy of the markdown renderer must stay in sync.
ok(clientSrc.includes('function mdToHtml') && clientSrc.includes('function inline'), 'client carries its own md helpers');
ok(wp.escAttr('a"b') === 'a&quot;b', 'escAttr escapes quotes');

// ── Category management UI (rename / delete with confirm-on-non-empty) ─────────
ok(html.includes('id="confirm-modal"'), 'confirm modal markup present');
{
  ok(clientSrc.includes('Rename category'), 'rename action present in sidebar');
  ok(clientSrc.includes('openConfirm'), 'delete routes through a confirm dialog');
  ok(/if \(n > 0\)/.test(clientSrc), 'confirm is gated on the category having skills (empty → no confirm)');
  // Sidebar structure: fixed items, separators, pin action.
  ok(clientSrc.includes('navSep'), 'sidebar renders separators');
  ok(clientSrc.includes("mkCat('Uncategorized'"), 'Uncategorized is a fixed top item');
  ok(clientSrc.includes('+ New category'), 'New category is a fixed top item');
  ok(clientSrc.includes("type: 'setPinned'"), 'pin/unpin action present');
  ok(clientSrc.includes('state.pinned'), 'sidebar groups pinned categories');
  // Layout switcher: grid/list toggle, persisted, accessible.
  ok(html.includes('id="layout-grid"') && html.includes('id="layout-list"'), 'grid/list layout switcher present');
  ok(clientSrc.includes("type: 'setLayout'"), 'layout choice is persisted via setLayout');
  ok(clientSrc.includes('rowitem'), 'list layout class present');
  ok(html.includes('aria-label="Grid view"') && html.includes('aria-label="List view"'), 'layout buttons have accessible names');
  ok(html.includes('role="group"') && html.includes('aria-label="Skill layout"'), 'layout switch is a labelled group');
  ok(clientSrc.includes('aria-pressed'), 'active layout is exposed via aria-pressed');
  ok(html.includes(':focus-visible'), 'visible keyboard-focus styles present');
  // Top-level tabs: Hub vs This project, with a Local/Global split in the project view.
  ok(html.includes('id="tab-hub"') && html.includes('id="tab-project"'), 'Hub / This project tabs present');
  ok(html.includes('role="tablist"'), 'tabs form an accessible tablist');
  ok(clientSrc.includes('function projectSkills') && clientSrc.includes('function tabSkills'), 'tab scoping helpers present');
  ok(clientSrc.includes('function renderProjectMain'), 'project view renderer present');
  ok(clientSrc.includes('isLocal(s) && !isGlobal(s)'), 'a globally-linked skill is shown only under Global, not Local');
  ok(clientSrc.includes("projTabBtn.disabled = !state.hasProject"), 'project tab is disabled without an open project');
  ok(clientSrc.includes('aria-selected'), 'active tab is exposed via aria-selected');
}

// computeState carries a normalised layout on every push (so a refresh never drops it).
{
  const base = wp.computeState;
  ok(typeof base === 'function', 'computeState is exported');
  // normLayout is the single source of truth for the two valid values.
  ok(wp.normLayout('list') === 'list' && wp.normLayout('grid') === 'grid', 'normLayout keeps valid values');
  ok(wp.normLayout(undefined) === 'grid' && wp.normLayout('weird') === 'grid', 'normLayout defaults unknown input to grid');
}

console.log(`✅ webviewPalette render + md security: ${passed} assertions passed`);
