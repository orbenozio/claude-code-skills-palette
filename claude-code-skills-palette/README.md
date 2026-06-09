# Skills Palette

A button in the Claude Code panel footer that opens a visual palette of your skills from the central Skills Hub, grouped by category, and links any skill into the current project (or globally) with one click - via a directory junction (the same mechanism as `/link-skill`).

Full specification: [../SPEC.md](../SPEC.md).

## What this is for

The Skills Hub is one central folder where all your skills live. The palette is a management window that shows them all and lets you "turn on" a skill for the project you are working on, without copying files by hand. The link is a junction, so editing the skill in the hub is reflected immediately everywhere it is linked.

Click the plug button in the Claude panel footer and the palette window opens.

## What you see in the palette

- **Two tabs at the top:**
  - **Hub** - every skill that exists in the hub, regardless of where it is linked. This is the place to discover a skill and link it.
  - **This project** - only what is linked to the currently open project, split into two sections:
    - **Local** - skills linked to this project only.
    - **Global** - skills linked globally, i.e. active in every project automatically.

    A skill linked both locally and globally shows only under Global (Global wins, since it is available everywhere anyway). This tab is disabled while no project is open.

- **A category sidebar** - "All Skills", "Uncategorized", add a new category, and then your categories (which you can pin to the top, rename, and delete). Counts update according to the active tab.

- **Search** - instant filtering by skill name, title, or summary.

- **Grid / List layout** - a toggle to switch the card layout; the choice is remembered between opens.

- **A card per skill** - title, summary, status badges (linked / global / broken), a category selector, and action buttons:
  - **Link to project / Unlink from project** - link or unlink for the current project.
  - **Link globally / Unlink global** - link or unlink globally (for all projects).
  - **Preview** - render the SKILL.md (Markdown) inside the panel, with a sticky back bar.

## Install (always the latest)

Download the latest VSIX from the permanent link:

https://github.com/orbenozio/claude-code-skills-palette/releases/latest/download/claude-code-skills-palette.vsix

Then in VSCode: **Extensions -> ... -> Install from VSIX...** -> pick the file -> Reload. (A VSIX install does not auto-update - upgrading means downloading and installing again.)

## How it works

Claude's panel is a sandboxed webview where you cannot spawn processes. So:

- The extension **injects** a small script into Claude's `webview/index.js` that draws a button inside the shared `#orb-tools` toolbar (alongside agentville and NONSTOP, with unique markers so they do not step on each other).
- Clicking the button fires a deep link `vscode://orbenozio.claude-code-skills-palette/open?ws=<path>` to the extension's `UriHandler`.
- The `UriHandler` opens the **palette panel** (a separate webview the extension controls) with all the skills, tabs, search, and actions described above. The link itself is created on the host via a directory junction.
- The button is a toggle and stays lit while the palette is open.
- If the deep link is blocked, a status-bar item and the `Skills Palette: Open` command do exactly the same thing. There is also a light QuickPick variant (`Skills Palette: Open (QuickPick)`) for keyboard-driven use.

## Categories (optional)

By default all skills show under "Uncategorized". To group them by category, copy [skills-categories.example.json](skills-categories.example.json) into the hub as `skills-categories.json`:

```
C:\Users\orben\OneDrive\DEV\Agents\SkillsHub\skills-categories.json
```

You can also manage categories directly from the palette (add, rename, delete, pin, and assign a skill to a category from its card) - the palette writes the same `skills-categories.json`. A skill not present in the manifest falls back to "Uncategorized" (so a new hub skill shows up immediately, without updating the manifest). An entry with no folder is ignored.

## Tests

```powershell
npm test
```

- `test/injector.test.js` - triple coexistence (NONSTOP + agentville + claude-code-skills-palette) + idempotency + in-place.
- `test/hubReader.test.js` - title/summary derivation across all real skills + category merge.
- `test/linker.test.js` - create/detect/remove a junction against real junctions, including a target under OneDrive and the recursive guard.
- `test/categoriesManifest.test.js` - read/write of the categories manifest (add, rename, delete, pin, assign).
- `test/webviewPalette.test.js` - rendering the panel HTML, Markdown-preview security, and the Hub / This project tabs.

## Commands

| Command | What it does |
| --- | --- |
| `Skills Palette: Open` | Opens the palette (guaranteed fallback for the deep link) |
| `Skills Palette: Open (QuickPick)` | A light, keyboard-driven QuickPick variant |
| `Skills Palette: Add button to Claude panel (inject)` | Injects/refreshes the button manually |
| `Skills Palette: Remove button from Claude panel` | Removes only our block from `webview/index.js` |
