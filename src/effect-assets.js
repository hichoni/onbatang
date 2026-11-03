// Each asset draws its own transparent SVG at rest. The small set of animation
// primitives is shared by the picker, the presentation and the offline lesson.
import { kineticTitle, chartFocus, titleExample, chartExample, sceneContent, beatIntro, spotlightTitle, rollingNumber, introBpm, introExample } from './effect-scenes.js';
import { REVEALS } from './reveal-scenes.js';
import { CLASSROOM_ACCENTS } from './classroom-accents.js';
import { OBSERVATION_ACCENTS } from './observation-accents.js';
import { CLUE_CARD, clueOptions } from './clue-card.js';
import { reducedMotion } from './motion-preference.js';
import { cleanMotionCues } from './motion-cues.js';

const NS = 'http://www.w3.org/2000/svg';
function svg(tag, attributes) {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  return node;
}

function prism({ part, ink }) {
  const facets = [
    ['-94,38 -24,1 28,-2 -46,26', ink[0]],
    ['-65,39 12,-3 64,-17 -15,23', ink[1]],
    ['-18,14 53,-25 97,-34 28,2', ink[2]],
    ['-74,48 -8,15 25,8 -41,36', ink[2]],
    ['20,0 62,-29 86,-33 49,-11', ink[0]],
  ];
  facets.forEach(([points, fill], i) => part('polygon', { points, fill }, [
    { transform: 'translate(-44px,22px) scaleX(.25)', opacity: 0 },
    { transform: 'translate(0,0) scaleX(1)', opacity: .92, offset: .48 },
    { transform: 'translate(38px,-20px) scaleX(.6)', opacity: 0 },
  ], 75 * i, 850));
}

function orbit({ part, ink }) {
  for (let i = 0; i < 3; i++) {
    const radius = 40 + i * 11;
    part('circle', { r: radius, fill: 'none', stroke: ink[i], 'stroke-width': 3 - i * .65,
      pathLength: 100, 'stroke-dasharray': i === 1 ? '1 4' : '23 4 9 14', 'stroke-linecap': 'round' }, [
      { transform: 'scale(1.4) rotate(-85deg)', opacity: 0 },
      { transform: 'scale(1) rotate(0deg)', opacity: 1, offset: .48 },
      { transform: 'scale(.85) rotate(64deg)', opacity: 0 },
    ], i * 90, 1120);
  }
  for (const [cx, cy] of [[-48, -36], [48, 36]]) {
    part('circle', { cx, cy, r: 3.4, fill: ink[1] });
  }
}

function signal({ part, ink }) {
  const routes = [
    ['M-93 27 H-57 L-37 7 H-8 L9 -10 H57 L74 -27 H92', 92, -27],
    ['M-82 43 H-52 L-29 20 H12 L30 2 H73', 73, 2],
    ['M-78 3 H-49 L-31 -15 H-7 L13 -35 H49', 49, -35],
  ];
  routes.forEach(([d, cx, cy], i) => {
    part('path', { d, fill: 'none', stroke: ink[i], 'stroke-width': i ? 2 : 3.6,
      pathLength: 1, 'stroke-dasharray': '1 1', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
      { strokeDashoffset: 1, opacity: 0 }, { strokeDashoffset: 0, opacity: 1, offset: .64 },
      { strokeDashoffset: 0, opacity: 0 },
    ], i * 105, 1080);
    part('circle', { cx, cy, r: 3.5, fill: ink[i] }, [
      { opacity: 0 }, { opacity: 1, offset: .36 }, { opacity: 0 },
    ], 510 + i * 105, 440);
  });
}

function confetti({ part, ink }) {
  for (let i = 0; i < 18; i++) {
    const angle = i * 2.39996, radius = 36 + (i % 5) * 8;
    const x = Math.cos(angle) * radius, y = Math.sin(angle) * radius * .72;
    const mark = i % 3 === 0 ? ['circle', { cx: x, cy: y, r: 2.9 }]
      : ['path', { d: i % 3 === 1 ? 'M0 -5 Q2 -1 5 0 Q2 1 0 5 Q-1 1 -5 0 Q-1 -1 0 -5Z' : 'M-2 -5 L2 -4 L1 5 L-2 4Z',
          transform: `translate(${x} ${y}) rotate(${i * 23})` }];
    // Animate a parent group so the confetti's own orientation stays intact.
    part(mark[0], { ...mark[1], fill: ink[i % 3] }, [
      { transform: 'translateY(0px) scale(.12)', opacity: 0 },
      { transform: 'translateY(0px) scale(.82)', opacity: 1, offset: .35 },
      { transform: 'translateY(12px) scale(1.2)', opacity: 0 },
    ], (i % 4) * 46, 880 + i % 3 * 110);
  }
}

function underline({part,ink}) {
  for (const [i,d] of ['M-91 42 Q-23 30 90 37','M-83 47 Q3 38 75 41'].entries()) {
    part('path',{d,fill:'none',stroke:ink[i],'stroke-width':i?2:6,'stroke-linecap':'round',
      pathLength:1,'stroke-dasharray':'1 1'},[
      {strokeDashoffset:1,opacity:0},{strokeDashoffset:0,opacity:1,offset:.52},{strokeDashoffset:0,opacity:1,offset:.85},{opacity:0},
    ],i*130,1110);
  }
}
function constellation({part,ink}) {
  const points=[[-77,20],[-48,-14],[-17,6],[14,-33],[44,-4],[76,-19]];
  points.forEach(([x,y],i)=>{
    if (i) part('path',{d:'M'+points[i-1].join(' ')+'L'+x+' '+y,fill:'none',stroke:ink[1],
      'stroke-width':1.6,pathLength:1,'stroke-dasharray':'1 1'},[{strokeDashoffset:1},{strokeDashoffset:0}],(i-1)*125,370);
    part('circle',{cx:x,cy:y,r:i===3?4.7:3,fill:ink[i%3]},[{opacity:0},{opacity:1}],i*125,210);
    if(i===0||i===3||i===5)part('circle',{cx:x,cy:y,r:8,stroke:ink[0],'stroke-width':1,fill:'none'},
      [{opacity:0},{opacity:.85,offset:.45},{opacity:0}],i*125,700);
  });
}

export const EFFECT_PALETTES = Object.freeze({
  lagoon:['#72f4d3','#66baff','#d3f7ac'], sunset:['#ffd678','#ff9480','#ffade2'], iris:['#b7a6ff','#ffb3e0','#79e5ff'],
});
export const paceFactor = pace => pace === 'slow' ? 1.55 : pace === 'fast' ? 0.7 : 1;
export const EFFECT_ASSETS = Object.freeze([
  { id: 'prism', name: '프리즘 리본', hint: '빛 띠가 대각선으로 스쳐 가요', ink: ['#9071ff', '#53e6ff', '#ff86bc'], draw: prism },
  {id:'beatintro', name:'박자 오프닝', hint:'글의 첫 72자를 세 구절까지 나눠 한 박자씩 올려요. 줄바꿈으로 구절을 정해요.', ink:EFFECT_PALETTES.lagoon, draw:beatIntro, example:introExample},
  {id:'spotlighttitle', name:'스포트라이트 타이틀', hint:'빛이 왼쪽에서 오른쪽으로 지나며 글의 첫 72자를 밝혀요.', ink:EFFECT_PALETTES.sunset, draw:spotlightTitle, example:titleExample},
  {id:'rollingnumber', name:'롤링 숫자', hint:'글 속 첫 수치가 자릿수별로 올라와 멈춰요. 부호·소수점·퍼센트를 함께 보여줘요.', requires:'숫자가 있는 글 전용 (최대 8자리)', ink:EFFECT_PALETTES.sunset, draw:rollingNumber, example:{t:'text',text:'발아율 82.5%'}},
  { id: 'orbit', name: '포커스 링', hint: '세 겹의 렌즈가 한 곳에 초점을 맞춰요', ink: ['#ffac45', '#fcea97', '#ff685a'], draw: orbit },
  { id: 'signal', name: '회로 신호', hint: '선을 따라 빛이 차례로 도착해요', ink: ['#35e3b8', '#73bdff', '#ab9bff'], draw: signal },
  { id: 'confetti', name: '별빛 파티클', hint: '별과 색종이가 피어올라 흩어져요', ink: ['#ffd44f', '#ff6197', '#54d9db'], draw: confetti },
  { id:'underline', name:'빛 밑줄', hint:'빛나는 두 획이 왼쪽에서 오른쪽으로 그어져요', ink:['#ffd55e','#ff915b','#fff8c6'], draw:underline },
  { id:'constellation', name:'별자리 연결', hint:'별을 하나씩 이어 개념 사이의 흐름을 보여줘요', ink:['#a8ddff','#a7a3ff','#ffbe88'], draw:constellation },
  { id:'kinetic', name:'키네틱 타이틀', hint:'선택한 글의 첫 72자를 큰 무대에서 낱말 차례로 보여줘요', ink:EFFECT_PALETTES.lagoon, draw:kineticTitle, example:titleExample },
  { id:'bars', name:'데이터 포커스', hint:'선택한 막대 차트의 항목과 수치가 큰 무대에서 차례로 자라요', ink:EFFECT_PALETTES.iris, draw:chartFocus, example:chartExample },
  ...REVEALS.map((asset,i)=>({...asset,ink:[EFFECT_PALETTES.lagoon,EFFECT_PALETTES.sunset,EFFECT_PALETTES.iris][i]})),
  ...CLASSROOM_ACCENTS,
  ...OBSERVATION_ACCENTS,
  {...CLUE_CARD,ink:EFFECT_PALETTES.lagoon},
]);
const registry = new Map(EFFECT_ASSETS.map(asset => [asset.id, asset]));
export const questionEffect = effect => !!registry.get(effect?.id)?.last;
export const effectable = item => ['text','shape','image','art','emoji','chart','math'].includes(item?.t);
export function cleanEffect(raw, item) {
  const asset=registry.get(raw?.id);
  if (!asset || (item && asset.example && !sceneContent(asset.id,item))) return null;
  const note = typeof raw.note === 'string' ? Array.from(raw.note.trim()).slice(0, 120).join('') : '';
  const observe = !asset.last && raw.observe === true;
  const stops = observe ? cleanMotionCues(raw.stops) : [];
  return { id: raw.id, when: !observe && (!asset.last || asset.id==='cluecard') && raw.when === 'open' ? 'open' : 'press', ...(note ? { note } : {}),
    ...(asset.id==='beatintro' ? {bpm:introBpm(raw.bpm)} : {}),
    ...(observe ? {observe:true} : {}),
    ...(stops.length ? {stops} : {}),
    ...(asset.id==='cluecard' ? clueOptions(raw) : {}),
    ...(asset.id!=='beatintro' && ['slow','fast'].includes(raw.pace) ? {pace:raw.pace} : {}),
    ...(typeof raw.palette==='string' && Object.hasOwn(EFFECT_PALETTES,raw.palette) ? {palette:raw.palette} : {}) };
}

function drawArt(id, animate, {pace,palette,content,step=0,photo,playOnce=false,...settings} = {}, container, animations, collect) {
  const asset = registry.get(id);
  if (!asset) return null;
  const art = svg('svg', { viewBox: asset.example?'0 0 720 360':'-100 -70 200 140', 'aria-hidden': 'true', focusable: 'false' });
  art.style.cssText = 'width:100%;height:100%;display:block;overflow:visible;pointer-events:none';
  if (container) container.replaceChildren(art);
  const running = animate && (playOnce || !reducedMotion(container));
  function part(tag, attrs, frames, delay = 0, duration = 1050, parent = art) {
    const node=svg(tag,attrs);
    // A clipPath needs a direct graphics child. Animate its shape in place.
    const target=parent.localName==='clipPath'?node:svg('g',{});
    if(target!==node)target.append(node);
    parent.append(target);
    if (frames && collect) collect(target, frames, delay*paceFactor(pace), duration*paceFactor(pace));
    if (running && frames && target.animate) {
      const animation = target.animate(frames, {
        duration:duration*paceFactor(pace), delay:delay*paceFactor(pace), fill:'both', easing:'cubic-bezier(.22,.68,.32,1)',
      });
      animations?.push(animation);
    }
    return node;
  }
  const data=asset.example && (sceneContent(id,content) || asset.example);
  if(id==='lens' && !photo && content?.t==='image' && content.url) {
    photo={...content,width:content.w || 4,height:(content.h || 3) / (content.aspect || 1)};
  }
  const options=id==='cluecard'?clueOptions(settings):id==='beatintro'?{bpm:introBpm(settings.bpm)}:{};
  asset.draw({ part, ink:typeof palette==='string' && Object.hasOwn(EFFECT_PALETTES,palette)?EFFECT_PALETTES[palette]:asset.ink,
    content:data,step:asset.last?Math.max(0,Math.min(asset.last(data,options),Math.trunc(step)||0)):0,photo,options });
  if(asset.last){
    art.removeAttribute('aria-hidden');art.setAttribute('role','img');
    art.setAttribute('aria-label',[...art.querySelectorAll('text')].map(n=>n.textContent).join(' · '));
  }
  return art;
}

export function effectArt(id, animate = false, options, collect) {
  return drawArt(id,animate,options,null,null,collect);
}

export function playEffectArt(container,id,options) {
  return drawArt(id,true,options,container);
}

// Wait for the animations we actually started. Some engines return an empty
// subtree animation list before the first paint, even when the groups are moving.
export function previewEffect(container, id, animate = true, options) {
  const animations=[];
  const art = drawArt(id,animate,options,container,animations);
  if (animations.length) Promise.allSettled(animations.map(animation => animation.finished))
    .then(() => { if (container.firstChild === art) container.replaceChildren(effectArt(id,false,options)); });
}
