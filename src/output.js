'use strict';

let channel;

/** Lazily create the single 'Skills Palette' OutputChannel for warnings/errors. */
function get(vscode) {
  if (!channel) channel = vscode.window.createOutputChannel('Skills Palette');
  return channel;
}

module.exports = { get };
