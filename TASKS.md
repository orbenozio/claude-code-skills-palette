# TASKS

מסמך מעקב משימות חי. סמן `[x]` כשמשימה הושלמה; הוסף משימות חדשות מתחת תוך כדי עבודה.

הפרויקט: **Skills Palette** — כפתור בפאנל Claude Code שפותח פלטת סקילים (Webview) מה-Skills Hub לפי קטגוריות, עם חיבור-בלחיצה לפרויקט, תצוגת README, והקצאת קטגוריות. ראו [SPEC.md](SPEC.md).

## Todo

### אימות runtime (הקוד מוכן; דורש `Developer: Restart Extension Host` + עין אנושית)
- [ ] הכפתור מופיע ב-`#orb-tools` בפוטר של Claude אחרי restart
- [ ] לחיצה על הכפתור → ה-Webview נפתח כ-tab (deep link מגיע ל-host)
- [ ] sidebar קטגוריות מסנן; חיפוש עובד; חיבור סקיל מכרטיס → junction אמיתי נוצר תחת `.claude\skills`
- [ ] preview של README נפתח בלחיצה על סקיל; שורת Back דביקה; חלונית "קטגוריה חדשה" בתוך הפאנל
- [ ] הקצאת קטגוריה מכרטיס → נכתב ל-`SkillsHub\skills-categories.json` והסקיל עובר קטגוריה
- [ ] סקיל גלובלי → "Link to project" מושבת; ✓/unlink; בחירת workspace כשפתוחות כמה תיקיות
- [ ] coexistence עם agentville בעין — שני הכפתורים יחד, בלי reload-loop (NONSTOP אומת חי; agentville רק ב-unit test)
- [ ] fallback: `Skills Palette: Open (QuickPick)` + פריט status-bar

### Phase 5 — ליטוש והפצה
- [x] `icon.png` לתוסף + שדה `icon` ב-package.json (אייקון תקע)
- [x] אריזת VSIX + GitHub Release ציבורי (`orbenozio/skills-palette`, tag `v0.1.0`) עם asset בשם קבוע `skills-palette.vsix` — קישור always-latest פעיל
- [ ] `FileSystemWatcher` על ה-hub לרענון Webview פתוח כשמשתנים סקילים/manifest
- [ ] להחליט על labels סופיים לקטגוריות / האם להציב manifest התחלתי ב-hub
- [ ] (אופציונלי) `defaultScope: global` במניפסט לסקילים מערכתיים (שאלה פתוחה ב-SPEC §11)

> שדרוג עתידי: bump גרסה → `vsce package` → `gh release create vX.Y.Z` → **חובה להעלות מחדש את `skills-palette.vsix` בשם הקבוע** (`gh release upload ... --clobber`) אחרת ה-latest-link נשבר. (סקיל `release-vsix-github`.)

### חוב טכני / בדיקות
- [ ] unit test ל-`resolveTargetFolder` (לוגיקת `?ws=` / focused-window) עם mock ל-vscode
- [ ] (אופציונלי) smoke test ל-`paletteUI` (QuickPick fallback)

## In progress
- (ריק — ממתין לאימות runtime למעלה)

## Done

### איפיון וסקירה
- [x] setup_project — קישור ל-hub, git, TASKS.md
- [x] קריאת הסקילים הקיימים (claude-panel-button, link-skill)
- [x] איפיון (SPEC.md) — draft ע"י architect + סקירת spec-reviewer/architect + הטמעת 3 הכרעות ותיקונים

### Phase 0 — אימות הנחות מסוכנות
- [x] **0a** — `linker.js` + זיהוי junction מנורמל (`\\?\`, resolve, case-insensitive); נבדק מול junctions אמיתיים כולל יעד OneDrive + guard רקורסיבי
- [x] **0b** — `UriHandler` עם `?ws=` + `resolveTargetFolder` (focused-window fallback)

### Phase 1 — MVP (קוד) + התקנה חיה
- [x] port תת-מערכת ההזרקה (constants/injector/atomicWrite/targets) עם markers `.skills-palette` ייחודיים
- [x] `webview/skills-palette.js` — כפתור SVG ב-`#orb-tools` + deep link + workspace discovery
- [x] `hubReader` async — scan + frontmatter + title/summary
- [x] `extension.js` + `statusBar` + `output` (OutputChannel) + commands
- [x] dry-run + התקנה חיה ל-`~\.vscode\extensions\orbenozio.skills-palette-0.1.0` + הזרקה (NONSTOP נשמר, backup נוצר) — `18fd144`

### Phase 2–4 — קוד מומש
- [x] Phase 2: `hubReader` טוען manifest + grouping לפי קטגוריה
- [x] Phase 3: חישוב `linkedToProject` + ✓ + toggle unlink + בחירת workspace folder
- [x] Phase 4: חיבור/ניתוק גלובלי

### Webview palette (pivot מ-feedback — QuickPick לא מאפשר סינון-לפי-קטגוריה אינטראקטיבי)
- [x] `webviewPalette.js` — WebviewPanel: sidebar קטגוריות לחיץ, חיפוש, כרטיסים בצבעי theme — `a47b4fa`
- [x] message bridge webview↔host + push state; CSP+nonce; user-text דרך textContent
- [x] extension מנתב ל-Webview; QuickPick נשאר כ-`skillsPalette.openQuickPick`
- [x] תצוגת README מרונדרת **בתוך** ה-Webview (Markdown→HTML בטוח) — לא פותח קובץ — `5b93982`
- [x] הקצאת קטגוריה מכרטיס (`<select>`) שכותבת ל-`skills-categories.json` (`categoriesManifest.js`, כתיבה אטומית)
- [x] מודעות global↔project: "Link to project" מושבת לסקיל גלובלי + badge "global · active here"
- [x] שורת Back דביקה (sticky) ב-preview + חלונית "קטגוריה חדשה" בתוך ה-Webview (במקום InputBox) — `12155ec`

### QuickPick (MVP מקורי, נשמר כ-fallback)
- [x] `paletteUI` — QuickPick + separators + כפתורי link/global/open + refresh in-place
- [x] כפתור `$(plug)` מפורש לפרויקט (`3d17cf9`) + פריטים בשורה אחת עם אייקוני-מצב (`2207cfa`)

### בדיקות
- [x] 126 assertions עוברים: injector (fixture משולש), hubReader (על 7 הסקילים + overrides), linker (junctions אמיתיים), categoriesManifest, webviewPalette (render + parse של הסקריפט המוטמע)
