# Skills Palette — איפיון טכני

כפתור בפוטר של פאנל Claude Code שפותח פלטת סקילים חכמה מתוך ה-Skills Hub המרכזי, מאורגנת לפי קטגוריות, עם חיבור סקיל לפרויקט הנוכחי בלחיצה אחת.

המסמך כתוב בעברית; שמות קבצים, מזהים, נתיבים וקטעי קוד נשארים באנגלית.

***

## 0. הכרעות שהתקבלו (אחרי סבב סקירה)

לאחר draft + סקירת `spec-reviewer` ו-`architect` (REVIEW), המשתמש הכריע:

1. **טופולוגיית התוסף: תוסף נפרד חדש** (`skills-palette`) לצד `agentville-launcher` הקיים — לא איחוד. מחיר: שני תוספים מזריקים לאותו `webview/index.js`, ולכן נדרש fixture-coexistence משולש + קריטריון runtime (סעיפים 10-R7, 12-Phase 1).
2. **מקור קטגוריות: manifest JSON אחד ב-hub** (`SkillsHub\skills-categories.json`) — סעיף 6.
3. **multi-window: להטמיע את ה-workspace ב-deep-link** — ה-URI נושא `?ws=<path>`, וה-`UriHandler` מחבר לפרויקט שממנו נלחץ הכפתור, לא ל-window שרירותי (סעיפים 2-Flow A, 3.2, 9).

הכרעות נוספות שנגזרו מהסקירה (היו "שאלות פתוחות", נסגרו): פעולת `accept` על פריט = toggle link/unlink לפי state (סעיף 2-Flow C); יצירת junction דרך `fs.symlinkSync(target, path, 'junction')` ב-Node ולא spawn של `cmd /c mklink` (סעיף 4); `publisher: OrBenozio` / `name: skills-palette`.

***

## 1. מטרות ולא-מטרות (Goals & Non-Goals)

### מטרות

* להוסיף כפתור יחיד לפוטר של פאנל Claude Code, שדוק בתוך הסרגל המשותף `#orb-tools`, לצד כפתור ה-globe של agentville ולצד NONSTOP.
* בלחיצה על הכפתור — לפתוח פלטה (palette) של כל הסקילים מתוך `C:\Users\orben\OneDrive\DEV\Agents\SkillsHub`, מאורגנים לפי קטגוריות.
* בכל פריט בפלטה — לחבר את הסקיל לפרויקט הנוכחי בלחיצה אחת, באמצעות יצירת directory junction (אותו מנגנון של `/link-skill`).
* להראות אילו סקילים כבר מחוברים לפרויקט הנוכחי (state), ולאפשר unlink.
* להציג לכל סקיל כותרת נקייה ותקציר קצר — לא את ה-trigger dump הגולמי מתוך `description`.
* לדור בכפיפה אחת עם כלים אחרים שמוזרקים לאותו `webview/index.js` (קונבנציית `#orb-tools` + markers ייחודיים).
* הפצה כ-VSIX דרך GitHub Releases (לא דרך ה-Marketplace), בהתאם לסקילים הקיימים `release-vsix-github` ו-`ship-vscode-extension`.

### לא-מטרות (מפורשות)

* אין יצירה/עריכה/מחיקה של סקילים מתוך הפלטה. הפלטה היא read + link בלבד; ניהול תוכן הסקילים נשאר ידני / דרך סוכן.
* אין סנכרון ענן, אין שיתוף בין משתמשים, אין מנגנון הרשאות מרובה-משתמשים. כלי אישי, single-user, Windows.
* אין תמיכה ב-symlinks (`/D`) — רק junctions (`/J`), שאינם דורשים admin (ראו סעיף 8).
* אין build step בזמן ריצה ואין תלויות runtime; VSCode + Node API טהורים (כמו ה-reference). esbuild קיים רק כ-devDependency לאריזה, לא חובה ל-MVP.
* ה-MVP אינו עורך קבצי hub. ההחלטה על מקור הקטגוריות (סעיף 6) נבחרה כך שלא לגעת בקבצי ה-hub.

***

## 2. זרימות משתמש עיקריות (Primary User Flows)

### Flow A — פתיחת הפלטה וחיבור סקיל (הזרימה המרכזית)

1. המשתמש לוחץ על כפתור ה-Skills בפוטר של פאנל Claude.
2. הסקריפט המוזרק יורה synthesized anchor click ל-`vscode://orbenozio.skills-palette/open?ws=<encoded workspace path>` (ראו 3.2 על אופן גילוי ה-workspace ב-webview ועל ה-fallback).
3. ה-`UriHandler` של ה-extension נקרא, מזהה את ה-workspace מתוך ה-`?ws=` (ובהיעדרו — ה-folder של ה-window הממוקד), סורק את ה-hub ופותח `QuickPick`.
4. ה-QuickPick מציג את הסקילים מקובצים לפי קטגוריות (separators), כל פריט עם כותרת + תקציר + סימון מצב (מחובר / לא מחובר לפרויקט הנוכחי).
5. המשתמש בוחר סקיל לא-מחובר → ה-extension יוצר junction תחת `<workspace>\.claude\skills\<skill>` ומציג הודעת הצלחה.
6. הפלטה נשארת פתוחה לחיבורים נוספים (`accept` מבצע toggle ומרענן in-place; ראו Flow C). `canSelectMany` נפסל כי הוא שובר את ה-item buttons.

### Flow B — fallback מובטח (status bar + command)

* אם ה-deep link נחסם (תלוי build של VSCode), המשתמש לוחץ על פריט ה-status-bar `$(list-unordered) Skills` או מריץ את ה-command `skillsPalette.open` מתוך ה-Command Palette. אותה פעולה בדיוק נפתחת.

### Flow C — סקיל כבר מחובר

* פריט מחובר מוצג עם סימן ✓ ועם תקציר "מחובר לפרויקט".
* **הכרעת UX (סגרה שאלה פתוחה):** `accept` (Enter / קליק על הפריט) = **toggle** — מחבר אם לא-מחובר, מנתק אם מחובר. ה-item buttons הם הפעולות המשניות (`Link globally`, `Open SKILL.md`). זה מונע את הסתירה בין "accept→unlink" ל-item-buttons.
* `unlink` מסיר רק את ה-junction של אותו סקיל (`fs.rmdirSync` על ה-link; junction removal הוא הסרת reparse-point בלבד — אומת ב-Phase 0 שאינו נכנס למחוק תוכן ב-hub), לעולם לא תוכן ב-hub.

### Flow D — חיבור גלובלי (--global)

* פעולה משנית (Phase 4): חיבור הסקיל ל-`%USERPROFILE%\.claude\skills` במקום לפרויקט. נחשף כ-action כפתור בתוך פריט ה-QuickPick, או כ-toggle בכותרת הפלטה.

***

## 3. ארכיטקטורה

### 3.1 רכיבים (component diagram, טקסטואלי)

```
┌─────────────────────────────────────────────────────────────────────┐
│  Claude Code panel (sandboxed webview — NOT ours)                    │
│                                                                     │
│   #orb-tools  ──┬── [🌍 agentville-btn]   (קיים)                    │
│                 └── [Skills SVG-btn]      ← מוזרק ע"י הכלי הזה       │
│                         │ click                                      │
│                         ▼                                            │
│   synthesized <a> click → vscode://orbenozio.skills-palette/open?ws=<path> │
└─────────────────────────┼───────────────────────────────────────────┘
                          │ (env.openExternal)
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Extension host (Node, our extension "skills-palette")               │
│                                                                     │
│   registerUriHandler ──► open palette                               │
│   statusBar item + command skillsPalette.open ──► open palette (fallback) │
│                                                                     │
│   ┌──────────────┐   ┌───────────────┐   ┌────────────────────┐    │
│   │ hubReader     │   │ paletteUI      │   │ linker             │    │
│   │ scan SkillsHub│──►│ QuickPick      │──►│ junction create /  │    │
│   │ parse YAML    │   │ categories +   │   │ remove (mklink /J, │    │
│   │ derive title  │   │ linked-state   │   │ rmdir), state read │    │
│   └──────────────┘   └───────────────┘   └────────────────────┘    │
│                                                                     │
│   Injection subsystem (ported מ-agentville verbatim):               │
│   constants.js · injector.js · atomicWrite.js · targets/claude-code.js │
│   patches Claude's webview/index.js with OUR markers                │
└─────────────────────────────────────────────────────────────────────┘
                          │ mklink /J
                          ▼
   <project>\.claude\skills\<skill>  ──►  SkillsHub\<skill>   (junction)
```

### 3.2 צינור מלא (injection → deep-link → palette → junction)

1. **Injection** — ב-`activate`, ה-extension מאתר את ה-`webview/index.js` הפעיל של Claude (`resolveTargets`) ומזריק בלוק בין markers ייחודיים משלו. הבלוק מכיל את `webview/skills-palette.js` (ה-IIFE שמצייר את הכפתור).
2. **Deep-link + workspace** — לחיצה על הכפתור יורה `<a href="vscode://orbenozio.skills-palette/open?ws=<encoded>">.click()` (לא `window.open`, לא `location.href` — חסומים ב-sandbox).
   * **אופן גילוי ה-workspace ב-webview:** `webview/index.js` הוא קובץ **יחיד משותף לכל חלונות VSCode** של אותה התקנת Claude — אסור לתבנת לתוכו נתיב סטטי. לכן הסקריפט המוזרק מנסה לגלות את ה-workspace ב-**זמן הקליק** מתוך רמזי ה-DOM של פאנל Claude (למשל title/data-attribute הנושאים את שם/נתיב הפרויקט) ומקודד אותו ל-`?ws=`.
   * **fallback רב-שכבתי (חשוב — מבטיח נכונות גם בלי גילוי):** (א) אם הסקריפט גילה נתיב → `?ws=`; (ב) אחרת ה-URI נשלח בלי `ws`, וה-`UriHandler` נופל ל-workspace של ה-**window הממוקד** (כל חלון רושם UriHandler משלו עם ה-workspace שלו; VSCode מנתב את ה-`vscode://` ל-window הממוקד — וזה ה-window שבו נלחץ הכפתור). שני המסלולים מובילים לפרויקט הנכון; ה-`?ws=` הוא הקשחה מעל ה-routing-by-focus.
3. **Palette** — ה-`UriHandler` מחשב `targetFolder` (מ-`?ws=` אם תקין ושייך ל-workspace פתוח, אחרת ה-folder של החלון הממוקד) ומפעיל `openPalette(context, targetFolder)`: `hubReader` סורק את ה-hub (async, עם `busy=true` על ה-QuickPick — ראו 7), `linker` קורא את מצב החיבור מול `targetFolder`, `paletteUI` בונה QuickPick עם separators לפי קטגוריה.
4. **Junction** — בחירת פריט מפעילה את `linker.link(skill, targetFolder)` שיוצר junction דרך `fs.symlinkSync(hubPath, linkPath, 'junction')` (Node, ללא admin, ללא spawn — ראו 4) ומרענן את ה-state בפלטה.

### 3.3 גבולות (boundaries)

* **core טהור, host דק.** הלוגיקה (parse, derive title, group, link-state diff) ב-modules טהורים ללא תלות ב-`vscode` (כמו `injector.js` של ה-reference) — ניתנים ל-unit test. ה-`vscode`-specific (QuickPick, UriHandler, statusBar) דק ועוטף.
* **ה-webview לא יודע כלום על סקילים.** הסקריפט המוזרק יודע רק לצייר כפתור ולירות deep link. כל הידע על ה-hub חי ב-host. זה קריטי: ה-webview ב-sandbox ולא יכול לקרוא את הדיסק או להריץ תהליכים.
* **injection מבודד מ-palette.** כשל בהזרקה לא יפיל את ה-UriHandler/command (נרשמים ראשונים ב-`activate`, כמו ב-reference), כך שגם בלי הכפתור — ה-fallback עובד.

***

## 4. בחירות טכנולוגיה (Tech Choices)

| בחירה                  | החלטה                                                                                   | נימוק                                                                                                                    |
| ---------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| שפה / runtime          | JavaScript (CommonJS), VSCode + Node API טהורים                                         | תואם ל-reference; אין build step, אין תלויות runtime, התקנה = copy folder                                                |
| `engines.vscode`       | `^1.85.0`                                                                               | זהה ל-reference; `QuickPick` ו-`registerUriHandler` זמינים מזמן רב                                                       |
| UI הפלטה               | **`vscode.window.createQuickPick`** (לא Webview)                                        | ראו 4.1                                                                                                                  |
| parsing של frontmatter | קורא ידני קל-משקל (regex על בלוק `---`)                                                 | אין צורך בתלות `js-yaml`; ה-frontmatter כאן פשוט (שני שדות מחרוזת). שומר על "אפס תלויות". אם נדרש YAML עשיר — ניתן לשדרג |
| יצירת junction         | **`fs.symlinkSync(target, link, 'junction')`** (Node native); `mklink /J` כ-fallback מתועד בלבד | אין spawn של `cmd`, אין quoting/stderr-parsing תלוי-locale, error handling מובנה (`err.code`); סימטרי ל-detection שכבר ב-Node fs. `/J` לא דורש admin (סעיף 8). `/link-skill` משתמש ב-`mklink` רק כי הוא PowerShell ואין לו את ה-API — לתוסף ב-Node יש |
| הזרקה                  | port verbatim של `constants.js`/`injector.js`/`atomicWrite.js`/`targets/claude-code.js` | מנגנון מוכח, coexistence-safe, marker-scoped                                                                             |
| הפצה                   | VSIX → GitHub Releases                                                                  | סקילים `release-vsix-github` + `ship-vscode-extension` קיימים                                                            |
| icon                   | inline SVG עם `currentColor`                                                            | אמוג'י מרונדר אפור/לא-עקבי ב-webview (לקח מ-reference)                                                                   |

### 4.1 QuickPick מול Webview — ההכרעה

> **עדכון (אחרי בנייה + feedback):** ההכרעה נבחנה מחדש. ה-QuickPick מומש ראשון (MVP), אבל בפועל עם הרבה סקילים נדרש **סינון אינטראקטיבי לפי קטגוריה** (לחיצה על קטגוריה → רק היא) — דבר ש-QuickPick אינו תומך בו (separators רק מתייגים בתוך רשימה אחת). לכן נבנה **Webview** כפלטה הראשית (`webviewPalette.js`) עם sidebar קטגוריות לחיץ, חיפוש וכרטיסים בצבעי theme, וה-QuickPick נשמר כ-fallback (`skillsPalette.openQuickPick`). שאר השיקולים למטה תקפים כתיעוד ההיסטוריה של ההכרעה.

**הכרעה מקורית:** **`QuickPick`** **ל-MVP ולטווח הנראה לעין.** Webview רק אם דרישת UI עשירה תופיע בעתיד.

נימוקים בעד QuickPick:

* **native, מהיר, אפס boilerplate.** אין HTML/CSS/message-passing, אין CSP, אין shim. מתאים ל"אפס build step".
* **fuzzy search מובנה** על פני שם + description — בדיוק מה שצריך לרשימת סקילים.
* **separators (`QuickPickItemKind.Separator`)** נותנים כותרות קטגוריה מובנות, בלי לבנות grouping UI ידני.
* **item buttons** (`QuickPickItem.buttons`) מאפשרים פעולות-לפריט (link / unlink / global) בלי לעזוב את הרשימה — מכסה את Flow C/D באלגנטיות.
* **`keepScrollPosition`** **+** **`busy`** מאפשרים refresh של ה-state במקום אחרי link/unlink בלי לסגור את הפלטה.

מתי Webview היה מנצח (ולמה לא עכשיו): תצוגת README מלאה של סקיל, תמונות, drag-to-reorder, layout עשיר. כל אלה מחוץ ל-scope. Webview גורר CSP, nonce, message bridge, ו-state management — over-engineering למקרה הזה.

***

## 5. מודל נתונים (Data Model)

### 5.1 הצורה הגולמית ב-hub (קיים, לא לשנות)

כל `SkillsHub\<name>\SKILL.md`:

```YAML
---
name: add-idea
description: "Add, check off, or list ideas... Triggers on 'add an idea', ..., 'הוסף רעיון', ..."
---

# Add Idea
...
```

עובדות שאומתו על פני הסקילים בפועל:

* `name` = מזהה kebab-case, **זהה לשם התיקייה** (משמש כשם ה-junction).
* `description` = מחרוזת ארוכה: משפט/משפטי מהות, אחריו `Use ...` ו/או `Triggers on '...'` עם trigger phrases באנגלית ובעברית. **לא מתאים להצגה ישירה.**
* שורת ה-H1 הראשונה בגוף (`# Add Idea`) = כותרת אנושית נקייה.
* **אין כיום שדה** **`category`.**

### 5.2 המודל הפנימי (מה ש-`hubReader` מייצר)

```JavaScript
/**
 * @typedef {Object} SkillEntry
 * @property {string} name        // "add-idea" — מזהה ושם junction
 * @property {string} title       // "Add Idea" — מה-H1, fallback: Title-Case של name
 * @property {string} summary     // המשפט הראשון של description, חתוך לפני "Triggers on"/"Use "
 * @property {string} category    // ראו סעיף 6; ברירת מחדל "Uncategorized"
 * @property {string} hubPath     // C:\...\SkillsHub\add-idea
 * @property {boolean} linkedToProject   // junction קיים תחת <ws>\.claude\skills\<name>?
 * @property {boolean} linkedGlobal      // junction קיים תחת %USERPROFILE%\.claude\skills\<name>?
 */
```

### 5.3 גזירת כותרת ותקציר נקיים (Phase 1, deterministic)

* **title**: השורה הראשונה בגוף שמתחילה ב-`# `  ← הטקסט אחרי `# ` . אם אין — `name` ב-Title Case עם רווחים במקום מקפים.
* **summary**: מתוך `description`, קח את הטקסט עד הראשון מבין: `" Triggers on"` / `" Use "` (case-insensitive). חתוך ל-\~100 תווים על גבול-מילה והוסף `…`. **לא** להסתמך על "נקודה+אות גדולה" — שביר על עברית, `e.g.`/`i.e.`, ושמות-קבצים (`index.js`). דוגמאות בפועל: `add-idea` → `"Add, check off, or list ideas in the central ideas document"`; `linkedin-post` (המשפט הראשון ארוך, אין `Use`/`Triggers` מוקדם) → ייחתך ל-~100 תווים. **acceptance:** `hubReader.test.js` מריץ את הגזירה על כל 7 הסקילים הקיימים כ-fixture ומאמת פלט קריא (לא חתוך באמצע מילה, לא trigger-dump).
* אופציונלי (Phase 5, polish): אם המשתמש יוסיף שדה `summary:` ל-frontmatter, יקבל קדימות. לא נדרש ל-MVP.

***

## 6. מקור הקטגוריות — ההכרעה

הוערכו שלוש האפשרויות:

* **(a) שדה** **`category:`** **בכל SKILL.md** — נקי וקנוני, אבל דורש לגעת בכל קבצי ה-hub, ולכל סקיל חדש צריך לזכור להוסיף. נוגד את אי-המטרה "MVP לא עורך קבצי hub".
* **(b) manifest JSON נפרד ב-hub** — מרכזי, ניתן לעריכה במקום אחד, לא נוגע ב-SKILL.md, ניתן ל-version control. החיסרון: drift אפשרי בין ה-manifest לתיקיות בפועל.
* **(c) חיתוך/קיבוץ heuristic** מתוך שמות/תיאורים — אפס תחזוקה אבל שביר ולא צפוי; קטגוריות "מנחשות" יבלבלו.

### ההכרעה (היברידי, מדורג)

* **ל-MVP (Phase 1): קטגוריה אחת "All Skills"** — בלי קטגוריות אמיתיות בכלל. מוריד סיכון, מאמת את כל הצינור (button → deep-link → palette → junction) לפני שמשקיעים במטא-דאטה.

* **Phase 2 (קטגוריות): אפשרות (b) — manifest JSON אחד ב-hub** בנתיב:

  `C:\Users\orben\OneDrive\DEV\Agents\SkillsHub\skills-categories.json`

  ```JSON
  {
    "version": 1,
    "categories": [
      { "id": "content",  "label": "Content & Posts",     "skills": ["linkedin-post", "add-idea"] },
      { "id": "release",  "label": "Release & Shipping",  "skills": ["release-vsix-github", "ship-vscode-extension"] },
      { "id": "project",  "label": "Project Hygiene",     "skills": ["update-tasks", "start-diburit"] },
      { "id": "tooling",  "label": "Claude / VSCode Tooling", "skills": ["claude-panel-button"] }
    ]
  }
  ```

* **כללי שילוב**: סקיל שמופיע ב-manifest מקבל את הקטגוריה שלו; סקיל קיים שלא מופיע באף קטגוריה נופל ל-`Uncategorized` (כך שסקיל חדש ב-hub מופיע מיד גם בלי עדכון manifest — נמנע drift שקט). מזהה ב-manifest שאין לו תיקייה — מתעלמים ממנו (אזהרה ב-output channel).

**למה (b) ולא (a):** ריכוז העריכה במקום אחד, ללא נגיעה ב-N קבצי hub, ועקביות עם הגישה ש-`/link-skill` כבר מתייחס ל-hub כמקור-אמת מרכזי. אם בעתיד יוחלט לעבור ל-(a), `hubReader` יכול לתעדף `category:` מ-frontmatter כשהוא קיים ול-fallback ל-manifest — מעבר לא-שובר.

***

## 7. State, רענון, וזיהוי "מחובר"

* **קביעת** **`linkedToProject`** (Blocker שנסגר): לכל סקיל, בדוק אם `<workspaceFolder>\.claude\skills\<name>` קיים, `fs.lstatSync(p).isSymbolicLink()` true, ו-`fs.readlinkSync(p)` מצביע ל-`SkillsHub\<name>`. **השוואת הנתיב חייבת להיות מנורמלת** — לא השוואת מחרוזות נאיבית:
  * הסר prefix `\\?\` ש-`readlinkSync` עשוי להחזיר על junction ב-Windows.
  * `path.resolve` על שני הצדדים, השוואה **case-insensitive** (Windows).
  * זהירות מ-OneDrive Files-On-Demand: תיקיית סקיל online-only היא reparse-point מסוג placeholder — אמת ש-`isSymbolicLink()` עדיין מבחין נכון בין junction לבין placeholder.
  * אלגוריתם ההשוואה הזה הוא **קריטריון יציאה של Phase 0a** (לא "fallback אם בעייתי"). אם לא עקבי — fallback ל-`fsutil reparsepoint query`.
* **הגנה רקורסיבית מפני junction בנתיב-אב (Blocker שנסגר):** לפני `mkdirSync` של `.claude\skills`, בדוק `LinkType` לא רק על `.claude\skills` אלא גם על `.claude` עצמו ועל ה-workspace root. אם רכיב-אב כלשהו הוא junction (תרחיש של "כל `.claude` מקושר") — `mkdirSync` היה כותב **בתוך ה-target של ה-junction** (data-corruption שקט). במקרה כזה סרב והסבר.
* **בחירת workspace folder**: `targetFolder` מגיע מ-`?ws=`/window ממוקד (3.2); כשפתוחות כמה ואין הכרעה — ראו edge cases (סעיף 9). ה-state מחושב מול `targetFolder`.
* **רענון + OneDrive hydration (#6):** הסריקה (`scan` של N תיקיות + `skills-categories.json`) רצה **async** (`fs.promises`) עם `quickPick.busy = true`, כך שהפלטה נפתחת מיד ומתמלאת — קבצי hub שהם online-only ב-OneDrive עלולים לחסום על hydration, ו-sync read היה נראה כתקיעה. ה-state נקרא טרי בכל פתיחה (אין caching מתמשך). אחרי link/unlink, חשב מחדש state ועדכן `items`, שמור/שחזר `activeItems` (לא רק `keepScrollPosition` — החלפת מערך ה-`items` מאפסת active item).
* **שינויים ב-hub**: בלי caching, סקיל/קטגוריה חדשים נקלטים בפתיחה הבאה. אין צורך ב-`FileSystemWatcher` ל-MVP (אפשר ב-polish כדי לרענן פלטה פתוחה).

***

## 8. אבטחה והרשאות (junctions, sandbox)

* **junction לא דורש admin.** directory junctions (ו-hard links) אינם דורשים הרשאות מנהל; רק symbolic links (`/D`) דורשים admin או Developer Mode. `fs.symlinkSync(target, link, 'junction')` יוצר reparse-point מסוג junction — אותו דבר שמייצר `mklink /J` — ולכן עובד מ-session רגיל. (אומת — ראו מקורות בסוף.)
* **sandbox של ה-webview**: הסקריפט המוזרק לא יכול לקרוא דיסק/להריץ תהליכים. הערוץ היחיד החוצה הוא synthesized `<a>` click ל-`vscode://`. אין מעבר מידע רגיש דרכו — רק נתיב פקודה (`/open`). הפלטה והחיבור מתבצעים כולם ב-host.
* **patching של קובץ צד-שלישי**: אנו עורכים את `webview/index.js` של Claude. סיכון מתון, ממותן ע"י: markers ייחודיים, `atomicWrite` עם verify+retries, הסרה שמסירה רק את הבלוקים שלנו (לעולם לא blind-restore של backup), ובדיקה שבלוקים זרים (NONSTOP, agentville) שורדים (port של `injector.test.js`).
* **אין הדפסת secrets/tokens.** אין כאן tokens בכלל; הכל מקומי-דיסק.
* **כתיבה ל-`.claude\skills`**: יצירת התיקייה האמיתית אם חסרה; אם היא עצמה junction לכל ה-hub — סרב והסבר (אותו כלל של `/link-skill`).

***

## 9. מקרי קצה (Edge Cases)

| מקרה                                                | טיפול                                                                                                                                                                                    |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| אין workspace פתוח                                  | הפלטה נפתחת אבל פעולת link מושבתת; הודעה "פתח תיקיית פרויקט כדי לחבר". `--global` עדיין זמין.                                                                                            |
| כמה workspace folders פתוחים                        | `targetFolder` מ-`?ws=`. אם חסר ויש 1 — בחר אותו. אם >1 ואין הכרעה — `showWorkspaceFolderPick` לפני link. ה-state מחושב מול הנבחר.                                                       |
| כמה **חלונות** VSCode פתוחים                        | ה-`?ws=` ב-deep-link מעגן את הפרויקט; בהיעדרו, ה-window הממוקד (שבו נלחץ הכפתור) קולט את ה-`vscode://` ומשתמש ב-workspace שלו. ראו 3.2.                                                  |
| `.claude\skills` לא קיים                            | צור אותו כתיקייה אמיתית (`fs.mkdirSync(recursive)`) — **רק אחרי** בדיקת junction רקורסיבית (להלן).                                                                                       |
| `.claude\skills` הוא junction לכל ה-hub             | סרב; הצג אזהרה זהה ל-`/link-skill` ("הסר עם `cmd /c rmdir` וצור תיקייה אמיתית").                                                                                                         |
| **`.claude` עצמו (או workspace root) הוא junction** | סרב לפני `mkdirSync` — אחרת התיקייה תיווצר בתוך ה-target של ה-junction (data-corruption שקט). בדיקת `LinkType` רקורסיבית על רכיבי-האב (סעיף 7).                                          |
| הסקיל כבר מחובר                                     | פריט מסומן ✓; `accept` → unlink (toggle, סעיף 2-Flow C).                                                                                                                                |
| junction "תלוי" שמצביע ל-hub חסר/שונה               | זוהה כ-broken; הצע re-link (rmdir + יצירה מחדש).                                                                                                                                         |
| שם סקיל עם תווים מיוחדים/רווחים                     | שמות בפועל הם kebab-case; `fs.symlinkSync` מקבל נתיב כ-string, אין צורך ב-shell quoting.                                                                                                  |
| `SKILL.md` בלי frontmatter / `name` חסר             | דלג על הסקיל, רשום אזהרה ל-`OutputChannel('Skills Palette')`; אל תפיל את הסריקה.                                                                                                         |
| `skills-categories.json` חסר/לא תקין                | התעלם, הצג הכל תחת "All Skills"/"Uncategorized" (degrade gracefully); אזהרה ל-OutputChannel.                                                                                             |
| כתיבה ל-`webview/index.js` נכשלת (קובץ נעול / race) | `atomicWrite` עם retries; אם נכשל — log ל-OutputChannel, ה-fallback (status bar/command) עדיין עובד.                                                                                     |
| יצירת junction נכשלת (`EPERM`/`EEXIST`/אחר)        | תפוס `err.code`, הצג הודעת שגיאה ידידותית, אל תפיל את ה-extension.                                                                                                                        |
| Claude עדכן ומחק את ההזרקה                          | re-inject ב-focus (throttled) ו-version upgrade, כמו ב-reference.                                                                                                                        |
| ‏OneDrive — קבצי ה-hub ב-OneDrive                   | junction מצביע לנתיב מקומי `C:\Users\...\OneDrive\...`; עובד. שים לב ל-Files-On-Demand: אם תיקיית סקיל "online-only", החיבור עובד אך הקריאה עשויה להוריד קובץ. לא חוסם, אך לציין כסיכון. |

***

## 10. סיכונים (Risks)

* **R1 — deep link נחסם ב-build מסוים של VSCode/Cursor.** ממותן ע"י status-bar item + command כ-fallback מובטח (קונבנציה מ-reference, חובה).
* **R2 — drift בין** **`skills-categories.json`** **ל-hub.** ממותן ע"י fallback ל-`Uncategorized` לסקילים לא-ממופים, והתעלמות ממזהים מתים. סקיל חדש לעולם לא "נעלם".
* **R3 — שינוי במבנה הפוטר של Claude (class prefixes).** הסלקטורים הם `[class*="prefix_"]`, ולא class מלא; עדיין שביר אם Claude ישנה prefixes. ממותן: re-inject loop + status-bar fallback. אותו סיכון שכבר נושאים agentville/NONSTOP.
* **R4 — זיהוי junction ב-Node לא עקבי (prefix `\\?\`, OneDrive placeholders).** ממותן ע"י אלגוריתם ההשוואה המנורמל בסעיף 7, שהוא **קריטריון יציאה של Phase 0a** ולא fallback. אם עדיין בעייתי — `fsutil reparsepoint query`.
* **R5 — OneDrive Files-On-Demand** הופך תיקיית סקיל **או את `skills-categories.json`** ל-online-only; קריאה עלולה לחסום על hydration. ממותן ע"י סריקה async + `busy=true` (סעיף 7).
* **R6 — ריבוי כלים מוזרקים** מתחרים על `webview/index.js`. ממותן ע"י in-place replacement ו-markers ייחודיים; backup suffix ייחודי `.skills-palette-backup`.
* **R7 — coexistence בין שני התוספים *שלך* (agentville + skills-palette), תרחיש שלא קיים ב-test הנוכחי.** ה-`injector.test.js` של ה-reference מאמת רק ששורת NONSTOP שורדת. עכשיו יהיו שלושה בלוקים + שני re-inject loops עצמאיים (focus 30s + webview 1500ms). אם ה-no-op invariant נשבר (version drift / trailing-whitespace) — **שני התוספים יציעו "Reload Window" לנצח.** ממותן: (א) `injector.test.js` חדש עם fixture **משולש** (NONSTOP+agentville+skills-palette) + round-trip inject→strip→re-inject שמאמת שהבלוקים הזרים שורדים byte-for-byte; (ב) **קריטריון runtime ב-Phase 1**: שני התוספים מותקנים יחד, אין reload-loop, שני הכפתורים חיים אחרי reload יחיד. (חלופה שנדחתה לפי בחירת המשתמש: איחוד לתוסף אחד.)

***

## 11. שאלות פתוחות (Open Questions)

**נסגרו בסבב הסקירה:** (1) multi-select — נפסל `canSelectMany`, נבחר one-click עם פלטה פתוחה ו-item buttons. (2) accept = toggle link/unlink (Flow C). (3) טופולוגיה — תוסף נפרד. (4) קטגוריות — manifest JSON. (5) multi-window — `?ws=` ב-deep-link. (6) junction — `fs.symlinkSync`. (7) publisher/name — `OrBenozio`/`skills-palette`, authority `orbenozio.skills-palette`.

**נותרו פתוחות (לא חוסמות MVP):**

1. **labels של קטגוריות** — ה-IDs/labels שב-6 (Content / Release / Project Hygiene / Tooling) הם דוגמה. רשימה סופית נדרשת רק ב-Phase 2. (החלטת המשתמש.)
2. **`defaultScope: global` במניפסט?** סקילים "מערכתיים" (claude-panel-button) אולי תמיד גלובליים. שדה אופציונלי במניפסט; ב-`version: 1` של ה-schema כדאי לשריין מקום אך לא חובה ליישם לפני Phase 4.
3. **תצוגת README** — פתיחת ה-SKILL.md המלא מהפלטה (item button "Open SKILL.md") — נשאר QuickPick (פותח קובץ ב-editor), לא Webview. polish.

***

## 12. מפת דרכים מדורגת (Phased Roadmap)

כל phase מסתיים בקריטריון יציאה בר-בדיקה. Phase מוקדם אינו תלוי ברכיבי phase מאוחר.

### Phase 0 — אימות ההנחות המסוכנות (הזול ביותר, ללא הזרקה)

מפוצל לשתי בדיקות עצמאיות שאינן דורשות את כל תת-מערכת ההזרקה:

**Phase 0a — junction ב-Node (סקריפט טהור, בלי VSCode):**
* צור junction עם `fs.symlinkSync(target, link, 'junction')` תחת `.claude\skills` של פרויקט בדיקה; השווה מול `cmd /c mklink /J`.
* זהה אותו חזרה עם `lstatSync().isSymbolicLink()` + `readlinkSync` והאלגוריתם המנורמל (סעיף 7): normalize של `\\?\`, `path.resolve`, case-insensitive.
* אמת על שלושה תרחישים: (א) junction רגיל, (ב) junction לתיקייה תחת OneDrive, (ג) אותה תיקייה כשהיא online-only.
* אמת ש-`fs.rmdirSync(link)` מסיר רק את ה-link ולא תוכן ב-hub.

**קריטריון יציאה 0a:** האלגוריתם מזהה נכון junction מחובר/לא-מחובר/broken בכל שלושת התרחישים; unlink בטוח.

**Phase 0b — deep-link מגיע ל-host (בלי הזרקה):**
* extension שלד עם `UriHandler` בלבד שמראה `showInformationMessage('reached host: ws=' + ws)`.
* בדיקה ע"י הקלדת `vscode://orbenozio.skills-palette/open?ws=...` ב-Run dialog (לא צריך כפתור מוזרק).

**קריטריון יציאה 0b:** ה-URI (עם וללא `?ws=`) מגיע ל-handler ב-window הנכון; ה-`ws` נקרא נכון.

### Phase 1 — MVP: כפתור + QuickPick שטוח + חיבור בלחיצה (כל ההזרקה כאן)

* port של תת-מערכת ההזרקה מ-agentville עם markers/backup-suffix ייחודיים (`.skills-palette-backup`).
* `webview/skills-palette.js`: כפתור Skills (inline SVG, `currentColor`) ב-`#orb-tools`, deep link ל-`/open?ws=` עם גילוי workspace + fallback (סעיף 3.2).
* `hubReader`: סריקת `SkillsHub\*\SKILL.md` **async** (`fs.promises`, `busy=true`), parse frontmatter, גזירת title+summary (סעיף 5.3).
* `paletteUI`: QuickPick שטוח (קטגוריה אחת "All Skills"), fuzzy search.
* `linker.link`: junction דרך `fs.symlinkSync(...'junction')` ב-`<targetFolder>\.claude\skills`, כולל יצירת התיקייה, הכלל של junction-לכל-ה-hub, וההגנה הרקורסיבית על `.claude`/root (סעיף 7).
* `OutputChannel('Skills Palette')` + status-bar item + command `skillsPalette.open` (fallback).
* **`injector.test.js` עם fixture משולש** (NONSTOP + agentville + skills-palette) + round-trip inject→strip→re-inject.
* `hubReader.test.js`: גזירת title/summary על כל 7 הסקילים.

**קריטריון יציאה:** (1) מהפאנל — פתיחת פלטה, בחירת סקיל, junction תקין נוצר ב-`.claude\skills`; (2) **runtime coexistence**: agentville + skills-palette מותקנים יחד, **אין reload-loop**, שני הכפתורים חיים ב-`#orb-tools` אחרי reload יחיד; (3) ה-fallback עובד.

### Phase 2 — קטגוריות

* `skills-categories.json` ב-hub + טעינה ב-`hubReader`.
* QuickPick עם `QuickPickItemKind.Separator` לכל קטגוריה; לא-ממופים תחת "Uncategorized".

**קריטריון יציאה:** הסקילים מוצגים מקובצים תחת כותרות הקטגוריות מה-manifest; סקיל hub שלא ב-manifest מופיע תחת Uncategorized.

### Phase 3 — מצב "מחובר" + unlink

* חישוב `linkedToProject` והצגת ✓ + תקציר "מחובר".
* item button / choice ל-unlink (`cmd /c rmdir`), עם רענון state בפלטה הפתוחה.
* בחירת workspace folder כשפתוחות כמה.

**קריטריון יציאה:** סקילים מחוברים מסומנים; unlink מסיר רק את ה-junction של הסקיל; הפלטה מתעדכנת בלי להיסגר.

### Phase 4 — חיבור גלובלי (--global)

* item button "Link globally" → `%USERPROFILE%\.claude\skills`.
* חישוב והצגת `linkedGlobal` בנפרד מ-project.

**קריטריון יציאה:** חיבור/ניתוק גלובלי עובדים ומסומנים בנפרד מחיבור הפרויקט.

### Phase 5 — ליטוש (Polish)

* `FileSystemWatcher` על ה-hub לרענון פלטה פתוחה.
* re-link ל-junctions שבורים.
* כיבוד אופציונלי של `summary:`/`category:` מ-frontmatter כשקיימים.
* אריזת VSIX + GitHub Release (סקיל `release-vsix-github`), README (RTL נקי), icon.

**קריטריון יציאה:** VSIX משוחרר ב-GitHub Releases עם asset בשם יציב ל-install-link; README מתועד.

***

## 13. מבנה קבצים מוצע (ל-implementation, לא קוד)

```
skills-palette/
  package.json                 # publisher OrBenozio, name skills-palette, activationEvents onUri/onStartupFinished, commands, config
  icon.png
  src/
    extension.js               # activate: register UriHandler+command+statusBar FIRST, then inject
    constants.js               # markers ייחודיים + BACKUP_SUFFIX = ".skills-palette-backup"
    injector.js                # port verbatim
    atomicWrite.js             # port verbatim
    targets/claude-code.js     # port verbatim
    statusBar.js               # $(list-unordered) Skills → skillsPalette.open
    output.js                  # OutputChannel('Skills Palette') — warnings/errors
    hubReader.js               # async scan + parse + derive title/summary + load categories (core, no vscode)
    linker.js                  # link/unlink/isLinked (fs.symlinkSync 'junction', fs.rmdirSync, normalized detection) — core + thin vscode wrapper
    paletteUI.js               # QuickPick build + separators + item buttons + state refresh (busy, activeItems)
  webview/
    skills-palette.js          # IIFE: Skills SVG button ב-#orb-tools, deep link /open?ws= + workspace discovery
  test/
    injector.test.js           # triple fixture: NONSTOP + agentville + skills-palette survive round-trip
    hubReader.test.js          # derive title/summary over all 7 skills, category merge, missing-frontmatter
```

***

## נספח — קבצים שנקראו לביסוס האיפיון

* `C:\Users\orben\OneDrive\DEV\Agents\commands\link-skill.md` — מנגנון ה-junction (mklink /J), כלל "תיקייה אמיתית", וריאנט `--global`.
* `C:\Users\orben\OneDrive\DEV\Agents\SkillsHub\claude-panel-button\SKILL.md` — קונבנציית `#orb-tools`, ה-bridge ל-host, gotchas.
* `C:\Users\orben\OneDrive\DEV\Projects\claude-code-agentville\vscode-extension\src\extension.js` · `constants.js` · `injector.js` · `targets\claude-code.js` · `statusBar.js` · `webview\agentville.js` · `package.json` — ה-reference להזרקה, ל-UriHandler, ל-status-bar fallback.
* `SkillsHub\{add-idea,linkedin-post,release-vsix-github,update-tasks}\SKILL.md` — צורת ה-frontmatter בפועל (name + description ארוך, H1 כותרת נקייה).

מקורות חיצוניים (הרשאות junction + Node fs):

* [MKLink command — SS64](https://ss64.com/nt/mklink.html)
* [fs.symlinkSync(target, path, 'junction') — Node.js docs](https://nodejs.org/api/fs.html#fssymlinksynctarget-path-type)

