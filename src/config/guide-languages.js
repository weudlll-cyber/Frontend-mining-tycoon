/**
File: src/config/guide-languages.js
Purpose: Single list of the languages the "How to play" guide is available in.
Role in system: vite.config.js builds one page per entry; src/how-to-play.test.js
  checks that every page exists, has the same sections as the English page and
  shows a language switch that lists exactly these languages.
Invariants: English (`how-to-play.html`) is the default page and stays first.
  To add a language, copy how-to-play.html to `how-to-play.<code>.html`,
  translate it, add an entry here and add the link to the language switch of
  every guide page (see README "How to play").
*/

export const GUIDE_LANGUAGES = [
  { code: 'en', label: 'English', file: 'how-to-play.html' },
  { code: 'de', label: 'Deutsch', file: 'how-to-play.de.html' },
];
