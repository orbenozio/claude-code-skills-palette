'use strict';

// Pure-logic checks for the self-updater (no network). Run: node test/updater.test.js
const assert = require('assert');
const { cmpVersions, repoSlug } = require('../src/updater');

let passed = 0;
function ok(cond, msg) { assert(cond, msg); passed++; }

// cmpVersions: numeric, ignores a leading "v", handles uneven lengths.
ok(cmpVersions('0.4.2', '0.4.1') > 0, '0.4.2 > 0.4.1');
ok(cmpVersions('v0.4.2', '0.4.2') === 0, 'leading v ignored, equal');
ok(cmpVersions('0.4.0', '0.4.1') < 0, '0.4.0 < 0.4.1');
ok(cmpVersions('1.0.0', '0.9.9') > 0, 'major beats minor/patch');
ok(cmpVersions('0.5', '0.5.0') === 0, 'missing patch treated as 0');
ok(cmpVersions('0.5.1', '0.5') > 0, 'extra patch is newer');

// repoSlug: parse owner/repo from a few repository URL shapes.
ok(repoSlug({ repository: { url: 'https://github.com/orbenozio/claude-code-skills-palette.git' } }).owner === 'orbenozio', 'owner parsed from https .git url');
ok(repoSlug({ repository: { url: 'https://github.com/orbenozio/claude-code-skills-palette.git' } }).repo === 'claude-code-skills-palette', 'repo parsed from https .git url');
ok(repoSlug({ repository: 'git@github.com:foo/bar.git' }).repo === 'bar', 'repo parsed from ssh url string');
ok(repoSlug({ repository: { url: 'https://github.com/foo/bar' } }).repo === 'bar', 'repo parsed without .git suffix');
ok(repoSlug({}) === null, 'no repository → null');

console.log(`✅ updater pure-logic: ${passed} assertions passed`);
