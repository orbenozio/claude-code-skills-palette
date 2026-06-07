'use strict';

/**
 * Read/write the hub's category manifest (`SkillsHub\skills-categories.json`).
 * This is the one place the palette WRITES to the hub — only category membership,
 * never skill content. Tolerant reads (missing/garbage → empty manifest), atomic
 * writes. Pure fs/path, no vscode, so it's unit-testable.
 */

const fs = require('fs');
const path = require('path');

const MANIFEST_NAME = 'skills-categories.json';
const UNCATEGORIZED = 'Uncategorized';

function manifestPath(hubRoot) {
  return path.join(hubRoot, MANIFEST_NAME);
}

/** Read the manifest, always returning a well-formed { version, categories: [] }. */
function read(hubRoot) {
  try {
    const j = JSON.parse(fs.readFileSync(manifestPath(hubRoot), 'utf8'));
    if (!j || typeof j !== 'object') throw new Error('not an object');
    if (!Array.isArray(j.categories)) j.categories = [];
    if (!j.version) j.version = 1;
    // Normalize each category shape.
    j.categories = j.categories
      .filter((c) => c && c.label)
      .map((c) => ({ id: c.id || slug(c.label), label: c.label, skills: Array.isArray(c.skills) ? c.skills.slice() : [] }));
    return j;
  } catch (_) {
    return { version: 1, categories: [] };
  }
}

/** Atomic write (temp + rename in the same dir). */
function write(hubRoot, manifest) {
  const p = manifestPath(hubRoot);
  const tmp = p + `.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  try {
    fs.renameSync(tmp, p);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch (_) { /* ignore */ }
    throw e;
  }
}

/** Kebab id from a human label. */
function slug(label) {
  return String(label).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'cat';
}

/**
 * Assign `skillName` to category `label` (creating the category if new). An empty
 * label, or "Uncategorized", removes the skill from all categories. Returns the
 * updated manifest after persisting it. Drops categories that end up empty AND were
 * not just created, to keep the file tidy.
 */
function setCategory(hubRoot, skillName, label) {
  const m = read(hubRoot);
  for (const c of m.categories) c.skills = c.skills.filter((s) => s !== skillName);

  const clean = String(label || '').trim();
  if (clean && clean.toLowerCase() !== UNCATEGORIZED.toLowerCase()) {
    let cat = m.categories.find((c) => c.label.toLowerCase() === clean.toLowerCase());
    if (!cat) {
      cat = { id: slug(clean), label: clean, skills: [] };
      m.categories.push(cat);
    }
    if (!cat.skills.includes(skillName)) cat.skills.push(skillName);
  }

  // NOTE: empty categories are intentionally KEPT — a category that loses its last
  // skill stays defined (and selectable) until the user explicitly deletes it.
  write(hubRoot, m);
  return m;
}

/**
 * Rename category `oldLabel` to `newLabel`. If a different category already has the
 * new label, the two are MERGED (skills combined). No-op if oldLabel doesn't exist
 * or newLabel is empty. Returns the updated (persisted) manifest.
 */
function renameCategory(hubRoot, oldLabel, newLabel) {
  const m = read(hubRoot);
  const clean = String(newLabel || '').trim();
  if (!clean) return m;
  const cat = m.categories.find((c) => c.label.toLowerCase() === String(oldLabel).toLowerCase());
  if (!cat) return m;
  const target = m.categories.find((c) => c !== cat && c.label.toLowerCase() === clean.toLowerCase());
  if (target) {
    for (const s of cat.skills) if (!target.skills.includes(s)) target.skills.push(s);
    m.categories = m.categories.filter((c) => c !== cat);
  } else {
    cat.label = clean;
    cat.id = slug(clean);
  }
  write(hubRoot, m); // empty categories are kept (see setCategory)
  return m;
}

/**
 * Delete a category by label. Its skills simply become Uncategorized (membership is
 * defined only by this manifest, so dropping the entry un-maps them). Non-destructive
 * to skill content. Returns the updated (persisted) manifest.
 */
function deleteCategory(hubRoot, label) {
  const m = read(hubRoot);
  m.categories = m.categories.filter((c) => c.label.toLowerCase() !== String(label).toLowerCase());
  write(hubRoot, m);
  return m;
}

module.exports = { MANIFEST_NAME, UNCATEGORIZED, manifestPath, read, write, slug, setCategory, renameCategory, deleteCategory };
