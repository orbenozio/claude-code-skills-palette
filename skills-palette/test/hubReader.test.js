'use strict';

// Verifies frontmatter parsing + title/summary derivation against the REAL 7 hub
// skills, plus unit cases for the heuristics. Run: node test/hubReader.test.js
const assert = require('assert');
const hub = require('../src/hubReader.js');

let passed = 0;
function ok(cond, msg) { assert(cond, msg); passed++; }

// ── Unit: deriveSummary cuts at Triggers/Use, not on period heuristic ──────────
ok(
  hub.deriveSummary("Add, check off, or list ideas in the central ideas document. Triggers on 'add an idea', 'הוסף רעיון'.")
    === 'Add, check off, or list ideas in the central ideas document.',
  'summary cut before " Triggers on"',
);
ok(
  hub.deriveSummary('Move a task between status sections. Use this whenever you finish work.')
    === 'Move a task between status sections.',
  'summary cut before " Use "',
);
{
  const long = 'Turn the work we did in the current project into an engagement-optimized LinkedIn post in English, ready to publish and share widely.';
  const s = hub.deriveSummary(long);
  ok(s.length <= 101 && s.endsWith('…'), 'long summary clamped with ellipsis');
  ok(!/\s\S+…$/.test(s) || s.lastIndexOf(' ') > 40, 'clamp respects a word boundary');
}

// ── Unit: deriveTitle from H1, fallback to Title-Case ──────────────────────────
ok(hub.deriveTitle('# Add Idea\n\nbody', 'add-idea') === 'Add Idea', 'title from H1');
ok(hub.deriveTitle('no heading here', 'release-vsix-github') === 'Release Vsix Github', 'title fallback Title-Case');

// ── Unit: parseFrontmatter ─────────────────────────────────────────────────────
{
  const { fm, body } = hub.splitFrontmatter('---\nname: foo-bar\ndescription: "Hello world"\n---\n# Foo Bar\ntext');
  const meta = hub.parseFrontmatter(fm);
  ok(meta.name === 'foo-bar', 'parsed name');
  ok(meta.description === 'Hello world', 'parsed + unquoted description');
  ok(/# Foo Bar/.test(body), 'body separated from frontmatter');
}

// ── Integration: frontmatter overrides (summary: / category:) in a temp hub ────
const fs = require('fs'), os = require('os'), path = require('path');
(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-fm-'));
  fs.mkdirSync(path.join(root, 'over'));
  fs.writeFileSync(path.join(root, 'over', 'SKILL.md'),
    '---\nname: over\ncategory: Custom Cat\nsummary: A hand-written summary.\ndescription: Long desc. Triggers on x.\n---\n# Over\n');
  fs.mkdirSync(path.join(root, 'plain'));
  fs.writeFileSync(path.join(root, 'plain', 'SKILL.md'),
    '---\nname: plain\ndescription: Plain desc. Triggers on y.\n---\n# Plain\n');
  const r = await hub.scan({ hubRoot: root });
  const over = r.skills.find((s) => s.name === 'over');
  const plain = r.skills.find((s) => s.name === 'plain');
  ok(over.summary === 'A hand-written summary.', 'frontmatter summary: overrides derivation');
  ok(over.category === 'Custom Cat', 'frontmatter category: overrides manifest');
  ok(plain.summary === 'Plain desc.', 'no override → derived summary');
  ok(r.categoryOrder.includes('Custom Cat'), 'frontmatter-only category appears in order');
  ok(r.categoryOrder[r.categoryOrder.length - 1] === hub.UNCATEGORIZED, 'Uncategorized stays last');
  fs.rmSync(root, { recursive: true, force: true });
})().catch((e) => { console.error(e); process.exit(1); });

// ── Integration: deleting a category returns its skills to Uncategorized ───────
// End-to-end proof (manifest write + scan) of the safe-delete guarantee.
const man = require('../src/categoriesManifest.js');
(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-del-'));
  for (const n of ['one', 'two']) {
    fs.mkdirSync(path.join(root, n));
    fs.writeFileSync(path.join(root, n, 'SKILL.md'), `---\nname: ${n}\ndescription: d. Triggers on x.\n---\n# ${n}\n`);
  }
  man.setCategory(root, 'one', 'Group X');
  let r = await hub.scan({ hubRoot: root });
  ok(r.skills.find((s) => s.name === 'one').category === 'Group X', 'skill mapped to its category');

  man.deleteCategory(root, 'Group X');
  r = await hub.scan({ hubRoot: root });
  ok(r.skills.find((s) => s.name === 'one').category === hub.UNCATEGORIZED, 'after deleting the category, its skill is Uncategorized (not lost)');
  ok(r.skills.length === 2, 'both skills still present after delete');
  fs.rmSync(root, { recursive: true, force: true });
})().catch((e) => { console.error(e); process.exit(1); });

// ── Integration: real hub scan over all skills ─────────────────────────────────
(async () => {
  const { skills, warnings } = await hub.scan();
  ok(skills.length >= 7, `found >=7 skills (got ${skills.length})`);

  for (const s of skills) {
    ok(s.name && /^[a-z0-9-]+$/.test(s.name), `${s.name}: kebab name`);
    ok(s.title && s.title.length > 0, `${s.name}: has a title`);
    ok(s.summary !== undefined, `${s.name}: has summary field`);
    ok(!/triggers on/i.test(s.summary), `${s.name}: summary is not a trigger-dump`);
    ok(s.summary.length <= 101, `${s.name}: summary length clamped`);
    ok(s.hubPath && s.hubPath.includes('SkillsHub'), `${s.name}: hubPath set`);
    ok(s.category, `${s.name}: has a category (>= Uncategorized)`);
  }

  // Print the derived display for human eyeballing (acceptance: readable).
  console.log('\n  Derived skill display (title — summary):');
  for (const s of skills) console.log(`   • [${s.category}] ${s.title} — ${s.summary}`);
  if (warnings.length) console.log('  warnings:', warnings);

  console.log(`\n✅ hubReader: ${passed} assertions passed`);
})().catch((e) => { console.error(e); process.exit(1); });
