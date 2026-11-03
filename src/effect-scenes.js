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
  if ((id === 'beatintro' || id === 'spotlighttitle') && item?.t === 'text') {
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
export const introExample = {t:'text', text:'작은 점에서\n하나의 그림으로\n우리의 픽셀아트'};
export const introBpm = value => Number.isFinite(value) ? Math.round(Math.max(60, Math.min(180, value))) : 100;
export const chartExample = { t:'chart', kind:'bar', title:'도안에 쓴 픽셀', labels:['별','하트','로켓','나무'],
  unit:'칸', series:[{name:'색칠한 칸',values:[18,26,34,22]}] };

const FONT = 'system-ui, sans-serif';
function letter(part, text, x, y, size, color, attrs = {}, frames, delay, duration) {
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
function titleLines(text) {
  const ctx = document.createElement('canvas').getContext('2d');
  for (const size of [63,55,46,38,29,21]) {
    ctx.font='800 '+size+'px '+FONT;
    const lines=[[]]; let width=0;
    for (const word of text.split(' ')) {
      const tokens=ctx.measureText(word).width>632 ? Array.from(word) : [word];
      tokens.forEach((token,i) => {
        const w=ctx.measureText(token).width, gap=width && !i ? size*.24 : 0;
        if (width && width+gap+w>632) { lines.push([]); width=0; }
        else width+=gap;
        lines.at(-1).push({text:token,x:width}); width+=w;
      });
    }
    if (lines.length<=3 || size===21) return {size,lines};
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

function introLines(text) {
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
  part('rect',{width:720,height:360,rx:12,fill:'#101e26'});
  letter(part,'OPENING     /     '+bpm+' BPM',36,36,13,ink[0],{'letter-spacing':2,'font-weight':700});
  part('path',{d:'M36 52H684 M36 302H684',fill:'none',stroke:'#446067'});
  lines.forEach((line,i) => {
    const y = 177 + (i - (lines.length-1)/2)*71;
    letter(part,String(i+1).padStart(2,'0'),38,y,14,ink[0],{'font-weight':700},
      [{opacity:0},{opacity:1}],i*beat,beat*.5);
    letter(part,line,84,y,fittedSize(line,590,52),i===lines.length-1?ink[0]:'#fafaf0',
      {'font-weight':800},[{opacity:0,transform:'translateY(18px)'},{opacity:1,transform:'none'}],i*beat,beat*.85);
  });
  for (let i=0;i<lines.length;i++) {
    const x=36+i*44;
    part('rect',{x,y:320,width:34,height:5,rx:2,fill:'#355059'});
    part('rect',{x,y:320,width:34,height:5,rx:2,fill:ink[0]},[{opacity:0},{opacity:1}],i*beat,beat*.4);
  }
}

let spotlightSerial = 0;
function numberIn(text) {
  const match=text.match(/[+−-]?\d[\d,]*(?:\.\d+)?(?:\s?[%％])?/);
  return match && match[0].replace(/\D/g,'').length<=8 ? match[0].replace(/\s/g,'') : '';
}

export function rollingNumber({part,ink,content}) {
  const value = numberIn(content.text);
  const size = Math.min(104, 620 / (value.length * .68));
  const step = size * 1.12, advance = size * .68;
  const defs = part('defs',{}), ns = 'http://www.w3.org/2000/svg';
  part('rect',{width:720,height:360,rx:12,fill:'#12212a'});
  letter(part,'수치로 보기',36,42,18,ink[0],{'font-weight':700});
  part('path',{d:'M36 61H684 M36 266H684',stroke:'#516371'});
  [...value].forEach((char,i)=>{
    const x=360+(i-value.length/2+.5)*advance;
    const attrs={x,y:212,'text-anchor':'middle','font-family':FONT,'font-size':size,'font-weight':800,fill:ink[0]};
    if(!/\d/.test(char)){part('text',attrs).textContent=char;return;}
    const digit=Number(char), clip=document.createElementNS(ns,'clipPath');
    clip.id='ob-digit-'+ ++spotlightSerial;
    const window=document.createElementNS(ns,'rect');
    for(const [key,val] of Object.entries({x:x-advance/2,y:212-size,width:advance,height:step}))window.setAttribute(key,String(val));
    clip.append(window);defs.append(clip);
    const reel=part('g',{},[{transform:'translateY('+(digit*step)+'px)'},{transform:'translateY(0px)'}],i*45,930);
    const wrap=document.createElementNS(ns,'g');
    wrap.setAttribute('clip-path','url(#'+clip.id+')');
    reel.parentNode.before(wrap);wrap.append(reel.parentNode);
    for(let n=0;n<=digit;n++){
      const text=document.createElementNS(ns,'text');
      for(const [key,val] of Object.entries({...attrs,y:212+(n-digit)*step}))text.setAttribute(key,String(val));
      text.textContent=String(n);reel.append(text);
    }
  });
  const caption=content.text.replace(/\s+/g,' ');
  letter(part,caption,360,313,fittedSize(caption,640,26),'#f7f4e8',{'text-anchor':'middle'});
}
export function spotlightTitle({part,ink,content}) {
  const lines=titleLines(content.text.replace(/\s+/g,' '));
  part('rect',{width:720,height:360,rx:12,fill:'#171925'});
  letter(part,'IN FOCUS',36,40,14,ink[1],{'letter-spacing':4,'font-weight':700});
  part('path',{d:'M36 58H684 M36 311H684',stroke:'#444759'});
  const ns='http://www.w3.org/2000/svg', clip=document.createElementNS(ns,'clipPath');
  clip.id='ob-title-light-'+ ++spotlightSerial;
  part('defs',{}).append(clip);
  const shutter=part('rect',{x:0,y:0,width:720,height:360},
    [{transform:'translateX(-720px)'},{transform:'translateX(0px)'}],150,1450);
  clip.append(shutter.parentNode);
  lines.lines.forEach((row,i)=>{
    const y=184+(i-(lines.lines.length-1)/2)*lines.size*1.18;
    for(const word of row){
      const attrs={x:38+word.x,y,'font-family':FONT,'font-size':lines.size,'font-weight':800};
      part('text',{...attrs,fill:'#767687'}).textContent=word.text;
      part('text',{...attrs,fill:i===lines.lines.length-1?ink[0]:'#fffbed','clip-path':'url(#'+clip.id+')'}).textContent=word.text;
    }
  });
  part('path',{d:'M36 311H684',stroke:ink[0],'stroke-width':3,pathLength:1,'stroke-dasharray':'1 1'},
    [{strokeDashoffset:1},{strokeDashoffset:0}],150,1450);
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
