# Skills Palette

כפתור בפוטר של פאנל Claude Code שפותח פלטה של הסקילים שלך מה-Skills Hub המרכזי, מקובצים לפי קטגוריות, עם חיבור סקיל לפרויקט הנוכחי בלחיצה אחת — באמצעות directory junction (אותו מנגנון של `/link-skill`).

האיפיון המלא: [../SPEC.md](../SPEC.md).

## איך זה עובד

הפאנל של Claude הוא webview ב-sandbox שאי אפשר להריץ בו תהליכים. לכן:

- התוסף **מזריק** סקריפט קטן ל-`webview/index.js` של Claude שמצייר כפתור בתוך הסרגל המשותף `#orb-tools` (לצד agentville ו-NONSTOP, עם markers ייחודיים כדי לא לדרוך אחד על השני).
- לחיצה על הכפתור יורה deep link `vscode://orbenozio.skills-palette/open?ws=<path>` אל ה-`UriHandler` של התוסף.
- ה-`UriHandler` פותח `QuickPick` עם כל הסקילים; `Enter` על פריט מחבר/מנתק את הסקיל לפרויקט; כפתורי הפריט מאפשרים חיבור גלובלי ופתיחת ה-SKILL.md.
- אם ה-deep link חסום — יש פריט status-bar ו-command `Skills Palette: Open` שעושים בדיוק אותו דבר.

## התקנה (dev)

```powershell
Copy-Item -Recurse .\skills-palette "$env:USERPROFILE\.vscode\extensions\orbenozio.skills-palette-0.1.0"
```

ואז: `Developer: Reload Window`. בהפעלה הראשונה התוסף יזריק את הכפתור ויציע לטעון מחדש את חלון Claude כדי שהכפתור יופיע. אין build step ואין תלויות runtime — VSCode + Node בלבד.

## קטגוריות (אופציונלי)

ברירת המחדל מציגה את כל הסקילים תחת "Uncategorized". כדי לקבץ לפי קטגוריות, העתק את [skills-categories.example.json](skills-categories.example.json) אל ה-hub בשם `skills-categories.json`:

```
C:\Users\orben\OneDrive\DEV\Agents\SkillsHub\skills-categories.json
```

סקיל שלא מופיע במניפסט נופל ל-"Uncategorized" (כך שסקיל hub חדש מופיע מיד, בלי לעדכן את המניפסט). מזהה שאין לו תיקייה — מתעלמים ממנו.

## בדיקות

```powershell
npm test
```

- `test/injector.test.js` — coexistence משולש (NONSTOP + agentville + skills-palette) + idempotency + in-place.
- `test/hubReader.test.js` — גזירת title/summary על כל הסקילים האמיתיים + מיזוג קטגוריות.
- `test/linker.test.js` — יצירה/זיהוי/הסרה של junction מול junctions אמיתיים, כולל יעד תחת OneDrive וה-guard הרקורסיבי.

## פקודות

| פקודה | מה היא עושה |
| --- | --- |
| `Skills Palette: Open` | פותח את הפלטה (fallback מובטח ל-deep link) |
| `Skills Palette: Add button to Claude panel (inject)` | מזריק/מרענן את הכפתור ידנית |
| `Skills Palette: Remove button from Claude panel` | מסיר רק את הבלוק שלנו מ-`webview/index.js` |
