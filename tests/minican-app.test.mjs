// 미니캔 앱(app/)의 점검: 그림 기록의 규칙, 슬라이드 다루기, 내려받기 크기·이름, 압축 파일, 템플릿과 주제 테마,
// 그리고 앱이 이 기기 밖으로 아무것도 보내지 않는지(로그인·서버 저장이 없는지).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  RATIOS, MAX_SLIDES, ratioOf, cleanRecord, newRecord, newDesignId, isDesignId, nextNumber, sortRecords, isBlank, fileName,
  exportSize, addSlide, copySlide, removeSlide, moveSlide, libraryOf, dropPhoto, slideExtra, deckVideos, unusedVideos, EXPORT_KEY, RATIO_KEY,
} from '../app/designs.js';
import { crc32, zipStore } from '../app/zip.js';
import { SHARED_LAYOUTS, BASIC_GROUP } from '../app/layouts.js';
import { TITLE_FONT, setTitleFont } from '../app/templates.js';
import { THEME_RATIO } from '../app/themes.js';
import { fixWebmDuration } from '../app/webm.js';

const APP = fileURLToPath(new URL('../app/', import.meta.url));
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

test('그림의 모양은 네 가지이고, 모르는 모양은 정사각형으로 읽는다', () => {
  assert.deepEqual(RATIOS.map((r) => r.id), ['1:1', '4:5', '16:9', '9:16']);
  assert.deepEqual(RATIOS.map((r) => r.name), ['정사각형', '세로', '가로', '길게']);
  assert.equal(ratioOf('3:2').id, '3:2');
  assert.equal(ratioOf('bad').id, '1:1');
  assert.equal(ratioOf('16:9').aspect, 16 / 9);
});

test('그림 기록: 이름표·이름·모양을 정리하고, 모양이 아니면 버린다. 예전 한 장짜리 기록은 슬라이드 한 장으로 읽는다', () => {
  assert.equal(cleanRecord(null), null);
  assert.equal(cleanRecord({ id: 'bad', slides: [{ items: [] }] }), null);
  assert.equal(cleanRecord({ id: newDesignId(), slides: [] }), null);
  const id = newDesignId(1700000000000, 0.5);
  assert.ok(isDesignId(id));
  const r = cleanRecord({ id, name: '  우리   반\n포스터 ', ratio: '7:3', design: { bg: '#fff', items: [{ t: 'text', text: '원문' }] }, updatedAt: 5, owner: '5-3-12', synced: true });
  assert.deepEqual(Object.keys(r).sort(), ['assets', 'id', 'name', 'originalSize', 'ratio', 'revision', 'schemaVersion', 'size', 'slides', 'source', 'updatedAt', 'uploads']);
  assert.equal(r.name, '우리 반 포스터');
  assert.equal(r.ratio, '7:3');
  assert.equal(r.slides.length, 1);
  assert.throws(() => cleanRecord({ id, slides: Array.from({ length: MAX_SLIDES + 5 }, () => ({ items: [] })), updatedAt: 1 }), { code: 'PAGE_LIMIT' });
});

test('새 그림 · 차례 · 다음 번호 · 빈 그림', () => {
  const a = newRecord('4:5', 3, 100);
  assert.equal(a.name, '그림 3');
  assert.equal(a.ratio, '4:5');
  assert.ok(isBlank(a));
  assert.equal(nextNumber([{ name: '그림 2' }, { name: '그림 9' }, { name: '포스터' }]), 10);
  assert.equal(nextNumber([]), 1);
  const list = sortRecords([{ id: 'da', updatedAt: 1 }, { id: 'db', updatedAt: 3 }]);
  assert.deepEqual(list.map((x) => x.id), ['db', 'da']);
  assert.ok(!isBlank({ slides: [{ items: [] }, { items: [{ t: 'text' }] }] }));
});

test('슬라이드 다루기: 더하기 · 복제 · 지우기 · 옮기기 (움직임은 이어받고, 한도를 넘지 않는다)', () => {
  const one = [{ items: [{ t: 'text', text: '가' }], pa: 'rise', tr: 'fade' }];
  const [two, at] = addSlide(one, 0, '#fff', one[0]);
  assert.equal(at, 1);
  assert.match(two[1].id, /^p[a-z0-9]+$/);
  assert.deepEqual({ ...two[1], id: undefined }, { id: undefined, bg: '#fff', items: [], pa: 'rise', tr: 'fade' });
  const [three, c] = copySlide(two, 0);
  assert.equal(c, 1);
  assert.notEqual(three[1], three[0]);
  assert.notEqual(three[1].id, three[0].id);
  assert.equal(three[1].items[0].text, three[0].items[0].text);
  assert.deepEqual(moveSlide(three, 0, -1), [three, 0]);
  assert.equal(moveSlide(three, 0, 1)[0][1], three[0]);
  assert.deepEqual(removeSlide(one, 0)[0][0].items, []);
  const full = Array.from({ length: MAX_SLIDES }, () => ({ items: [] }));
  assert.equal(addSlide(full, 0)[1], -1);
  assert.equal(copySlide(full, 0)[1], -1);
});

test('올린 파일 목록과 영상 장면: 쓰는 사진은 늘 목록에 있고, 안 쓰는 영상 파일만 지운다', () => {
  const slides = [{ items: [{ t: 'image', url: PNG }] }];
  assert.deepEqual(libraryOf([], slides), [PNG]);
  assert.deepEqual(libraryOf([PNG, 'https://example.com/a.png'], slides), [PNG]);
  assert.deepEqual(dropPhoto(slides, PNG), [{ items: [] }]);
  assert.equal(dropPhoto(slides, 'x'), slides);
  const withVideo = { items: [], video: { src: 'vabc123', dur: 3, in: 0.5, junk: 1 }, pa: 'rise', tr: 'Bad!' };
  assert.deepEqual(slideExtra(withVideo), { pa: 'rise', video: { src: 'vabc123', dur: 3, in: 0.5 } });
  assert.deepEqual(deckVideos([withVideo, withVideo]), ['vabc123']);
  const files = [{ key: 'vabc123', design: 'd1' }, { key: 'vold111', design: 'd1' }, { key: 'vother1', design: 'd2' }];
  assert.deepEqual(unusedVideos(files, 'd1', ['vabc123']), ['vold111']);
});

test('내려받기: 긴 쪽이 1080 · 1920 · 3840 이 되고, 파일 이름은 영어·숫자로만 짓는다', () => {
  assert.deepEqual(exportSize('small', 16 / 9), { id: 'small', width: 1080, height: 608 });
  assert.deepEqual(exportSize('large', 9 / 16), { id: 'large', width: 2160, height: 3840 });
  assert.deepEqual(exportSize('nope', 1), { id: 'medium', width: 1920, height: 1920 });
  const when = new Date(2026, 9, 13, 9, 5);
  assert.equal(fileName(when), 'onbatang-20261013-0905');
  assert.equal(fileName(when, 3), 'onbatang-20261013-0905-03');
  assert.match(EXPORT_KEY, /^minican\./);
  assert.match(RATIO_KEY, /^minican\./);
});

test('압축 파일(zip): 이름 · 크기 · 검사 값이 맞게 적힌다', () => {
  assert.equal(crc32(new TextEncoder().encode('hello')), 0x3610a686);
  const bytes = new TextEncoder().encode('hello');
  const zip = zipStore([{ name: 'a.txt', bytes }, { name: 'b.txt', bytes }], new Date(2026, 0, 2, 3, 4, 6));
  const view = new DataView(zip.buffer);
  assert.equal(view.getUint32(0, true), 0x04034b50);
  assert.equal(view.getUint32(14, true), 0x3610a686);
  const end = zip.length - 22;
  assert.equal(view.getUint32(end, true), 0x06054b50);
  assert.equal(view.getUint16(end + 10, true), 2);
});

test('템플릿: 기본 짜임 6종과 주제 테마 9종(표지 · 내용). 네 가지 모양 모두에서 요소를 만든다', () => {
  const basic = SHARED_LAYOUTS.filter((l) => l.group === BASIC_GROUP);
  const covers = SHARED_LAYOUTS.filter((l) => l.cover);
  assert.equal(basic.length, 6);
  assert.equal(covers.length, 9);
  assert.equal(SHARED_LAYOUTS.length, 6 + 18);
  assert.ok(covers.every((l) => l.ratio === THEME_RATIO));
  assert.equal(new Set(SHARED_LAYOUTS.map((l) => l.id)).size, SHARED_LAYOUTS.length);
  for (const l of SHARED_LAYOUTS) {
    for (const r of RATIOS) {
      const items = l.items(r.aspect);
      assert.ok(Array.isArray(items) && items.length > 0, `${l.id} ${r.id}`);
      assert.ok(items.length <= 40, `${l.id} ${r.id} ${items.length}`);
    }
  }
});

test('큰 제목 글꼴은 들여 쓰는 곳이 정한다(정하지 않으면 기본 글꼴)', () => {
  const titleFonts = () => SHARED_LAYOUTS.flatMap((l) => l.items(1)).filter((it) => it.t === 'text' && it.font).map((it) => it.font);
  setTitleFont('');
  assert.equal(TITLE_FONT, '');
  assert.ok(titleFonts().every((f) => f === ''));
  setTitleFont('my-title');
  assert.ok(titleFonts().includes('my-title'));
  setTitleFont(null);
  assert.equal(TITLE_FONT, '');
});

test('WebM 길이 적어 넣기: 모양이 다르면 그대로 돌려준다', () => {
  const junk = new Uint8Array([1, 2, 3, 4]);
  assert.equal(fixWebmDuration(junk, 2), junk);
});

test('편집기 자체에는 인증·서버 API가 없고 GBE-AI Lab 연결 주소는 명시적인 팝업(가이X · 계정 이어 쓰기)과 복사 링크 받기에만 있다', () => {
  const files = readdirSync(APP).filter((f) => /\.(js|css|html)$/.test(f));
  assert.ok(files.includes('app.js') && files.includes('app.css') && files.includes('index.html'));
  for (const f of files) {
    const src = readFileSync(APP + f, 'utf8');
    // PPTX only reads a cleaned existing photo URL. No credentials, referrer, body,
    // writes or other network APIs are allowed; keep every other app file under the old rule.
    // 온바탕 파일(file-fonts.js)은 글꼴 목록에 적힌 같은 곳의 글꼴 파일 · 사용 허락 글(또는 blob:)만 읽는다. 인증 정보는 싣지 않는다.
    if (f === 'file-fonts.js') assert.match(src, /if \(u\.protocol !== 'blob:' && u\.origin !== location\.origin\) throw Error\('font_origin'\);/);
    const networkSource = f === 'pptx.js' ? src.replace("fetch(item.url, {signal, method: 'GET', credentials: 'omit', referrerPolicy: 'no-referrer'})", 'readExistingPhoto()')
      : f === 'file-fonts.js' ? src.replace("fetch(u.href, { credentials: 'omit', referrerPolicy: 'no-referrer' })", 'readSameOriginAsset()') : src;
    assert.doesNotMatch(networkSource, /\bfetch\(|XMLHttpRequest|WebSocket|sendBeacon|EventSource/, f);
    const addresses = f === 'pptx.js' ? src.replaceAll(/http:\/\/schemas\.openxmlformats\.org\/(?:drawingml\/2006\/main|presentationml\/2006\/main|officeDocument\/2006\/(?:relationships|extended-properties)|package\/2006\/(?:relationships(?:\/metadata\/core-properties)?|content-types|metadata\/core-properties))/g, '').replaceAll('http://purl.org/dc/elements/1.1/', '').replaceAll('http://schemas.microsoft.com/office/powerpoint/2010/main', '') : src;
    // 링크 미리보기 태그(og:* · twitter:*)는 공용 온바탕의 주소를 절대 주소로 적어야 미리보기가 그림을 읽는다(앱이 보내는 요청이 아니다).
    const previews = f === 'index.html' ? addresses.replace(/<meta (?:property="og:(?:url|image)"|name="twitter:image") content="https:\/\/onbatang\.web\.app\/[^"]*" \/>/g, '') : addresses;
    // 휴대폰 리모컨(phone-remote.js)은 GBE-AI Lab의 리모컨 판을, 같이 고치기(co-relay.js)는 GBE-AI Lab의 다리를 작은 창으로만 띄운다. 복사 링크(copy-link.js)는 로그인 없이 GBE-AI Lab의 공개 함수 두 개와 영상 자리만 읽는다(인증 정보를 싣지 않는다, credentials: 'omit').
    const allowed = f === 'gai-provider.js' ? previews.replaceAll('https://gbe.ai.kr/onbatang-gai-connect.html', '') : f === 'account-bridge.js' ? previews.replaceAll('https://gbe.ai.kr/onbatang-account-connect.html', '') : f === 'copy-link.js' ? previews.replaceAll('https://wiaciazdsnhzgwplwjpu.supabase.co', '').replaceAll("'https://gbe.ai.kr/onbatang-copy.html'", '').replaceAll("'https://gbe.ai.kr/onbatang-play.html'", '') : f === 'phone-remote.js' ? previews.replaceAll('https://gbe.ai.kr/onbatang-remote-relay.html', '') : f === 'co-relay.js' ? previews.replaceAll('https://gbe.ai.kr/onbatang-co-relay.html', '') : previews;
    if (f === 'copy-link.js') {
      assert.deepEqual([...src.matchAll(/\/(rest\/v1\/rpc|storage\/v1\/object)\/([\w${}-]+)/g)].map((m) => m[0]), ['/rest/v1/rpc/${name}', '/storage/v1/object/onbatang-copy-videos']);
      // 받기 두 개와 7일 링크(누구나 만드는 링크)의 만들기 · 올리기 · 미리보기 그림 · 지금 모습 · 지우기만 부른다.
      assert.deepEqual([...src.matchAll(/rpc\('(\w+)'/g)].map((m) => m[1]), ['onbatang_copy_info', 'onbatang_copy_part', 'onbatang_guest_copy_publish', 'onbatang_guest_copy_put', 'onbatang_guest_copy_card', 'onbatang_guest_copy_get', 'onbatang_guest_copy_remove']);
      assert.equal(src.match(/credentials: 'omit'/g)?.length, 2, 'copy-link.js: 쿠키 · 인증을 싣지 않는다');
    }
    assert.doesNotMatch(allowed.replaceAll('http://www.w3.org/2000/svg', ''), /https?:\/\//, `${f}: 바깥 주소`);
    assert.doesNotMatch(src, /firebase|firestore|tinkerlab|틴커랩|signInWithPassword|access_token|service_role/i, f);
    for (const [, from] of src.matchAll(/from '([^']+)'/g)) assert.match(from, /^\.\/(?:pptx-import\/)?[\w-]+\.js$|^\.\.\/src\/[\w-]+\.js$/, `${f}: ${from}`);
  }
  assert.doesNotMatch(readFileSync(APP + 'app.css', 'utf8'), /cv-team|cv-roster|cv-me\b|cv-adopt/);
});

test('들여 쓰는 곳의 표시: 안전한 로고를 받고 온바탕 로고와 함께 편집기 막대에 놓는다', async () => {
  const { cleanBrand } = await import('../app/designs.js');
  assert.deepEqual(cleanBrand({ name: ' GBE-AI LAB ', logo: 'assets/brand-logo-owl.png' }), { name: 'GBE-AI LAB', logo: 'assets/brand-logo-owl.png' });
  for (const logo of ['./logo.png', '../logo.svg', '/logo.png', 'https://example.org/logo.png', 'data:image/png;base64,AAAA']) assert.ok(cleanBrand({ name: '학교', logo }), logo);
  for (const logo of ['javascript:alert(1)', 'http://example.org/a.png', '//example.org/a.png', 'data:text/html,<b>', '', null]) assert.equal(cleanBrand({ name: '학교', logo }), null, String(logo));
  assert.equal(cleanBrand({ name: '', logo: 'a/b.png' }), null);assert.equal(cleanBrand({ name: '가'.repeat(41), logo: 'a/b.png' }), null);assert.equal(cleanBrand(null), null);
  const app = readFileSync(APP + 'app.js', 'utf8');
  assert.match(app, /brand = cleanBrand\(mark\);/);
  assert.match(app, /const bar = el\('header', \{ class: 'cv-bar' \},\s+el\('span', \{ class: 'onba-editor-logo' \}, onbatangLogo\(\)\),\s+\.\.\.\(mark \? \[mark,/);
  // GitHub Pages 의 첫 주소는 앱으로 보낸다.
  const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(index, /http-equiv="refresh" content="0; url=app\/"/);
});
