'use strict';

const fs = require('fs');
const path = require('path');
const vscode = require('vscode');

const { BACKUP_SUFFIX, FOREIGN_MARKERS } = require('./constants');
const injector = require('./injector');
const { writeAndVerify } = require('./atomicWrite');
const { resolveTargets } = require('./targets/claude-code');
const statusBar = require('./statusBar');
const output = require('./output');
const { openPalette } = require('./paletteUI');

let reinjectTimer = null;
let lastFocusCheck = 0;
const FOCUS_REINJECT_THROTTLE_MS = 30000;

function getConfig() {
  return vscode.workspace.getConfiguration('skillsPalette');
}

function loadWebviewScript(context) {
  const p = path.join(context.extensionPath, 'webview', 'skills-palette.js');
  return fs.readFileSync(p, 'utf8');
}

function backupPathFor(indexPath) {
  return indexPath + BACKUP_SUFFIX;
}

/** Emergency-only backup (never used for blind restore — removal strips our markers). */
function ensureBackup(indexPath) {
  const bp = backupPathFor(indexPath);
  if (!fs.existsSync(bp)) {
    try { fs.copyFileSync(indexPath, bp); } catch (_) { /* best effort */ }
  }
}

function injectTarget(target, version, scriptBody) {
  let content;
  try {
    content = fs.readFileSync(target.indexPath, 'utf8');
  } catch (_) {
    return false;
  }
  const next = injector.inject(content, version, scriptBody);
  if (next === content) return false; // already current (version + code match)

  ensureBackup(target.indexPath);
  const ok = writeAndVerify(
    target.indexPath,
    next,
    (written) => injector.hasValidInjection(written, version),
    { retries: 3, backoffMs: 50 },
  );
  if (!ok) console.error(`[SkillsPalette] write race not resolved for ${target.indexPath}`);
  for (const fm of FOREIGN_MARKERS) {
    if (next.includes(fm)) console.log('[SkillsPalette] coexisting with', fm.replace('// >>> ', '').replace(' (injected) v', ''), 'in', target.name);
  }
  return ok;
}

function checkAndInject(context, { interactive = false } = {}) {
  const c = getConfig();
  if (!c.get('autoInject', true) && !interactive) return { changed: 0, targets: 0 };

  const version = context.extension.packageJSON.version;
  const scriptBody = loadWebviewScript(context);
  const targets = resolveTargets(vscode);

  let changed = 0;
  for (const t of targets) {
    if (injectTarget(t, version, scriptBody)) changed++;
  }
  const result = { changed, targets: targets.length };
  statusBar.reflect(result);
  return result;
}

/** Remove ONLY our blocks from every target. Never blind-restore the backup. */
function removeInjection() {
  const targets = resolveTargets(vscode);
  let changed = 0;
  for (const t of targets) {
    let content;
    try { content = fs.readFileSync(t.indexPath, 'utf8'); } catch (_) { continue; }
    const blocks = injector.findBlocks(content);
    if (blocks.length === 0) continue;
    const cleaned = injector.stripAllBlocks(content).replace(/\s+$/, '') + '\n';
    writeAndVerify(t.indexPath, cleaned, (w) => injector.findBlocks(w).length === 0);
    try { fs.unlinkSync(backupPathFor(t.indexPath)); } catch (_) { /* ignore */ }
    changed++;
  }
  return changed;
}

let reinjectDisposed = false;
function scheduleReinject(context) {
  if (reinjectTimer) { clearInterval(reinjectTimer); reinjectTimer = null; }
  const hours = Number(getConfig().get('reinjectCheckHours', 6)) || 0;
  if (hours <= 0) return;
  reinjectTimer = setInterval(() => {
    try { checkAndInject(context, { interactive: false }); } catch (err) { console.error('[SkillsPalette]', err); }
  }, hours * 3600 * 1000);
  if (!reinjectDisposed) {
    reinjectDisposed = true;
    context.subscriptions.push({ dispose: () => { if (reinjectTimer) clearInterval(reinjectTimer); } });
  }
}

function registerFocusReinject(context) {
  context.subscriptions.push(
    vscode.window.onDidChangeWindowState((state) => {
      if (!state.focused) return;
      const now = Date.now();
      if (now - lastFocusCheck < FOCUS_REINJECT_THROTTLE_MS) return;
      lastFocusCheck = now;
      checkAndInject(context, { interactive: false });
    }),
  );
}

function handleVersionUpgrade(context) {
  const version = context.extension.packageJSON.version;
  const stored = context.globalState.get('skillsPalette.installedVersion');
  if (stored && stored !== version) checkAndInject(context, { interactive: false });
  context.globalState.update('skillsPalette.installedVersion', version);
}

function offerReload() {
  vscode.window.showInformationMessage(
    'Skills Palette button injected into the Claude Code panel. Reload the window to show it.',
    'Reload Window', 'Restart Extension Host',
  ).then((choice) => {
    if (choice === 'Reload Window') vscode.commands.executeCommand('workbench.action.reloadWindow');
    else if (choice === 'Restart Extension Host') vscode.commands.executeCommand('workbench.action.restartExtensionHost');
  });
}

/**
 * Resolve which project folder a link action targets.
 * Priority: a valid `?ws=` that matches an open folder → that folder; else the
 * single open folder; else prompt among multiple; else null (no project open).
 * Each VS Code window registers its OWN UriHandler, and VS Code delivers a vscode:
 * URI to the FOCUSED window — the one whose Claude panel the user clicked — so this
 * window's own workspace is already the correct fallback.
 */
async function resolveTargetFolder(wsPath) {
  const folders = vscode.workspace.workspaceFolders || [];
  if (wsPath) {
    const want = path.resolve(wsPath).replace(/[\\/]+$/, '').toLowerCase();
    const hit = folders.find((f) => path.resolve(f.uri.fsPath).replace(/[\\/]+$/, '').toLowerCase() === want);
    if (hit) return { fsPath: hit.uri.fsPath, name: hit.name };
    // ws given but not an open folder in THIS window — still honour the path itself.
    return { fsPath: wsPath, name: path.basename(wsPath) };
  }
  if (folders.length === 0) return null;
  if (folders.length === 1) return { fsPath: folders[0].uri.fsPath, name: folders[0].name };
  const picked = await vscode.window.showWorkspaceFolderPick({ placeHolder: 'Link the skill into which folder?' });
  return picked ? { fsPath: picked.uri.fsPath, name: picked.name } : null;
}

function open(context, wsPath) {
  return openPalette(vscode, {
    output: output.get(vscode),
    getTargetFolder: () => resolveTargetFolder(wsPath),
  });
}

function activate(context) {
  // Register the launch paths FIRST, before anything that can throw (e.g. reading the
  // webview script off disk). onUri can activate this extension via the footer
  // button's deep link, so the UriHandler must exist even if injection later fails.
  output.get(vscode);
  statusBar.create(vscode, context);

  context.subscriptions.push(
    vscode.commands.registerCommand('skillsPalette.open', () => open(context, null)),
    vscode.commands.registerCommand('skillsPalette.checkAndInject', () => {
      const r = checkAndInject(context, { interactive: true });
      if (r.changed > 0) offerReload();
      else vscode.window.showInformationMessage(`Skills Palette: nothing to update (${r.targets} target(s) already current).`);
    }),
    vscode.commands.registerCommand('skillsPalette.removeInjection', () => {
      const n = removeInjection();
      vscode.window.showInformationMessage(`Skills Palette: removed injection from ${n} target(s). Reload to apply.`);
    }),
  );

  // The footer button's vscode: deep link arrives here:
  //   vscode://orbenozio.skills-palette/open?ws=<encoded path>
  context.subscriptions.push(
    vscode.window.registerUriHandler({
      handleUri(uri) {
        const cmd = (uri.path || '').replace(/^\/+/, '').replace(/\/+$/, '');
        if (cmd !== 'open') return;
        let wsPath = null;
        try {
          const params = new URLSearchParams(uri.query || '');
          wsPath = params.get('ws');
        } catch (_) { /* ignore */ }
        open(context, wsPath);
      },
    }),
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('skillsPalette.autoInject')) {
        try { checkAndInject(context, { interactive: false }); } catch (err) { console.error('[SkillsPalette]', err); }
      }
      if (e.affectsConfiguration('skillsPalette.reinjectCheckHours')) {
        scheduleReinject(context);
      }
    }),
  );

  // Injection is best-effort — a failure here must never break the launch paths above.
  try {
    handleVersionUpgrade(context);
    const r = checkAndInject(context, { interactive: false });
    if (r.changed > 0) offerReload();
    scheduleReinject(context);
    registerFocusReinject(context);
  } catch (err) {
    console.error('[SkillsPalette] injection setup failed:', err);
    statusBar.reflect({ changed: 0, targets: 0 });
  }
}

function deactivate() {
  if (reinjectTimer) clearInterval(reinjectTimer);
}

module.exports = { activate, deactivate, resolveTargetFolder };
