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
