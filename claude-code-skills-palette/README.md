# Skills Palette

כפתור בפוטר של פאנל Claude Code שפותח פלטה ויזואלית של הסקילים שלך מה-Skills Hub המרכזי, מקובצים לפי קטגוריות, ומחבר כל סקיל לפרויקט הנוכחי (או גלובלית) בלחיצה אחת - באמצעות directory junction (אותו מנגנון של `/link-skill`).

האיפיון המלא: [../SPEC.md](../SPEC.md).

## מה זה נותן לך

ה-Skills Hub הוא תיקייה מרכזית אחת שבה כל הסקילים שלך יושבים. הפלטה היא חלון ניהול שמראה את כולם, ומאפשר "להדליק" סקיל לפרויקט שאתה עובד עליו בלי להעתיק קבצים ידנית. החיבור הוא junction, אז עריכה של הסקיל ב-hub משתקפת מיד בכל מקום שהוא מקושר אליו.

לוחצים על כפתור התקע בפוטר של פאנל Claude, ונפתח חלון הפלטה.

## מה רואים בפלטה

- **שני טאבים למעלה:**
  - **Hub** - כל הסקילים שקיימים ב-hub, בלי קשר לאן הם מקושרים. זה המקום לגלות סקיל ולחבר אותו.
  - **This project** - רק מה שמקושר לפרויקט הפתוח כרגע, מחולק לשני קטעים:
    - **Local** - סקילים שמקושרים לפרויקט הזה בלבד.
    - **Global** - סקילים שמקושרים גלובלית, כלומר פעילים בכל פרויקט אוטומטית.

    סקיל שמקושר גם מקומית וגם גלובלית מופיע רק תחת Global (הגלובלי גובר, כי הוא ממילא זמין בכל מקום). הטאב הזה מושבת כל עוד לא פתוח פרויקט.

- **סרגל קטגוריות בצד** - "All Skills", "Uncategorized", הוספת קטגוריה חדשה, ואז הקטגוריות שלך (אפשר להצמיד לראש, לשנות שם, ולמחוק). הספירות מתעדכנות לפי הטאב הפעיל.

- **חיפוש** - סינון מיידי לפי שם הסקיל, הכותרת או התקציר.

- **תצוגת Grid / List** - מתג להחלפת פריסת הכרטיסים; הבחירה נשמרת בין פתיחות.

- **כרטיס לכל סקיל** - כותרת, תקציר, תגיות מצב (linked / global / broken), בורר קטגוריה, וכפתורי פעולה:
  - **Link to project / Unlink from project** - חיבור או ניתוק לפרויקט הנוכחי.
  - **Link globally / Unlink global** - חיבור או ניתוק גלובלי (לכל הפרויקטים).
  - **Preview** - תצוגת ה-SKILL.md (Markdown מרונדר) בתוך הפאנל, עם סרגל חזרה דביק.

## התקנה (תמיד הגרסה האחרונה)

הורד את ה-VSIX האחרון מהקישור הקבוע:

https://github.com/orbenozio/claude-code-skills-palette/releases/latest/download/claude-code-skills-palette.vsix

ואז ב-VSCode: **Extensions -> ... -> Install from VSIX...** -> בחר את הקובץ -> Reload. (התקנת VSIX לא מתעדכנת אוטומטית - שדרוג = הורדה והתקנה מחדש.)

## איך זה עובד

הפאנל של Claude הוא webview ב-sandbox שאי אפשר להריץ בו תהליכים. לכן:

- התוסף **מזריק** סקריפט קטן ל-`webview/index.js` של Claude שמצייר כפתור בתוך הסרגל המשותף `#orb-tools` (לצד agentville ו-NONSTOP, עם markers ייחודיים כדי לא לדרוך אחד על השני).
- לחיצה על הכפתור יורה deep link `vscode://orbenozio.claude-code-skills-palette/open?ws=<path>` אל ה-`UriHandler` של התוסף.
- ה-`UriHandler` פותח את **פאנל הפלטה** (webview נפרד שהתוסף שולט בו) עם כל הסקילים, הטאבים, החיפוש והפעולות שתוארו למעלה. החיבור עצמו נעשה ב-host דרך directory junction.
- הכפתור הוא toggle ונשאר דלוק כל עוד הפלטה פתוחה.
- אם ה-deep link חסום - יש פריט status-bar ו-command `Skills Palette: Open` שעושים בדיוק אותו דבר. יש גם גרסת QuickPick קלה (`Skills Palette: Open (QuickPick)`) לעבודה מהמקלדת.

## קטגוריות (אופציונלי)

ברירת המחדל מציגה את כל הסקילים תחת "Uncategorized". כדי לקבץ לפי קטגוריות, העתק את [skills-categories.example.json](skills-categories.example.json) אל ה-hub בשם `skills-categories.json`:

```
C:\Users\orben\OneDrive\DEV\Agents\SkillsHub\skills-categories.json
```

אפשר גם לנהל קטגוריות ישירות מהפלטה (הוספה, שינוי שם, מחיקה, הצמדה, ושיוך סקיל לקטגוריה מתוך הכרטיס) - הפלטה כותבת את אותו `skills-categories.json`. סקיל שלא מופיע במניפסט נופל ל-"Uncategorized" (כך שסקיל hub חדש מופיע מיד, בלי לעדכן את המניפסט). מזהה שאין לו תיקייה - מתעלמים ממנו.

## התקנה (dev)

```powershell
Copy-Item -Recurse .\claude-code-skills-palette "$env:USERPROFILE\.vscode\extensions\orbenozio.claude-code-skills-palette-0.2.0"
```

ואז: `Developer: Reload Window`. בהפעלה הראשונה התוסף יזריק את הכפתור ויציע לטעון מחדש את חלון Claude כדי שהכפתור יופיע. אין build step ואין תלויות runtime - VSCode + Node בלבד.

## בדיקות

```powershell
npm test
```

- `test/injector.test.js` - coexistence משולש (NONSTOP + agentville + claude-code-skills-palette) + idempotency + in-place.
- `test/hubReader.test.js` - גזירת title/summary על כל הסקילים האמיתיים + מיזוג קטגוריות.
- `test/linker.test.js` - יצירה/זיהוי/הסרה של junction מול junctions אמיתיים, כולל יעד תחת OneDrive וה-guard הרקורסיבי.
- `test/categoriesManifest.test.js` - קריאה/כתיבה של מניפסט הקטגוריות (הוספה, שינוי שם, מחיקה, הצמדה, שיוך).
- `test/webviewPalette.test.js` - רינדור ה-HTML של הפאנל, אבטחת ה-Markdown preview, והטאבים Hub / This project.

## פקודות

| פקודה | מה היא עושה |
| --- | --- |
| `Skills Palette: Open` | פותח את הפלטה (fallback מובטח ל-deep link) |
| `Skills Palette: Open (QuickPick)` | גרסת QuickPick קלה, מהמקלדת |
| `Skills Palette: Add button to Claude panel (inject)` | מזריק/מרענן את הכפתור ידנית |
| `Skills Palette: Remove button from Claude panel` | מסיר רק את הבלוק שלנו מ-`webview/index.js` |
