// 사용법 안내(app/tour.js): 비추는 자리와 펼치는 도구가 실제 화면에 있는 것인지 살핀다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HOME_STEPS, EDITOR_STEPS, NEWS_STEPS, NEWS_KEY } from '../app/tour.js';

const read = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');

test('안내의 단계: 제목과 설명이 있고, 비추는 자리는 앱이 그리는 것이다', () => {
  const app = read('../app/app.js'), editor = read('../src/editor.js');
  for (const s of [...HOME_STEPS, ...EDITOR_STEPS, ...NEWS_STEPS]) {
    assert.ok(s.title && s.text && s.text.length <= 140, s.title);
    const cls = s.target.match(/^\.([a-z-]+)$/)?.[1];
    assert.ok(cls, s.target);
    assert.ok(app.includes(cls) || editor.includes(cls), `${s.target} 는 화면에 있어야 해요`);
  }
  // 펼치는 도구는 편집기의 칸 이름이다
  const tabs = [...editor.matchAll(/\['([a-z]+)', '[a-zA-Z]+', '[^']+', '[^']+'\]/g)].map((m) => m[1]);
  for (const s of [...EDITOR_STEPS, ...NEWS_STEPS].filter((x) => x.view)) assert.ok(tabs.includes(s.view), s.view);
});

test('처음 꾸미는 화면을 열면 한 번 저절로 보여 주고, ? 단추로 언제든 다시 본다', () => {
  const app = read('../app/app.js');
  assert.match(app, /if \(!tourSeen\('editor'\)\) \{\n    markTourSeen\('editor'\);/);
  assert.match(app, /tourButton\('home'\)/);
  assert.match(app, /tourButton\('editor', O\)/);
  assert.match(app, /function setView\(view\) \{\n  stopTour\(\);/, '화면이 바뀌면 안내를 닫는다');
});

test('새 기능 안내: 안내를 이미 본 기기에 한 번, 처음 온 기기는 같은 내용이 든 안내만 본다', async () => {
  const app = read('../app/app.js');
  assert.match(NEWS_KEY, /^news-\d+\.\d+$/);
  assert.match(app, /if \(!tourSeen\('editor'\)\) \{\n    markTourSeen\('editor'\);\n    markTourSeen\(NEWS_KEY\);[\s\S]*?\} else if \(!tourSeen\(NEWS_KEY\)\) \{\n    markTourSeen\(NEWS_KEY\);[\s\S]*?editorTour\(O, \{ news: true \}\)/);
  // 새 기능 안내의 단계는 처음 온 기기의 안내에도 들어 있다(연결선 · 발표 글쇠 · 내려받기 · 저장).
  for (const title of ['연결선으로 잇기', '발표하기', '내려받기', '저절로 저장돼요']) {
    assert.ok(NEWS_STEPS.some((x) => x.title === title) && EDITOR_STEPS.some((x) => x.title === title), title);
  }
  // 새로 든 기능의 이름이 안내에 나온다.
  const words = [...EDITOR_STEPS, ...NEWS_STEPS].map((x) => `${x.text} ${x.tip || ''}`).join(' ');
  // 꾸미는 화면 안내를 이미 본 것으로 두는 브라우저 시험은 새 기능 안내도 본 것으로 둔다(안내가 화면을 가리지 않게).
  const { readdirSync } = await import('node:fs');
  for (const f of readdirSync(new URL('./browser/', import.meta.url)).filter((x) => x.endsWith('.test.mjs'))) {
    const src = read(`./browser/${f}`);
    if (/onbatang-tour-seen-v1:editor|\['home', 'editor'/.test(src)) assert.ok(src.includes(NEWS_KEY), `${f}: ${NEWS_KEY}`);
    for (const m of src.matchAll(/markTourSeen\('editor'\)/g)) assert.match(src.slice(m.index, m.index + 80), /markTourSeen\(tour\.NEWS_KEY\)/, `${f}: 새 기능 안내도 본 것으로`);
  }
  for (const w of ['연결선', '붙는 곳', '손잡이', '이어 움직이기', '강조', '숨기', '주제', '찾아 바꾸기', '전체 보기', '카메라', '자동 넘기기', '리허설', 'PDF', 'GIF', 'HTML', '새로 고쳐도']) assert.ok(words.includes(w), w);
});
