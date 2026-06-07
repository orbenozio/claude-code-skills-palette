# Changelog

## 0.1.0
- Inject a "plug" button into the Claude Code panel (#orb-tools toolbar) that toggles a Skills Palette and stays lit while it is open.
- Webview palette: clickable category sidebar, text search, theme-coloured skill cards.
- In-panel README preview (rendered Markdown) for any skill, with a sticky Back bar.
- One-click link / unlink of a skill into the current project (or globally) via a Windows directory junction; project link is disabled for skills that are already global.
- Assign categories from a card; writes a central `skills-categories.json` manifest in the hub.
- QuickPick fallback command, status-bar entry, and a guaranteed deep-link path.
