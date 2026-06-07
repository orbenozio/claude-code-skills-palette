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

console.log(`✅ webviewPalette render: ${passed} assertions passed`);
