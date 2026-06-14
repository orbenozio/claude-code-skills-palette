'use strict';

let statusBarItem;

/**
 * A status-bar entry that opens the Skills Palette. This is the GUARANTEED launch
 * path (the footer button inside Claude's panel is the nicer UX, but its vscode:
 * deep link can be blocked depending on the VS Code build). The tooltip reflects
 * host-side injection status.
 */
function create(vscode, context) {
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'claudeCodeSkillsPalette.open';
  // Show the running extension version next to the label (e.g. "Skills v0.4.0").
  const version = context.extension && context.extension.packageJSON && context.extension.packageJSON.version;
  statusBarItem.text = version ? `$(checklist) Skills v${version}` : '$(checklist) Skills';
  statusBarItem.tooltip = 'Open Skills Palette — link a hub skill to this project';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);
  return statusBarItem;
}

/** Reflect the result of a checkAndInject pass in the tooltip. */
function reflect(r) {
  if (!statusBarItem) return;
  if (!r || r.targets === 0) {
    statusBarItem.tooltip = 'Open Skills Palette — note: no Claude Code panel found to add the footer button to.';
  } else if (r.changed > 0) {
    statusBarItem.tooltip = 'Open Skills Palette — footer button injected; reload the Claude window to show it.';
  } else {
    statusBarItem.tooltip = 'Open Skills Palette (footer button active in the Claude panel).';
  }
}

module.exports = { create, reflect };
