'use strict';

/**
 * Reads the Skills Hub: enumerates `<hub>\<skill>\SKILL.md`, parses the YAML
 * frontmatter (name + description), derives a clean display title + summary, and
 * merges category info from an optional `skills-categories.json` manifest.
 *
 * Pure-ish: depends only on `fs`/`path` (no `vscode`). The scan is async
 * (`fs.promises`) because hub files live under OneDrive — a Files-On-Demand
 * "online-only" file can block on hydration, and we don't want to freeze the host.
 */

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

const DEFAULT_HUB = 'C:\\Users\\orben\\OneDrive\\DEV\\Agents\\SkillsHub';
const MANIFEST_NAME = 'skills-categories.json';
const UNCATEGORIZED = 'Uncategorized';

/** Extract the leading `---`...`---` frontmatter block + the remaining body. */
function splitFrontmatter(text) {
  const m = /^﻿?---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!m) return { fm: '', body: text };
  return { fm: m[1], body: m[2] };
}

/** Strip one layer of matching surrounding quotes from a scalar value. */
function unquote(v) {
  const s = v.trim();
  if (s.length >= 2 && ((s[0] === '"' && s.endsWith('"')) || (s[0] === "'" && s.endsWith("'")))) {
    return s.slice(1, -1);
  }
  return s;
}

/**
 * Minimal single-line `key: value` frontmatter parser — enough for these SKILL.md
 * files (name + a long single-line description). Not a general YAML parser.
 */
function parseFrontmatter(fm) {
  const out = {};
  for (const rawLine of fm.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    if (!/^[A-Za-z0-9_-]+$/.test(key)) continue; // ignore non key:value (e.g. list items)
    out[key] = unquote(line.slice(idx + 1));
  }
  return out;
}

/** First `# Heading` in the body → its text; else Title-Case of the kebab name. */
function deriveTitle(body, name) {
  const lines = (body || '').split(/\r?\n/);
  for (const l of lines) {
    const m = /^#\s+(.+?)\s*$/.exec(l);
    if (m) return m[1].trim();
  }
  return String(name || '')
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Clean one-line summary from a (long, trigger-laden) description.
 * Cut at the first of " Triggers on" / " Use " (case-insensitive) — NOT on a
 * period-heuristic (breaks on Hebrew, e.g./i.e., file.names). Then clamp to ~100
 * chars on a word boundary with an ellipsis.
 */
function deriveSummary(description, max = 100) {
  let s = (description || '').replace(/\s+/g, ' ').trim();
  const lower = s.toLowerCase();
  let cut = s.length;
  for (const marker of [' triggers on', ' use ']) {
    const i = lower.indexOf(marker);
    if (i >= 0 && i < cut) cut = i;
  }
  s = s.slice(0, cut).trim();
  if (s.length <= max) return s;
  const clipped = s.slice(0, max);
  const lastSpace = clipped.lastIndexOf(' ');
  return (lastSpace > 40 ? clipped.slice(0, lastSpace) : clipped).trimEnd() + '…';
}

/**
 * Load the category manifest if present. Returns { skillToCategory: Map, order: [labels] }.
 * Tolerant: missing/invalid manifest → empty mapping (everything → Uncategorized).
 */
async function loadCategories(hubRoot) {
  const p = path.join(hubRoot, MANIFEST_NAME);
  let raw;
  try {
    raw = await fsp.readFile(p, 'utf8');
  } catch (_) {
    return { skillToCategory: new Map(), order: [], warning: null };
  }
  try {
    const json = JSON.parse(raw);
    const skillToCategory = new Map();
    const order = [];
    for (const cat of json.categories || []) {
      if (!cat || !cat.label) continue;
      if (!order.includes(cat.label)) order.push(cat.label);
      for (const sk of cat.skills || []) skillToCategory.set(sk, cat.label);
    }
    return { skillToCategory, order, warning: null };
  } catch (e) {
    return { skillToCategory: new Map(), order: [], warning: `${MANIFEST_NAME}: ${e.message}` };
  }
}

/**
 * Scan the hub. Returns { skills: SkillEntry[], categoryOrder: string[], warnings: string[] }.
 * Each SkillEntry: { name, title, summary, category, hubPath }.
 * @param {object} [opts]
 * @param {string} [opts.hubRoot]
 */
async function scan(opts = {}) {
  const hubRoot = opts.hubRoot || DEFAULT_HUB;
  const warnings = [];

  let entries;
  try {
    entries = await fsp.readdir(hubRoot, { withFileTypes: true });
  } catch (e) {
    return { skills: [], categoryOrder: [], warnings: [`Cannot read hub "${hubRoot}": ${e.message}`] };
  }

  const { skillToCategory, order, warning: catWarn } = await loadCategories(hubRoot);
  if (catWarn) warnings.push(catWarn);

  const skills = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(hubRoot, entry.name);
    const skillMd = path.join(dir, 'SKILL.md');
    let text;
    try {
      text = await fsp.readFile(skillMd, 'utf8');
    } catch (_) {
      continue; // not a skill folder
    }
    const { fm, body } = splitFrontmatter(text);
    const meta = parseFrontmatter(fm);
    const name = meta.name || entry.name;
    if (!meta.name) warnings.push(`${entry.name}\\SKILL.md: missing "name" in frontmatter (using folder name).`);
    skills.push({
      name,
      title: deriveTitle(body, name),
      summary: deriveSummary(meta.description || ''),
      category: skillToCategory.get(name) || UNCATEGORIZED,
      hubPath: dir,
    });
  }

  skills.sort((a, b) => a.title.localeCompare(b.title));

  // Final category order: manifest order first, then Uncategorized last (if used).
  const used = new Set(skills.map((s) => s.category));
  const categoryOrder = order.filter((c) => used.has(c));
  if (used.has(UNCATEGORIZED)) categoryOrder.push(UNCATEGORIZED);

  return { skills, categoryOrder, warnings };
}

module.exports = {
  DEFAULT_HUB,
  MANIFEST_NAME,
  UNCATEGORIZED,
  splitFrontmatter,
  parseFrontmatter,
  unquote,
  deriveTitle,
  deriveSummary,
  loadCategories,
  scan,
};
