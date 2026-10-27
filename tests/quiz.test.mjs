import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanQuizActivity, newQuizActivity, quizCover, quizTiles, quizPoints, quizTally, createQuizBoard, quizResultPage, quizzesFromAnswer, QUIZ_POINTS } from '../src/quiz.js';
import { cleanActivity } from '../src/activity.js';
import { cleanDesign } from '../src/model.js';
import { newRecord, migrateRecord, copyRecord, copySlide } from '../app/designs.js';

const base = () => newQuizActivity({ question: '식물이 자라는 데 필요한 것은?', choices: ['물과 햇빛', '장난감', '소금물'], answer: 0, seconds: 20 });

test('a quiz is plain data: question, 2–4 choices, one answer, a time limit, an optional explanation', () => {
  const q = base();
  assert.deepEqual(Object.keys(q), ['version', 'kind', 'id', 'question', 'choices', 'answer', 'seconds']);
  assert.deepEqual(cleanQuizActivity(JSON.parse(JSON.stringify(q))), q);
  assert.deepEqual(cleanActivity(q), q, 'slides carry it like the other activities');
  assert.equal(cleanQuizActivity({ ...q, explain: '  물과 햇빛으로 양분을 만들어요.  ' }).explain, '물과 햇빛으로 양분을 만들어요.');
  assert.equal(cleanQuizActivity({ ...q, question: 'x'.repeat(300) }).question.length, 120);
  assert.equal(cleanQuizActivity({ ...q, choices: ['a\nb', 'c'], answer: 1 }).choices[0], 'a b');
  for (const change of [a => { a.version = 2; }, a => { a.kind = 'poll'; }, a => { a.id = 'x'; }, a => { a.question = '  '; }, a => { a.choices = ['하나']; },
    a => { a.choices = ['1', '2', '3', '4', '5']; }, a => { a.choices = ['1', '']; }, a => { a.answer = 3; }, a => { a.answer = -1; }, a => { a.seconds = 15; }, a => { a.explain = 3; }]) {
    const bad = structuredClone(q); change(bad);
    assert.throws(() => cleanQuizActivity(bad), { code: 'INVALID_ACTIVITY' });
  }
});

test('quiz slides survive the record sanitizers, and copies get their own quiz identity', () => {
  let record = newRecord('16:9'); record.slides[0] = { ...record.slides[0], ...quizCover(base(), 16 / 9), activity: base() };
  const original = structuredClone(record.slides[0].activity);
  for (let i = 0; i < 2; i++) record = migrateRecord(JSON.parse(JSON.stringify({ ...record, slides: record.slides.map(page => cleanDesign(page)) })));
  assert.deepEqual(record.slides[0].activity, original);
  assert.notEqual(copyRecord(record).slides[0].activity.id, original.id);
  assert.notEqual(copySlide(record.slides, 0)[0][1].activity.id, original.id);
});

test('the cover shows the question and every choice (no answer), laid out 2×2 on wide slides and in a column on tall ones', () => {
  const q = base(), cover = quizCover(q, 16 / 9), texts = cover.items.filter(i => i.t === 'text').map(i => i.text);
  assert.ok(texts.includes('퀴즈 · 20초'));
  assert.ok(texts.includes(q.question));
  assert.deepEqual(texts.filter(t => /^[▲◆●■]/.test(t)), ['▲  물과 햇빛', '◆  장난감', '●  소금물']);
  assert.ok(!texts.some(t => t.includes('정답')), 'printing a quiz does not give the answer away');
  const wide = quizTiles(4, 16 / 9), tall = quizTiles(4, 9 / 16);
  assert.equal(new Set(wide.map(t => t.y)).size, 2); assert.equal(new Set(tall.map(t => t.y)).size, 4);
  for (const t of [...wide, ...tall]) { assert.ok(t.x - t.w / 2 >= 0 && t.x + t.w / 2 <= 100); assert.ok(t.y + t.h / 2 <= 93); }
  for (const item of cover.items) assert.ok(cleanDesign({ items: [item] }).items.length, 'every cover item is an ordinary element');
});

test('right answers score 1000 down to 500 with time; untimed quizzes give 1000; wrong answers 0', () => {
  assert.equal(quizPoints(true, 0, 20), QUIZ_POINTS);
  assert.equal(quizPoints(true, 10000, 20), 750);
  assert.equal(quizPoints(true, 99999, 20), 500);
  assert.equal(quizPoints(true, 12345, 0), 1000);
  assert.equal(quizPoints(false, 0, 20), 0);
});

test('the board counts each device once per quiz, keeps the latest name, and ranks ties together', () => {
  const q1 = base(), q2 = newQuizActivity({ question: '2+2?', choices: ['3', '4'], answer: 1, seconds: 0 }), board = createQuizBoard();
  const r1 = board.score(q1, [
    { from: 'aaaaaaaaaaaaaaaa', name: '민준', choice: 0, ms: 0 },
    { from: 'aaaaaaaaaaaaaaaa', name: '민준', choice: 1, ms: 10 },            // 첫 답만 센다
    { from: 'bbbbbbbbbbbbbbbb', name: '서연', choice: 0, ms: 10000 },
    { from: 'cccccccccccccccc', name: '', choice: 2, ms: 500 },
    { from: 'dddddddddddddddd', name: '나쁜', choice: 9, ms: 0 },               // 없는 보기는 버린다
  ]);
  assert.deepEqual(r1.aaaaaaaaaaaaaaaa, { correct: true, points: 1000, total: 1000, rank: 1 });
  assert.deepEqual(r1.bbbbbbbbbbbbbbbb, { correct: true, points: 750, total: 750, rank: 2 });
  assert.deepEqual(r1.cccccccccccccccc, { correct: false, points: 0, total: 0, rank: 3 });
  assert.equal(r1.dddddddddddddddd, undefined);
  board.score(q2, [{ from: 'bbbbbbbbbbbbbbbb', name: '서연2', choice: 1, ms: 1 }, { from: 'cccccccccccccccc', name: '하늘', choice: 1, ms: 1 }]);
  const ranking = board.ranking();
  assert.deepEqual(ranking.map(r => [r.name, r.score, r.rank]), [['서연2', 1750, 1], ['민준', 1000, 2], ['하늘', 1000, 2]]);
  assert.equal(board.size, 3);
  // 같은 문제를 다시 매기면 앞 결과를 덮어쓴다(점수가 두 번 쌓이지 않는다)
  board.score(q2, [{ from: 'bbbbbbbbbbbbbbbb', name: '서연2', choice: 1, ms: 1 }]);
  assert.equal(board.ranking()[0].score, 1750);
  assert.deepEqual(quizTally(q1, [{ choice: 0 }, { choice: 0 }, { choice: 2 }, { choice: 7 }]), { counts: [2, 0, 1], total: 3, correct: 2, rate: 67 });
});

test('the result page shows bars with the answer marked, the accuracy, the explanation and the top five', () => {
  const q = { ...base(), explain: '양분을 만들어요.' }, ranking = Array.from({ length: 7 }, (_, k) => ({ name: '학생' + k, score: 1000 - k, rank: k + 1 }));
  const page = quizResultPage(q, [{ choice: 0 }, { choice: 1 }], 16 / 9, { ranking, at: Date.UTC(2026, 9, 27, 3) });
  const texts = page.items.filter(i => i.t === 'text').map(i => i.text);
  assert.equal(page.source.kind, 'result');
  assert.ok(texts.includes('▲ 물과 햇빛 ✓'));
  assert.ok(texts.some(t => t.startsWith('2명 참여 · 맞힌 비율 50%')));
  assert.ok(texts.includes('해설: 양분을 만들어요.'));
  assert.deepEqual(texts.filter(t => /^\d\. 학생/.test(t)).length, 5);
  assert.ok(cleanDesign(page).items.length === page.items.length);
});

test('GAI answers become quizzes: Q lines, 2–4 choices with one starred answer, optional explanation; broken ones are dropped', () => {
  const answer = '여기 있어요!\n```quiz\nQ: 식물에 꼭 필요한 것은?\n- 물과 햇빛 *\n- 장난감\n- 소금물\n해설: 광합성을 해요.\n\nQ2: 정답이 두 개\n- 가 *\n- 나 *\n\n문제 3. 지구는 어떤 모양?\n1) 네모\n2) 둥근 공 (정답)\n\nQ: 보기가 하나\n- 가 *\n```';
  const quizzes = quizzesFromAnswer(answer, { seconds: 30 });
  assert.deepEqual(quizzes.map(q => [q.question, q.choices, q.answer, q.seconds, q.explain]), [
    ['식물에 꼭 필요한 것은?', ['물과 햇빛', '장난감', '소금물'], 0, 30, '광합성을 해요.'],
    ['지구는 어떤 모양?', ['네모', '둥근 공'], 1, 30, undefined],
  ]);
  assert.deepEqual(quizzesFromAnswer('관련 없는 글'), []);
});
