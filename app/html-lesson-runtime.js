import { cleanPixelActivity } from '../src/pixel-art.js';
import { cleanActivity } from '../src/activity.js';
import { cleanGaiResult } from '../src/gai-app.js';
import { isId, newId, slideNotes, slideTopic } from '../src/document.js';
import { mountPixelArt } from './pixel-art.js';
import { mountGaiApp } from './gai-app.js';
import { el } from '../src/dom.js';
import { createShowTools } from './show-tools.js';
import {cleanLessonTarget,cleanLessonBinding,returnedResultsFromLesson} from './lesson-results.js';

const png = value => typeof value === 'string' && /^data:image\/png;base64,[A-Za-z\d+/=]+$/.test(value) && value.length <= 4_000_000;
export const safeLessonJson = value => JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
export function cleanHtmlLesson(raw) {
  if (!raw || raw.version !== 1 || !isId(raw.id) || typeof raw.title !== 'string' || !raw.title.trim() || raw.title.length > 160 || !Array.isArray(raw.pages) || !raw.pages.length || raw.pages.length > 500) throw new Error('수업 파일의 형식을 확인해 주세요.');
  const seen = new Set(); let bytes = 0;
  const pages = raw.pages.map(page => {
    if (!page || !isId(page.id) || seen.has(page.id) || !png(page.image) || !Number.isFinite(page.aspect) || page.aspect < .25 || page.aspect > 4) throw new Error('수업 슬라이드를 확인해 주세요.');
    seen.add(page.id); bytes += page.image.length;
    if (bytes > 200_000_000) throw new Error('수업 파일이 너무 커요. 그림 크기를 줄여 다시 내려받아 주세요.');
    const out = { id: page.id, image: page.image, aspect: page.aspect, ...slideNotes(page), ...slideTopic(page) };
    if (out.notes) bytes += out.notes.length * 3;
    if (page.activity !== undefined) { out.activity = cleanActivity(page.activity); bytes += new TextEncoder().encode(JSON.stringify(out.activity)).length; }
    if(page.binding!==undefined){out.binding=cleanLessonBinding(page.binding);if(out.activity&&(out.binding.pageId!==out.id||out.binding.activityId!==out.activity.id||out.binding.kind!==out.activity.kind))throw Error('활동의 원본 연결 정보가 달라요.');}
    if (bytes > 200_000_000) throw new Error('수업 파일이 너무 커요. 그림 크기를 줄여 다시 내려받아 주세요.');
    if (page.result === true) {
      out.result = true;
      if(page.resultData!==undefined){out.resultData=cleanGaiResult(page.resultData);bytes+=new TextEncoder().encode(JSON.stringify(out.resultData)).length;}
    }
    if(bytes>200_000_000)throw new Error('수업 파일이 너무 커요. 그림 크기를 줄여 다시 내려받아 주세요.');
    return out;
  });
  return { version: 1, id: raw.id, title: raw.title, updatedAt: Number.isSafeInteger(raw.updatedAt) && raw.updatedAt >= 0 ? raw.updatedAt : 0, pages,...(raw.target===undefined?{}:{target:cleanLessonTarget(raw.target)}) };
}

export function mountHtmlLesson(raw, host = document.getElementById('onbatang-lesson')) {
  const seed = cleanHtmlLesson(raw), storageKey = `onbatang-html-lesson-v1:${seed.id}`;
  let pages = seed.pages, current = 0, app = null, executing = false, persistent = true, storageNotice = '', update = seed.updatedAt;
  const savedResults = new Map();
  const originalIds = seed.pages.filter(p => !p.result).map(p => p.id).join(',');
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (stored?.version === 1 && stored.originalIds === originalIds && Number.isSafeInteger(stored.updatedAt) && stored.updatedAt >= seed.updatedAt && Array.isArray(stored.order) && Array.isArray(stored.results)) {
      const originals = new Map(seed.pages.filter(p => !p.result).map(p => [p.id, p]));
      for (const result of cleanHtmlLesson({ ...seed, pages: stored.results.length ? stored.results : seed.pages.slice(0, 1) }).pages) if (result.result && !originals.has(result.id)) originals.set(result.id, result);
      if (stored.order.length !== originals.size || new Set(stored.order).size !== originals.size || stored.order.some(id => !originals.has(id))) throw new Error('저장된 순서가 달라요.');
      pages = stored.order.map(id => {
        const page = originals.get(id), cells = stored.cells?.[id], state = stored.states?.[id];
        if(page.activity?.kind==='pixel-art'&&cells!==undefined)return {...page,activity:cleanActivity({...page.activity,cells})};
        if(page.activity?.kind==='gai-app'&&state!==undefined)return {...page,activity:cleanActivity({...page.activity,state})};
        return page;
      });
      current = Math.max(0, pages.findIndex(p => p.id === stored.currentId)); update = stored.updatedAt;
      storageNotice = '이 브라우저에 저장한 활동과 결과를 다시 열었어요.';
    }
  } catch { persistent = false; storageNotice = '브라우저 저장을 사용할 수 없거나 이전 저장을 읽지 못했어요. 작업은 계속할 수 있어요. 결과는 현재 수업 내려받기로 보관해 주세요.'; }
  const title = el('h1', { text: seed.title }), count = el('span', { class: 'lesson-count' });
  const status = el('p', { class: 'lesson-status', role: 'status', text: storageNotice || '인터넷 없이 이 파일에서 수업할 수 있어요.' });
  const stage = el('main', { class: 'lesson-stage', tabindex: '-1' });
  const previous = el('button', { type: 'button', text: '이전', onclick: () => navigate(-1) });
  const next = el('button', { type: 'button', text: '다음', onclick: () => navigate(1) });
  const returnToCover = el('button', { type: 'button', text: '활동 화면 닫기', hidden: true, onclick: () => { app?.destroy(); app = null; executing = false; render(); } });
  const download = el('button', { type: 'button', text: '현재 수업 내려받기', class: 'lesson-download', onclick: () => {
    try {
      persist();
      const clone = document.documentElement.cloneNode(true);
      clone.querySelector('#onbatang-lesson').replaceChildren();
      clone.querySelector('#onbatang-lesson-data').textContent = safeLessonJson(cleanHtmlLesson({ ...seed, pages, updatedAt: update }));
      const blob = new Blob(['<!doctype html>\n', clone.outerHTML], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob), anchor = el('a', { href: url, download: `${seed.title.replace(/[\\/:*?"<>|]/g, '-').slice(0, 100)}-수업.html` });
      anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 60_000);
      status.textContent = '활동과 결과가 담긴 새 수업 파일을 내려받았어요. 처음 연 파일은 그대로예요.';
    } catch { status.textContent = '수업 파일을 만들지 못했어요. 작업은 이 화면에 남아 있어요. 다시 시도해 주세요.'; }
  } });
  const returnResults=el('button',{type:'button',text:'온바탕용 결과 내려받기',class:'lesson-download',onclick:()=>{
    try{
      const packet=returnedResultsFromLesson({...seed,pages});if(!packet.results.length){status.textContent='활동을 하고 결과를 다음 슬라이드에 저장한 뒤 내려받아주세요.';return;}
      const url=URL.createObjectURL(new Blob([JSON.stringify(packet)],{type:'application/json'})),anchor=el('a',{href:url,download:'onbatang-results.json'});anchor.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
      status.textContent='원래 온바탕 자료에서 「HTML 수업 결과 가져오기」를 누르고 이 JSON 파일을 선택해주세요.';
    }catch(error){status.textContent=error.message;}
  }});
  // 발표 모드: 온바탕 안의 발표와 같은 글쇠·도구(show-tools.js). 화면 가득 한 쪽씩, 누르면 다음 쪽.
  let show = null;
  const showCount = el('span', { class: 'lesson-show-count' });
  const showKey = (label, title, onClick) => el('button', { type: 'button', class: 'lesson-show-key', title, 'aria-label': title, onclick: event => { event.stopPropagation(); onClick(); } }, label);
  const showClose = showKey('활동 닫기', '활동 화면 닫기', () => returnToCover.click());
  const present = el('button', { type: 'button', class: 'lesson-download lesson-present', text: '▶ 발표 모드', title: '화면 가득 발표해요. 단축키는 ? 로 볼 수 있어요.', onclick: () => startShow() });
  host.replaceChildren(el('header', { class: 'lesson-header' }, el('div', {}, el('span', { class: 'lesson-brand', text: '온바탕 수업' }), title),el('div',{class:'lesson-downloads'},present,download,returnResults)),
    el('nav', { class: 'lesson-navigation', 'aria-label': '슬라이드 이동' }, previous, count, next, returnToCover), stage, status,
    el('footer', { class: 'lesson-footer', text: '활동과 결과는 이 브라우저에 저장돼요. 다른 기기에서는 현재 수업을 내려받아 여세요.' }));
  function persist() {
    update = Date.now();
    const cells = Object.fromEntries(pages.filter(p => p.activity?.kind==='pixel-art').map(p => [p.id, p.activity.cells]));
    const states = Object.fromEntries(pages.filter(p => p.activity?.kind==='gai-app').map(p => [p.id, p.activity.state]));
    try {
      localStorage.setItem(storageKey, JSON.stringify({ version: 1, originalIds, updatedAt: update, currentId: pages[current].id, order: pages.map(p => p.id), cells, states, results: pages.filter(p => p.result) }));
      if (!persistent) status.textContent = '이 브라우저에 활동과 결과를 저장했어요.';
      persistent = true;
    } catch { persistent = false; status.textContent = '브라우저에 저장하지 못했어요. 지금 작업은 그대로 있어요. 현재 수업 내려받기로 결과를 보관해 주세요.'; }
  }
  function navigate(step) { goTo(current + step); }
  function goTo(to) {
    if (to < 0 || to >= pages.length || to === current) return;
    app?.destroy(); app = null; executing = false; current = to; persist(); render();
  }
  const slideImage = k => el('img', { src: pages[k].image, alt: '' });
  function startShow() {
    if (show) return;
    host.classList.add('lesson-show');
    const tools = createShowTools(host, {
      total: () => pages.length, index: () => current, next: () => navigate(1), prev: () => navigate(-1), go: goTo, close: endShow,
      thumb: slideImage, preview: slideImage, ratio: k => pages[k].aspect,
      notes: k => pages[k].notes || '', topic: k => pages[k].topic || '', label: k => pages[k].activity ? '활동' : pages[k].result ? '결과' : '',
      title: seed.title, notify: message => { status.textContent = message; }, keyClass: 'lesson-show-key',
    });
    const bar = el('div', { class: 'lesson-show-bar' }, showKey('◀', '앞 쪽', () => navigate(-1)), showCount, showKey('▶', '다음 쪽', () => navigate(1)), showClose, ...tools.buttons, showKey('끝내기', '발표 끝내기 (Esc)', endShow));
    host.append(bar);
    show = { tools, bar, full: false };
    const mine = show;
    host.requestFullscreen?.().then(() => { mine.full = true; }).catch(() => {});
    render(); host.focus?.({ preventScroll: true });
  }
  function endShow() {
    if (!show) return;
    const { tools, bar } = show; show = null;
    tools.destroy(); bar.remove(); host.classList.remove('lesson-show');
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    render();
  }
  // 전체 화면이 풀리면 발표 모드를 끝낸다. 발표자 화면을 열어 풀린 것이면 창 안에서 이어 간다(F 로 다시 켠다).
  const onFull = () => {
    if (!show) return;
    if (document.fullscreenElement === host) { show.full = true; return; }
    if (document.fullscreenElement || !show.full) return;
    show.full = false;
    if (!show.tools.presenting() && !show.tools.camera()) endShow();
  };
  document.addEventListener('fullscreenchange', onFull);
  // 발표 모드에서 쪽(빈 곳)을 누르면 다음 쪽. 활동 화면과 단추를 누른 것은 그것들의 몫이다.
  host.addEventListener('click', event => {
    if (!show || event.target.closest('button,a,input,textarea,select,.lesson-activity,.lesson-show-bar')) return;
    if (show.tools.claimClick(event)) return;
    navigate(1);
  });
  // 앱 안을 누른 뒤에도 프레젠터의 넘기기 단추와 Esc 는 수업이 듣는다.
  const appKey = key => { if (show) show.tools.handle({ key, code: key }); else if (key === 'PageDown') navigate(1); else if (key === 'PageUp') navigate(-1); };
  function render() {
    previous.disabled = current === 0; next.disabled = current === pages.length - 1;
    const page = pages[current]; count.textContent = `${current + 1} / ${pages.length}쪽${page.activity ? ' · 활동' : page.result ? ' · 결과' : ''}`;
    showCount.textContent = `${current + 1} / ${pages.length}`;
    returnToCover.hidden = !executing; showClose.hidden = !executing;
    host.style.setProperty('--lesson-ratio', String(page.aspect));
    show?.tools.changed();
    if (executing) return;
    const scene = el('section', { class: 'lesson-scene' });
    scene.append(el('img', { class: 'lesson-slide', src: page.image, alt: `${current + 1}쪽${page.activity ? ` ${page.activity.title}` : page.result ? ' 활동 결과' : ''}` }));
    if (page.activity) scene.append(el('button', { type: 'button', class: 'lesson-start', text: '활동 시작', onclick: () => {
      executing = true; returnToCover.hidden = false;
      const target = el('section', { class: 'lesson-scene lesson-activity' }); stage.replaceChildren(target);
      if(page.activity.kind==='gai-app'){
        app=mountGaiApp(target,{activity:page.activity,onKey:appKey,onChange:state=>{page.activity=cleanActivity({...page.activity,state});persist();},onSave:async rawResult=>{
          const value=cleanGaiResult(rawResult);page.activity=cleanActivity({...page.activity,state:value.state});
          const signature=JSON.stringify([page.id,value]),existing=pages.findIndex(p=>p.id===savedResults.get(signature));
          if(existing>=0){app?.destroy();app=null;executing=false;current=existing;persist();render();return;}
          if(pages.length>=500)throw new Error('이 수업은 최대 500쪽까지 저장할 수 있어요. 앱의 진행 기록은 그대로 있어요.');
          const owner=app,result={id:newId('p'),result:true,image:await gaiResultImage(page.activity,value,page.aspect),aspect:page.aspect,resultData:value,...(page.binding?{binding:page.binding}:{})};
          if(app!==owner||pages[current]?.id!==page.id)throw new Error('활동 화면이 바뀌었어요. 앱을 다시 열어 결과 저장을 눌러주세요.');
          savedResults.set(signature,result.id);pages.splice(current+1,0,result);app?.destroy();app=null;executing=false;current++;persist();render();
          if(persistent)status.textContent=value.imageOmitted?'앱 화면 그림은 생략하고 답과 진행 상태를 다음 슬라이드에 저장했어요.':'앱 결과를 다음 슬라이드에 저장했어요.';
        }});
        return;
      }
      app = mountPixelArt(target, { activity: page.activity, onChange: cells => { page.activity = cleanPixelActivity({ ...page.activity, cells }); persist(); }, onSave: async cells => {
        page.activity = cleanPixelActivity({ ...page.activity, cells });
        const signature = JSON.stringify([page.id, page.activity.title, page.activity.palette, cells]);
        const existing = pages.findIndex(p => p.id === savedResults.get(signature));
        if (existing >= 0) {
          app?.destroy(); app = null; executing = false; current = existing; persist(); render();
          if (persistent) status.textContent = '같은 그림을 저장한 결과 슬라이드를 다시 열었어요.';
          return;
        }
        if (pages.length >= 500) throw new Error('이 수업은 최대 500쪽까지 저장할 수 있어요. 지금 그림은 그대로 있어요.');
        const result = { id: newId('p'), result: true, image: resultImage(page.activity, page.aspect), aspect: page.aspect,...(page.binding?{binding:page.binding}:{}) };
        savedResults.set(signature, result.id);
        pages.splice(current + 1, 0, result); app?.destroy(); app = null; executing = false; current++; persist(); render();
        if (persistent) status.textContent = '결과를 다음 슬라이드에 저장했어요. 현재 수업 내려받기로 다른 기기에 옮길 수 있어요.';
      } });
      target.querySelector('button')?.focus({ preventScroll: true });
    } }));
    stage.replaceChildren(scene);
  }
  const keys = event => {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
    // 앱·그림판 안에서 치는 글쇠는 앱의 것이다. 프레젠터의 넘기기(PageDown · PageUp)와 발표 모드의 Esc 만 수업이 듣는다.
    const clicker = ['PageDown', 'PageUp'].includes(event.key) || (show && event.key === 'Escape');
    if (event.target.closest('.pixel-app,.gai-app-runtime') && !clicker) return;
    if (show) {
      if (event.target.closest('button') && (event.key === 'Enter' || event.key === ' ')) return;
      if (show.tools.handle(event)) { event.preventDefault(); event.stopPropagation(); }
      return;
    }
    if (event.target.closest('button,input,textarea,select,[contenteditable=true]') && !clicker) return;
    if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === ' ') { event.preventDefault(); navigate(1); }
    else if (event.key === 'ArrowLeft' || event.key === 'PageUp') { event.preventDefault(); navigate(-1); }
    else if (event.key === 'Home') { event.preventDefault(); goTo(0); }
    else if (event.key === 'End') { event.preventDefault(); goTo(pages.length - 1); }
  };
  document.addEventListener('keydown', keys); render();
  return { getPages: () => pages, startShow, endShow, destroy() { endShow(); app?.destroy(); document.removeEventListener('keydown', keys); document.removeEventListener('fullscreenchange', onFull); host.replaceChildren(); } };
}

async function gaiResultImage(activity,result,aspect){
 const canvas=document.createElement('canvas');canvas.width=Math.round(aspect>=1?1280:1280*aspect);canvas.height=Math.round(canvas.width/aspect);
 const c=canvas.getContext('2d');if(!c)throw new Error('결과 그림을 만들 수 없어요.');
 c.fillStyle='#fffdf5';c.fillRect(0,0,canvas.width,canvas.height);c.fillStyle='#273f3a';c.textAlign='center';c.font=`bold ${Math.max(15,Math.min(38,canvas.width/20))}px sans-serif`;
 c.fillText(`${activity.title} · 결과`,canvas.width/2,canvas.height*.1,canvas.width*.9);
 let y=canvas.height*.28;
 if(result.image){const image=new Image();image.src=result.image;await image.decode();const scale=Math.min(canvas.width*.84/image.width,canvas.height*.5/image.height),w=image.width*scale,h=image.height*scale;c.drawImage(image,(canvas.width-w)/2,canvas.height*.18,w,h);y=canvas.height*.77;}
 const answer=result.answer||`진행 ${Math.round(result.progress)}%${result.completed?' · 완료':''}${result.score===null?'':` · 점수 ${result.score}`}`;
 const font=Math.max(12,Math.min(24,canvas.width/30));c.font=`${font}px sans-serif`;c.fillStyle='#273f3a';
 const lines=[];let line='';for(const char of answer){if(char==='\n'||c.measureText(line+char).width>canvas.width*.88){lines.push(line);line=char==='\n'?'':char;}else line+=char;}if(line)lines.push(line);
 const max=Math.max(1,Math.floor((canvas.height*.94-y)/(font*1.45)));
 lines.slice(0,max).forEach((value,i)=>c.fillText(i===max-1&&lines.length>max?value.slice(0,-1)+'…':value,canvas.width/2,y+i*font*1.45,canvas.width*.9));
 return canvas.toDataURL('image/png');
}

function resultImage(activity, aspect) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(aspect >= 1 ? 1280 : 1280 * aspect); canvas.height = Math.round(canvas.width / aspect);
  const c = canvas.getContext('2d'); if (!c) throw new Error('결과 그림을 만들 수 없어요.');
  c.fillStyle = '#fffdf5'; c.fillRect(0, 0, canvas.width, canvas.height);
  c.fillStyle = '#273f3a'; c.textAlign = 'center'; c.font = `bold ${Math.max(15, Math.min(38, canvas.width / 20))}px sans-serif`;
  c.fillText(`${activity.title} · 결과`, canvas.width / 2, canvas.height * .1, canvas.width * .9);
  const side = Math.min(canvas.width * .82, canvas.height * .68), left = (canvas.width - side) / 2, top = canvas.height * .53 - side / 2;
  c.fillStyle = '#ffffff'; c.fillRect(left, top, side, side);
  activity.cells.forEach((color, i) => { if (color < 0) return; c.fillStyle = activity.palette[color]; c.fillRect(left + i % activity.size * side / activity.size, top + Math.floor(i / activity.size) * side / activity.size, side / activity.size + .1, side / activity.size + .1); });
  c.font = `${Math.max(12, Math.min(22, canvas.width / 40))}px sans-serif`; c.fillStyle = '#526b60'; c.fillText('온바탕에서 만든 픽셀아트', canvas.width / 2, canvas.height * .95, canvas.width * .9);
  return canvas.toDataURL('image/png');
}

if (typeof document !== 'undefined' && document.getElementById('onbatang-lesson-data')) {
  try { mountHtmlLesson(JSON.parse(document.getElementById('onbatang-lesson-data').textContent)); }
  catch { document.getElementById('onbatang-lesson').textContent = '수업 파일을 열지 못했어요. 온바탕에서 다시 내려받아 주세요.'; }
}
