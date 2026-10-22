import test from 'node:test';
import assert from 'node:assert/strict';
import {configure, cleanDesign} from '../src/model.js';
import {parseOutline, outlineSlides, OUTLINE_LINES} from '../app/outline.js';

test('an outline reads titles, body lines at two levels, bullets, numbers and speaker notes', () => {
  const read = parseOutline('# 식물의 한살이\r\n- 씨앗이 싹 터요\n  - 떡잎이 나와요\n\n• 잎과 줄기가 자라요\n> 씨앗을 보여 주며\n> 시작해요\n물의 순환\n\t증발\n\t1. 구름\n마무리');
  assert.deepEqual(read, [
    {title: '식물의 한살이', lines: [{text: '씨앗이 싹 터요', level: 1}, {text: '떡잎이 나와요', level: 2}, {text: '잎과 줄기가 자라요', level: 1}], notes: '씨앗을 보여 주며\n시작해요'},
    {title: '물의 순환', lines: [{text: '증발', level: 1}, {text: '1. 구름', level: 1}], notes: ''},
    {title: '마무리', lines: [], notes: ''},
  ]);
  assert.deepEqual(parseOutline('  먼저 내용부터'), [{title: '', lines: [{text: '먼저 내용부터', level: 1}], notes: ''}]);
  assert.deepEqual(parseOutline('  \n\n'), []);
});

test('outline slides lay a title, a short bar and stacked body lines in the slide colours; long ones go on to more slides', () => {
  configure({aspect: 16 / 9});
  const like = {pa: 'up', tr: 'fade'};
  const {slides, cut} = outlineSlides(parseOutline('물의 순환\n  증발\n    햇볕\n  1. 구름\n마무리'), {bg: 'navy', like});
  assert.equal(cut, 0);
  assert.equal(slides.length, 2);
  const [one, end] = slides;
  assert.equal(one.bg, 'navy');
  assert.equal(one.tr, 'fade');
  const texts = one.items.filter(it => it.t === 'text');
  assert.deepEqual(texts.map(it => it.text), ['물의 순환', '• 증발', '◦ 햇볕', '1. 구름']);
  assert.ok(texts.every(it => it.color === '#ffffff' && it.align === 'l' && it.id));
  assert.ok(texts[0].bold && texts[0].size > texts[1].size && texts[2].size < texts[1].size, 'title big, sub-line smaller');
  assert.ok(texts.every((it, k) => !k || it.y > texts[k - 1].y), 'stacked top to bottom');
  assert.ok(texts.at(-1).y < 95);
  assert.equal(one.items.find(it => it.t === 'shape').color, '#ffd43b', 'accent bar');
  // A title on its own: big, in the middle.
  const cover = end.items.find(it => it.t === 'text');
  assert.deepEqual([cover.text, cover.align, cover.y], ['마무리', 'c', 46]);
  // The slides are valid designs as they are.
  for (const s of slides) assert.equal(cleanDesign(s).items.length, s.items.length);
  // More than OUTLINE_LINES lines: split, the rest under "(이어서)"; only as many slides as there is room for.
  const many = Array.from({length: OUTLINE_LINES + 2}, (_, k) => `  ${k + 1}번째 이야기`).join('\n');
  const split = outlineSlides(parseOutline(`긴 장\n${many}\n> 노트`), {bg: '#fffdf5', room: 5});
  assert.deepEqual(split.slides.map(s => s.items.find(it => it.t === 'text').text), ['긴 장', '긴 장 (이어서)']);
  assert.equal(split.slides[0].notes, '노트');
  assert.equal(split.slides[0].items.filter(it => it.t === 'text').length, 1 + OUTLINE_LINES);
  assert.equal(split.slides[0].items[0].color, '#1d2433', 'dark ink on a light colour');
  const tight = outlineSlides(parseOutline('하나\n둘\n셋'), {bg: 'paper', room: 2});
  assert.deepEqual([tight.slides.length, tight.cut], [2, 1]);
  // Long lines: the letters shrink first, then what still does not fit goes on to a "(이어서)" slide; every line is kept.
  const long = '아주 길게 쓴 내용 줄이에요 아주 길게 쓴 내용 줄이에요 아주 길게';
  const full = outlineSlides(parseOutline(`길게\n${Array.from({length: 6}, () => `  ${long}`).join('\n')}\n다음`), {bg: 'paper'});
  const titles = full.slides.map(s => s.items.find(it => it.t === 'text').text);
  assert.deepEqual([titles[0], titles[1], titles.at(-1)], ['길게', '길게 (이어서)', '다음']);
  const bodies = full.slides.slice(0, -1).flatMap(s => s.items.filter(it => it.t === 'text').slice(1));
  assert.equal(bodies.length, 6);
  assert.ok(bodies[0].size < 5);
  for (const s of full.slides) for (const it of s.items) assert.ok(it.y < 95, `${it.text} at ${it.y}`);
});

test('an outline written by 가이X is taken from its code block, without numbering or bold marks', async () => {
  const {outlineFromAnswer} = await import('../app/outline.js');
  const answer = '좋아요! 개요를 써 볼게요.\n\n```outline\n1. **식물의 한살이**\n  - 씨앗이 **싹** 터요\n> 씨앗을 보여 주기\n2장: 잎과 줄기\n  - 햇빛\n슬라이드 3) 정리\n```\n더 필요하면 말해 주세요.';
  const text = outlineFromAnswer(answer);
  assert.equal(text, '식물의 한살이\n  - 씨앗이 싹 터요\n> 씨앗을 보여 주기\n잎과 줄기\n  - 햇빛\n정리');
  assert.deepEqual(parseOutline(text).map(s => s.title), ['식물의 한살이', '잎과 줄기', '정리']);
  assert.equal(outlineFromAnswer('### 제목\n  내용'), '제목\n  내용', 'no code block: the whole answer');
  assert.equal(outlineFromAnswer(null), '');
});
