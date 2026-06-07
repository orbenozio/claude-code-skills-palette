'use strict';

// Verifies the hub category manifest read/write/setCategory logic against a temp hub.
// Run: node test/categoriesManifest.test.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const man = require('../src/categoriesManifest.js');

let passed = 0;
function ok(cond, msg) { assert(cond, msg); passed++; }

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-man-'));
const file = path.join(root, man.MANIFEST_NAME);

// Missing manifest → tolerant empty.
ok(man.read(root).categories.length === 0, 'missing manifest reads as empty');

// Assign a skill to a NEW category → file created, category present.
man.setCategory(root, 'add-idea', 'Content & Posts');
let m = man.read(root);
let cat = m.categories.find((c) => c.label === 'Content & Posts');
ok(!!cat, 'new category created');
ok(cat.id === 'content-posts', 'id slugified from label');
ok(cat.skills.includes('add-idea'), 'skill added to category');
ok(fs.existsSync(file), 'manifest file written');

// Assign a second skill to the same category (case-insensitive match, no dup category).
man.setCategory(root, 'linkedin-post', 'content & posts');
m = man.read(root);
ok(m.categories.filter((c) => c.label.toLowerCase() === 'content & posts').length === 1, 'no duplicate category on case-insensitive match');
ok(m.categories[0].skills.length === 2, 'both skills in the category');

// Move a skill to another category → removed from the first.
man.setCategory(root, 'add-idea', 'Productivity');
m = man.read(root);
ok(!m.categories.find((c) => c.label === 'Content & Posts').skills.includes('add-idea'), 'moved skill left old category');
ok(m.categories.find((c) => c.label === 'Productivity').skills.includes('add-idea'), 'moved skill joined new category');

// Set to Uncategorized / '' → removed from all, empty categories pruned.
man.setCategory(root, 'add-idea', '');
m = man.read(root);
ok(!m.categories.find((c) => c.label === 'Productivity'), 'empty category pruned after removal');
ok(man.setCategory(root, 'linkedin-post', 'Uncategorized') && !man.read(root).categories.find((c) => c.skills.includes('linkedin-post')), '"Uncategorized" removes membership');

// Tolerant read of garbage.
fs.writeFileSync(file, '{ not json ');
ok(man.read(root).categories.length === 0, 'garbage manifest → empty');

fs.rmSync(root, { recursive: true, force: true });
console.log(`✅ categoriesManifest: ${passed} assertions passed`);
