// 퀴즈 장의 화면: 편집기의 "퀴즈 넣기"(직접 · 가이X 에게 부탁) 칸과 발표 화면의 퀴즈(시작 → 시간 재기 → 정답 공개 → 순위).
// 발표 화면은 휴대폰 없이도 돈다(선생님이 시작하고 정답을 연다). GBE-AI Lab 발표에서는 live 로 학생 휴대폰의 답을 받아 점수를 낸다.
//   live: { connected(), connect(), send(state|null), listen(fn) → 끊기 } (app.js 가 호스트의 "질문 · 반응" 통로에 잇는다)
//   state(학생 휴대폰으로 가는 것): { id, question, choices, seconds, phase: 'ready'|'open'|'shown'|'ranking', endsAt?, answer?, results?, top? }
//   listen 으로 오는 것: { id, answers: [{ from, name, choice, ms }] } (호스트가 기기마다 첫 답만 모아 보낸다)
import { el } from '../src/dom.js';
import { newId } from '../src/document.js';
import { cleanQuizActivity, quizTally, quizResultPage, quizzesFromAnswer, QUIZ_CHOICES, QUIZ_LIMITS, QUIZ_SECONDS } from '../src/quiz.js';

const secondsLabel = (s) => (s ? `${s}초` : '시간 제한 없음');

/**
 * 퀴즈 넣기 · 고치기 칸. onApply(quizzes[]) 가 지금 장 다음에 넣는다(고칠 때는 하나).
 * ai: { generate({ topic, count, seconds, share }) → quizzes[], title, hasText } — 가이X 를 이어 준 곳에서만.
 */
export function createQuizSetup({ activity: raw, onApply, onCancel, ai = null } = {}) {
  const editing = !!raw;
  let busy = false;
  const status = el('p', { class: 'quiz-setup-status', role: 'status', 'aria-live': 'polite' });
  const lock = (on) => { busy = on; form.querySelectorAll('input,textarea,select,button').forEach((n) => { if (!n.dataset.quizKeep) n.disabled = on; }); };
  const apply = async (list) => {
    if (busy) return;
    lock(true); status.textContent = '퀴즈 장을 넣고 있어요…';
    try { await onApply(list); }
    catch (error) { status.textContent = `퀴즈를 넣지 못했어요. ${error?.message || '다시 시도해 주세요.'}`; }
    finally { lock(false); }
  };

  // 직접 만들기: 문제 · 보기 2~4개(정답 하나 고르기) · 시간 · 해설
  // 새 퀴즈는 빈 칸으로 시작한다(빈 문제는 아직 퀴즈가 아니므로 cleanQuizActivity 를 거치지 않는다)
  const start = raw ? cleanQuizActivity(raw) : { id: newId('a'), question: '', choices: ['', '', '', ''], answer: 0, seconds: 20, explain: '' };
  const question = el('textarea', { rows: 2, maxlength: QUIZ_LIMITS.question, value: editing ? start.question : '', placeholder: '예) 식물이 자라는 데 꼭 필요한 것은?', 'aria-label': '문제', dataset: { quizQuestion: '' } });
  const rows = el('ol', { class: 'quiz-setup-choices' });
  const seconds = el('select', { 'aria-label': '제한 시간', dataset: { quizSeconds: '' } }, QUIZ_SECONDS.map((s) => el('option', { value: String(s), text: secondsLabel(s) })));
  seconds.value = String(start.seconds);
  const explain = el('input', { type: 'text', maxlength: QUIZ_LIMITS.explain, value: start.explain || '', placeholder: '정답을 연 뒤 보여 줄 한 줄(없어도 돼요)', 'aria-label': '해설', dataset: { quizExplain: '' } });
  const group = `quiz-answer-${Math.random().toString(36).slice(2, 8)}`;
  const addRow = (value = '', right = false) => {
    const k = rows.children.length, look = QUIZ_CHOICES[k];
    const input = el('input', { type: 'text', maxlength: QUIZ_LIMITS.choice, value, placeholder: `보기 ${k + 1}${k >= 2 ? '(없어도 돼요)' : ''}`, 'aria-label': `보기 ${k + 1}` });
    const pick = el('input', { type: 'radio', name: group, checked: right, 'aria-label': `보기 ${k + 1}이 정답` });
    rows.append(el('li', { class: 'quiz-setup-choice', style: `--quiz-c:${look.color}` }, el('span', { class: 'quiz-setup-mark', text: look.mark, 'aria-hidden': 'true' }), input, el('label', { class: 'quiz-setup-right' }, pick, '정답')));
  };
  start.choices.forEach((c, k) => addRow(c, editing && k === start.answer));
  const read = () => {
    const list = [...rows.children].map((li) => ({ text: li.querySelector('input[type=text]').value.trim(), right: li.querySelector('input[type=radio]').checked }));
    const filled = list.filter((c) => c.text);
    if (!question.value.trim()) throw Error('문제를 적어 주세요.');
    if (filled.length < 2) throw Error('보기를 두 개 넘게 적어 주세요.');
    if (new Set(filled.map((c) => c.text)).size !== filled.length) throw Error('보기가 서로 달라야 해요.');
    const answer = filled.findIndex((c) => c.right);
    if (answer < 0) throw Error('정답인 보기를 하나 골라 주세요.');
    return cleanQuizActivity({ version: 1, kind: 'quiz', id: start.id, question: question.value, choices: filled.map((c) => c.text), answer, seconds: Number(seconds.value), explain: explain.value });
  };
  const manual = el('div', { class: 'quiz-setup-manual' },
    el('label', { class: 'quiz-setup-field' }, '문제', question),
    el('div', { class: 'quiz-setup-field' }, el('span', { text: '보기 (정답에 표시)' }), rows),
    el('div', { class: 'quiz-setup-row' }, el('label', { class: 'quiz-setup-field' }, '제한 시간', seconds), el('label', { class: 'quiz-setup-field quiz-setup-grow' }, '해설', explain)),
    el('div', { class: 'quiz-setup-actions' },
      el('button', { type: 'button', class: 'btn', text: '취소', dataset: { quizKeep: '' }, onclick: () => { if (!busy) onCancel?.(); } }),
      el('button', { type: 'submit', class: 'btn btn-primary', text: editing ? '퀴즈 고치기' : '퀴즈 장 넣기', dataset: { quizApply: '' } })));

  // 가이X 에게 부탁하기: 주제 · 문제 수 · (지금 그림의 글 참고) → 미리 보고 고른 문제만 넣는다
  let asking = null;
  const aiBox = ai && !editing ? (() => {
    const topic = el('input', { type: 'text', maxlength: 300, value: ai.title || '', placeholder: '예) 4학년 과학 · 식물의 한살이', 'aria-label': '퀴즈 주제', dataset: { quizTopic: '' } });
    const count = el('select', { 'aria-label': '문제 수', dataset: { quizCount: '' } }, [3, 5, 8, 10].map((n) => el('option', { value: String(n), text: `${n}문제`, ...(n === 5 ? { selected: true } : {}) })));
    const share = el('input', { type: 'checkbox', checked: !!ai.hasText, dataset: { quizShare: '' } });
    const say = el('p', { class: 'quiz-setup-status', role: 'status', 'aria-live': 'polite', text: ai.hasText ? '지금 그림의 내용으로 문제를 만들어 줘요. 만든 문제는 넣기 전에 골라요.' : '주제를 적으면 가이X가 문제를 만들어 줘요. 만든 문제는 넣기 전에 골라요.' });
    const picks = el('ol', { class: 'quiz-setup-picks', hidden: true });
    const put = el('button', { type: 'button', class: 'btn btn-primary', hidden: true, dataset: { quizPut: '' } });
    let made = [];
    const paintPut = () => { const n = picks.querySelectorAll('input:checked').length; put.textContent = `고른 ${n}문제 넣기`; put.disabled = !n || busy; };
    put.addEventListener('click', () => { const chosen = made.filter((_, k) => picks.children[k]?.querySelector('input')?.checked); if (chosen.length) apply(chosen.map((q) => cleanQuizActivity({ ...q, seconds: Number(seconds.value) }))); });
    const label = el('span', { text: '가이X에게 부탁하기' });
    const go = el('button', { type: 'button', class: 'btn btn-primary', dataset: { quizAsk: '', quizKeep: '' }, onclick: async () => {
      if (asking) { asking.abort(); return; }
      const want = topic.value.trim();
      if (!share.checked && want.length < 3) { say.textContent = '주제를 3자 넘게 적어 주세요.'; topic.focus(); return; }
      const controller = asking = new AbortController();
      label.textContent = '그만두기'; topic.disabled = count.disabled = share.disabled = true; say.textContent = '가이X 연결을 확인하고 있어요…';
      try {
        made = await ai.generate({ topic: want, count: Number(count.value), seconds: Number(seconds.value), share: share.checked, signal: controller.signal, onStatus: (text) => { say.textContent = text; } });
        if (!made.length) throw Error('문제 모양의 답을 받지 못했어요. 주제를 조금 더 자세히 적어 다시 부탁해 주세요.');
        picks.replaceChildren(...made.map((q, k) => el('li', { class: 'quiz-setup-pick' }, el('label', {}, el('input', { type: 'checkbox', checked: true, onchange: paintPut }),
          el('b', { text: `${k + 1}. ${q.question}` })),
          el('ul', {}, q.choices.map((c, i) => el('li', { class: i === q.answer ? 'quiz-setup-right-choice' : '', text: `${QUIZ_CHOICES[i].mark} ${c}${i === q.answer ? ' (정답)' : ''}` }))),
          q.explain ? el('p', { class: 'quiz-setup-explain', text: `해설: ${q.explain}` }) : null)));
        picks.hidden = put.hidden = false; paintPut();
        say.textContent = `가이X가 ${made.length}문제를 만들었어요. 넣을 문제만 골라요(넣은 뒤에도 장마다 고칠 수 있어요).`;
      } catch (error) {
        say.textContent = error?.name === 'AbortError' ? '부탁을 그만뒀어요.' : String(error?.message || '가이X가 문제를 만들지 못했어요. 다시 부탁해 주세요.').slice(0, 300);
      } finally {
        if (asking === controller) asking = null;
        label.textContent = '가이X에게 부탁하기'; topic.disabled = count.disabled = share.disabled = false;
      }
    } }, label);
    return el('section', { class: 'quiz-setup-ai', 'aria-label': '가이X에게 퀴즈 부탁하기' },
      el('h3', { text: '가이X에게 부탁하기' }), el('label', { class: 'quiz-setup-field' }, '주제', topic),
      ai.hasText ? el('label', { class: 'quiz-setup-check' }, share, ' 지금 그림의 글로 문제 만들기') : null,
      el('div', { class: 'quiz-setup-row' }, count, go), say, picks, put);
  })() : null;

  const form = el('form', { class: 'quiz-setup', 'aria-label': editing ? '퀴즈 고치기' : '퀴즈 넣기' },
    el('h2', { text: editing ? '퀴즈 고치기' : '퀴즈 넣기' }),
    el('p', { class: 'quiz-setup-lead', text: '지금 장 다음에 퀴즈 장을 넣어요. 발표에서 시작하면 시간을 재고 정답을 열어요. GBE-AI Lab 발표에서는 학생이 휴대폰으로 풀고 점수 · 순위가 나와요.' }),
    aiBox, aiBox ? el('h3', { class: 'quiz-setup-or', text: '직접 만들기' }) : null, manual, status);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    let quiz; try { quiz = read(); } catch (error) { status.textContent = error.message; return; }
    apply([quiz]);
  });
  form.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !busy) { event.stopPropagation(); onCancel?.(); } else if (event.key !== 'Escape') event.stopPropagation(); });
  return form;
}

/**
 * 발표 화면의 퀴즈. board: 이 발표의 점수판(createQuizBoard). onSave(page): 결과 장을 다음 장으로 넣는다.
 * 돌려주는 것: { step() 다음 차례가 있으면 그것을 하고 true, destroy() }.
 */
export function mountQuiz(root, { activity: raw, board = null, live = null, aspect = 16 / 9, onSave = null, now = () => Date.now() } = {}) {
  const quiz = cleanQuizActivity(raw);
  let phase = 'ready', run = 0, openedAt = 0, timer = 0, answers = [], results = null, saved = false, busy = false, destroyed = false, unlisten = null;
  const abort = new AbortController(), signal = abort.signal;
  const id = () => `${quiz.id}-${run}`;
  const status = el('p', { class: 'quiz-status', role: 'status', 'aria-live': 'polite' });
  const clock = el('span', { class: 'quiz-clock', 'aria-label': '남은 시간' });
  const count = el('span', { class: 'quiz-count' });
  const fill = el('span', { class: 'quiz-bar-fill' });
  const bar = el('div', { class: 'quiz-bar', hidden: !quiz.seconds }, fill);
  const tiles = quiz.choices.map((text, k) => el('li', { class: 'quiz-tile', style: `--quiz-c:${QUIZ_CHOICES[k].color}`, dataset: { choice: String(k) } },
    el('span', { class: 'quiz-mark', 'aria-hidden': 'true', text: QUIZ_CHOICES[k].mark }), el('span', { class: 'quiz-text', text }), el('span', { class: 'quiz-n' })));
  const explain = el('p', { class: 'quiz-explain', hidden: true, text: quiz.explain ? `해설: ${quiz.explain}` : '' });
  const rank = el('ol', { class: 'quiz-rank', hidden: true, 'aria-label': '순위' });
  const actions = el('div', { class: 'quiz-actions' });
  const body = el('section', { class: 'quiz-app', 'aria-label': '퀴즈' },
    el('header', { class: 'quiz-head' }, el('span', { class: 'quiz-kicker', text: '퀴즈' }), clock, count),
    el('h2', { class: 'quiz-question', text: quiz.question }), bar,
    el('ol', { class: `quiz-tiles quiz-tiles-${quiz.choices.length}`, 'aria-label': '보기' }, tiles), explain, rank, actions, status);
  root.replaceChildren(body);
  const button = (text, onClick, extra = '') => el('button', { type: 'button', class: `quiz-btn cv-show-key ${extra}`.trim(), text, onclick: (e) => { e.stopPropagation(); onClick(); } });
  const linked = () => !!live?.connected?.();

  function state() {
    const s = { id: id(), question: quiz.question, choices: quiz.choices, seconds: quiz.seconds, phase };
    if (phase === 'open' && quiz.seconds) s.endsAt = openedAt + quiz.seconds * 1000;
    if (phase === 'shown' || phase === 'ranking') { s.answer = quiz.answer; if (results) s.results = results; }
    if (phase === 'ranking' && board) s.top = board.ranking().slice(0, 5).map(({ name, score, rank: r }) => ({ name, score, rank: r }));
    return s;
  }
  const tell = () => { if (!destroyed) try { live?.send?.(state()); } catch (error) { console.warn(error); } };

  function paint() {
    body.dataset.phase = phase;
    const shown = phase === 'shown' || phase === 'ranking', tally = quizTally(quiz, answers);
    count.textContent = linked() ? (phase === 'ready' ? '학생 휴대폰 연결됨' : `${answers.length}명 답함`) : '';
    tiles.forEach((tile, k) => {
      tile.classList.toggle('quiz-right', shown && k === quiz.answer);
      tile.classList.toggle('quiz-dim', shown && k !== quiz.answer);
      tile.querySelector('.quiz-n').textContent = shown && answers.length ? `${tally.counts[k]}명` : '';
    });
    explain.hidden = !(shown && quiz.explain);
    const top = board && phase === 'ranking' ? board.ranking().slice(0, 5) : [];
    rank.hidden = phase !== 'ranking';
    rank.replaceChildren(...top.map((r) => el('li', { class: `quiz-rank-row quiz-rank-${r.rank}` }, el('b', { text: `${r.rank}등` }), el('span', { text: r.name }), el('span', { text: `${r.score.toLocaleString('ko-KR')}점` }))));
    if (phase === 'ranking' && !top.length) rank.append(el('li', { text: '아직 답한 학생이 없어요.' }));
    const list = [];
    if (phase === 'ready') {
      if (live && !linked()) list.push(button('학생 휴대폰으로 함께 풀기', connect));
      list.push(button(quiz.seconds ? `시작 (${quiz.seconds}초)` : '시작', open, 'quiz-primary'));
    } else if (phase === 'open') list.push(button('정답 공개', reveal, 'quiz-primary'));
    else {
      if (phase === 'shown' && board && answers.length) list.push(button('순위 보기', showRanking, 'quiz-primary'));
      if (onSave && answers.length) list.push(button(saved ? '결과를 저장했어요' : '결과를 다음 장으로 저장', save));
      list.push(button('다시 풀기', again));
    }
    actions.replaceChildren(...list);
    const saveBtn = [...actions.children].find((b) => b.textContent.startsWith('결과'));
    if (saveBtn) saveBtn.disabled = saved || busy;
    if (shown && !status.textContent) status.textContent = answers.length ? `${tally.total}명 중 ${tally.correct}명 맞혔어요(${tally.rate}%).` : '정답을 열었어요. 다음 장은 → 또는 다음 단추로 가요.';
  }
  function tick() {
    if (phase !== 'open' || destroyed) return;
    if (!quiz.seconds) { clock.textContent = ''; return; }
    const left = Math.max(0, openedAt + quiz.seconds * 1000 - now());
    clock.textContent = `${Math.ceil(left / 1000)}`;
    fill.style.transform = `scaleX(${left / (quiz.seconds * 1000)})`;
    if (left <= 0) { reveal(); return; }
    timer = setTimeout(tick, 200);
  }
  async function connect() {
    try { await live.connect(); } catch (error) { status.textContent = String(error?.message || '학생 휴대폰을 잇지 못했어요.').slice(0, 200); }
    if (destroyed) return;
    status.textContent = linked() ? '학생은 발표 화면의 QR 을 찍어 들어와요. 다 들어오면 시작해요.' : status.textContent;
    tell(); paint();
  }
  function open() {
    if (phase !== 'ready') return;
    run += 1; answers = []; results = null; saved = false; status.textContent = '';
    phase = 'open'; openedAt = now(); clock.textContent = quiz.seconds ? String(quiz.seconds) : '';
    fill.style.transform = 'scaleX(1)';
    tell(); paint(); tick();
  }
  function reveal() {
    if (phase !== 'open') return;
    clearTimeout(timer); phase = 'shown'; clock.textContent = '';
    results = board && answers.length ? board.score(quiz, answers) : null;
    status.textContent = '';
    tell(); paint();
  }
  function showRanking() { if (phase === 'shown') { phase = 'ranking'; tell(); paint(); } }
  function again() { clearTimeout(timer); phase = 'ready'; answers = []; results = null; status.textContent = ''; clock.textContent = ''; tell(); paint(); }
  async function save() {
    if (saved || busy || !onSave || !answers.length) return;
    busy = true; paint(); status.textContent = '결과 장을 저장하고 있어요…';
    try { await onSave(quizResultPage(quiz, answers, aspect, { ranking: board ? board.ranking() : [] })); saved = true; if (!destroyed) status.textContent = '결과를 다음 장에 저장했어요.'; }
    catch (error) { if (!destroyed) status.textContent = String(error?.message || '결과 장을 저장하지 못했어요.').slice(0, 200); }
    finally { busy = false; if (!destroyed) paint(); }
  }
  if (live?.listen) unlisten = live.listen((msg) => {
    if (destroyed || msg?.id !== id() || !Array.isArray(msg.answers) || phase !== 'open') return;
    answers = msg.answers.filter((a) => typeof a?.from === 'string' && Number.isInteger(a.choice) && a.choice >= 0 && a.choice < quiz.choices.length);
    paint();
  });
  body.addEventListener('click', (e) => e.stopPropagation(), { signal });
  tell(); paint();
  return {
    // 발표의 "다음"(→ · 스페이스 · 클리커 · 휴대폰 리모컨): 시작 → 정답 공개 → 순위 → (그다음은 다음 장)
    step() {
      if (busy) return true;
      if (phase === 'ready') { open(); return true; }
      if (phase === 'open') { reveal(); return true; }
      if (phase === 'shown' && board && answers.length) { showRanking(); return true; }
      return false;
    },
    // 학생 휴대폰이 나중에 이어졌을 때 지금 상태를 다시 알린다
    refresh() { tell(); paint(); },
    destroy() { destroyed = true; clearTimeout(timer); unlisten?.(); try { live?.send?.(null); } catch { /* 이미 닫힌 통로 */ } abort.abort(); body.remove(); },
  };
}

/** 가이X 답(글) → 퀴즈 목록(app.js 가 appMaker.generate 의 답을 넘긴다). */
export { quizzesFromAnswer };
