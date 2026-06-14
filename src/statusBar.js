'use strict';

let statusBarItem;
let vscodeRef;
let localVersion = '';
let remoteVersion = '';      // newest version seen from GitHub (empty until checked)
let injectionTip = 'link a hub skill to this project'; // detail appended to the tooltip

/**
 * A status-bar entry that opens the Skills Palette (and exposes "Check for updates").
 * This is the GUARANTEED launch path (the footer button inside Claude's panel is the
 * nicer UX, but its vscode: deep link can be blocked depending on the VS Code build).
 *
 * The label shows the running version (e.g. "Skills v0.4.1"); when a newer GitHub
 * release exists it becomes "Skills v0.4.1 → v0.4.2" on a warning background. Clicking
 * the item opens a small menu (open palette / check for updates) - see the
 * `claudeCodeSkillsPalette.menu` command.
 */
function create(vscode, context) {
  vscodeRef = vscode;
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'claudeCodeSkillsPalette.menu';
  localVersion = (context.extension && context.extension.packageJSON && context.extension.packageJSON.version) || '';
  render();
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);
  return statusBarItem;
}

function render() {
  if (!statusBarItem) return;
  const ver = localVersion ? ` v${localVersion}` : '';
  const hasUpdate = remoteVersion && remoteVersion !== localVersion;
  if (hasUpdate) {
    statusBarItem.text = `$(cloud-download) Skills${ver} → v${remoteVersion}`;
    statusBarItem.tooltip = `Skills Palette: update available (v${remoteVersion}) — click for options.`;
    statusBarItem.backgroundColor = vscodeRef ? new vscodeRef.ThemeColor('statusBarItem.warningBackground') : undefined;
  } else {
    statusBarItem.text = `$(checklist) Skills${ver}`;
    statusBarItem.tooltip = `Open Skills Palette — ${injectionTip}`;
    statusBarItem.backgroundColor = undefined;
  }
}

/** Reflect the result of a checkAndInject pass in the tooltip detail. */
function reflect(r) {
  if (!statusBarItem) return;
  if (!r || r.targets === 0) {
    injectionTip = 'note: no Claude Code panel found to add the footer button to';
  } else if (r.changed > 0) {
    injectionTip = 'footer button injected; reload the Claude window to show it';
  } else {
    injectionTip = 'footer button active in the Claude panel';
  }
  render();
}

/** Reflect an update check: badge the item when a newer release exists. */
function reflectUpdate(remote) {
  remoteVersion = remote || '';
  render();
}

module.exports = { create, reflect, reflectUpdate };
