// Uploaded documents stay inert until opened in an opaque-origin sandbox.
export const HTML_FILE_MAX_BYTES = 50 * 1024 * 1024;
export const cleanHtmlPoster = value => typeof value === 'string' && value.length <= 400000 && /^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]+={0,2}$/.test(value) ? value : '';
export const isHtmlFile = file => /\.html?$/i.test(file?.name || '') || file?.type?.split(';')[0].trim().toLowerCase() === 'text/html';
export function cleanHtmlFile(value) {
  if (!value || typeof value.html !== 'string' || !value.html.trim() || value.html.includes('\0')) return null;
  if (value.html.length > HTML_FILE_MAX_BYTES || new TextEncoder().encode(value.html).length > HTML_FILE_MAX_BYTES) return null;
  const filename = String(value.filename || 'HTML 자료.html').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 160) || 'HTML 자료.html';
  const poster=cleanHtmlPoster(value.poster);
  return { html: value.html, filename, ...(poster ? {poster} : {}) };
}
// A neutral base prevents relative image/script URLs from targeting the host application.
// The iframe sandbox (never allow-same-origin) also applies to nested frames and navigation.
export function htmlFileSource(html) {
  return '<!doctype html><meta charset="utf-8"><base href="about:blank">' + html;
}
export const HTML_FILE_SANDBOX = 'allow-scripts allow-forms allow-modals allow-downloads allow-presentation allow-pointer-lock';
