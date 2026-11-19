import {newRecord, migrateRecord} from './designs.js';
import {HTML_FILE_MAX_BYTES, isHtmlFile, cleanHtmlFile} from '../src/html-file.js';

export async function readHtmlFile(file) {
  if (!isHtmlFile(file)) throw Error('HTML 파일(.html 또는 .htm)을 골라 주세요.');
  if (!file.size) throw Error('빈 HTML 파일이에요. 내용이 있는 파일을 골라 주세요.');
  if (file.size > HTML_FILE_MAX_BYTES) throw Error('HTML 파일은 25MB까지 가져올 수 있어요.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength > HTML_FILE_MAX_BYTES) throw Error('HTML 파일은 25MB까지 가져올 수 있어요.');
  // Honor common exported document encodings without evaluating any of the markup.
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 1024));
  const charset = /<meta\b[^>]*charset\s*=\s*["']?\s*([\w-]+)/i.exec(head)?.[1] || 'utf-8';
  let html;
  try { html = new TextDecoder(charset).decode(bytes); }
  catch { throw Error('HTML 파일의 글자 인코딩을 읽지 못했어요. UTF-8로 저장한 뒤 다시 가져와 주세요.'); }
  if (!/<(?:!doctype\s+html|html|head|body|title|meta|div|main|section|article|h[1-6]|p|span|canvas|svg|script|style|button|table|img)\b/i.test(html)) throw Error('HTML 내용이 없는 파일이에요. 파일을 확인해 주세요.');
  const web = cleanHtmlFile({html, filename: file.name});
  if (!web) throw Error('HTML 내용을 읽지 못했거나 25MB를 넘어요. 파일을 확인해 주세요.');
  const record = newRecord('16:9');
  record.name = web.filename.replace(/\.html?$/i, '') || 'HTML 자료';
  record.slides[0].web = web;
  return migrateRecord(record);
}
