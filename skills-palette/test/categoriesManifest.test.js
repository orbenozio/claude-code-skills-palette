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

// Set to '' / Uncategorized → skill removed from all categories; the now-empty
// category is KEPT (not auto-pruned — only an explicit delete removes it).
man.setCategory(root, 'add-idea', '');
m = man.read(root);
const prod = m.categories.find((c) => c.label === 'Productivity');
ok(prod && prod.skills.length === 0, 'emptied category is kept (not auto-pruned)');
ok(!m.categories.some((c) => c.skills.includes('add-idea')), 'skill removed from all categories');
ok(man.setCategory(root, 'linkedin-post', 'Uncategorized') && !man.read(root).categories.find((c) => c.skills.includes('linkedin-post')), '"Uncategorized" removes membership');

// ── Create an empty category from the sidebar ──────────────────────────────────
man.createCategory(root, 'Recipe');
let mc = man.read(root);
const recipe = mc.categories.find((c) => c.label === 'Recipe');
ok(recipe && recipe.skills.length === 0, 'createCategory adds an empty category');
ok(recipe.id === 'recipe', 'createCategory slugs the id');
const countBefore = mc.categories.length;
man.createCategory(root, 'recipe'); // case-insensitive duplicate → no-op
ok(man.read(root).categories.length === countBefore, 'createCategory is idempotent (case-insensitive)');
man.createCategory(root, 'Uncategorized'); // ignored
ok(!man.read(root).categories.find((c) => c.label === 'Uncategorized'), 'createCategory ignores "Uncategorized"');
// A skill can then be moved INTO the freshly-created empty category.
man.setCategory(root, 'z', 'Recipe');
ok(man.read(root).categories.find((c) => c.label === 'Recipe').skills.includes('z'), 'a skill moves into the new category');

// ── Rename a category ──────────────────────────────────────────────────────────
man.setCategory(root, 'a', 'Temp Cat');
man.setCategory(root, 'b', 'Temp Cat');
man.renameCategory(root, 'Temp Cat', 'Renamed Cat');
let mr = man.read(root);
ok(!mr.categories.find((c) => c.label === 'Temp Cat'), 'rename: old label gone');
const rc = mr.categories.find((c) => c.label === 'Renamed Cat');
ok(rc && rc.skills.includes('a') && rc.skills.includes('b'), 'rename: skills preserved under new label');
ok(rc.id === 'renamed-cat', 'rename: id re-slugged');

// Rename onto an existing label → merge.
man.setCategory(root, 'c', 'Other Cat');
man.renameCategory(root, 'Other Cat', 'Renamed Cat');
mr = man.read(root);
ok(mr.categories.filter((c) => c.label === 'Renamed Cat').length === 1, 'rename-merge: single category');
ok(mr.categories.find((c) => c.label === 'Renamed Cat').skills.includes('c'), 'rename-merge: skill carried over');
ok(!mr.categories.find((c) => c.label === 'Other Cat'), 'rename-merge: source category removed');

// ── Delete a category that HAS skills → skills return to Uncategorized ──────────
// (guarantee the user asked for: a non-empty category never DELETES its skills.)
man.deleteCategory(root, 'Renamed Cat');
mr = man.read(root);
ok(!mr.categories.find((c) => c.label === 'Renamed Cat'), 'delete: category removed');
ok(!mr.categories.some((c) => ['a', 'b', 'c'].some((s) => c.skills.includes(s))),
   'delete: every skill of the deleted category is un-mapped (→ Uncategorized), not lost');

// Tolerant read of garbage.
fs.writeFileSync(file, '{ not json ');
ok(man.read(root).categories.length === 0, 'garbage manifest → empty');

fs.rmSync(root, { recursive: true, force: true });
console.log(`✅ categoriesManifest: ${passed} assertions passed`);
