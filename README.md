# Skills Palette

A VSCode extension that adds a button to the Claude Code panel footer and opens a visual palette for managing the skills in your central Skills Hub - discover them, group them by category, and link any skill into the current project (or globally) with one click. Linking uses a directory junction, so editing a skill in the hub is reflected immediately everywhere it is linked.

## Install

Download the latest VSIX from the permanent link:

https://github.com/orbenozio/claude-code-skills-palette/releases/latest/download/claude-code-skills-palette.vsix

Then in VSCode: **Extensions -> ... -> Install from VSIX...** -> pick the file -> Reload Window. (A VSIX install does not auto-update - upgrading means downloading and installing again.)

## What you get

Click the plug button in the Claude panel footer and the palette opens. Inside:

- **Two tabs:**
  - **Hub** - every skill in the hub. The place to discover a skill and link it.
  - **This project** - only what is linked to the open project, split into **Local** (linked to this project only) and **Global** (linked globally, active in every project). A skill linked both ways shows only under Global. The tab is disabled while no project is open.
- **A category sidebar** with search, pinning, rename and delete - counts are scoped to the active tab.
- **Grid / List layouts**, with each skill shown as a consistent three-row card: name + badges, a one-line description, then its controls.
- **Link / unlink** a skill to the project or globally, **preview** its SKILL.md, or **open its folder** in your file manager to edit it - all straight from the card.

## How it works

Claude's panel is a sandboxed webview. The extension injects a small script into Claude's `webview/index.js` that draws the button in the shared `#orb-tools` toolbar (coexisting with agentville and NONSTOP). Clicking it fires a deep link to the extension's `UriHandler`, which opens the palette panel. If the deep link is blocked, a status-bar item and the `Skills Palette: Open` command are a guaranteed fallback. There is no build step and no runtime dependencies.

## Documentation

- [Full extension docs](claude-code-skills-palette/README.md) - all actions, commands, categories, and the dev install.
- [SPEC.md](SPEC.md) - the full specification.
- [CHANGELOG](claude-code-skills-palette/CHANGELOG.md) - version history.

## License

[MIT](claude-code-skills-palette/LICENSE).
