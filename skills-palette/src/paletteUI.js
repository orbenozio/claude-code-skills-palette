'use strict';

/**
 * The Skills Palette QuickPick. Native QuickPick (not a Webview): fuzzy search,
 * category separators, per-item buttons, and in-place refresh after link/unlink.
 *
 * UX (decided in spec §2): `accept` (Enter / click) TOGGLES the project link
 * (link if absent, unlink if present). Item buttons are the secondary actions:
 *   • globe  → toggle a GLOBAL link (%USERPROFILE%\.claude\skills)
 *   • open   → open the skill's SKILL.md in an editor
 */

const os = require('os');
const path = require('path');

const hubReader = require('./hubReader');
const linker = require('./linker');

function projectSkillsDir(folderFsPath) {
  return path.join(folderFsPath, '.claude', 'skills');
}
function globalSkillsDir() {
  return path.join(os.homedir(), '.claude', 'skills');
}

/**
 * @param {object} vscode
 * @param {object} deps  { output, getTargetFolder, hubRoot? }
 *   output          — OutputChannel-like { appendLine }
 *   getTargetFolder — async () => ({ fsPath, name }) | null   (the project to link into)
 */
async function openPalette(vscode, deps) {
  const output = deps.output || { appendLine() {} };
  const targetFolder = await deps.getTargetFolder();

  const qp = vscode.window.createQuickPick();
  qp.title = 'Skills Palette' + (targetFolder ? ` — ${targetFolder.name}` : ' — (no project open)');
  qp.placeholder = targetFolder
    ? 'Search · $(plug) link to project · $(globe) link globally · $(go-to-file) open · (Enter also links to project)'
    : 'Open a project folder to link skills · $(go-to-file) opens a skill';
  qp.matchOnDescription = true;
  qp.matchOnDetail = true;
  qp.busy = true;
  qp.show();

  // Primary action (leftmost) — link/unlink to THIS project. Mirrors `accept`, but
  // visible as a button so it's discoverable (the global link had a button; the
  // project link — the common case — must be at least as obvious).
  const linkBtn = { iconPath: new vscode.ThemeIcon('plug'), tooltip: 'Link / unlink to THIS project' };
  const globeBtn = { iconPath: new vscode.ThemeIcon('globe'), tooltip: 'Link / unlink GLOBALLY (~/.claude/skills)' };
  const openBtn = { iconPath: new vscode.ThemeIcon('go-to-file'), tooltip: 'Open SKILL.md' };

  let skills = [];
  let categoryOrder = [];

  async function load() {
    const res = await hubReader.scan(deps.hubRoot ? { hubRoot: deps.hubRoot } : {});
    skills = res.skills;
    categoryOrder = res.categoryOrder;
    for (const w of res.warnings) output.appendLine(`[scan] ${w}`);
  }

  function statusFor(skill) {
    const proj = targetFolder
      ? linker.linkStatus(path.join(projectSkillsDir(targetFolder.fsPath), skill.name), skill.hubPath)
      : 'absent';
    const glob = linker.linkStatus(path.join(globalSkillsDir(), skill.name), skill.hubPath);
    return { proj, glob };
  }

  function buildItems() {
    const Sep = vscode.QuickPickItemKind.Separator;
    const groups = new Map();
    for (const s of skills) {
      if (!groups.has(s.category)) groups.set(s.category, []);
      groups.get(s.category).push(s);
    }
    // Stable category order: manifest order (already computed), then any stragglers.
    const order = categoryOrder.length ? categoryOrder.slice() : [...groups.keys()];
    for (const c of groups.keys()) if (!order.includes(c)) order.push(c);

    const items = [];
    const multiCat = order.filter((c) => groups.has(c)).length > 1;
    for (const cat of order) {
      const group = groups.get(cat);
      if (!group) continue;
      if (multiCat) items.push({ label: cat, kind: Sep });
      for (const s of group) {
        const { proj, glob } = statusFor(s);
        const linked = proj === 'linked';
        const broken = proj === 'broken';
        // Compact, single-line item: state shown by leading icons (not words), the
        // summary as the dimmed same-line description. Keeps a long list scannable.
        let icons = '';
        if (linked) icons += '$(check) ';
        else if (broken) icons += '$(warning) ';
        if (glob === 'linked') icons += '$(globe) ';
        items.push({
          label: icons + s.title,
          description: s.summary,
          buttons: [linkBtn, globeBtn, openBtn],
          skill: s,
          _proj: proj,
          _glob: glob,
        });
      }
    }
    return items;
  }

  async function refresh(preserveActiveName) {
    qp.busy = true;
    const items = buildItems();
    qp.items = items;
    if (preserveActiveName) {
      const again = items.find((i) => i.skill && i.skill.name === preserveActiveName);
      if (again) qp.activeItems = [again];
    }
    qp.busy = false;
  }

  function toggleProject(skill) {
    if (!targetFolder) {
      vscode.window.showWarningMessage('Skills Palette: open a project folder first to link a skill.');
      return;
    }
    const dir = projectSkillsDir(targetFolder.fsPath);
    try {
      const st = linker.linkStatus(path.join(dir, skill.name), skill.hubPath);
      if (st === 'linked') {
        linker.unlink(skill.name, skill.hubPath, dir);
        vscode.window.showInformationMessage(`Unlinked "${skill.name}" from ${targetFolder.name}.`);
      } else {
        const r = linker.link(skill.name, skill.hubPath, dir);
        vscode.window.showInformationMessage(
          `${r === 'relinked' ? 'Re-linked' : 'Linked'} "${skill.name}" → ${targetFolder.name}\\.claude\\skills.`,
        );
      }
    } catch (e) {
      output.appendLine(`[link] ${skill.name}: ${e.code || ''} ${e.message}`);
      vscode.window.showErrorMessage(`Skills Palette: ${e.message}`);
    }
  }

  function toggleGlobal(skill) {
    const dir = globalSkillsDir();
    try {
      const st = linker.linkStatus(path.join(dir, skill.name), skill.hubPath);
      if (st === 'linked') {
        linker.unlink(skill.name, skill.hubPath, dir);
        vscode.window.showInformationMessage(`Unlinked "${skill.name}" globally.`);
      } else {
        linker.link(skill.name, skill.hubPath, dir);
        vscode.window.showInformationMessage(`Linked "${skill.name}" globally (~/.claude/skills).`);
      }
    } catch (e) {
      output.appendLine(`[global] ${skill.name}: ${e.code || ''} ${e.message}`);
      vscode.window.showErrorMessage(`Skills Palette: ${e.message}`);
    }
  }

  async function openSkillMd(skill) {
    const uri = vscode.Uri.file(path.join(skill.hubPath, 'SKILL.md'));
    try {
      const doc = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(doc, { preview: true });
      qp.hide();
    } catch (e) {
      vscode.window.showErrorMessage(`Cannot open SKILL.md: ${e.message}`);
    }
  }

  qp.onDidAccept(() => {
    const item = qp.activeItems[0];
    if (!item || !item.skill) return;
    toggleProject(item.skill);
    refresh(item.skill.name); // stay open, reflect new state
  });

  qp.onDidTriggerItemButton((e) => {
    const skill = e.item && e.item.skill;
    if (!skill) return;
    if (e.button === openBtn) { openSkillMd(skill); return; }
    if (e.button === linkBtn) { toggleProject(skill); refresh(skill.name); return; }
    if (e.button === globeBtn) { toggleGlobal(skill); refresh(skill.name); }
  });

  qp.onDidHide(() => qp.dispose());

  await load();
  await refresh();
}

module.exports = { openPalette, projectSkillsDir, globalSkillsDir };
