import { cleanChart, chartScale, chartNumber } from './chart.js';
import { revealContent } from './reveal-scenes.js';
import { clueAnswer } from './clue-card.js';

// Content is taken from the current piece each time. Only offline lessons
// carry a bounded copy, because their slide is otherwise a single picture.
export function sceneContent(id, item) {
  if (id === 'rollingnumber' && item?.t === 'text') {
    const text = Array.from(String(item.text || '').trim()).slice(0,72).join('');
    return numberIn(text) ? {t:'text',text} : null;
  }
  if (titleSceneIds.includes(id) && item?.t === 'text') {
    const text = Array.from(String(item.text || '').trim()).slice(0, 72).join('');
    return text ? {t:'text', text} : null;
  }
  if (id==='cluecard') return clueAnswer(item);
  if (id === 'kinetic' && item?.t === 'text' && typeof item.text==='string') {
    const chars = Array.from(item.text.trim().replace(/\s+/g, ' '));
    if (chars.length) return { t:'text', text:chars.length > 72 ? chars.slice(0,71).join('')+'…' : chars.join('') };
  }
  if (id === 'bars' && item?.t === 'chart' && ['bar','hbar'].includes(item.kind)) {
    const chart = cleanChart(item);
    if (chart) return { t:'chart', ...chart };
  }
  return revealContent(id,item);
}

export const titleExample = { t:'text', text:'작은 픽셀이 모여 그림이 된다' };
export const titleSceneIds = ['beatintro','spotlighttitle','paperhorizon','fieldroute'];
export const introExample = {t:'text', text:'작은 점에서\n하나의 그림으로\n우리의 픽셀아트'};
export const introBpm = value => Number.isFinite(value) ? Math.round(Math.max(60, Math.min(180, value))) : 100;
export const chartExample = { t:'chart', kind:'bar', title:'도안에 쓴 픽셀', labels:['별','하트','로켓','나무'],
  unit:'칸', series:[{name:'색칠한 칸',values:[18,26,34,22]}] };

const FONT = 'system-ui, sans-serif';
export function letter(part, text, x, y, size, color, attrs = {}, frames, delay, duration) {
  const node = part('text',{x,y,fill:color,'font-family':FONT,'font-size':size,...attrs},frames,delay,duration);
  node.textContent = text;
}
const appear = [{opacity:0,transform:'translateY(13px)'},{opacity:1,transform:'translateY(0)'}];
function plate(part, ink, kicker) {
  part('rect',{x:2,y:2,width:716,height:356,rx:20,fill:'#10242c',stroke:ink[0],'stroke-width':2});
  for(let i=0;i<4;i++){
    const x=560+i*24;
    part('path',{d:'M'+x+' 11l-14 20h15l14-20z',fill:ink[i%3],opacity:.22+i*.09},
      [{opacity:0,transform:'translateX(-12px)'},{opacity:1,transform:'none'}],i*85,450);
  }
  part('path',{d:'M30 34h19',stroke:ink[0],'stroke-width':4,'stroke-linecap':'round'});
  letter(part,kicker,59,39,13,'#dce8e9',{'font-weight':700,'letter-spacing':2});
}

// SVG has no automatic line wrapping. Measure the actual system font so a
// Korean title, a long word, and a mixed-language title all fit the same plate.
export function titleLines(text, widthLimit=632, sizes=[63,55,46,38,29,21]) {
  const ctx = document.createElement('canvas').getContext('2d');
  for (const size of sizes) {
    ctx.font='800 '+size+'px '+FONT;
    const lines=[[]]; let width=0;
    for (const word of text.split(' ')) {
      const tokens=ctx.measureText(word).width>widthLimit ? Array.from(word) : [word];
      tokens.forEach((token,i) => {
        const w=ctx.measureText(token).width, gap=width && !i ? size*.24 : 0;
        if (width && width+gap+w>widthLimit) { lines.push([]); width=0; }
        else width+=gap;
        lines.at(-1).push({text:token,x:width}); width+=w;
      });
    }
    if (lines.length<=3 || size===sizes.at(-1)) return {size,lines};
  }
}

export function kineticTitle({part,ink,content}) {
  plate(part,ink,'핵심 문장');
  const {size,lines}=titleLines(content.text);
  const step=size*1.2, start=178-(lines.length-1)*step/2+size*.33;
  const count=lines.reduce((n,line)=>n+line.length,0);
  let index=0;
  for (const [row,line] of lines.entries()) {
    for (const token of line) {
      const last=index===count-1;
      letter(part,token.text,37+token.x,start+row*step,size,last?ink[0]:'#fbfcf5',
        {'font-weight':800},appear,130+index*640/Math.max(1,count-1),570);
      index++;
    }
  }
  part('path',{d:'M38 307H681',stroke:'#49606a','stroke-width':1});
  part('path',{d:'M38 307H197',stroke:ink[0],'stroke-width':4,pathLength:1,'stroke-dasharray':'1 1'},
    [{strokeDashoffset:1},{strokeDashoffset:0}],220,960);
}

export function introLines(text) {
  const lines = text.trim().split(/\n+/).map(line => line.trim()).filter(Boolean);
  if (lines.length > 1) return [...lines.slice(0, 2), lines.slice(2).join(' ')].filter(Boolean);
  const words = text.trim().split(/\s+/), perLine = Math.ceil(words.length / 3);
  const result = [];
  for (let i = 0; i < words.length; i += perLine) result.push(words.slice(i, i + perLine).join(' '));
  return result;
}

function fittedSize(text, width, max) {
  const ctx = document.createElement('canvas').getContext('2d');
  ctx.font = '800 ' + max + 'px ' + FONT;
  return Math.min(max, max * width / Math.max(1, ctx.measureText(text).width));
}

export function beatIntro({part,ink,content,options}) {
  const bpm = introBpm(options.bpm), beat = 60000 / bpm, lines = introLines(content.text);
  part('rect',{width:720,height:360,fill:'#101e26'});
  // Etched grooves build outward. Only a short arc catches the light on each beat.
  const cx=622,cy=163;
  part('circle',{cx,cy,r:134,fill:'#19323b'},appear,0,beat);
  for(let i=0;i<13;i++){
    const r=48+i*6.4;
    part('circle',{cx,cy,r,fill:'none',stroke:ink[i%3],opacity:.13+(i%4)*.04},[{opacity:0},{opacity:1}],i*17,620);
  }
  lines.forEach((_,i)=>{
    const r=69+i*21;
    part('path',{d:'M'+(cx-r)+' '+cy+'a'+r+' '+r+' 0 0 1 '+r+' '+(-r),fill:'none',stroke:ink[i],'stroke-width':3,
      pathLength:1,'stroke-dasharray':'1 1'},[{strokeDashoffset:1,opacity:0},{strokeDashoffset:0,opacity:1}],beat*i,beat*.86);
  });
  part('circle',{cx,cy,r:29,fill:ink[0]});
  part('circle',{cx,cy,r:5,fill:'#10232b'});
  letter(part,'SIDE A   /   '+bpm+' BPM',36,39,14,ink[0],{'letter-spacing':2,'font-weight':700});
  part('path',{d:'M36 56H450 M36 302H684',fill:'none',stroke:'#43656b'});
  lines.forEach((line,i) => {
    const y = 177 + (i - (lines.length-1)/2)*71;
    letter(part,String(i+1).padStart(2,'0'),38,y,14,ink[0],{'font-weight':700},
      [{opacity:0},{opacity:1}],i*beat,beat*.5);
    letter(part,line,72,y,fittedSize(line,412,56),i===lines.length-1?ink[0]:'#fafaf0',
      {'font-weight':800},[{opacity:0,transform:'translateY(25px)'},{opacity:1,transform:'translateY(-2px)',offset:.78},
        {opacity:1,transform:'translateY(0px)'}],i*beat,beat*.94);
  });
  for (let i=0;i<lines.length;i++) {
    const x=36+i*44;
    part('rect',{x,y:320,width:34,height:5,rx:2,fill:'#355059'});
    part('rect',{x,y:320,width:34,height:5,rx:2,fill:ink[0]},[{opacity:0},{opacity:1}],i*beat,beat*.4);
  }
  letter(part,'RHYTHM   /   '+String(lines.length).padStart(2,'0'),684,328,12,'#acc2c5',{'text-anchor':'end','letter-spacing':2});
}

let spotlightSerial = 0;
function numberIn(text) {
  const match=text.match(/[+−-]?\d[\d,]*(?:\.\d+)?(?:\s?[%％])?/);
  return match && match[0].replace(/\D/g,'').length<=8 ? match[0].replace(/\s/g,'') : '';
}

export function rollingNumber({part,ink,content}) {
  const value = numberIn(content.text);
  const size = Math.min(100, 624 / (value.length * .82));
  const step = size * 1.17, advance = size * .82;
  const defs = part('defs',{}), ns = 'http://www.w3.org/2000/svg';
  part('rect',{width:720,height:360,fill:'#f0e9d8'});
  letter(part,'수치로 보기',34,47,21,'#243136',{'font-weight':800});
  letter(part,'MEASURE   /   01',684,45,13,'#445658',{'text-anchor':'end','letter-spacing':2});
  part('path',{d:'M35 64H685 M35 264H685',stroke:'#78817a'});
  for(let i=0;i<=32;i++)part('path',{d:'M'+(40+20*i)+' 68v'+(i%4?4:9),stroke:'#7e8982'});
  [...value].forEach((char,i)=>{
    const x=360+(i-value.length/2+.5)*advance;
    const attrs={x,y:212,'text-anchor':'middle','font-family':FONT,'font-size':size,'font-weight':800,fill:ink[0]};
    if(!/\d/.test(char)){part('text',{...attrs,fill:'#2a3a3d'}).textContent=char;return;}
    const digit=Number(char), clip=document.createElementNS(ns,'clipPath');
    const travel=4+i%4;
    part('rect',{x:x-advance*.48,y:210-size,width:advance*.96,height:step+5,rx:6,fill:'#1d2c31'});
    clip.id='ob-digit-'+ ++spotlightSerial;
    const window=document.createElementNS(ns,'rect');
    for(const [key,val] of Object.entries({x:x-advance/2,y:212-size,width:advance,height:step}))window.setAttribute(key,String(val));
    clip.append(window);defs.append(clip);
    const reel=part('g',{},[{transform:'translateY('+(travel*step)+'px)'},{transform:'translateY('+(-size*.04)+'px)',offset:.9},
      {transform:'translateY(0px)'}],120+i*85,1140);
    const wrap=document.createElementNS(ns,'g');
    wrap.setAttribute('clip-path','url(#'+clip.id+')');
    reel.parentNode.before(wrap);wrap.append(reel.parentNode);
    for(let n=0;n<=travel;n++){
      const text=document.createElementNS(ns,'text');
      for(const [key,val] of Object.entries({...attrs,y:212+(n-travel)*step}))text.setAttribute(key,String(val));
      text.textContent=String((digit-travel+n+10)%10);reel.append(text);
    }
    part('path',{d:'M'+(x-advance*.47)+' '+(212-size*.38)+'h'+(advance*.94),stroke:'#101c22',opacity:.32,'stroke-width':2});
  });
  const caption=content.text.replace(/\s+/g,' ');
  letter(part,caption,360,313,fittedSize(caption,640,30),'#233338',{'text-anchor':'middle','font-weight':700},appear,560+value.length*85,680);
}
export function spotlightTitle({part,ink,content}) {
  const lines=titleLines(content.text.replace(/\s+/g,' '));
  const ns='http://www.w3.org/2000/svg', defs=part('defs',{});
  const glow=document.createElementNS(ns,'radialGradient');
  glow.id='ob-stage-light-'+ ++spotlightSerial;
  for(const [offset,opacity] of [[0,.52],[.44,.24],[1,0]]){
    const stop=document.createElementNS(ns,'stop');
    stop.setAttribute('offset',offset);stop.setAttribute('stop-color',ink[1]);stop.setAttribute('stop-opacity',opacity);
    glow.append(stop);
  }
  defs.append(glow);
  const sweep=[{transform:'translateX(-720px)'},{transform:'translateX(0px)'}];
  part('rect',{width:720,height:360,fill:'#1b1927'});
  part('ellipse',{cx:655,cy:92,rx:290,ry:234,fill:'url(#'+glow.id+')'},sweep,180,1660);
  for(let i=0;i<3;i++){
    const left=584+i*32;
    part('path',{d:'M'+left+' 0h'+(22-i*6)+'l-122 360h-'+(54-i*12)+'z',fill:ink[i],opacity:.045+i*.015},sweep,180,1660);
  }
  letter(part,'IN FOCUS',36,40,14,ink[1],{'letter-spacing':4,'font-weight':700});
  part('path',{d:'M36 58H684 M36 311H684',stroke:'#444759'});
  const clip=document.createElementNS(ns,'clipPath');
  clip.id='ob-title-light-'+ ++spotlightSerial;
  defs.append(clip);
  part('rect',{x:0,y:0,width:720,height:360},sweep,180,1660,clip);
  lines.lines.forEach((row,i)=>{
    const y=184+(i-(lines.lines.length-1)/2)*lines.size*1.18;
    for(const word of row){
      const attrs={x:38+word.x,y,'font-family':FONT,'font-size':lines.size,'font-weight':800};
      part('text',{...attrs,fill:'#767687'}).textContent=word.text;
      part('text',{...attrs,fill:i===lines.lines.length-1?ink[0]:'#fffbed','clip-path':'url(#'+clip.id+')'}).textContent=word.text;
    }
  });
  const glint=part('path',{d:'M718 61v242',stroke:'#fff3cf','stroke-width':2},
    [{...sweep[0],opacity:0},{opacity:.68,offset:.24},{opacity:.48,offset:.81},{...sweep[1],opacity:0}],180,1660);
  glint.parentNode.setAttribute('opacity',0);
  part('path',{d:'M36 311H684',stroke:ink[0],'stroke-width':3,pathLength:1,'stroke-dasharray':'1 1'},
    [{strokeDashoffset:1},{strokeDashoffset:0}],180,1660);
  for(let i=0;i<19;i++)part('path',{d:'M'+(38+i*9)+' 322v'+(i%3?4:9),stroke:'#807c84'});
  letter(part,'LIGHT STUDY',684,335,12,'#e2d0bf',{'text-anchor':'end','letter-spacing':3});
}

const short = (str,n) => Array.from(str).length>n ? Array.from(str).slice(0,n-1).join('')+'…' : str;
export function chartFocus({part,ink,content:c}) {
  plate(part,ink,'자료 읽기');
  letter(part,short(c.title||'항목별 비교',25),32,77,25,'#fbfcf5',{'font-weight':750});
  const colors=c.series.map((_,i)=>ink[i]);
  c.series.forEach((s,i)=>{
    const x=34+i*185;
    part('circle',{cx:x,cy:102,r:4,fill:colors[i]});
    letter(part,short(s.name,13),x+10,107,13,'#dee9e9');
  });
  if(c.unit) letter(part,'단위 · '+c.unit,688,106,13,'#cee0df',{'text-anchor':'end'});
  const horizontal=c.kind==='hbar', left=horizontal?122:82, right=662, top=132, bottom=305;
  const {lo,hi,ticks}=chartScale(c.series.flatMap(s=>s.values));
  const pos=v=>horizontal?left+(right-left)*(v-lo)/(hi-lo):bottom-(bottom-top)*(v-lo)/(hi-lo);
  const baseline=pos(0);
  for (const tick of ticks) {
    const p=pos(tick);
    part('line',{x1:horizontal?p:left,x2:horizontal?p:right,y1:horizontal?top:p,y2:horizontal?bottom:p,
      stroke:tick===0?'#b8ccd0':'#314851','stroke-width':tick===0?1.8:1});
    const tickLabel=Math.abs(tick)>=1e6?new Intl.NumberFormat('ko',{notation:'compact'}).format(tick):chartNumber(tick);
    letter(part,tickLabel,horizontal?p:left-7,horizontal?bottom+20:p+4,12,'#c1d2d4',
      {'text-anchor':horizontal?'middle':'end'});
  }
  const span=(horizontal?bottom-top:right-left)/c.labels.length;
  const bar=span*.72/c.series.length;
  c.labels.forEach((label,i)=>{
    const mid=(horizontal?top:left)+(i+.5)*span;
    letter(part,short(label,horizontal?8:Math.max(2,Math.floor(span/15))),horizontal?left-8:mid,horizontal?mid+4:bottom+24,
      13,'#e4eeed',{'text-anchor':horizontal?'end':'middle'});
    c.series.forEach((s,k)=>{
      const value=s.values[i], end=pos(value), start=mid-span*.36+k*bar, length=Math.abs(end-baseline);
      const dims=horizontal?{x:Math.min(end,baseline),y:start,width:length,height:bar*.9}
        :{x:start,y:Math.min(end,baseline),width:bar*.9,height:length};
      const transform=horizontal?'scaleX(0)':'scaleY(0)';
      const node=part('rect',{...dims,rx:Math.min(3,bar/5,length/2),fill:colors[k]},
        [{transform},{transform:'none'}],100+650*i/Math.max(1,c.labels.length-1)+k*50,740);
      node.parentNode.style.transformOrigin=horizontal?baseline+'px 0':'0 '+baseline+'px';
      if(c.vals!==false && c.labels.length*c.series.length<=12) {
        letter(part,chartNumber(value),horizontal?end+(value<0?-3:3):start+bar*.45,
          horizontal?start+bar*.45+4:end+(value<0?13:-5),12,'#ffffff',
          {'text-anchor':horizontal?(value<0?'end':'start'):'middle'},
          [{opacity:0},{opacity:1}],550+650*i/Math.max(1,c.labels.length-1),350);
      }
    });
  });
}
