// 한바탕 장의 화면: 편집기의 "한바탕 넣기" 칸(새로 만들기 · 만든 한바탕 고르기)과 발표 화면의 실시간 판.
// 판 · 서버 · 로그인은 호스트(GBE-AI Lab)의 wallAction 이 맡는다. 이 파일에는 서버 주소 · 자격 정보가 없다.
//   wallAction: { create({title, approval}) → {id,title,code}, list() → [{id,title,code,open,posts,pending,createdAt}],
//                 mount(root, {id,title,code}) → {destroy()} }
import { el } from '../src/dom.js';
import { cleanWallActivity, newWallActivity, formatWallCode, WALL_ADDRESS, WALL_TITLE_MAX } from '../src/wall.js';

/** 한바탕 넣기 · 바꾸기 칸. onApply(activity) 가 지금 장 다음에 넣는다(고칠 때는 그 장을 바꾼다). */
export function createWallSetup({ wallAction, activity: raw = null, defaultTitle = '', onApply, onCancel } = {}) {
  const editing = !!raw, current = raw ? cleanWallActivity(raw) : null;
  let busy = false;
  const status = el('p', { class: 'quiz-setup-status', role: 'status', 'aria-live': 'polite' });
  const lock = (on) => { busy = on; form.querySelectorAll('input,button').forEach((n) => { if (!n.dataset.wallKeep) n.disabled = on; }); };
  const run = async (job, doing) => {
    if (busy) return;
    lock(true); status.textContent = doing;
    try { await job(); }
    catch (error) { status.textContent = error?.message || '다시 시도해 주세요.'; }
    finally { lock(false); }
  };
  const title = el('input', { type: 'text', maxlength: WALL_TITLE_MAX, value: defaultTitle, placeholder: '예) 오늘 만든 것 나누기', 'aria-label': '한바탕 제목', dataset: { wallTitle: '' } });
  const approval = el('input', { type: 'checkbox', checked: true, dataset: { wallApproval: '' } });
  const create = el('button', { type: 'submit', class: 'btn primary', text: editing ? '새 한바탕으로 바꾸기' : '한바탕 만들어 넣기', dataset: { wallCreate: '' } });
  const list = el('ul', { class: 'wall-setup-list', 'aria-label': '내가 만든 한바탕' });
  const listNote = el('p', { class: 'quiz-setup-lead', text: '불러오는 중…' });
  const apply = (wall) => run(async () => { await onApply(newWallActivity(wall)); }, '한바탕 장을 넣고 있어요…');
  const form = el('form', { class: 'quiz-setup wall-setup', 'aria-label': editing ? '한바탕 바꾸기' : '한바탕 넣기' },
    el('h2', { text: editing ? '한바탕 바꾸기' : '한바탕 넣기' }),
    el('p', { class: 'quiz-setup-lead', text: `발표 화면에 ${WALL_ADDRESS} 와 숫자 6자리 코드가 크게 보여요. 참여자는 노트북 · 휴대폰으로 로그인 없이 들어와 별명으로 조각(글 · 링크 · 사진)을 붙이고, 그 판이 이 장에 실시간으로 보여요.` }),
    editing ? el('p', { class: 'quiz-setup-lead', text: `지금 한바탕: ${current.title} · 코드 ${formatWallCode(current.code)}` }) : null,
    el('label', { class: 'quiz-setup-field' }, '새 한바탕 제목', title),
    el('label', { class: 'quiz-setup-check' }, approval, ' 선생님이 확인한 조각만 보이기(장난 글이 바로 뜨지 않아요)'),
    el('div', { class: 'quiz-setup-actions' },
      el('button', { type: 'button', class: 'btn', text: '취소', dataset: { wallKeep: '' }, onclick: () => { if (!busy) onCancel?.(); } }),
      create),
    el('div', { class: 'quiz-setup-or' }, el('h3', { text: '만든 한바탕 다시 쓰기' }), listNote, list),
    status);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const name = title.value.replace(/\s+/g, ' ').trim();
    if (!name) { status.textContent = '한바탕 제목을 적어 주세요.'; title.focus(); return; }
    run(async () => { const wall = await wallAction.create({ title: name, approval: approval.checked }); await onApply(newWallActivity(wall)); }, '한바탕을 만들고 있어요…');
  });
  Promise.resolve().then(() => wallAction.list()).then((walls) => {
    const rows = (Array.isArray(walls) ? walls : []).filter((w) => !current || w.id !== current.wall).slice(0, 30);
    listNote.textContent = rows.length ? '고르면 그 한바탕(조각 · 코드 그대로)을 이 장에 넣어요.' : '아직 만든 한바탕이 없어요.';
    list.replaceChildren(...rows.map((w) => el('li', {},
      el('button', { type: 'button', class: 'btn wall-setup-pick', dataset: { wallPick: w.id }, onclick: () => apply(w) },
        el('strong', { text: w.title }), el('span', { text: ` · 코드 ${formatWallCode(w.code)} · 조각 ${w.posts ?? 0}${w.pending ? ` · 확인 대기 ${w.pending}` : ''}${w.open ? '' : ' · 참여 닫힘'}` })))));
  }).catch(() => { listNote.textContent = '만든 한바탕 목록을 불러오지 못했어요.'; });
  queueMicrotask(() => title.focus({ preventScroll: true }));
  return form;
}

/**
 * 발표 화면: 호스트가 그 자리에 실시간 판을 그린다. 판을 그리지 못하면 주소 · 코드만 크게 보인다(참여는 그대로 된다).
 * 돌려주는 것: { destroy() } (app.js 의 활동 손잡이와 같은 모양)
 */
export function mountWall(root, { activity: raw, wallAction }) {
  const wall = cleanWallActivity(raw);
  let handle = null, gone = false;
  const fallback = (message) => root.replaceChildren(el('div', { class: 'wall-show-fallback' },
    el('p', { class: 'wall-show-kicker', text: '한바탕' }), el('h2', { text: wall.title }),
    el('p', { class: 'wall-show-join' }, el('span', { text: WALL_ADDRESS }), el('strong', { text: formatWallCode(wall.code) })),
    message ? el('p', { class: 'wall-show-note', text: message }) : null));
  fallback('한바탕을 여는 중이에요…');
  Promise.resolve().then(() => wallAction.mount(root, { id: wall.wall, title: wall.title, code: wall.code }))
    .then((h) => { if (gone) h?.destroy?.(); else handle = h; })
    .catch((error) => { console.warn(error); if (!gone) fallback(error?.message || '한바탕을 열지 못했어요. 참여는 위 주소와 코드로 그대로 할 수 있어요.'); });
  return { destroy() { gone = true; try { handle?.destroy?.(); } catch (error) { console.warn(error); } handle = null; root.replaceChildren(); } };
}
