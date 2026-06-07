'use strict';

/**
 * Junction-based linking of a Skills Hub skill into a project (or global) skills dir.
 *
 * A "link" is a Windows directory junction:
 *     <skillsDir>\<skill>   ->   <hub>\SkillsHub\<skill>
 *
 * We create it with Node's native `fs.symlinkSync(target, path, 'junction')` — same
 * reparse-point `mklink /J` produces, but with no `cmd` spawn, no shell quoting, and
 * structured errors (`err.code`). Junctions need NO admin (only `/D` symlinks do).
 *
 * Detection (`isLinkedTo`) must NORMALIZE the readlink result: Windows junctions come
 * back with a `\\?\` prefix, paths differ in casing, and OneDrive Files-On-Demand
 * placeholders are themselves reparse points. So we resolve both sides and compare
 * case-insensitively. Pure-ish module: only depends on `fs`/`path`, no `vscode`.
 */

const fs = require('fs');
const path = require('path');

/** Strip the Windows extended-length prefix `\\?\` (and `\??\`) that readlink may return. */
function stripExtendedPrefix(p) {
  if (!p) return p;
  return p.replace(/^\\\\\?\\/, '').replace(/^\\\?\?\\/, '');
}

/** Canonical form for comparing two Windows paths: prefix-stripped, resolved, lowercased. */
function canon(p) {
  return path.resolve(stripExtendedPrefix(p)).replace(/[\\/]+$/, '').toLowerCase();
}

/**
 * Is `linkPath` a junction/symlink that points at `expectedTarget`?
 * @returns {'linked'|'broken'|'absent'|'not-a-link'}
 *   linked     — reparse point resolving to expectedTarget
 *   broken     — reparse point, but points elsewhere / target missing
 *   not-a-link — exists as a real dir/file (e.g. a normal folder of the same name)
 *   absent     — nothing there
 */
function linkStatus(linkPath, expectedTarget) {
  let st;
  try {
    st = fs.lstatSync(linkPath);
  } catch (_) {
    return 'absent';
  }
  if (!st.isSymbolicLink()) return 'not-a-link';
  let target;
  try {
    target = fs.readlinkSync(linkPath);
  } catch (_) {
    return 'broken';
  }
  if (canon(target) !== canon(expectedTarget)) return 'broken';
  // Points where we expect — but is the hub target actually present?
  if (!fs.existsSync(linkPath)) return 'broken'; // dangling: hub folder gone
  return 'linked';
}

/** Convenience boolean: true only when a healthy junction to expectedTarget exists. */
function isLinkedTo(linkPath, expectedTarget) {
  return linkStatus(linkPath, expectedTarget) === 'linked';
}

/** Is `p` itself a junction/symlink? (used for the recursive parent guard) */
function isReparsePoint(p) {
  try {
    return fs.lstatSync(p).isSymbolicLink();
  } catch (_) {
    return false;
  }
}

/**
 * Guard: refuse to create `<skillsDir>` if any ANCESTOR is a junction, because
 * `mkdirSync` would then write INSIDE the junction's target (silent corruption).
 * Checks every ancestor of skillsDir up to the filesystem root.
 * @returns {string|null} the offending junction path, or null if safe.
 */
function offendingAncestorJunction(skillsDir) {
  let dir = path.dirname(path.resolve(skillsDir)); // start at `.claude`
  let prev = null;
  while (dir && dir !== prev) {
    if (isReparsePoint(dir)) return dir;
    prev = dir;
    dir = path.dirname(dir);
  }
  return null;
}

/**
 * Ensure `skillsDir` exists as a REAL directory suitable for per-skill junctions.
 * Throws a descriptive Error when it can't be made safe.
 */
function ensureSkillsDir(skillsDir) {
  // `skillsDir` itself must not be a whole-hub junction.
  if (isReparsePoint(skillsDir)) {
    const err = new Error(
      `"${skillsDir}" is a junction (likely to the whole hub). ` +
      `Remove it (cmd /c rmdir "${skillsDir}") and let a real folder be created for per-skill links.`,
    );
    err.code = 'SKILLS_DIR_IS_JUNCTION';
    throw err;
  }
  // No ancestor may be a junction.
  const bad = offendingAncestorJunction(skillsDir);
  if (bad) {
    const err = new Error(
      `Refusing to create "${skillsDir}": an ancestor is a junction ("${bad}"). ` +
      `Creating the folder would write inside the junction's target.`,
    );
    err.code = 'ANCESTOR_IS_JUNCTION';
    throw err;
  }
  fs.mkdirSync(skillsDir, { recursive: true });
}

/**
 * Create a junction `<skillsDir>\<skill>` -> `hubSkillPath`.
 * Idempotent: if an identical healthy link already exists, returns 'already'.
 * @returns {'linked'|'already'|'relinked'}
 */
function link(skill, hubSkillPath, skillsDir) {
  ensureSkillsDir(skillsDir);
  const linkPath = path.join(skillsDir, skill);
  const status = linkStatus(linkPath, hubSkillPath);
  if (status === 'linked') return 'already';
  if (status === 'broken') {
    // Re-link: drop the stale junction first.
    removeJunction(linkPath);
    fs.symlinkSync(hubSkillPath, linkPath, 'junction');
    return 'relinked';
  }
  if (status === 'not-a-link') {
    const err = new Error(`"${linkPath}" already exists as a real folder/file — not touching it.`);
    err.code = 'EEXIST_REAL';
    throw err;
  }
  fs.symlinkSync(hubSkillPath, linkPath, 'junction');
  return 'linked';
}

/** Remove a junction (the link only — never its target's contents). */
function removeJunction(linkPath) {
  // A directory junction is removed with rmdir; this unlinks the reparse point and
  // does NOT recurse into / delete the hub target. On any rmdir failure, fall back to
  // unlink — `unlink` on a junction also removes only the reparse point, never the
  // target's contents — so the fallback is safe regardless of the error code.
  try {
    fs.rmdirSync(linkPath);
  } catch (e) {
    try {
      fs.unlinkSync(linkPath);
    } catch (_) {
      throw e; // surface the original rmdir error
    }
  }
}

/**
 * Unlink a skill from `skillsDir`. Only removes a junction that points at the hub;
 * refuses to delete a real folder.
 * @returns {'unlinked'|'absent'}
 */
function unlink(skill, hubSkillPath, skillsDir) {
  const linkPath = path.join(skillsDir, skill);
  const status = linkStatus(linkPath, hubSkillPath);
  if (status === 'absent') return 'absent';
  if (status === 'not-a-link') {
    const err = new Error(`"${linkPath}" is a real folder, not a junction — refusing to remove.`);
    err.code = 'NOT_A_LINK';
    throw err;
  }
  removeJunction(linkPath);
  return 'unlinked';
}

module.exports = {
  canon,
  stripExtendedPrefix,
  linkStatus,
  isLinkedTo,
  isReparsePoint,
  offendingAncestorJunction,
  ensureSkillsDir,
  link,
  unlink,
  removeJunction,
};
