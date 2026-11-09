// 온바탕 글꼴(app/fonts.js): 파일과 사용 조건(OFL)이 함께 있고, 예전 그림의 글꼴 이름이 이어진다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { ONBATANG_FONTS, ONBATANG_TITLE_FONT } from '../app/fonts.js';
import { fontFaceWeight } from '../src/fonts.js';

const dir = new URL('../app/fonts/', import.meta.url);

test('글꼴마다 웹 글꼴 파일과 OFL 전문이 있고, 목록에 없는 파일은 없다', () => {
  assert.equal(ONBATANG_FONTS.length, 15);
  const files = new Set(readdirSync(dir));
  for (const f of ONBATANG_FONTS) {
    assert.match(f.id, /^[a-z][a-z0-9-]+$/);
    assert.ok(f.name && f.desc, f.id);
    const file = decodeURIComponent(new URL(f.url).pathname.split('/').pop());
    assert.ok(files.delete(file), `${file} 가 있어야 해요`);
    const head = readFileSync(new URL(file, dir)).subarray(0, 4).toString('latin1');
    assert.ok(head === 'wOF2' || head === 'wOFF', `${file} 는 웹 글꼴이어야 해요`);
    assert.ok(files.delete(`${f.id}-OFL.txt`), `${f.id}-OFL.txt 가 있어야 해요`);
    assert.match(readFileSync(new URL(`${f.id}-OFL.txt`, dir), 'utf8'), /SIL Open Font License, Version 1\.1/);
  }
  assert.deepEqual([...files], [], '목록에 없는 파일');
});

test("이미 아주 굵은 한 굵기 제목 글꼴(도현 · 주아 · 베이글)만 '굵게'를 켜도 덧그리지 않는다", () => {
  // 가짜 굵게로 덧그리면 '를' · '틀'의 속이 메워진다. 이 셋은 @font-face 가 모든 굵기를 한 파일로 맡는다고 알린다.
  assert.deepEqual(ONBATANG_FONTS.filter((f) => f.noFakeBold).map((f) => f.id), ['do-hyeon', 'jua', 'bagel-fat-one']);
  for (const f of ONBATANG_FONTS) assert.equal(fontFaceWeight(f), f.noFakeBold ? ' font-weight: 100 900;' : '', f.id);
  assert.equal(fontFaceWeight({ id: 'x', noFakeBold: 'yes' }), '', 'true 일 때만');
  assert.equal(fontFaceWeight(null), '');
  // 화면(fonts.js)과 그림 · PDF 내보내기(export.js)가 같은 규칙을 쓴다.
  for (const file of ['../src/fonts.js', '../src/export.js']) assert.match(readFileSync(new URL(file, import.meta.url), 'utf8'), /@font-face \{ font-family[^\n]*\$\{fontFaceWeight\(f\)\}/, file);
});

test('예전 그림의 글꼴 이름(do-hyeon · jua · single-day)과 제목 글꼴이 이어지고, 쓰지 않기로 한 글꼴은 없다', () => {
  const ids = ONBATANG_FONTS.map((f) => f.id);
  for (const id of ['do-hyeon', 'jua', 'single-day']) assert.ok(ids.includes(id), id);
  assert.ok(ids.includes(ONBATANG_TITLE_FONT));
  assert.doesNotMatch(JSON.stringify(ONBATANG_FONTS) + readdirSync(dir).join(' '), /피오피|pop-?nemo/i);
  // 나눔은 예약된 이름을 지키려고 원래 정보 그대로의 WOFF 로만 바꿨다(NOTICE 에 적는다).
  assert.match(readFileSync(new URL('../NOTICE', import.meta.url), 'utf8'), /nanum-pen \(나눔손글씨 펜\)/);
});
