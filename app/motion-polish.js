// 움직임 자동 다듬기: 장의 '모양'만 보고 정할 수 있는 움직임을 지시(app/ai-edits.js 의 move · slide)로 만든다. AI를 쓰지 않는다.
// 삼척 연수 덱을 손으로 다듬으며 쓴 규칙(develop.mjs)을 옮긴 것이다. 내용을 읽어야 정할 수 있는 것(서류는 펼치기, 위기 장면은 펀치 …)은 AI-G가 맡는다.
// 화면을 모르는 순수 함수(DOM 없음). 설계: docs/ai-helper-2026-11-11.md §5.1
import { rolesOf, isDark } from './ai-edits.js';
import { cleanTopic } from '../src/document.js';

const said = (it) => String(it?.text ?? '').trim();
const within = (box, it) => Math.abs(it.x - box.x) <= box.w / 2 + 0.01 && Math.abs(it.y - box.y) <= box.h / 2 + 0.01;
const near = (a, b, d) => Math.abs(a - b) <= d;
const r1 = (v) => Math.round(v * 10) / 10;
// 큰 제목 하나가 주인공인 장(구역 표지처럼 쓴 장): 글이 둘까지이고 제목이 크며, 카드 · 사진 · 숫자 · 칩 · 화살표가 없다
const loneTitle = (items, roles, texts) => texts.length <= 2 && (items[roles.indexOf('title')]?.size ?? 0) >= 6 && !roles.some((r) => ['photo', 'card', 'number', 'chip', 'arrow'].includes(r));
/** 조각이 이보다 많은 장은 전환만 정한다(하나하나 움직이면 어지럽다). */
export const POLISH_BUSY = 40;

// 크기가 같은 판(카드)들이 한 줄 · 한 열로 3개 넘게 놓인 묶음을 찾는다 → [{ axis: 'x' | 'y', cards: [자리 번호 …] }]
function cardRuns(items, roles) {
  const cards = items.map((it, i) => ({ it, i })).filter((v) => roles[v.i] === 'card');
  const used = new Set(), out = [];
  for (const axis of ['x', 'y']) {
    const cross = axis === 'x' ? 'y' : 'x';
    for (const seed of cards) {
      if (used.has(seed.i)) continue;
      const group = cards.filter((v) => !used.has(v.i) && near(v.it[cross], seed.it[cross], 1.5)
        && near(v.it.w, seed.it.w, Math.max(0.8, seed.it.w * 0.06)) && near(v.it.h, seed.it.h, Math.max(0.8, seed.it.h * 0.06)));
      if (group.length < 3) continue;
      group.sort((a, b) => a.it[axis] - b.it[axis]);
      if (group.some((v, k) => k && near(v.it[axis], group[k - 1].it[axis], 0.5))) continue;   // 겹쳐 놓은 것(그림자와 판)은 줄이 아니다
      group.forEach((v) => used.add(v.i));
      out.push({ axis, cards: group.map((v) => v.i) });
    }
  }
  return out;
}

/**
 * 장들의 움직임을 다듬는 지시 목록을 만든다.
 * ctx: editContext(slides, picks, { limits: LOCAL_LIMITS }) · keep: 이미 정한 움직임(an · lp · tr)은 그대로 둔다.
 * 돌려주는 것: { say, ops }  (checkEdits · applyEdits 에 그대로 넣는다)
 */
export function polishMotion(slides, ctx, { keep = true } = {}) {
  const list = Array.isArray(slides) ? slides : [];
  const ops = [];
  // 주제는 시작하는 장에만 적혀 있을 수도, 장마다 적혀 있을 수도 있다: 앞 장까지의 주제와 달라지는 장이 '새 주제의 첫 장'이다
  let running = '';
  const starts = list.map((s) => { const t = cleanTopic(s?.topic); const fresh = !!t && t !== running; if (t) running = t; return fresh; });
  for (const index of ctx.picks) {
    const slide = list[index], items = Array.isArray(slide?.items) ? slide.items : [], roles = rolesOf(slide);
    const kind = slide?.activity?.kind || '';
    const texts = items.filter((it) => it.t === 'text' && said(it));
    // ---- 전환 ----
    let tr = '', trWhy = '';
    if (kind === 'quiz') { tr = 'flip'; trWhy = '퀴즈 장은 뒤집히며'; }
    else if (kind === 'wall') { tr = 'circle'; trWhy = '한바탕 장은 동그랗게'; }
    else if (roles.includes('section-number') || (starts[index] && index > 0 && loneTitle(items, roles, texts))) { tr = 'zoomblur'; trWhy = '구역 표지'; }
    else if (starts[index] && index > 0 && !isDark(slide)) { tr = 'pushup'; trWhy = '새 주제로 넘어가요'; }
    if (tr && slide.tr !== tr && !(keep && slide.tr)) ops.push({ op: 'slide', slide: ctx.keyOf(index), tr, why: trWhy });
    if (kind && kind !== 'wall') continue;                       // 퀴즈 · 앱 · 픽셀 활동 장의 조각은 활동이 그린다
    if (slide?.video || items.length > POLISH_BUSY) continue;

    const plan = new Map();                                       // 자리 번호 → { 정할 값 …, why }
    const free = (i, key) => !(keep && items[i][key] !== undefined) && !(plan.get(i) && Object.hasOwn(plan.get(i), key));
    const set = (i, props, why) => {
      if (!ctx.keyOf(index, i) || items[i].lock) return;
      const cur = plan.get(i) || {};
      let any = false;
      for (const [key, value] of Object.entries(props)) {
        if (key === 'dl' || !free(i, key) || items[i][key] === value) continue;
        cur[key] = value;
        any = true;
      }
      // 늦추기는 나타나기를 함께 정할 때에만 적는다(이미 정해 둔 차례를 흩뜨리지 않게)
      if (any && props.an !== undefined && cur.an === props.an && props.dl !== undefined && !(keep && items[i].dl)) cur.dl = r1(props.dl);
      if (any) { cur.why ||= why; plan.set(i, cur); }
    };
    const still = (i) => !items[i].aw;                            // 누를 때 나오는 조각은 계속 움직이게 하지 않는다
    const all = items.map((_, i) => i);

    // ---- 한바탕 장: 주소는 타자 치듯, 코드는 쿵 찍고 숨쉬기 ----
    if (kind === 'wall') {
      for (const i of all) {
        const it = items[i];
        if (it.t !== 'text') continue;
        if (it.size >= 5 && /[a-z0-9-]+\.[a-z]{2,}/i.test(said(it))) set(i, { an: 'type' }, '주소는 타자 치듯');
        else if (it.size >= 7 && /^\d{3} ?\d{3}$/.test(said(it))) set(i, { an: 'stomp', dl: 1.3, lp: 'breathe' }, '들어올 코드');
      }
    }
    // ---- 구역 표지의 큰 번호는 둥실둥실 ----
    for (const i of all) if (roles[i] === 'section-number') set(i, { lp: 'float' }, '구역 번호');
    // ---- 흐름을 잇는 화살표는 반짝반짝 ----
    const arrows = all.filter((i) => roles[i] === 'arrow' && still(i));
    if (arrows.length && arrows.length <= 6) for (const i of arrows) set(i, { lp: 'blink' }, '흐름 화살표');
    // ---- 동그라미 속 작은 아이콘은 숨쉬기(3 ~ 6개일 때만) ----
    const icons = all.filter((i) => roles[i] === 'icon' && still(i) && items[i].w <= 4.2);
    if (icons.length >= 3 && icons.length <= 6) for (const i of icons) set(i, { lp: 'breathe' }, '작은 아이콘');
    // ---- 표지 · 맺음: 뒤의 큰 원이 숨을 쉰다 ----
    if (index === 0 || index === list.length - 1) for (const i of all) if (items[i].t === 'shape' && items[i].shape === 'circle' && items[i].w >= 50) set(i, { lp: 'breathe' }, index ? '맺음의 큰 원' : '표지의 큰 원');

    // 조합 효과가 있는 장: 나타나는 차례는 조합 효과가 짠다(조각의 나타나기는 건드리지 않는다)
    if (!slide.pa) {
      // ---- 큰 숫자: 한 박자씩 쿵 ----
      const numbers = all.filter((i) => roles[i] === 'number').sort((a, b) => items[a].x - items[b].x || items[a].y - items[b].y);
      numbers.forEach((i, k) => {
        const d = 0.4 + k * 0.45;
        set(i, { an: 'stomp', dl: d }, '숫자는 쿵');
        if (plan.get(i)?.an !== 'stomp') return;
        all.filter((j) => j !== i && items[j].t === 'text' && near(items[j].x, items[i].x, 3) && items[j].size < 3 && !['title', 'kicker', 'closing'].includes(roles[j]))
          .forEach((j, n) => set(j, { an: 'fade', dl: d + 0.2 + n * 0.08 }, '숫자를 따라서'));
      });
      // ---- 나란한 카드 묶음: 왼쪽(위)부터 차례로, 카드 위의 번호 · 글은 제 카드 바로 뒤에 ----
      for (const run of cardRuns(items, roles)) {
        run.cards.forEach((c, k) => {
          const d = 0.3 + k * 0.28, box = items[c];
          set(c, { an: 'left', dl: d }, run.axis === 'x' ? '왼쪽부터 차례로' : '위에서부터 차례로');
          if (plan.get(c)?.an !== 'left') return;
          for (const j of all) {
            const it = items[j];
            if (j <= c || run.cards.includes(j) || it.t === 'link' || roles[j] === 'card' || !within(box, it)) continue;
            if (it.t === 'text') set(j, { an: 'fade', dl: d + (it.size >= 3 ? 0.1 : 0.18) }, '제 카드를 따라서');
            else set(j, { an: 'pop', dl: d + 0.1 }, '제 카드를 따라서');
          }
        });
      }
      // ---- 사진 줄: 사진과 그 틀을 함께, 왼쪽부터 차례로 · 큰 사진 한 장은 커지며 ----
      const photos = all.filter((i) => roles[i] === 'photo').sort((a, b) => items[a].x - items[b].x);
      const frameOf = (p) => all.find((i) => roles[i] === 'frame' && near(items[i].x, items[p].x, 0.6) && near(items[i].y, items[p].y, 0.6));
      const follow = (p, fallback) => {
        const f = frameOf(p);
        if (f === undefined) return;
        const an = plan.get(p)?.an ?? items[p].an ?? fallback, dl = plan.get(p)?.dl ?? items[p].dl;
        set(f, { an, ...(dl ? { dl } : {}) }, '사진의 틀');
      };
      const row = photos.filter((p) => photos.filter((q) => near(items[q].y, items[p].y, 3)).length >= 2);
      row.forEach((p, k) => { set(p, { an: 'left', dl: 0.3 + k * 0.25 }, '사진을 차례로'); follow(p, 'left'); });
      if (photos.length === 1 && (items[photos[0]].w * items[photos[0]].h) / 10000 >= 0.3) { set(photos[0], { an: 'zoom' }, '큰 사진'); follow(photos[0], 'zoom'); }
      // ---- 칩 줄: 톡톡 ----
      const chips = all.filter((i) => roles[i] === 'chip').sort((a, b) => items[a].y - items[b].y || items[a].x - items[b].x);
      if (chips.length >= 3) chips.forEach((i, k) => set(i, { an: 'pop', dl: k * 0.06 }, '칩은 톡톡'));
      // ---- 제목은 초점이 맞듯, 그 밑의 띠는 쓱 ----
      const title = roles.indexOf('title');
      if (title >= 0) {
        set(title, { an: 'blur' }, '제목');
        for (const i of all) if (roles[i] === 'bar' && items[i].w <= 22 && items[i].y > items[title].y && items[i].y - items[title].y <= 14) set(i, { an: 'wipe', dl: 0.2 }, '제목 밑 띠');
      }
    }
    for (const [i, props] of [...plan].sort((a, b) => a[0] - b[0])) {
      const { why, ...rest } = props;
      if (Object.keys(rest).length) ops.push({ op: 'move', item: ctx.keyOf(index, i), ...rest, why });
    }
  }
  return { say: ops.length ? '장의 모양을 보고 움직임을 입혔어요.' : '', ops };
}
