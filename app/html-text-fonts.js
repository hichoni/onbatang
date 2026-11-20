import {ONBATANG_FONTS} from './fonts.js';
import {readFontAsset} from './file-fonts.js';

// Reuse the shipped OFL fonts and their notices. No third-party font requests.
export const HTML_TEXT_FONTS = [
  {id: 'noto-sans-kr', name: '본고딕', url: new URL('./brand/noto-sans-kr.woff2', import.meta.url).href,
    license: new URL('./brand/OFL.txt', import.meta.url).href, variable: true},
  ...ONBATANG_FONTS.map(font => ({...font, license: new URL(`./fonts/${font.id}-OFL.txt`, import.meta.url).href})),
].map(font => ({...font, family: `Onbatang HTML ${font.id}`}));

const embeddedFonts = new Map();
export function embeddedHtmlFont(id) {
  const font = HTML_TEXT_FONTS.find(item => item.id === id);
  if (!font) return Promise.reject(Error('지원하지 않는 글꼴이에요.'));
  if (!embeddedFonts.has(id)) embeddedFonts.set(id, (async () => {
    const [blob, license] = await Promise.all([readFontAsset(font.url), readFontAsset(font.license, 'text')]);
    if (!blob.size || blob.size > 5 * 1024 * 1024 || !license.includes('SIL OPEN FONT LICENSE')) throw Error('글꼴 파일을 확인할 수 없어요.');
    const data = await new Promise((resolve, reject) => {
      const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob);
    });
    const notice = license.replaceAll('*/', '* /').replace(/<\/style/gi, '<\\/style');
    const weight = font.variable || font.noFakeBold ? '100 900' : '400';
    return `/* ${font.name}\n${notice}\n*/\n@font-face{font-family:"${font.family}";src:url("${data}") format("${font.url.endsWith('.woff') ? 'woff' : 'woff2'}");font-weight:${weight};font-style:normal;font-display:swap;}`;
  })().catch(error => {embeddedFonts.delete(id); throw error;}));
  return embeddedFonts.get(id);
}
