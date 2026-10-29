// 한 장의 효과가 아니라, 전체 → 집중 → 다음 주제 → 전체를 잇는 움직임 묶음.
// 기존 움직임 계약(tr/pa, an/lp/sp)만 사용한다. 발표·HTML 수업·영상은 같은 런타임으로 재생한다.
// 원본 자료에 적용할 때 내용/배치/이름표/출처는 건드리지 않고 새 값을 돌려준다.
import { newId } from '../src/document.js';

const STAGES = Object.freeze(['전체 보기', '첫 번째 주제', '두 번째 주제', '세 번째 주제', '다시 한눈에']);
export const MOTION_SETS = Object.freeze([
  { id: 'atlas', name: '이야기 지도', kicker: 'FIELD NOTES / 01', hint: '지형과 항로를 따라 익숙한 풍경 속 작은 발견을 찾아가요.', combo: 'fade', idle: 'breathe', colors: ['#f4f0e6', '#18221e', '#d4d7c3', '#e75c36'], topics: ['익숙한 풍경', '작은 발견', '새로운 길'], stages: STAGES },
  { id: 'orbit', name: '생각의 궤도', kicker: 'A QUESTION, A UNIVERSE', hint: '고정된 궤도를 따라 시선을 옮기며 질문의 우주를 넓혀요.', combo: 'ripple', idle: 'breathe', colors: ['#11172b', '#eff0ff', '#687196', '#daf076'], topics: ['하나의 질문', '다른 관점', '새로운 가능성'], stages: STAGES },
  { id: 'ribbon', name: '한 줄의 여정', kicker: 'SMALL STEPS, REAL CHANGE', hint: '300% 너비의 편집 디자인을 따라 발견·실험·확장으로 나아가요.', combo: 'cascade', idle: 'none', colors: ['#fafaf7', '#171918', '#d8dcd9', '#244bdb'], topics: ['발견', '실험', '확장'], stages: STAGES },
  { id: 'focus', name: '관찰의 렌즈', kicker: 'OBSERVATION / SPECIMEN 01', hint: '하나의 잎을 더 가까이 들여다보며 형태·차이·관계를 읽어요.', combo: 'cinema', idle: 'breathe', colors: ['#f1f2ee', '#1d2c29', '#b9c8b9', '#df5b3d'], topics: ['형태를 보다', '차이를 읽다', '관계를 찾다'], stages: STAGES },
  { id: 'stage', name: '주인공의 무대', kicker: 'THE MOMENT IS YOURS', hint: '조명과 한 사람의 실루엣을 따라 목소리가 무대가 되는 순간을 만들어요.', combo: 'kinetic', idle: 'breathe', colors: ['#171419', '#ffebcf', '#705638', '#e4b77b'], topics: ['목소리를 열다', '경험을 나누다', '서로를 바꾸다'], stages: STAGES },
  { id: 'breath', name: '숨 쉬는 연결', kicker: 'PAUSE / LISTEN / CONNECT', hint: '여백과 작은 점을 따라 잠깐 멈추고, 듣고, 다시 연결해요.', combo: 'fade', idle: 'breathe', colors: ['#f7f5ef', '#1e4c45', '#d7e1d4', '#b87850'], topics: ['잠깐 멈추기', '깊이 듣기', '다시 연결하기'], stages: STAGES },
].map(set => Object.freeze({ ...set, colors: Object.freeze(set.colors), topics: Object.freeze(set.topics) })));

const motionKeys = ['an', 'aw', 'em', 'ex', 'lp', 'sp', 'dl'];
const optionValues = (raw = {}) => ({
  speed: ['slow', 'fast'].includes(raw.speed) ? raw.speed : '',
  breathing: raw.breathing !== false,
  calm: raw.calm === true,
});
const findSet = id => {
  const set = MOTION_SETS.find(value => value.id === id);
  if (!set) throw new RangeError('움직임 묶음을 골라 주세요.');
  return set;
};

/** 기존 자료에 적용. 배열/각 장/요소는 새 객체이며, 모션 이외의 값과 순서·식별자는 그대로다. */
export function applyMotionSet(slides, id, options = {}) {
  const set = findSet(id), opts = optionValues(options);
  if (!Array.isArray(slides)) throw new TypeError('슬라이드 목록이 필요해요.');
  return slides.map(slide => {
    if (!slide || !Array.isArray(slide.items)) throw new TypeError('슬라이드 내용을 확인해 주세요.');
    let ornament = 0;
    const items = slide.items.map(item => {
      // 앱·연결선·영상·수식의 동작은 이 묶음으로 바꾸지 않는다.
      if (!item || !['text', 'shape', 'art', 'emoji', 'image'].includes(item.t)) return { ...item };
      const next = { ...item };
      motionKeys.forEach(key => delete next[key]);
      if (opts.calm) next.an = 'fade';
      next.lp = 'none';
      if (opts.speed) next.sp = opts.speed;
      // 읽어야 할 본문/사진 전체를 흔들지 않고 작은 그림 조각 최대 두 개만 살아 있게 한다.
      if (!opts.calm && opts.breathing && set.idle !== 'none'
        && !item.lock && ['shape', 'art', 'emoji'].includes(item.t) && Number(item.w) <= 8 && ornament++ < 2) next.lp = set.idle;
      return next;
    });
    return { ...slide, pa: opts.calm ? 'fade' : set.combo, tr: opts.calm ? 'fade' : 'move', items };
  });
}

// 공간은 100 × 56.25 너비 단위의 고정 장면이다. 모든 장에서 같은 장면에\n// 같은 카메라(확대 + 이동)를 적용한다. 조각마다 임의로 자리 바꾸기를 하지 않는다.
const H = 56.25;
const round = value => Math.round(value * 10000) / 10000;
const widthOf = text => [...text].reduce((n, char) => n + (/\s/.test(char) ? .32 : /[A-Za-z0-9.,:/-]/.test(char) ? .59 : 1), 0);
function scene() {
  const items = [];
  const shape = (key, kind, x, y, w, h, color, more = {}) => items.push({ key, t: 'shape', shape: kind, x, y, w, h, color, ...more });
  const text = (key, value, left, top, w, size, color, more = {}) => {
    const lines = value.split('\n'), fit = Math.min(size, w / Math.max(...lines.map(widthOf), 1) * .97);
    const h = lines.length * fit * 1.14;
    items.push({ key, t: 'text', text: value, x: left + w / 2, y: top + h / 2, w, h, size: fit, color, align: 'l', lh: 1.14, valign: 'top', hangingPunct: false, ...more });
  };
  const circle = (key, x, y, d, color, more = {}) => shape(key, 'circle', x, y, d, d, color, more);
  const ellipse = (key, x, y, w, h, color, more = {}) => shape(key, 'circle', x, y, w, h, color, more);
  const line = (key, ax, ay, bx, by, color, thick = .16, more = {}) =>
    shape(key, 'line', (ax + bx) / 2, (ay + by) / 2, Math.hypot(bx - ax, by - ay), thick, color, { rot: Math.atan2(by - ay, bx - ax) * 180 / Math.PI, ...more });
  return { items, shape, text, circle, ellipse, line };
}
const outline = (color, line = .14) => ({ line, lc: color, hollow: true });
const closeCamera = ([x, y], zoom = 1.8) => ({ x: x - 19 / zoom, y, z: zoom });

function mapScene(set, labels) {
  const s = scene(), p = set.colors;
  [[73,29,50,31],[74,29,40,24],[75,29,29,17]].forEach(([x,y,w,h],i) =>
    s.ellipse('contour' + i,x,y,w,h,p[2],{...outline(p[2],.18),rot:-18}));
  const points = [[53,37],[70,19],[87,37]];
  s.line('route-a',53,37,70,19,p[3],.6); s.line('route-b',70,19,87,37,p[3],.6);
  points.forEach(([x,y],i) => {
    s.circle('halo' + i,x,y,5,p[0],outline(p[3],.2));
    s.circle('place' + i,x,y,1.8,p[3],{ idle: i === 0 });
    s.text('place-name' + i,labels[i],x - 6,y + 4.5,16,2.6,p[1],{bold:true,annotation:true});
    s.text('place-no' + i,'0' + (i+1),x - 1.2,y - 7,8,1.5,p[3],{bold:true});
  });
  s.line('map-north',92,9,92,15,p[1],.14); s.shape('north', 'tri',92,8.5,1.4,2,p[1]);
  s.text('north-label','N',91.2,5,4,1.4,p[1]);
  return { ...s, cameras: [{x:50,y:H/2,z:1},...points.map(point=>closeCamera(point,1.85)),{x:50,y:H/2,z:1}],
    heads:['익숙한 곳,\n새로운 길.',labels[0],labels[1],labels[2],'발견은 길이,\n길은 이야기.'],
    bodies:['매일 지나던 풍경을\n조금 다른 눈으로 보는 여정.',
      '늘 걷던 길을 다시 봅니다.\n어떤 장면이 먼저 눈에 들어오나요?',
      '자세히 볼수록 보이는 것.\n한 가지 발견을 사진과 글로 남겨요.',
      '발견한 것을 연결해 봅니다.\n내일은 어떤 길을 걸어 볼까요?',
      '처음의 풍경과 지금의 풍경.\n우리의 시선은 어떻게 달라졌나요?'] };
}
function orbitScene(set, labels) {
  const s=scene(),p=set.colors, points=[[63,29],[82,17],[83,41]];
  [[68,29,48,29,-18],[68,29,38,21,18],[68,29,28,38,-12]].forEach(([x,y,w,h,rot],i)=>
    s.ellipse('orbit'+i,x,y,w,h,p[2],{...outline(p[2],.12),rot}));
  [[50,8],[85,8],[93,26],[55,46],[91,47],[42,38]].forEach(([x,y],i)=>s.circle('star'+i,x,y,i%2?.28:.45,'#bbc2ed',{op:i%2?55:90,idle:i===0}));
  s.circle('sun-glow',63,29,18,'#414875',{op:65});
  s.circle('sun',63,29,13,'#b3b9ff');
  s.circle('sun-mark',60.8,26.5,3,'#e2e4ff',{op:65});
  s.circle('moon',82,17,5,p[3]); s.circle('planet',83,41,7.5,'#9cbba9');
  s.ellipse('planet-ring',83,41,13,3,p[3],{...outline(p[3],.18),rot:-22});
  points.forEach(([x,y],i)=>s.text('planet-name'+i,labels[i],x-5,y+(i===0?10:7),20,2.4,p[1],{bold:true,annotation:true}));
  return {...s,cameras:[{x:50,y:H/2,z:1},...points.map(point=>closeCamera(point,1.65)),{x:50,y:H/2,z:1}],
    heads:['질문 하나,\n다른 우주.',labels[0],labels[1],labels[2],'질문 다음엔,\n새로운 궤도.'],
    bodies:['정답을 찾기 전에,\n더 넓은 질문을 함께 만듭니다.',
      '우리가 당연하게 생각한 것.\n왜 그런지 한 번 더 물어봅니다.',
      '같은 대상을 다른 자리에서 보면\n어떤 새로운 모습이 보일까요?',
      '다른 관점이 만나는 자리에서\n새로운 가능성이 태어납니다.',
      '세 가지 관점이 만났습니다.\n다음에는 무엇이 궁금한가요?']};
}
function ribbonScene(set,labels) {
  const s=scene(),p=set.colors,points=[20,100,180];
  // 세 선분은 한 트랙을 이룬다. 한 요소를 250%로 늘리지 않아 편집기의
  // 안전한 크기 한도 안에서도 카메라 확대와 선의 길이가 정확히 맞는다.
  [[-15,69],[69,153],[153,236]].forEach(([a,b],i)=>s.line('track'+i,a,44,b,44,p[2],.3));
  points.forEach((x,i)=>{
    s.line('tick'+i,x-23,42,x-23,47,p[3],.3);
    s.circle('step'+i,x-23,44,1.3,p[3]);
    s.text('act'+i,'ACT 0'+(i+1),x-23,4,30,1.8,p[3],{bold:true});
    s.text('number'+i,'0'+(i+1),x-27,8,35,24,p[1],{bold:true});
    s.text('topic'+i,labels[i],x+12,13,43,8,p[1],{bold:true});
    s.text('body'+i,[
      '작은 불편을 찾아요.\n좋은 변화는 관찰에서 시작됩니다.',
      '완벽한 계획보다 한 번의 시도.\n작게 만들어 직접 확인해요.',
      '나의 발견을 함께 나눠요.\n하나의 경험이 다음 변화가 됩니다.',
    ][i],x+12,28,42,2.8,p[1]);
  });
  return {...s,cameras:[{x:104,y:-4,z:.41},...points.map(x=>({x:x+12,y:H/2,z:1})),{x:104,y:-4,z:.41}],
    heads:['작은 시도,\n큰 변화.',labels[0],labels[1],labels[2],'세 번의 시도,\n하나의 변화.'],
    bodies:['발견하고, 시도하고, 나눕니다.','','','','우리의 다음 한 걸음은 무엇일까요?'], ownType:true};
}
function focusScene(set,labels) {
  const s=scene(),p=set.colors,points=[[61,18],[79,26],[68,41]];
  [[51.5,7.5,92.5,7.5],[92.5,7.5,92.5,48.5],[92.5,48.5,51.5,48.5],[51.5,48.5,51.5,7.5]].forEach(([a,b,c,d],i)=>s.line('sample-frame'+i,a,b,c,d,'#a8b5a7',.12));
  [57,67,77,87].forEach((x,i)=>s.line('grid-v'+i,x,8,x,48,'#d4dbd0',.09));
  [15,25,35,45].forEach((y,i)=>s.line('grid-h'+i,52,y,92,y,'#d4dbd0',.09));
  s.shape('leaf-body','leaf',71,27,23,32,'#6c8a68',{rot:29});
  s.shape('leaf-shadow','leaf',75,30,15,25,'#3e6851',{rot:29});
  s.line('stem',62,42,81,14,'#dbe4c9',.3);
  points.forEach(([x,y],i)=>{
    s.circle('observation'+i,x,y,4,p[3],outline(p[3],.18));
    s.line('cross'+i,x-3,y,x+3,y,p[3],.1);
    s.text('observation-label'+i,labels[i],x-7,y+4,19,2.4,p[1],{bold:true,annotation:true});
  });
  s.text('scale-label','10 mm',81,49,15,1.5,p[1]);
  s.line('scale',80,47.5,89,47.5,p[1],.15);
  return {...s,cameras:[{x:50,y:H/2,z:1},...points.map(point=>closeCamera(point,2.15)),{x:50,y:H/2,z:1}],
    heads:['가까이,\n다르게.',labels[0],labels[1],labels[2],'작은 관찰,\n깊은 이해.'],
    bodies:['하나의 잎 안에도\n서로 다른 이야기가 있습니다.',
      '전체의 모양에서 출발합니다.\n어떤 선과 면이 반복되나요?',
      '같아 보이는 부분을 비교해요.\n차이는 어디에서 시작될까요?',
      '부분과 부분을 연결해 봅니다.\n형태에는 어떤 이유가 있을까요?',
      '처음 보았던 잎을 다시 봅니다.\n이제 무엇을 설명할 수 있나요?']};
}
function stageScene(set,labels) {
  const s=scene(),p=set.colors;
  s.shape('beam','tri',74,26,35,43,'#8d6c42',{op:23,rot:180});
  s.ellipse('light-field',73,29,38,33,'#493528',{op:55});
  s.circle('light-outline',73,28,31,p[2],outline(p[2],.16));
  s.text('voice','VOICE',44,17,56,15,'#b8956c',{bold:true,op:16});
  s.ellipse('floor',74,45,32,2.2,p[3],{op:28});
  s.circle('head',73,23,5.2,p[1]);
  s.shape('body','round',73,34,11,15,p[1],{r:45});
  s.line('mic-stand',81,29,81,43,p[3],.26);
  s.line('mic',80,28,83,26.5,p[3],.65);
  [[53,10],[91,13],[91,43]].forEach(([x,y],i)=>s.circle('stage-spark'+i,x,y,.42,p[3],{idle:i===0}));
  return {...s,cameras:[{x:50,y:H/2,z:1},{x:58,y:26,z:1.25},{x:62,y:29,z:1.7},{x:57,y:34,z:1.25},{x:50,y:H/2,z:1}],
    heads:['당신의\n이야기가\n무대가 된다.',labels[0],labels[1],labels[2],'한 사람의 목소리,\n우리의 이야기.'],
    bodies:['한 사람의 경험이\n서로를 바꾸는 시간을 엽니다.',
      '오늘의 이야기를 시작합니다.\n당신에게 중요한 한 장면은?',
      '설명보다 살아 있는 경험을.\n서로의 이야기에 귀 기울여요.',
      '들은 것을 내 삶과 연결해요.\n우리는 무엇을 함께 바꿀 수 있나요?',
      '우리가 함께 만든 무대.\n다음 목소리는 누구의 차례인가요?']};
}
function breathScene(set,labels) {
  const s=scene(),p=set.colors,points=[[56,35],[74,20],[86,38]];
  s.ellipse('quiet-mass',75,29,25,32,p[2],{rot:-28});
  s.ellipse('quiet-mass-2',82,36,16,20,'#e5e8d9',{rot:23});
  s.shape('leaf-one','leaf',72,21,11,18,'#b1c5b4',{rot:-36});
  s.shape('leaf-two','leaf',85,38,9,15,'#8cae9c',{rot:35});
  s.line('connection-a',56,35,74,20,p[3],.14);
  s.line('connection-b',74,20,86,38,p[3],.14);
  points.forEach(([x,y],i)=>{
    s.circle('quiet-point'+i,x,y,1.1,p[3],{idle:i===0});
    s.text('quiet-word'+i,labels[i],x-6,y+4,16,2.5,p[1],{bold:true,annotation:true});
  });
  s.circle('quiet-ring',56,35,5,p[3],outline(p[3],.12));
  return {...s,cameras:[{x:50,y:H/2,z:1},...points.map(point=>closeCamera(point,1.65)),{x:50,y:H/2,z:1}],
    heads:['잠깐 멈춤.\n깊은 연결.',labels[0],labels[1],labels[2],'함께 머문 시간이,\n연결이 된다.'],
    bodies:['빨리 답하기보다,\n서로의 이야기에 머무는 연습.',
      '잠시 속도를 늦춥니다.\n지금 내 마음은 어떤 모습인가요?',
      '말하지 않은 마음까지 들어요.\n상대가 정말 전하고 싶은 것은?',
      '들었던 말 한 가지를 기억해요.\n오늘의 만남을 어떻게 이어 갈까요?',
      '서로에게 닿은 한 마디.\n다음 만남까지 간직해 보세요.']};
}
const BUILDERS={atlas:mapScene,orbit:orbitScene,ribbon:ribbonScene,focus:focusScene,stage:stageScene,breath:breathScene};

/**
 * 고정 장면 전체를 같은 카메라로 탐색하는 5장. 화면 밖의 요소도 유지하여
 * 전환 중 종이의 가장자리에서 갑자기 생성되거나 이동하는 것을 막는다.
 * origin은 같은 내용·형태의 공간 요소에만 붙인다. 새 설명은 장마다 별도다.
 */
export function createMotionSequence(id,options={}) {
  const set=findSet(id),opts=optionValues(options);
  const aspect=Number(options.aspect)>=.25&&Number(options.aspect)<=4?Number(options.aspect):16/9;
  const labels=set.topics.map((fallback,index)=>{
    const value=options.topics?.[index];
    return typeof value==='string'&&value.trim()?Array.from(value.trim()).slice(0,14).join(''):fallback;
  });
  const story=BUILDERS[id](set,labels),seeds=story.items.map(()=>newId('e'));
  const fit=Math.min(1,(100/aspect)/H),light=set.colors[0],ink=set.colors[1],accent=set.colors[3];
  return story.cameras.map((camera,page)=>{
    const scale=camera.z*fit;
    const items=story.items.map((item,index)=>{
      const {key,idle,annotation,...raw}=item;
      const out={...raw,id:page===0?seeds[index]:newId('e'),layout:'slide',
        ...(page>0?{origin:{elementId:seeds[index]}}:{}),
        x:round(50+(item.x-camera.x)*scale),y:round(50+(item.y-camera.y)*scale*aspect),
        w:round(item.w*scale),h:round(item.h*scale*aspect),
        an:'none',lp:!opts.calm&&opts.breathing&&idle?set.idle:'none',
        ...(opts.speed?{sp:opts.speed}:{})};
      if(item.size)out.size=round(item.size*scale);
      if(item.line)out.line=round(item.line*scale);
      // 지도 주석은 화면 끝에서 단어가 반으로 잘리지 않게 조용히 걷는다.
      // 위치는 계속 같은 카메라를 따르므로 장 사이의 공간은 유지된다.
      if(annotation&&(out.x-out.w/2<0||out.x+out.w/2>98||out.y-out.h/2<2||out.y+out.h/2>94))out.op=0;
      return out;
    });
    const hud=scene(),focused=page>0&&page<4;
    // 카메라와 독립된 편집 디자인의 기준선. 본문 뒤의 평평한 면은
    // 읽는 영역을 지키며, 공간을 나누는 둥근 카드나 유리창을 만들지 않는다.
    if(focused&&!story.ownType)hud.shape('reading-plane','rect',24,27.5,48,55,light);
    if(!(focused&&story.ownType))hud.text('kicker',set.kicker,8,5.4,78,1.65,accent,{bold:true});
    if(!focused||!story.ownType){
      const plain=story.heads[page],title=focused&&!plain.includes('\n')?plain.replace(' ','\n'):plain,size=id==='stage'&&page===0?7.8:focused?7.7:8;
      hud.text('headline',title,8,focused?13.4:12,focused?39:48,size,ink,{bold:true});
      const head=hud.items[hud.items.length-1],top=id==='stage'&&page===0?44:Math.min(40,head.y+head.h/2+4);
      if(!story.ownType)hud.text('explanation',story.bodies[page],8,top,focused?38:45,2.7,ink,{op:82});
      if(focused)hud.line('editorial-rule',8,47,18,47,accent,.35);
    }
    hud.text('folio',set.name+'  /  '+String(page+1).padStart(2,'0')+' — 05',8,52,75,1.5,ink,{op:65});
    hud.items.forEach(({key,...raw})=>{
      const sc=Math.min(1,fit),y=50+(raw.y-H/2)*fit*aspect;
      items.push({...raw,id:newId('e'),layout:'slide',x:round(50+(raw.x-50)*fit),y:round(y),
        w:round(raw.w*sc),h:round(raw.h*sc*aspect),...(raw.size?{size:round(raw.size*sc)}:{}),
        // New editorial copy waits for the camera to land. Shared scene
        // elements keep their identity; two different headlines never ghost
        // over one another halfway through the journey.
        an:opts.calm?'none':'fade',dl:.1,lp:'none',...(opts.speed?{sp:opts.speed}:{})});
    });
    return {id:newId('p'),bg:light,tr:opts.calm?'fade':'move',pa:'fade',topic:page===0?set.name:'',
      notes:set.stages[page]+' · '+set.hint+'\n같은 공간을 확대하고 이동합니다. 모든 글과 도형은 직접 고칠 수 있어요.',items};
  });
}
