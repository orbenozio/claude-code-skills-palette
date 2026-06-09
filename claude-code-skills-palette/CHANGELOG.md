# Changelog

## 0.3.0
- Configurable Skills Hub folder: set it from inside the palette via a new gear (settings) button in the header - Browse to a folder or paste a path. No more editing settings.json by hand.
- New `claudeCodeSkillsPalette.hubPath` setting (supports a leading `~` and `${env:VAR}`); leave it empty to use the default `~/.claude/SkillsHub`.
- Neutral default hub derived from your home folder, so the extension works for any user out of the box (no machine-specific path baked in).
- Actionable empty state: when no hub is set or it is empty, the palette shows a clear prompt with a 'Set hub folder...' button instead of a blank list.

## 0.2.0
- Two top-level view tabs in the palette: 'Hub' (the whole hub, as before) and 'This project' (only what is linked here).
- The project view splits its skills into a 'Local' section (linked to this project only) and a 'Global' section (linked globally, active in every project); a skill linked both ways shows only under Global.
- The 'This project' tab is disabled until a project folder is open, and falls back to 'Hub' if the project closes.
- Category counts and the 'All Skills' total are scoped to the active tab.

## 0.1.0
- Inject a "plug" button into the Claude Code panel (#orb-tools toolbar) that toggles a Skills Palette and stays lit while it is open.
- Webview palette: clickable category sidebar, text search, theme-coloured skill cards.
- In-panel README preview (rendered Markdown) for any skill, with a sticky Back bar.
- One-click link / unlink of a skill into the current project (or globally) via a Windows directory junction; project link is disabled for skills that are already global.
- Assign categories from a card; writes a central `skills-categories.json` manifest in the hub.
- QuickPick fallback command, status-bar entry, and a guaranteed deep-link path.
