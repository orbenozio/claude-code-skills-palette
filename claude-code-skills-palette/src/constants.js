'use strict';

/**
 * Shared constants for the Skills Palette extension.
 *
 * Two-sided injection markers (open + close) let our block be located and removed
 * precisely regardless of what other extensions append to the same Claude
 * webview/index.js. We only ever touch text BETWEEN OUR OWN markers — that is what
 * lets Skills Palette, Agentville Launcher, and Claude Code Nonstop all share the
 * file safely. Each tool MUST use a distinct marker + backup suffix.
 */

// Open marker carries the version: "// >>> Skills Palette (injected) v1.2.3 >>>"
const OPEN_PREFIX = '// >>> Skills Palette (injected) v';
const OPEN_SUFFIX = ' >>>';
const CLOSE_MARKER = '// <<< Skills Palette (injected) <<<';

// Marker strings of KNOWN co-installed tools that inject into the same file. Used
// only to DETECT their presence (diagnostics) so we never clobber them — values
// must match those tools' open markers verbatim.
const FOREIGN_MARKERS = [
  '// >>> Claude Code Nonstop (injected) v',
  '// >>> Agentville Launcher (injected) v',
];

// Backup file suffix — distinct from ".nonstop-backup" and ".agentville-backup".
const BACKUP_SUFFIX = '.claude-code-skills-palette-backup';

// Claude Code extension id and directory prefix.
const CLAUDE_EXTENSION_ID = 'anthropic.claude-code';
const CLAUDE_DIR_PREFIX = 'anthropic.claude-code-';

// The webview entry file we inject into, relative to the extension dir.
const WEBVIEW_ENTRY = 'webview/index.js';

module.exports = {
  OPEN_PREFIX,
  OPEN_SUFFIX,
  CLOSE_MARKER,
  FOREIGN_MARKERS,
  BACKUP_SUFFIX,
  CLAUDE_EXTENSION_ID,
  CLAUDE_DIR_PREFIX,
  WEBVIEW_ENTRY,
};
