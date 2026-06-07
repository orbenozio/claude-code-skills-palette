'use strict';

// Phase 0a — verifies junction creation + NORMALIZED detection against REAL junctions
// on this machine (incl. a target under OneDrive). Pure Node, no VSCode.
// Run: node test/linker.test.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const linker = require('../src/linker.js');

const HUB = 'C:\\Users\\orben\\OneDrive\\DEV\\Agents\\SkillsHub';

function tmpDir(prefix) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return d;
}

let passed = 0;
function ok(cond, msg) { assert(cond, msg); passed++; }

// ── Scenario A: junction to a local (non-OneDrive) target ─────────────────────
{
  const root = tmpDir('sp-localtgt-');
  const target = path.join(root, 'real-skill');
  fs.mkdirSync(target);
  fs.writeFileSync(path.join(target, 'SKILL.md'), '# T');
  const skillsDir = path.join(root, '.claude', 'skills');

  const r = linker.link('real-skill', target, skillsDir);
  ok(r === 'linked', 'A: link created');
  ok(linker.isLinkedTo(path.join(skillsDir, 'real-skill'), target), 'A: detected as linked (normalized)');
  ok(linker.linkStatus(path.join(skillsDir, 'real-skill'), path.join(root, 'OTHER')) === 'broken',
     'A: points-elsewhere reads as broken');
  ok(linker.link('real-skill', target, skillsDir) === 'already', 'A: re-link is idempotent (already)');

  const u = linker.unlink('real-skill', target, skillsDir);
  ok(u === 'unlinked', 'A: unlinked');
  ok(fs.existsSync(target) && fs.existsSync(path.join(target, 'SKILL.md')),
     'A: unlink left the TARGET intact (only removed the junction)');
  ok(linker.linkStatus(path.join(skillsDir, 'real-skill'), target) === 'absent', 'A: link gone');
  fs.rmSync(root, { recursive: true, force: true });
}

// ── Scenario B: junction to a REAL OneDrive target (an actual hub skill) ───────
{
  const target = path.join(HUB, 'add-idea'); // lives under OneDrive
  if (fs.existsSync(target)) {
    const root = tmpDir('sp-onedrive-');
    const skillsDir = path.join(root, '.claude', 'skills');
    const r = linker.link('add-idea', target, skillsDir);
    ok(r === 'linked', 'B: link to OneDrive hub skill created');
    const lp = path.join(skillsDir, 'add-idea');
    ok(linker.isLinkedTo(lp, target), 'B: OneDrive-targeted junction detected as linked');
    // readlink may carry a \\?\ prefix and differ in case — normalization must handle it.
    const raw = fs.readlinkSync(lp);
    ok(linker.canon(raw) === linker.canon(target), 'B: canon() normalizes \\\\?\\ prefix + casing');
    ok(fs.existsSync(path.join(lp, 'SKILL.md')), 'B: SKILL.md readable through the junction');
    linker.unlink('add-idea', target, skillsDir);
    ok(fs.existsSync(path.join(target, 'SKILL.md')), 'B: hub SKILL.md still present after unlink');
    fs.rmSync(root, { recursive: true, force: true });
  } else {
    console.log('  (B skipped — SkillsHub\\add-idea not found)');
  }
}

// ── Scenario C: recursive ancestor-junction guard ─────────────────────────────
{
  const root = tmpDir('sp-ancestor-');
  const realClaudeTarget = path.join(root, 'real-claude');
  fs.mkdirSync(realClaudeTarget);
  const claudeJunction = path.join(root, '.claude');
  fs.symlinkSync(realClaudeTarget, claudeJunction, 'junction'); // .claude itself is a junction
  const skillsDir = path.join(claudeJunction, 'skills');

  ok(linker.offendingAncestorJunction(skillsDir) !== null, 'C: ancestor junction detected');
  let threw = false;
  try { linker.ensureSkillsDir(skillsDir); } catch (e) { threw = e.code === 'ANCESTOR_IS_JUNCTION'; }
  ok(threw, 'C: ensureSkillsDir refuses when an ancestor is a junction');
  // And: skillsDir-itself-is-junction case
  const root2 = tmpDir('sp-selfjunction-');
  const hubLike = path.join(root2, 'hub');
  fs.mkdirSync(hubLike);
  const sd = path.join(root2, 'skills');
  fs.symlinkSync(hubLike, sd, 'junction');
  let threw2 = false;
  try { linker.ensureSkillsDir(sd); } catch (e) { threw2 = e.code === 'SKILLS_DIR_IS_JUNCTION'; }
  ok(threw2, 'C: ensureSkillsDir refuses when skillsDir itself is a junction');

  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(root2, { recursive: true, force: true });
}

console.log(`✅ linker (Phase 0a): ${passed} assertions passed`);
