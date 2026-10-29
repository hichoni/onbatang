// 온바탕 오리지널 디자인 세트. 한 스타일의 표지·차례·내용·기록·마무리를 함께 쓴다.
// 레이아웃에는 너비 단위의 도형 높이, 완성 슬라이드에는 페이지 % 높이를 쓴다.
// 외부 이미지/글꼴/저장소를 사용하지 않으며 모든 글과 도형은 개별 편집 가능하다.
import { board, LINE, TITLE_FONT } from './templates.js';
import { newId } from '../src/document.js';

export const COLLECTIONS = Object.freeze([
  { id:'fieldnote', name:'현장 노트', label:'FIELDNOTE', hint:'관찰에서 실천으로 이어지는 에디토리얼 세트', bg:'#F4F0E6', ink:'#18221E', accent:'#E75C36' },
  { id:'signal', name:'배움 신호', label:'SIGNAL', hint:'작은 실험과 새로운 연결을 위한 테크 세트', bg:'#0F1821', ink:'#EAF2F1', accent:'#D5F26A' },
  { id:'gallery', name:'함께 자란 시간', label:'GALLERY', hint:'전시·성장·졸업의 이야기를 담는 도록 세트', bg:'#F6F0E5', ink:'#3D263D', accent:'#B15F45' },
  { id:'forum', name:'다음 학교', label:'FORUM', hint:'질문·논의·결정을 정리하는 정보 디자인 세트', bg:'#F7F7F1', ink:'#141E2B', accent:'#2554E8' },
].map(value=>Object.freeze({...value,slides:5})));

const ASPECT = 16/9;
const validAspect = value => Number.isFinite(Number(value)) && Number(value)>=.25 && Number(value)<=4 ? Number(value) : ASPECT;
const em = value => [...String(value)].reduce((sum,char)=>sum+(/\s/.test(char)?.34:/[A-Za-z0-9.,:;/+—-]/.test(char)?.62:1),0);
function canvas(aspect, collection, index, {dark=false}={}) {
  const a=validAspect(aspect),b=board(a),H=b.H,wide=a>=1.25;
  const ink=dark?'#F6F0E5':collection.ink,accent=collection.accent;
  const rect=(x,y,w,h,color,extra={})=>b.shape('rect',{left:x,top:y*H/100,w,h:h*H/100,color,...extra});
  const circle=(x,y,d,color,extra={})=>b.shape('circle',{left:x,top:y*H/100,w:d,h:d,color,...extra});
  const line=(x,y,w,color=ink,thickness=.32)=>b.shape('rect',{left:x,top:y*H/100,w,h:thickness,color});
  const vertical=(x,y,h,color=ink,thickness=.32)=>rect(x,y,thickness,h,color);
  const text=(value,x,y,w,h,size,color=ink,{bold=false,align='l',title=false,op=100}={})=>{
    const rows=String(value).split('\n'),fit=Math.min(size,w/Math.max(...rows.map(em),1)*.94,h*H/100/(rows.length*LINE));
    const actual=Math.max(2.6,Math.floor(fit*10)/10),height=actual*rows.length*LINE;
    b.text(value,{left:x,top:Math.max(0,Math.min(y*H/100,H-height)),w,size:actual,color,bold:bold||title,align,op,...(title&&TITLE_FONT?{font:TITLE_FONT}:{})});
  };
  const label=(value,x=7,y=7,w=78,color=ink)=>text(value,x,y,w,9,2.6,color,{bold:true});
  const title=(value,x=7,y=25,w=86,h=43,size=10.5,color=ink)=>text(value,x,y,w,h,size,color,{title:true});
  const footer=(value='교사 연구회 · 수업을 함께 바꾸는 시간')=>{
    line(7,89,86,dark?'#785F76':collection.id==='signal'?'#2B4550':'#BEBFB6',.24);
    text(value,7,92,72,6,2.6,ink);
    text(String(index+1).padStart(2,'0'),85,92,8,6,2.6,ink,{bold:true,align:'r'});
  };
  const meta=(caption=collection.label)=>label(caption);
  return{a,b,H,wide,ink,accent,rect,circle,line,vertical,text,label,title,footer,meta};
}

function fieldnote(a,index) {
  const set=COLLECTIONS[0],c=canvas(a,set,index),{wide}=c;
  c.meta('FIELDNOTE / 현장의 발견');c.line(7,18,86,'#ABAFA5');
  if(index===0){
    c.circle(wide?72:61,wide?23:64,wide?37:31,set.accent);
    c.circle(wide?82:72,wide?43:76,wide?16:12,set.bg);
    c.title('현장에서\n다시 배우다',7,wide?31:25,wide?62:86,wide?39:33,11.6);
    c.text('관찰하고, 질문하고,\n다음 수업을 함께 만듭니다.',7,wide?74:61,wide?59:60,wide?12:12,3.0);
  }else if(index===1){
    c.title('오늘의\n세 장면',7,wide?29:23,wide?28:86,wide?32:20,9.2);
    const x=wide?42:7,w=wide?51:86,top=wide?28:49,gap=wide?18:13;
    [['01','지금의 수업을 관찰하기'],['02','한 가지 질문을 고르기'],['03','다음의 실천을 정하기']].forEach(([n,t],i)=>{
      const y=top+i*gap;c.text(n,x,y,11,10,4.6,set.accent,{bold:true});c.text(t,x+14,y+1,w-14,10,3.5);c.line(x,y+12,w,'#BCBEB3',.23);
    });
  }else if(index===2){
    c.title('작게 만들고,\n함께 확인하기',7,25,86,wide?30:24,9.4);
    const steps=[['01','만들기','내 수업의 작은 도구'],['02','나누기','서로 다른 관점 찾기'],['03','바꾸기','다음 시간의 한 가지']];
    steps.forEach(([n,t,body],i)=>{
      const x=wide?7+i*30:7,y=wide?59:53+i*11,w=wide?26:86;
      if(wide){c.text(n,x,y,w,9,3.8,set.accent,{bold:true});c.line(x,y+11,w,'#BDBFB6');c.text(t,x,y+13,w,10,3.6,c.ink,{bold:true});c.text(body,x,y+23,w,8,2.6);}
      else{c.text(n,x,y,10,8,3.5,set.accent,{bold:true});c.text(t,23,y,25,8,3.5,c.ink,{bold:true});c.text(body,50,y+1,43,7,2.6);c.line(23,y+9,70,'#BDBFB6',.23);}
    });
  }else if(index===3){
    c.title('발견을\n변화로 잇기',7,24,86,wide?23:22,8.6);
    const columns=[['먼저 발견한 것','설명은 줄이고\n학생의 선택을 늘려요.'],['바꿔 볼 한 가지','질문 하나를 남기고\n다음 수업에서 확인해요.']];
    columns.forEach(([head,body],i)=>{const x=wide?7+i*46:7,y=wide?55:47+i*21,w=wide?39:86;c.label('0'+(i+1),x,y,10,set.accent);c.text(head,x,y+(wide?8:5),w,9,3.8,c.ink,{bold:true});c.text(body,x,y+(wide?19:12),w,14,3.0);});
    if(wide)c.vertical(50,55,29,'#BDBFB6');
  }else{
    c.circle(wide?75:62,wide?21:63,wide?33:29,set.accent);
    c.circle(wide?81:68,wide?32:69,wide?21:17,set.bg);
    c.title('다음 수업에서\n한 번 더.',7,wide?31:25,wide?66:86,wide?38:31,10.8);
    c.text('오늘의 관찰을\n내일의 실천으로 가져갑니다.',7,wide?76:61,wide?66:75,12,3.0);
  }
  c.footer('FIELDNOTE · 관찰에서 실천으로');return c.b.items;
}

function signal(a,index) {
  const set=COLLECTIONS[1],c=canvas(a,set,index),{wide}=c;
  c.meta('SIGNAL / 배움을 연결하는 실험');c.line(7,18,86,'#2B4550');
  const node=(x,y,d,color=set.accent)=>{c.circle(x,y,d,color);c.circle(x+d*.27,y+d*.27*c.a,d*.46,set.bg);};
  if(index===0){
    for(let n=0;n<4;n++)c.vertical(7+n*27,21,63,'#19303B',.22);
    for(let n=0;n<4;n++)c.line(7,25+n*18,86,'#19303B',.22);
    c.rect(wide?73:7,wide?37:71,wide?20:35,wide?35:12,set.accent);
    c.rect(wide?79:43,wide?28:71,wide?14:18,wide?8:12,'#67C7D0');
    c.title('배움을 켜는\n새로운 신호',7,wide?31:26,wide?64:86,wide?39:34,11.0);
    c.text('도구를 실험하고,\n수업의 가능성을 연결해요.',7,wide?76:61,wide?61:86,12,3.0);
  }else if(index===1){
    c.title('연결을 위한\n세 단계',7,24,86,wide?25:23,9.6);
    [['01','질문 세우기'],['02','도구 실험하기'],['03','수업에 연결하기']].forEach(([n,t],i)=>{
      const x=wide?9+i*30:9,y=wide?54:52+i*11,w=wide?23:80;
      if(wide){if(i<2)c.line(x+8,y+4*c.a,22,'#67C7D0',.6);node(x,y,8);c.text(n,x,y+16,w,10,4.2,set.accent,{bold:true});c.text(t,x,y+27,w,8,3.0);}
      else{node(x,y,6);c.text(n,20,y,11,8,3.3,set.accent,{bold:true});c.text(t,35,y,58,8,3.7);}
    });
  }else if(index===2){
    c.title('직접 만드는\n20분',7,wide?29:24,wide?42:86,wide?35:25,10.4);
    const x=wide?55:7,y=wide?27:53,w=wide?38:86,h=wide?53:30;
    c.rect(x,y,w,h,'#172C36');c.rect(x,y,1.1,h,set.accent);c.label('EXPERIMENT / 실습',x+5,y+5,w-10,set.accent);
    ['수업 장면 고르기','작은 결과 만들기','고칠 점 나누기'].forEach((t,i)=>c.text(`${i+1}  ${t}`,x+5,y+16+i*(wide?11:6),w-10,9,wide?2.8:3.0));
    c.text('정답보다 과정,\n완성보다 다음의 가능성.',7,wide?76:39,wide?43:86,12,3.0,'#8CB3BE');
  }else if(index===3){
    c.title('한 번의 실험,\n달라진 수업',7,24,86,wide?26:25,9.0);
    [['BEFORE','교사가 보여주기','설명에 맞춰 따라가기','#67C7D0'],['AFTER','학생이 선택하기','만든 결과로 이야기하기',set.accent]].forEach(([n,t,body,color],i)=>{
      const x=wide?7+i*45:7,y=wide?57:53+i*16,w=wide?41:86,h=wide?26:14;
      c.rect(x,y,w,h,color);c.label(n,x+4,y+3,w-8,set.bg);c.text(t,x+4,y+(wide?10:5),w-8,10,4.0,set.bg,{bold:true});c.text(body,x+4,y+(wide?20:10),w-8,7,2.6,set.bg);
    });
  }else{
    c.title('이제,\n연결할 시간.',7,wide?31:25,wide?62:86,wide?36:29,11.0);
    c.text('내일의 수업에\n한 가지 적용해 보세요.',7,wide?76:60,wide?63:86,12,3.1,'#B6CFD4');
    const x=wide?75:59,y=wide?35:70,d=wide?21:25;
    c.line(wide?63:7,wide?54:80,wide?19:57,'#67C7D0',.7);node(x,y,d);c.text('NEXT',x,y+d*.35*c.a,d,10,wide?3.0:3.4,set.accent,{bold:true,align:'c'});
  }
  c.footer('SIGNAL · 작은 실험, 새로운 연결');return c.b.items;
}

function gallery(a,index) {
  const set=COLLECTIONS[2],c=canvas(a,set,index,{dark:index===4}),{wide}=c;
  c.meta(index===4?'GALLERY / THANK YOU':'GALLERY / 함께한 날의 기록');
  const frame=(x,y,w,h,color)=>{c.rect(x,y,w,h,'#3D263D');c.rect(x+1,y+1.5,w-2,h-3,color);};
  if(index===0){
    frame(wide?67:49,wide?24:63,wide?23:35,wide?56:24,'#D8A4A2');
    frame(wide?59:32,wide?43:70,wide?22:29,wide?38:20,'#9F9BC1');
    c.circle(wide?72:62,wide?38:68,wide?11:14,'#F4D9AF');
    c.title('함께 자란\n시간',7,wide?30:25,wide?52:86,wide?42:32,11.4);
    c.text('발견의 순간과 시도의 흔적을\n하나의 이야기로 모읍니다.',7,wide?76:59,wide?50:86,12,2.8);
  }else if(index===1){
    c.title('전시를 걷는\n세 가지 시선',7,24,86,wide?26:24,9.1);
    [['01','발견의 순간'],['02','시도한 흔적'],['03','함께할 내일']].forEach(([n,t],i)=>{
      const x=wide?7+i*30:7,y=wide?57:52+i*11,w=wide?26:86;
      c.text(n,x,y,wide?w:13,wide?19:8,wide?9.0:4.2,['#B15F45','#9F9BC1','#A77C60'][i],{title:true});
      c.text(t,wide?x:27,wide?y+23:y,wide?w:66,9,3.6,c.ink,{bold:true});
      c.line(x,wide?y+36:y+9,w,'#CDBDB4',.25);
    });
  }else if(index===2){
    c.title('작은 시도,\n깊어진 배움',7,wide?28:24,wide?47:86,wide?34:26,9.7);
    c.text('서로의 생각을 듣고\n처음의 답을 다시 고쳤어요.',7,wide?69:52,wide?45:86,14,3.0);
    const x=wide?58:43,y=wide?26:68,w=wide?35:46,h=wide?52:17;
    frame(x,y,w,h,'#E7D7BC');c.rect(x+4,y+5,w*.42,h*.7,'#B15F45');c.circle(x+w*.44,y+(wide?10:3),w*.39,'#9F9BC1');
    c.text('작품 01 / 생각을 잇다',wide?58:7,wide?81:83,wide?35:86,7,2.6);
  }else if(index===3){
    c.title('기억하고,\n다음으로 남기기',7,24,86,wide?25:24,8.9);
    [['01','기억하고 싶은 순간','함께여서 달라진 점은?'],['02','다음에 전할 마음','누구와 나누고 싶나요?']].forEach(([n,t,body],i)=>{
      const x=wide?7+i*46:7,y=wide?54:48+i*20,w=wide?40:86;
      c.label(n,x,y,10,set.accent);c.text(t,x,y+(wide?8:5),w,9,3.6,c.ink,{bold:true});c.text(body,x,y+(wide?19:12),w,9,2.6);c.line(x,y+(wide?30:15),w,'#B7A697',.24);
    });
  }else{
    c.rect(wide?83:77,wide?22:68,wide?10:16,wide?50:17,'#6C4A69');
    c.title('우리가 함께한\n모든 순간을 기억해요',7,wide?32:25,wide?76:86,wide?38:32,9.0,'#F6F0E5');
    c.text('지금의 기록이\n다음 만남의 시작이 되기를.',7,wide?76:63,wide?70:86,13,3.0,'#D7BBB8');
  }
  c.footer('GALLERY · 우리의 이야기는 계속됩니다');return c.b.items;
}

function forum(a,index) {
  const set=COLLECTIONS[3],c=canvas(a,set,index,{dark:index===4}),{wide}=c;
  const ink=index===4?'#FFFFFF':set.ink;
  c.meta(index===4?'FORUM / NEXT ACTION':'FORUM / 함께 그리는 다음 학교');
  c.line(7,18,86,index===4?'#8FAAFF':set.ink,.4);
  if(index===0){
    c.rect(7,25,1.5,54,set.accent);
    // Open cobalt bracket: the forum has a typographic information-design
    // silhouette, distinct from Fieldnote's circles and Gallery's frames.
    const bx=wide?84:69,by=wide?27:69,bw=wide?9:24,bh=wide?48:15;
    c.rect(bx,by,bw,wide?2:1.5,set.accent);c.rect(bx,by,wide?1.2:2,bh,set.accent);c.rect(bx,by+bh-(wide?2:1.5),bw,wide?2:1.5,set.accent);
    c.title('다음 학교를\n함께 그리다',13,wide?31:25,wide?66:80,wide?39:31,11.0);
    c.text('하나의 질문에서\n함께할 결정으로.',13,wide?76:60,wide?64:79,12,3.1);
  }else if(index===1){
    c.title('오늘의 의제',7,25,wide?62:86,wide?20:17,9.5);
    [['01','지금의 문제','무엇이 달라져야 할까요?'],['02','가능한 대안','어떤 길을 선택할 수 있나요?'],['03','함께할 결정','무엇부터 시작할까요?']].forEach(([n,t,body],i)=>{
      const y=(wide?50:49)+i*(wide?12:12);c.text(n,7,y,12,9,4.0,set.accent,{bold:true});c.text(t,24,y,wide?30:69,9,3.6,ink,{bold:true});
      if(wide)c.text(body,58,y+1,35,9,2.6);c.line(24,y+10,69,'#BCC5D0',.22);
    });
  }else if(index===2){
    c.title('우리에게 필요한\n한 가지 변화는?',7,wide?27:24,86,wide?30:25,10.2);
    [['생각','지금 가장 필요한 것'],['근거','그렇게 생각한 이유'],['실행','함께 시작할 한 걸음']].forEach(([t,body],i)=>{
      const x=wide?7+i*30:7,y=wide?65:56+i*10,w=wide?26:86;c.text(t,x,y,wide?w:21,9,4.0,set.accent,{bold:true});c.text(body,wide?x:32,wide?y+14:y+1,wide?w:61,8,2.6);if(wide&&i<2)c.vertical(x+28,y,21,'#BCC5D0',.24);
    });
  }else if(index===3){
    c.title('결정과 실행',7,24,86,wide?21:18,9.4);
    c.rect(7,wide?49:48,86,wide?10:8,set.ink);
    const top=wide?51:49;
    c.text('함께 할 일',10,top,wide?47:49,7,2.8,'#FFFFFF',{bold:true});c.text('담당',wide?63:63,top,13,7,2.8,'#FFFFFF',{bold:true});c.text('기한',81,top,10,7,2.8,'#FFFFFF',{bold:true});
    [['수업 질문 하나 바꾸기','연구회','11.06'],['서로의 실천 나누기','함께','11.13'],['다음 만남 돌아보기','모두','11.20']].forEach(([what,who,when],i)=>{
      const y=(wide?63:60)+i*(wide?8:9);c.text(what,10,y,49,7,2.8);c.text(who,63,y,14,7,2.6);c.text(when,81,y,10,7,2.6);c.line(7,y+7,86,'#C5CDD7',.22);
    });
  }else{
    c.title('다음은,\n우리의 실행입니다.',7,wide?31:25,86,wide?42:33,10.4,'#FFFFFF');
    c.rect(wide?79:74,wide?71:70,wide?14:19,wide?12:12,'#FFFFFF');
    c.text('작은 약속을\n실제 변화로 이어갑니다.',7,wide?76:62,wide?67:86,12,3.0,'#D8E2FF');
  }
  c.footer('FORUM · 논의에서 함께하는 실행으로');return c.b.items;
}

const makers={fieldnote,signal,gallery,forum};
const roles=['표지','차례','내용·실습','비교·기록','마무리'];
export const COLLECTION_LAYOUTS=Object.freeze(COLLECTIONS.flatMap(collection=>roles.map((role,index)=>Object.freeze({
  id:`collection-${collection.id}-${index+1}`,name:`${collection.name} · ${role}`,group:`디자인 세트 · ${collection.name}`,ratio:'16:9',cover:index===0,
  collection:collection.id,collectionName:collection.name,bg:collection.id==='gallery'&&index===4?'#3D263D':collection.id==='forum'&&index===4?'#2554E8':collection.bg,
  tags:[collection.name,collection.label,role,'디자인 세트',...(collection.id==='gallery'?['전시','성장','졸업']:collection.id==='forum'?['회의','토론','결정']:['연수','워크숍','실습'])],
  items:aspect=>makers[collection.id](validAspect(aspect),index),
}))));

/** 편집기 설정에 기대지 않는 새 5장. 도형 높이를 페이지 %로 바꾸고 모든 이름표를 새로 만든다. */
export function createCollectionSlides(id,{aspect=ASPECT}={}) {
  const a=validAspect(aspect),layouts=COLLECTION_LAYOUTS.filter(layout=>layout.collection===id);
  if(layouts.length!==5)throw new RangeError('디자인 세트를 골라 주세요.');
  return layouts.map(layout=>({id:newId('p'),bg:layout.bg,items:layout.items(a).map(raw=>({...raw,...(raw.t==='shape'?{h:raw.h*a}:{}),id:newId('e')}))}));
}
