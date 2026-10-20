import { newId } from '../src/document.js';
import { cleanHtmlLesson, safeLessonJson } from './html-lesson-runtime.js';
import { HTML_LESSON_RUNTIME, HTML_LESSON_STYLE } from './html-lesson-bundle.js';

const escape = value => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export function createHtmlLesson({ id = newId('d'), title, pages, target, updatedAt = Date.now() }) {
  const lesson = cleanHtmlLesson({ version: 1, id, title, pages, target, updatedAt });
  // Every dependency is in this file; neither the source PPT nor assets are uploaded.
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'; object-src 'none'"><title>${escape(lesson.title)} · 온바탕 수업</title><style>${HTML_LESSON_STYLE.replace(/<\/style/gi, '<\\/style')}</style></head><body><div id="onbatang-lesson"></div><script type="application/json" id="onbatang-lesson-data">${safeLessonJson(lesson)}</script><script id="onbatang-lesson-runtime">${HTML_LESSON_RUNTIME.replace(/<\/script/gi, '<\\/script')}</script></body></html>`;
  return new Blob([html], { type: 'text/html;charset=utf-8' });
}
