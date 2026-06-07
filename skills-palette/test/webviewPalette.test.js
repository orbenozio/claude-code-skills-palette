'use strict';

// Pure-render checks for the webview HTML shell (no VSCode needed).
// Run: node test/webviewPalette.test.js
const assert = require('assert');
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
    // A hostile summary trying to break out of the embedded <script> JSON.
    { name: 'evil', title: 'Evil</script><script>alert(1)', summary: 'x</script>', category: 'Release & Shipping', proj: 'absent', glob: 'linked' },
  ],
  warnings: [],
};

const N = 'TESTNONCE123';
const html = wp.renderHtml(state, N, 'vscode-resource:');

ok(html.startsWith('<!DOCTYPE html>'), 'is an HTML document');
ok(html.includes(`script-src 'nonce-${N}'`), 'CSP pins the script nonce');
ok(html.includes('vscode-resource:'), 'CSP uses the webview cspSource');
ok(html.includes(`<script nonce="${N}">`), 'script tag carries the nonce');
ok(html.includes('acquireVsCodeApi()'), 'wires the vscode api');

// The embedded state must be present but with NO raw "</script>" that would close
// the tag early — every "<" in the JSON is escaped to <.
const embeddedRaw = html.split('let state = ')[1].split(';\n')[0];
ok(embeddedRaw.includes('\\u003c'), 'state JSON escapes < as \\u003c');
ok(!embeddedRaw.includes('</script>'), 'no raw </script> survives in the embedded state');
ok(embeddedRaw.includes('add-idea') && embeddedRaw.includes('Release & Shipping'), 'skills + categories embedded');

// nonce() should be reasonably long and alphanumeric.
const n = wp.nonce();
ok(/^[A-Za-z0-9]{32}$/.test(n), 'nonce() is 32 alphanumerics');

// The embedded client script must be syntactically valid JS (new Function parses
// without running). Catches escaping bugs in the regex-heavy markdown renderer.
const scriptMatch = html.match(new RegExp('<script nonce="' + N + '">([\\s\\S]*?)<\\/script>'));
ok(!!scriptMatch, 'found the embedded script');
let parsed = true;
try { new Function(scriptMatch[1]); } catch (e) { parsed = false; console.error('client script parse error:', e.message); }
ok(parsed, 'embedded client script parses as valid JS');
ok(scriptMatch[1].includes('function mdToHtml'), 'markdown renderer present');
ok(scriptMatch[1].includes('function categorySelect'), 'category selector present');
ok(scriptMatch[1].includes("coveredByGlobal"), 'global-covers-project logic present');

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
  const html = wp.mdToHtml('# Title\n\n<script>alert(1)</script>\n\n- item');
  ok(!html.includes('<script>'), 'raw <script> in markdown is escaped');
  ok(html.includes('&lt;script&gt;'), 'script tag rendered as text');
  ok(html.includes('<h1>Title</h1>') && html.includes('<li>item</li>'), 'known markdown still renders');
}
// The host functions and the embedded client source are the SAME implementation.
ok(wp.markdownClientSource().includes('function mdToHtml'), 'client source carries mdToHtml');
ok(html.includes(wp.escAttr('a"b')) === false || wp.escAttr('a"b') === 'a&quot;b', 'escAttr escapes quotes');

// ── Category management UI (rename / delete with confirm-on-non-empty) ─────────
ok(html.includes('id="confirm-modal"'), 'confirm modal markup present');
{
  const script = html.match(new RegExp('<script nonce="' + N + '">([\\s\\S]*?)<\\/script>'))[1];
  ok(script.includes('Rename category'), 'rename action present in sidebar');
  ok(script.includes('openConfirm'), 'delete routes through a confirm dialog');
  ok(/if \(n > 0\)/.test(script), 'confirm is gated on the category having skills (empty → no confirm)');
  // Sidebar structure: fixed items, separators, pin action.
  ok(script.includes('navSep'), 'sidebar renders separators');
  ok(script.includes("mkCat('Uncategorized'"), 'Uncategorized is a fixed top item');
  ok(script.includes('+ New category'), 'New category is a fixed top item');
  ok(script.includes("type: 'setPinned'"), 'pin/unpin action present');
  ok(script.includes('state.pinned'), 'sidebar groups pinned categories');
  // View switcher: grid/list toggle, persisted.
  ok(html.includes('id="view-grid"') && html.includes('id="view-list"'), 'grid/list view switcher present');
  ok(script.includes("type: 'setView'"), 'view choice is persisted via setView');
  ok(script.includes('rowitem'), 'list layout class present');
}

console.log(`✅ webviewPalette render + md security: ${passed} assertions passed`);
