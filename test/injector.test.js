'use strict';

// Pure-logic invariants for the marker-scoped injector, with a TRIPLE coexistence
// fixture: NONSTOP + Agentville + Skills Palette all share Claude's webview/index.js.
// This guards R7 — that our injector never clobbers the OTHER two tools' blocks and
// that re-injection is a byte-for-byte no-op (so no infinite "Reload Window" loop).
// Run: node test/injector.test.js
const assert = require('assert');
const inj = require('../src/injector.js');

let passed = 0;
function ok(cond, msg) { assert(cond, msg); passed++; }

// Foreign blocks we must never touch.
const nonstopBlock =
  '// >>> Claude Code Nonstop (injected) v0.2.3 >>>\n' +
  'window.__NONSTOP_CONFIG__ = {};\n(function(){/*nonstop*/})();\n' +
  '// <<< Claude Code Nonstop (injected) <<<';
const agentvilleBlock =
  '// >>> Agentville Launcher (injected) v0.1.6 >>>\n' +
  '(function(){/*agentville*/})();\n' +
  '// <<< Agentville Launcher (injected) <<<';

const ourBody = '(function(){/*claude-code-skills-palette*/})();';

// Base file already carrying BOTH foreign blocks (the new, untested-before scenario).
const base =
  'console.log("claude original");\n\n' + nonstopBlock + '\n\n' + agentvilleBlock + '\n';

// 1) Inject ours — both foreign blocks intact, exactly one of ours.
const v1 = inj.inject(base, '0.1.0', ourBody);
ok(v1.includes('Claude Code Nonstop (injected)'), 'nonstop survived inject');
ok(v1.includes('Agentville Launcher (injected)'), 'agentville survived inject');
ok(inj.hasValidInjection(v1, '0.1.0'), 'our block valid');
ok(inj.findBlocks(v1).length === 1, 'exactly one claude-code-skills-palette block');

// 2) Idempotent — re-injecting same version+body is a byte-for-byte no-op.
ok(inj.inject(v1, '0.1.0', ourBody) === v1, 'idempotent re-inject (no reload loop)');

// 3) Version/body bump replaces ONLY our block; both foreign blocks intact & unmoved.
const v3 = inj.inject(v1, '0.2.0', '(function(){/*claude-code-skills-palette v2*/})();');
ok(inj.findBlocks(v3).length === 1, 'still one block after bump');
ok(inj.hasValidInjection(v3, '0.2.0'), 'bumped block valid');
ok(v3.includes('claude-code-skills-palette v2') && !v3.includes('/*claude-code-skills-palette*/'), 'body replaced in place');
ok(v3.includes(nonstopBlock), 'nonstop byte-identical after bump');
ok(v3.includes(agentvilleBlock), 'agentville byte-identical after bump');

// 4) stripAllBlocks removes ONLY ours — both foreign blocks + original code remain.
const stripped = inj.stripAllBlocks(v3);
ok(inj.findBlocks(stripped).length === 0, 'our blocks gone');
ok(stripped.includes('Claude Code Nonstop (injected)'), 'nonstop NOT stripped');
ok(stripped.includes('Agentville Launcher (injected)'), 'agentville NOT stripped');
ok(stripped.includes('claude original'), 'original code intact');

// 5) Round-trip: inject → strip → re-inject leaves the two foreign blocks byte-for-byte.
{
  const injected = inj.inject(base, '0.1.0', ourBody);
  const back = inj.stripAllBlocks(injected).replace(/\s+$/, '') + '\n';
  ok(back.includes(nonstopBlock) && back.includes(agentvilleBlock), 'round-trip keeps both foreign blocks');
  const reinjected = inj.inject(back, '0.1.0', ourBody);
  ok(inj.findBlocks(reinjected).length === 1, 'round-trip re-inject = one block');
  ok(reinjected.includes(nonstopBlock) && reinjected.includes(agentvilleBlock), 'foreign blocks survive round-trip');
}

// 6) IN-PLACE no-op with foreign blocks on BOTH sides of ours (ours in the middle).
{
  const our = inj.buildBlock('0.1.0', ourBody);
  const sandwich =
    'console.log("orig");\n\n' + nonstopBlock + '\n\n' + our + '\n\n' + agentvilleBlock + '\n';
  ok(inj.findBlocks(sandwich).length === 1, 'one block in sandwich fixture');
  ok(inj.inject(sandwich, '0.1.0', ourBody) === sandwich, 're-inject no-op when sandwiched between two foreign blocks');
  // Ordering preserved after a bump.
  const bumped = inj.inject(sandwich, '0.2.0', '(function(){/*sp2*/})();');
  ok(bumped.indexOf('Claude Code Nonstop') < bumped.indexOf('Skills Palette'), 'nonstop stays before ours');
  ok(bumped.indexOf('Skills Palette') < bumped.indexOf('Agentville Launcher'), 'ours stays before agentville');
}

console.log(`✅ injector triple-coexistence + idempotency + in-place: ${passed} assertions pass`);
