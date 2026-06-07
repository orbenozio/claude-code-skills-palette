# TASKS

מסמך מעקב משימות חי. סמן `[x]` כשמשימה הושלמה; הוסף משימות חדשות מתחת תוך כדי עבודה.

הפרויקט: **Skills Palette** — כפתור בפאנל Claude Code שפותח פלטת סקילים מה-Skills Hub לפי קטגוריות, עם חיבור-בלחיצה לפרויקט. ראו [SPEC.md](SPEC.md).

## Todo

### Phase 1 — נותר לאימות ידני (דורש VSCode חי)
- [ ] runtime: התקנה ל-`~\.vscode\extensions`, reload, אימות שהכפתור מופיע ב-#orb-tools
- [ ] runtime coexistence: skills-palette + agentville מותקנים יחד — אין reload-loop, שני הכפתורים חיים אחרי reload יחיד
- [ ] runtime: לחיצה על הכפתור → פלטה נפתחת, חיבור סקיל יוצר junction בפועל

### Phase 2+ (קוד קיים חלקית — לאימות/הרחבה)
- [x] Phase 2: קטגוריות — `hubReader` טוען manifest + `paletteUI` separators (מומש; דורש `skills-categories.json` ב-hub כדי להפעיל)
- [x] Phase 3: מצב "מחובר" ✓ + unlink (toggle) + בחירת workspace folder (מומש ב-paletteUI/extension)
- [x] Phase 4: חיבור גלובלי (כפתור globe לכל פריט → `~/.claude/skills`)
- [ ] Phase 5: ליטוש — FileSystemWatcher, icon.png, אריזת VSIX + GitHub Release

## In progress

## Done
- [x] setup_project — קישור ל-hub, git, TASKS.md
- [x] קריאת הסקילים הקיימים (claude-panel-button, link-skill)
- [x] איפיון (SPEC.md) — draft ע"י architect
- [x] סבב סקירה — spec-reviewer + architect (REVIEW)
- [x] הטמעת הכרעות + תיקוני סקירה ב-SPEC.md
- [x] **Phase 0a** — `linker.js` + זיהוי junction מנורמל; נבדק מול junctions אמיתיים כולל יעד OneDrive (15 assertions ✅)
- [x] **Phase 0b** — `UriHandler` עם `?ws=` + resolveTargetFolder (focused-window fallback)
- [x] port תת-מערכת ההזרקה (constants/injector/atomicWrite/targets) עם markers `.skills-palette`
- [x] `webview/skills-palette.js` — כפתור SVG ב-#orb-tools + deep link + workspace discovery
- [x] `hubReader` async — scan + frontmatter + title/summary (59 assertions ✅ על 7 הסקילים)
- [x] `paletteUI` — QuickPick + separators + item buttons + refresh in-place
- [x] `extension.js` + `statusBar` + `output` (OutputChannel) + commands
- [x] `injector.test.js` fixture משולש (21 assertions ✅) — NONSTOP+agentville+skills-palette שורדים
- [x] dry-run הזרקה מול Claude webview/index.js האמיתי: valid + reinject-noop + NONSTOP נשמר (לא נכתב כלום)
