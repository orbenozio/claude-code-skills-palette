'use strict';

/**
 * Position-based, two-sided-marker injection logic (ported from Agentville Launcher,
 * which ported it from Claude Code Nonstop). Uses Skills Palette's own markers.
 *
 * We wrap the injected block in matching open/close markers and only ever remove the
 * text BETWEEN and INCLUDING our own marker pair. This lets us coexist with other
 * injected tools (Nonstop, Agentville) in the same webview/index.js without anyone
 * clobbering anyone. Pure string functions (no fs) so they are trivially testable.
 */

const { OPEN_PREFIX, OPEN_SUFFIX, CLOSE_MARKER } = require('./constants');

/**
 * Find every Skills Palette block in `content`.
 * Returns [{ start, end, version, malformed }] where [start, end) spans the whole
 * block including both markers. Handles multiple/duplicate blocks (defensive).
 */
function findBlocks(content) {
  const blocks = [];
  let searchFrom = 0;
  while (true) {
    const openIdx = content.indexOf(OPEN_PREFIX, searchFrom);
    if (openIdx < 0) break;

    const lineEnd = content.indexOf('\n', openIdx);
    const openLine = content.slice(openIdx, lineEnd < 0 ? content.length : lineEnd);
    let version = null;
    if (openLine.endsWith(OPEN_SUFFIX)) {
      version = openLine.slice(OPEN_PREFIX.length, openLine.length - OPEN_SUFFIX.length);
    }

    const closeIdx = content.indexOf(CLOSE_MARKER, openIdx);
    if (closeIdx < 0) {
      blocks.push({ start: openIdx, end: content.length, version, malformed: true });
      break;
    }
    const end = closeIdx + CLOSE_MARKER.length;
    blocks.push({ start: openIdx, end, version, malformed: false });
    searchFrom = end;
  }
  return blocks;
}

/**
 * Remove ALL our blocks from `content` (including duplicates/leftovers), collapsing
 * a single surrounding blank line. Never touches text outside our markers.
 */
function stripAllBlocks(content) {
  const blocks = findBlocks(content);
  if (blocks.length === 0) return content;
  let out = content;
  for (let i = blocks.length - 1; i >= 0; i--) {
    const { start, end } = blocks[i];
    let s = start;
    let e = end;
    // Eat a single trailing newline we may have introduced after the block.
    if (out[e] === '\n') e += 1;
    // Collapse the single blank line `inject()` puts before the block. Only ever
    // consume ONE preceding newline — never spaces/tabs (could be meaningful
    // indentation of foreign code).
    if (out[s - 1] === '\n') s -= 1;
    out = out.slice(0, s) + out.slice(e);
  }
  return out;
}

/**
 * Build a fresh injection block (open marker + script body + close marker).
 * @param {string} version
 * @param {string} scriptBody  the IIFE-wrapped webview script source
 */
function buildBlock(version, scriptBody) {
  const open = `${OPEN_PREFIX}${version}${OPEN_SUFFIX}`;
  return `${open}\n${scriptBody}\n${CLOSE_MARKER}`;
}

/** Is `content` already correctly injected for `version`? (exactly one well-formed block) */
function hasValidInjection(content, version) {
  const blocks = findBlocks(content);
  if (blocks.length !== 1) return false;
  const b = blocks[0];
  return !b.malformed && b.version === version;
}

/**
 * Produce new file content carrying a single fresh Skills Palette block.
 *
 * IN-PLACE: with no block yet we append at end (with a separating blank line). With a
 * block present we replace the FIRST one where it sits — same byte offsets — and drop
 * duplicates, without reordering or trimming global whitespace. This is critical when
 * other extensions also inject here: if everyone appended-to-end, each would shove its
 * block past the others every reload, so all files would read "changed" forever and
 * all would keep offering "Reload Window". With in-place replacement, re-injecting an
 * up-to-date block is a byte-for-byte no-op (next === content) — that stops the loop.
 */
function inject(content, version, scriptBody) {
  const blocks = findBlocks(content);
  const block = buildBlock(version, scriptBody);

  if (blocks.length === 0) {
    const trimmed = content.replace(/\s+$/, '');
    return `${trimmed}\n\n${block}\n`;
  }

  let out = content;
  // Remove duplicate blocks (everything past the first), back-to-front so earlier
  // offsets stay valid. These all sit after the primary block.
  for (let i = blocks.length - 1; i >= 1; i--) {
    let { start: s, end: e } = blocks[i];
    if (out[e] === '\n') e += 1;
    if (out[s - 1] === '\n') s -= 1;
    out = out.slice(0, s) + out.slice(e);
  }
  // Replace the primary (first) block in place — same start/end, no reordering.
  const primary = blocks[0];
  return out.slice(0, primary.start) + block + out.slice(primary.end);
}

module.exports = {
  findBlocks,
  stripAllBlocks,
  buildBlock,
  hasValidInjection,
  inject,
};
