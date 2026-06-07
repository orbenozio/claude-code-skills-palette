# TASKS

מסמך מעקב משימות חי. סמן `[x]` כשמשימה הושלמה; הוסף משימות חדשות מתחת תוך כדי עבודה.

הפרויקט: **Skills Palette** — כפתור בפאנל Claude Code שפותח פלטת סקילים מה-Skills Hub לפי קטגוריות, עם חיבור-בלחיצה לפרויקט. ראו [SPEC.md](SPEC.md) למפת הדרכים המלאה (Phase 0–5).

## Todo

### Phase 1 — אימות runtime (דורש reload + עין אנושית; הקוד מוכן)
- [ ] `Developer: Restart Extension Host` → הכפתור מופיע ב-`#orb-tools` בפוטר של Claude
- [ ] לחיצה על הכפתור → **ה-Webview** נפתח כ-tab (deep link מגיע ל-host)
- [ ] סינון לפי קטגוריה ב-sidebar + חיפוש; חיבור סקיל מכרטיס → junction אמיתי נוצר
- [ ] coexistence עם agentville בעין — שני הכפתורים חיים יחד, בלי reload-loop (NONSTOP כבר אומת חי; agentville אומת ב-unit test בלבד)
- [ ] אימות ה-fallback: `Skills Palette: Open (QuickPick)` + פריט status-bar

### Phase 2 — קטגוריות (קוד מומש; דורש הפעלה ואימות)
- [ ] להחליט על labels סופיים לקטגוריות (שאלה פתוחה ב-SPEC §11) — כרגע דוגמה ב-[skills-palette/skills-categories.example.json](skills-palette/skills-categories.example.json)
- [ ] להציב `skills-categories.json` בפועל ב-`SkillsHub\` (נוגע ב-hub — דורש אישור)
- [ ] לאמת בעין ש-sidebar הקטגוריות מסנן נכון; לא-ממופים תחת "Uncategorized"

### Webview palette (pivot מ-feedback — QuickPick לא מאפשר סינון-לפי-קטגוריה אינטראקטיבי)
- [x] `webviewPalette.js` — WebviewPanel: sidebar קטגוריות לחיץ, חיפוש, כרטיסים בצבעי theme
- [x] message bridge webview↔host (toggleProject/toggleGlobal/open) + push state אחרי כל פעולה
- [x] CSP עם nonce + רינדור user-text דרך textContent (בלי innerHTML); נבדק ב-`webviewPalette.test.js`
- [x] extension מנתב את הכפתור ל-Webview; QuickPick נשאר כ-`skillsPalette.openQuickPick`
- [ ] (Phase 5) `FileSystemWatcher` כדי לרענן את ה-Webview הפתוח כשמשתנים סקילים/manifest

### Phase 3 — מצב "מחובר" + unlink (קוד מומש; דורש אימות)
- [ ] לאמת ✓ על סקיל מחובר + toggle ל-unlink (מסיר רק את ה-junction)
- [ ] לאמת בחירת workspace folder כשפתוחות כמה תיקיות
- [ ] לאמת זיהוי junction "broken" → הצעת re-link

### Phase 4 — חיבור גלובלי (קוד מומש; דורש אימות)
- [ ] לאמת כפתור globe לכל פריט → junction ב-`~/.claude/skills` + סימון `$(globe)` נפרד מהפרויקט

### Phase 5 — ליטוש והפצה
- [ ] `FileSystemWatcher` על ה-hub לרענון פלטה פתוחה כשמשתנים סקילים/manifest
- [ ] כיבוד אופציונלי של `summary:` / `category:` מ-frontmatter כשקיימים (עדיפות על המניפסט)
- [ ] `icon.png` לתוסף + החזרת שדה `icon` ל-package.json
- [ ] אריזת VSIX + GitHub Release (סקיל `release-vsix-github`) עם asset בשם יציב ל-install-link
- [ ] (אופציונלי) שדה `defaultScope: global` במניפסט לסקילים מערכתיים (שאלה פתוחה ב-SPEC §11)

### חוב טכני / בדיקות
- [ ] unit test ל-`resolveTargetFolder` (לוגיקת `?ws=` / focused-window) עם mock ל-vscode
- [ ] (אופציונלי) smoke test ל-`paletteUI` מעל QuickPick מדומה

## In progress
- (ריק — ממתין לאימות runtime של Phase 1)

## Done

### איפיון וסקירה
- [x] setup_project — קישור ל-hub, git, TASKS.md
- [x] קריאת הסקילים הקיימים (claude-panel-button, link-skill)
- [x] איפיון (SPEC.md) — draft ע"י architect
- [x] סבב סקירה — spec-reviewer + architect (REVIEW)
- [x] הטמעת 3 ההכרעות + תיקוני סקירה ב-SPEC.md

### Phase 0 — אימות הנחות מסוכנות
- [x] **0a** — `linker.js` + זיהוי junction מנורמל (`\\?\`, resolve, case-insensitive); נבדק מול junctions אמיתיים כולל יעד OneDrive + guard רקורסיבי (15 assertions ✅)
- [x] **0b** — `UriHandler` עם `?ws=` + `resolveTargetFolder` (focused-window fallback)

### Phase 1 — MVP (קוד)
- [x] port תת-מערכת ההזרקה (constants/injector/atomicWrite/targets) עם markers `.skills-palette` ייחודיים
- [x] `webview/skills-palette.js` — כפתור SVG ב-`#orb-tools` + deep link + workspace discovery
- [x] `hubReader` async — scan + frontmatter + title/summary (59 assertions ✅ על 7 הסקילים)
- [x] `paletteUI` — QuickPick + separators + item buttons + refresh in-place
- [x] `extension.js` + `statusBar` + `output` (OutputChannel) + 3 commands
- [x] `injector.test.js` fixture משולש (21 assertions ✅) — NONSTOP+agentville+skills-palette שורדים
- [x] dry-run הזרקה מול Claude webview/index.js האמיתי: valid + reinject-noop + NONSTOP נשמר
- [x] התקנה ל-`~\.vscode\extensions\orbenozio.skills-palette-0.1.0` + הזרקה לקובץ החי (בלוק valid, NONSTOP נשמר, backup נוצר)
- [x] commit על master (`18fd144`)

### Phase 2–4 — קוד מומש (ממתין לאימות runtime למעלה)
- [x] Phase 2: `hubReader` טוען manifest + `paletteUI` בונה separators לקטגוריות
- [x] Phase 3: חישוב `linkedToProject` + ✓ + toggle unlink + בחירת workspace folder
- [x] Phase 4: כפתור globe לכל פריט → חיבור/ניתוק גלובלי

### שיפורי UX (מ-feedback)
- [x] כפתור-פריט מפורש "link to project" (`$(plug)`) ליד ה-globe — קישור-לפרויקט גלוי, לא רק דרך Enter (`3d17cf9`)
- [x] פריטים בשורה אחת (כותרת + תקציר עמום) עם אייקוני-מצב במקום מילים — פחות מלל, רשימה סריקה (`2207cfa`)
