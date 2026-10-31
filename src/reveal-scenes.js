import { chartNumber, chartScale, cleanChart, sampleChart } from './chart.js';

const initials = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const syllable = c => /^[\uac00-\ud7a3]$/.test(c);

export function revealContent(id, item) {
  if (id === 'lens' && item?.t === 'image') return {t:'image'};
  if (id === 'forecast' && item?.t === 'chart' && item.kind === 'line') {
    const chart = cleanChart(item);
    if (chart?.labels.length >= 2) return {t:'chart', ...chart};
  }
  if (id === 'initials' && item?.t === 'text' && typeof item.text === 'string') {
    const text = item.text.normalize('NFC').trim().replace(/\s+/g, ' ');
    if (Array.from(text).length <= 16 && Array.from(text).some(syllable)) return {t:'text', text};
  }
  return null;
}

// Only expose the active hint in the rendered text, including to assistive tech.
function clue(text, step) {
  let seen = 0;
  return Array.from(text, c => {
    if (step === 2 || /\s/.test(c)) return c;
    if (!syllable(c)) return '·';
    if (seen++ === 0 && step === 1) return c;
    return initials[Math.floor((c.charCodeAt(0) - 0xac00) / 588)];
  }).join('');
}
const type = (part, text, x, y, size, color, attrs = {}, frames) => {
  const node = part('text', {x,y,fill:color,'font-size':size,'font-family':'system-ui,sans-serif',...attrs}, frames, 0, 380);
  node.textContent = text;
};
const bright = '#f6f8f3', quiet = '#b2c4c9';
const fade = [{opacity:0},{opacity:1}];
function panel(part, ink, label, step, last) {
  part('rect',{width:720,height:360,rx:18,fill:'#101f2b'});
  part('circle',{cx:35,cy:33,r:4,fill:ink[0]});
  type(part,label,51,39,16,ink[0],{'font-weight':750});
  type(part,String(step+1).padStart(2,'0')+' / '+String(last+1).padStart(2,'0'),684,39,14,quiet,{'text-anchor':'end','letter-spacing':2});
}
function decode({part,ink,content,step}) {
  const last=Array.from(content.text).filter(syllable).length===1?1:2;
  panel(part,ink,'단어 연구소',step,last);
  const phase=step===last?2:step;
  const value = clue(content.text,phase);
  const chars=Array.from(value);
  const previous=step?Array.from(clue(content.text,phase-1)):[];
  const size=Math.min(82,Math.floor(620/chars.length));
  part('path',{d:'M36 113V92h24 M660 92h24v21 M36 245v21h24 M660 266h24v-21',stroke:ink[1],fill:'none','stroke-width':3});
  const spacing=size*1.02, start=360-(chars.length-1)*spacing/2;
  chars.forEach((char,i)=>{
    if(char===' ')return;
    const changed=char!==previous[i];
    const glyph=part('text',{x:start+i*spacing,y:190+size*.28,fill:phase===1&&changed?ink[0]:bright,
      'font-family':'system-ui,sans-serif','font-size':size,'text-anchor':'middle','font-weight':800},
      changed?[{opacity:0,transform:'translateY(12px)'},{opacity:1,transform:'none'}]:null,i*22,380);
    glyph.textContent=char;
  });
  type(part,['초성만 보고 단어를 떠올려 보세요','첫 글자를 열었어요','숨은 단어를 찾았어요'][phase],360,320,18,quiet,{'text-anchor':'middle'});
}
function forecast({part,ink,content:c,step}) {
  const last=c.labels.length-1;
  panel(part,ink,'다음 점 예측',step,last);
  type(part,Array.from(c.title || '어떻게 달라질까요?').slice(0,22).join(''),32,79,26,bright,{'font-weight':750});
  const left=75,right=652,top=144,bottom=287;
  const {lo,hi,ticks}=chartScale(c.series.flatMap(s=>s.values));
  const x=i=>left+i*(right-left)/last, y=v=>bottom-(v-lo)/(hi-lo)*(bottom-top);
  for (const tick of ticks) {
    part('path',{d:`M${left} ${y(tick)}H${right}`,stroke:tick===0?'#79959d':'#29404c'});
    type(part,new Intl.NumberFormat('ko',{notation:'compact'}).format(tick),left-8,y(tick)+4,12,quiet,{'text-anchor':'end'});
  }
  for (const [i,label] of c.labels.entries()) {
    type(part,Array.from(label).slice(0,c.labels.length>7?3:7).join(''),x(i),315,13,i<=step?bright:quiet,{'text-anchor':'middle'});
  }
  c.series.forEach((s,k)=>{
    const color=ink[k], current=chartNumber(s.values[step])+(c.unit || '');
    type(part,Array.from(s.name).slice(0,8).join('')+' · '+current,32+230*k,115,15,color,{'font-weight':700});
    for (let i=0;i<=step;i++) {
      if (i) part('path',{d:`M${x(i-1)} ${y(s.values[i-1])}L${x(i)} ${y(s.values[i])}`,stroke:color,'stroke-width':3,
        pathLength:1,'stroke-dasharray':'1 1'},i===step?[{strokeDashoffset:1},{strokeDashoffset:0}]:null,0,420);
      part('circle',{cx:x(i),cy:y(s.values[i]),r:i===step?5:3.5,fill:color},i===step?fade:null,0,400);
    }
  });
  if (step<last) {
    part('path',{d:`M${x(step+1)} ${top}V${bottom}`,stroke:ink[0],'stroke-dasharray':'3 6'});
    type(part,'?',x(step+1),top-6,20,ink[0],{'text-anchor':'middle','font-weight':800});
  }
}

// Offline lessons already have a rendered slide. Read only the selected box
// from that picture, without embedding the uncropped source or fetching a URL.
function lensPicture(part, photo, step) {
  const radii=[45,103,355], clip=r=>'circle('+r+'px at 360px 183px)';
  const frame=part('svg',{x:44,y:61,width:632,height:244,viewBox:'0 0 632 244',overflow:'hidden'},
    [{clipPath:clip(step?radii[step-1]:14)},{clipPath:clip(radii[step])}],0,620);
  if (!photo) {
    const ns=frame.namespaceURI;
    const add=(tag,attrs)=>{const n=document.createElementNS(ns,tag);for(const [a,v] of Object.entries(attrs))n.setAttribute(a,v);frame.append(n);};
    add('rect',{width:632,height:244,fill:'#26344d'});
    for(let i=0;i<32;i++) add('circle',{cx:(17+97*i)%632,cy:(11+83*i)%244,r:i%4===0?2:1,fill:'#dcecf0'});
    add('circle',{cx:316,cy:122,r:91,fill:'#ffc387'});
    add('path',{d:'M235 81Q306 118 400 88 M228 116Q308 152 405 124 M237 154Q296 185 392 164',fill:'none',stroke:'#e39873','stroke-width':8});
    add('ellipse',{cx:316,cy:122,rx:165,ry:29,transform:'rotate(-17 316 122)',fill:'none',stroke:'#b1e8db','stroke-width':13});
    return;
  }
  const aspect=photo.width/photo.height;
  const w=Math.min(632,244*aspect),h=w/aspect;
  const view=document.createElementNS(frame.namespaceURI,'svg');
  for (const [key,value] of Object.entries({x:(632-w)/2,y:(244-h)/2,width:w,height:h,viewBox:'0 0 '+photo.width+' '+photo.height,overflow:'hidden'})) view.setAttribute(key,value);
  frame.append(view);
  const image=document.createElementNS(frame.namespaceURI,'image');
  image.setAttribute('href',photo.url);
  if (photo.slide) {
    image.setAttribute('width',photo.slide.w);image.setAttribute('height',photo.slide.h);
    image.setAttribute('preserveAspectRatio','none');
    image.setAttribute('transform',`translate(${photo.width/2} ${photo.height/2}) rotate(${-photo.slide.rot}) translate(${-photo.slide.x} ${-photo.slide.y})`);
  } else {
    const c=photo.crop || {x:0,y:0,w:1,h:1};
    image.setAttribute('x',-c.x*photo.width/c.w);image.setAttribute('y',-c.y*photo.height/c.h);
    image.setAttribute('width',photo.width/c.w);image.setAttribute('height',photo.height/c.h);
    image.setAttribute('preserveAspectRatio',photo.crop?'none':'xMidYMid slice');
    image.setAttribute('transform',`translate(${photo.fx?photo.width:0} ${photo.fy?photo.height:0}) scale(${photo.fx?-1:1} ${photo.fy?-1:1})`);
    if (photo.mask==='circle') view.style.clipPath='ellipse(50% 50% at 50% 50%)';
    if (photo.mask==='round') view.style.clipPath='inset(0 round 10%)';
  }
  view.append(image);
}
function lens({part,ink,step,photo}) {
  panel(part,ink,'미스터리 렌즈',step,2);
  part('rect',{x:43,y:60,width:634,height:246,fill:'#192b39'});
  lensPicture(part,photo,step);
  if(step<2){
    const r=step?103:45;
    part('path',{d:`M43 60h634v246H43z M${360-r} 183a${r} ${r} 0 1 0 ${2*r} 0a${r} ${r} 0 1 0 ${-2*r} 0z`,'fill-rule':'evenodd',fill:'#192b39'});
    part('circle',{cx:360,cy:183,r:r+2,fill:'none',stroke:ink[0],'stroke-width':3},fade,0,300);
    part('circle',{cx:360,cy:183,r:r+9,fill:'none',stroke:ink[1],'stroke-dasharray':'1 8'});
  }
  type(part,['이 단서가 무엇의 일부일까요?','조금 더 넓게 살펴보세요','전체 그림'][step],360,337,17,bright,{'text-anchor':'middle'});
}

export const REVEALS = [
  {id:'forecast',name:'다음 점 예측',requires:'항목 2개 이상인 꺾은선 차트',hint:'다음 값이 오를지 내릴지 물은 뒤, 실제 값을 하나씩 열어요.',
    example:{t:'chart',...sampleChart('line')},draw:forecast,last:c=>c.labels.length-1,next:()=>'다음 값 공개'},
  {id:'lens',name:'미스터리 렌즈',requires:'사진 조각 전용',hint:'사진을 작은 구멍으로 먼저 보고, 단서를 넓힌 뒤 전체를 공개해요.',
    example:{t:'image'},draw:lens,last:()=>2,next:s=>s===0?'렌즈 넓히기':'전체 그림 공개'},
  {id:'initials',name:'초성 해독기',requires:'한글이 있는 16자 이하 글 조각',hint:'수업 낱말을 초성으로 보여 주고 첫 글자와 정답을 차례로 열어요.',
    example:{t:'text',text:'인공지능'},draw:decode,last:c=>Array.from(c.text).filter(syllable).length===1?1:2,next:(s,c)=>s===0&&Array.from(c.text).filter(syllable).length>1?'첫 글자 공개':'정답 공개'},
];
