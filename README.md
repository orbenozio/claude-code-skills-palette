# Skills Palette

תוסף VSCode שמוסיף כפתור לפוטר של פאנל Claude Code, ופותח פלטה ויזואלית לניהול הסקילים שלך מה-Skills Hub המרכזי - גילוי, קיבוץ לפי קטגוריות, וחיבור כל סקיל לפרויקט הנוכחי (או גלובלית) בלחיצה אחת. החיבור נעשה דרך directory junction, אז עריכה של הסקיל ב-hub משתקפת מיד בכל מקום שהוא מקושר אליו.

## התקנה

הורד את ה-VSIX האחרון מהקישור הקבוע:

https://github.com/orbenozio/claude-code-skills-palette/releases/latest/download/claude-code-skills-palette.vsix

ואז ב-VSCode: **Extensions -> ... -> Install from VSIX...** -> בחר את הקובץ -> Reload Window. (התקנת VSIX לא מתעדכנת אוטומטית - שדרוג = הורדה והתקנה מחדש.)

## מה זה נותן

לוחצים על כפתור התקע בפוטר של פאנל Claude, ונפתח חלון הפלטה. בפלטה:

- **שני טאבים:**
  - **Hub** - כל הסקילים שקיימים ב-hub. המקום לגלות סקיל ולחבר אותו.
  - **This project** - רק מה שמקושר לפרויקט הפתוח, מחולק ל-**Local** (מקושר לפרויקט הזה בלבד) ו-**Global** (מקושר גלובלית, פעיל בכל פרויקט). סקיל שמקושר בשתי הדרכים מופיע רק תחת Global. הטאב מושבת כל עוד לא פתוח פרויקט.
- **סרגל קטגוריות** עם חיפוש, הצמדה, שינוי שם ומחיקה - והספירות מתעדכנות לפי הטאב הפעיל.
- **תצוגת Grid / List**, ו-**Preview** של ה-SKILL.md (Markdown מרונדר) בתוך הפאנל.
- **חיבור / ניתוק** סקיל לפרויקט או גלובלית, ישירות מהכרטיס.

## איך זה עובד

הפאנל של Claude הוא webview ב-sandbox. התוסף מזריק סקריפט קטן ל-`webview/index.js` של Claude שמצייר את הכפתור בסרגל המשותף `#orb-tools` (חי בשלום לצד agentville ו-NONSTOP). לחיצה יורה deep link אל ה-`UriHandler` של התוסף, שפותח את פאנל הפלטה. אם ה-deep link חסום - יש פריט status-bar ו-command `Skills Palette: Open` כ-fallback מובטח. אין build step ואין תלויות runtime.

## תיעוד

- [תיעוד מלא של התוסף](claude-code-skills-palette/README.md) - כל הפעולות, הפקודות, הקטגוריות, וההתקנה ל-dev.
- [SPEC.md](SPEC.md) - האיפיון המלא.
- [CHANGELOG](claude-code-skills-palette/CHANGELOG.md) - היסטוריית הגרסאות.

## רישיון

[MIT](claude-code-skills-palette/LICENSE).
