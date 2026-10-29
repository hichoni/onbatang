// 온바탕 오리지널 아트 디렉션: 행사·연수·학교·회의·안내 30종.
// 각각의 구도와 색을 따로 설계한다. 모든 글·도형은 편집 가능한 기존 요소이며 외부 자산을 쓰지 않는다.
import { board, TITLE_FONT, LINE } from './templates.js';

const WHITE='#ffffff', INK='#182d29';
const widthOf=s=>[...s].reduce((n,c)=>n+(/\s/.test(c)?.36:/[A-Za-z0-9.,:;!/-]/.test(c)?.65:1),0);

/** y/h는 페이지 높이의 %, x/w는 너비의 %. 원과 그림 표시는 물리 비율을 유지한다. */
function page(aspect, ink=INK) {
  const a=Number.isFinite(aspect)&&aspect>0?aspect:16/9,b=board(a),H=b.H;
  const wide=a>=1.25;
  const rect=(x,y,w,h,color,more={})=>b.shape('rect',{left:x,top:y*H/100,w,h:h*H/100,color,...more});
  const round=(x,y,w,h,color,r=12)=>b.shape('round',{left:x,top:y*H/100,w,h:h*H/100,color,r});
  const art=(id,x,y,w,h,color,more={})=>b.shape(id,{left:x,top:y*H/100,w,h,color,...more});
  const circle=(x,y,d,color,more={})=>art('circle',x,y,d,d,color,more);
  const rule=(x,y,w,color,thick=.45)=>b.shape('rect',{left:x,top:y*H/100,w,h:thick,color});
  const text=(value,x,y,w,h,size=5,color=ink,opts={})=>{
    const lines=String(value).split('\n'),fit=Math.min(size,w/Math.max(...lines.map(widthOf),1)*.94,h*H/100/(lines.length*LINE));
    const actual=Math.max(2.6,Math.floor(fit*10)/10);
    const height=lines.length*actual*LINE;
    const top=Math.max(0,Math.min(y*H/100,H-height));
    b.text(value,{left:x,top,w,size:actual,color,bold:opts.bold===true||opts.title===true,align:opts.align||'l',...(opts.title&&TITLE_FONT?{font:TITLE_FONT}:{})});
  };
  const small=(s,x=7,y=8,w=86,color=ink)=>text(s,x,y,w,8,2.8,color,{bold:true});
  const number=(s,x,y,w=20,h=25,size=16,color=ink)=>text(s,x,y,w,h,size,color,{bold:true});
  const title=(s,x=7,y=25,w=86,h=42,size=11,color=ink)=>text(s,x,y,w,h,size,color,{title:true});
  const ring=(x,y,d,color,line=3)=>art('circle',x,y,d,d,color,{hollow:true,line,lc:color});
  const tag=(s,x,y,w,bg,fg=ink)=>{round(x,y,w,wide?8:6,bg,100);text(s,x+2,y+1,w-4,wide?6:4.6,2.7,fg,{align:'c',bold:true});};
  const path=(x1,y1,x2,y2,color,thick=.6)=>{const dy=(y2-y1)*H/100,dx=x2-x1,d=Math.hypot(dx,dy);b.shape('rect',{left:(x1+x2)/2-d/2,top:(y1+y2)*H/200-thick/2,w:d,h:thick,color,rot:Math.atan2(dy,dx)*180/Math.PI});};
  return{b,H,wide,a,rect,round,art,circle,rule,text,small,number,title,ring,tag,path};
}

// 01  에디토리얼 개막 포스터 — 짙은 그린, 여백, 겹치는 금빛 궤도.
function opening(a){
 const c=page(a,WHITE),{wide}=c;
 c.rect(wide?67:0,wide?0:67,wide?33:100,wide?100:33,'#baddb2');
 c.ring(wide?62:55,wide?17:67,wide?33:30,'#f7c87b',5);
 c.ring(wide?71:68,wide?36:79,wide?24:22,'#153f38',4);
 if(wide)c.rect(0,88,100,12,'#153f38');
 c.small('2026  ONBATANG  COMMUNITY',7,7,79);
 c.rule(7,19,wide?52:85,'#7ea397');
 c.title('함께 여는\n새로운 무대',7,wide?28:24,wide?60:86,wide?43:34,wide?11:12);
 c.small('서로의 이야기가 만나는 하루',7,wide?76:57,wide?57:85,'#d5e5dc');
 c.number('11.06',7,wide?89:79,wide?26:46,wide?9:12,wide?5:9,wide?WHITE:'#153f38');
 c.small('금요일 14:00 · 온바탕홀',wide?38:7,wide?90:92,wide?55:86,wide?WHITE:'#153f38');
 return c.b.items;
}
// 02  파스텔 문화 축제 — 종이 조각과 대형 조형, 중심형 타이포.
function ceremony(a){
 const c=page(a,'#402958'),{wide}=c;
 c.rect(0,0,100,12,'#e9f183');c.rect(0,82,100,18,'#d7c6ff');
 c.art('quarter',wide?1:4,wide?15:13,wide?22:25,wide?22:25,'#f28570');
 c.circle(wide?79:74,wide?20:39,wide?25:24,'#bacde7');
 c.art('spark',wide?78:72,wide?58:63,12,12,'#f28570');
 c.small('ART · MUSIC · OUR STORIES',9,3,82);
 c.title('우리의 오늘은\n하나의 축제',wide?23:10,wide?29:30,wide?66:80,wide?39:31,wide?9.2:11);
 c.text('마을 문화예술제',10,wide?72:70,80,8,3.4,'#402958',{align:'c'});
 c.text('11.06  SAT  ·  모두의 운동장',9,87,82,9,3.5,'#402958',{align:'c'});
 return c.b.items;
}
// 03  프로그램 북 — 가는 선, 큰 숫자와 오른쪽 식순의 편집 디자인.
function agenda(a){
 const c=page(a,'#292c2b'),{wide}=c;
 c.small('PROGRAM / 오늘의 순서');
 c.rule(7,19,86,'#313e36');
 if(wide){c.number('04',7,31,25,34,22,'#c06a42');c.text('네 번의 만남,\n한 편의 이야기',7,72,28,20,3.5);}
 else{c.number('04',7,22,24,18,18,'#c06a42');c.text('네 번의 만남,\n한 편의 이야기',41,25,52,17,4.3);}
 const x=wide?43:7,w=wide?50:86,start=wide?29:47,gap=wide?16:11;
 [['14:00','환영과 여는 인사'],['14:10','함께 나누는 이야기'],['15:00','축하와 기념 촬영'],['15:20','다음 만남의 약속']].forEach(([t,s],i)=>{
   const y=start+i*gap;c.small(t,x,y,wide?17:22,'#a25b3c');c.text(s,x+(wide?15:22),y,w-(wide?15:22),8,3.2);c.rule(x,y+10,w,'#d5cdbf',.25);
 });
 return c.b.items;
}
// 04  시상식 — 네이비/골드, 높은 기둥과 월계수의 균형.
function award(a){
 const c=page(a,'#f2d7a3'),{wide}=c;
 c.rect(4,5,92,90,'#101d37');c.rule(7,8,86,'#c6a774',.3);c.rule(7,92,86,'#c6a774',.3);
 c.art('trophy',wide?45:42,wide?22:24,wide?10:16,wide?12:19,'#e9c77e');
 c.small('THE ONBATANG AWARDS',10,11,80);
 c.text('빛나는 도전상',wide?17:10,wide?48:46,wide?66:80,wide?20:19,wide?8:9,'#f2d7a3',{title:true,align:'c'});
 c.text('홍길동',10,wide?72:69,80,11,wide?5:7,'#f5e7cb',{align:'c',bold:true});
 c.text('올해의 배움을 만든 당신에게',10,wide?84:82,80,7,2.6,'#d0b88d',{align:'c'});
 return c.b.items;
}
// 05  인터미션 — 거대한 타이머 숫자를 포스터의 주인공으로.
function intermission(a){
 const c=page(a,'#603c2a'),{wide}=c;
 c.circle(wide?55:20,wide?3:31,wide?48:65,'#ef8354');
 c.number('10',wide?57:27,wide?5:33,wide?37:52,wide?61:34,wide?40:42,'#fff4df');
 c.text('MINUTES',wide?61:32,wide?71:61,wide?30:41,9,4,'#fff4df',{align:'c'});
 c.small('INTERMISSION',7,8,77);
 c.title('잠시\n쉬어 갑니다',7,wide?32:12,wide?46:86,wide?45:29,wide?9.5:10.5);
 c.rule(7,wide?85:78,wide?42:86,'#8d6447');
 c.small('14:10에 다시 만나요',7,wide?89:85,wide?47:86);
 return c.b.items;
}
// 06  감사 포스터 — 거대한 글자와 짧은 인사, 그리드에서 벗어난 별.
function eventClosing(a){
 const c=page(a,'#304dce'),{wide}=c;
 c.rect(0,wide?77:80,100,wide?23:20,'#304dce');
 c.art('spark',wide?77:67,wide?10:17,wide?17:25,wide?17:25,'#f2a286');
 c.small('UNTIL WE MEET AGAIN',7,8,80);
 c.title('고맙\n습니다.',7,wide?27:32,wide?73:86,wide?46:39,wide?19:20);
 c.text('오늘의 만남을 내일의 시작으로',7,wide?85:84,86,11,3.7,WHITE);
 return c.b.items;
}
// 07  AI 연수 — 짙은 기술 그리드, 모듈 칩과 좌측 큰 타이포.
function workshop(a){
 const c=page(a,'#e8f8f7'),{wide}=c;
 for(let i=1;i<7;i++)c.rect(i*14,0,.35,100,'#233d47');
 for(let i=1;i<5;i++)c.rule(0,i*20,100,'#233d47',.25);
 c.rect(5,16,wide?61:90,wide?66:47,'#112c37');
 c.tag('TEACHER LAB',7,6,wide?29:37,'#baf375','#102c35');
 c.title('배우고 만들고\nAI로 수업을 잇다',7,wide?31:24,wide?62:86,wide?42:31,wide?9.2:10);
 const center=wide?[83.5,49.9]:[50,75],diameter=wide?19:38;
 const points=wide?[[83.5,17],[94,76],[71,82]]:[[24,67],[78,61],[80,85]];
 for(const [x,y] of points)c.path(center[0],center[1],x,y,'#537d84',.5);
 c.ring(center[0]-diameter/2,center[1]-diameter/2/c.H*100,diameter,'#baf375',2);
 c.text('AI',center[0]-(wide?7.5:14),center[1]-(wide?6:4),wide?15:28,wide?16:9,wide?6.5:10,'#d8f8c0',{align:'c',bold:true});
 points.forEach(([x,y],i)=>c.circle(x-2.5,y-2.5/c.H*100,5,['#baf375','#75cbd4','#f4c58b'][i]));
 c.small('11.06  14:00  /  교사 실습 연수',7,91,86);
 return c.b.items;
}
// 08  강연자 소개 — 잡지의 인물 프로필처럼 원형 조형과 편집된 정보.
function speaker(a){
 const c=page(a,'#352b31'),{wide}=c;
 c.rect(0,0,wide?41:100,wide?100:42,'#e4b6a7');
 c.title('김\n온유',9,wide?22:11,wide?29:50,wide?58:26,wide?15:18,'#793d58');
 c.small('MEET THE SPEAKER',wide?49:7,wide?10:48,wide?44:86,'#793d58');
 c.title('수업을 바꾸는\n작은 질문',wide?49:7,wide?30:59,wide?44:86,wide?36:21,wide?8:9);
 c.rule(wide?49:7,wide?74:84,wide?44:86,'#c5a9ad');
 c.text('초등교사 · 수업 디자이너\n학생의 선택을 연구합니다.',wide?49:7,wide?81:89,wide?44:86,wide?16:10,2.9);
 return c.b.items;
}
// 09  목표 — 초대형 숫자와 색면 세 칸을 쓰는 타이포그래피.
function goals(a){
 const c=page(a,'#f7f3e9'),{wide}=c;
 c.small('TODAY’S TAKEAWAYS',7,7,86,'#dce29f');
 c.title('세 가지를\n가져가세요.',7,wide?23:19,wide?29:86,wide?50:22,wide?8.2:10);
 const labels=[['01','관점을\n넓히기'],['02','직접\n만들기'],['03','수업에\n연결하기']];
 labels.forEach(([n,t],i)=>{
   const x=wide?42+i*18:7+i*29,y=wide?25:52,w=wide?16:26,h=wide?60:34;
   c.rect(x,y,w,h,['#e9edbe','#e8a86f','#b9d5cf'][i]);
   c.number(n,x+2,y+3,w-4,wide?19:10,wide?10:11,'#183a34');
   c.text(t,x+2,y+(wide?37:20),w-4,wide?20:11,wide?3.5:3.7,'#183a34');
 });
 return c.b.items;
}
// 10  실습 — 작업대 위 포스트잇과 도구를 연상하는 종이 콜라주.
function handsOn(a){
 const c=page(a,'#28314d'),{wide}=c;
 c.art('rect',wide?62:63,wide?13:41,wide?29:29,wide?28:34,'#ffcd6f',{rot:8});
 c.art('rect',wide?58:60,wide?20:47,wide?31:31,wide?27:33,'#cac6f3',{rot:-6});
 c.art('cursor',wide?78:73,wide?61:72,wide?13:16,wide?16:19,'#4754b7');
 c.tag('HANDS-ON  /  20 MIN',7,7,wide?40:61,'#28314d',WHITE);
 c.title('나만의 수업\n도구 만들기',7,wide?28:22,wide?55:86,wide?35:28,wide?9.2:11);
 c.text('만들 것',wide?65:65,wide?31:52,wide?23:24,wide?8:5,3.5,'#28314d');
 c.text('내 교실의\n작은 불편 하나',wide?65:65,wide?44:59,wide?24:25,wide?17:11,2.9,'#28314d');
 c.rule(7,wide?75:82,wide?46:86,'#7882a4');
 c.text('1  발견  →  2  만들기  →  3  나누기',7,wide?82:89,wide?69:86,10,3.3);
 return c.b.items;
}
// 11  전후 비교 — 경계를 가르는 좌우 색면, 바뀌는 문장.
function beforeAfter(a){
 const c=page(a,'#282b32'),{wide}=c;
 c.rect(wide?50:0,wide?0:50,wide?50:100,wide?100:50,'#f6c368');
 c.small('BEFORE / AFTER',7,7,86);
 const left={x:7,y:wide?34:22,w:wide?37:86},right={x:wide?57:7,y:wide?34:64,w:wide?36:86};
 c.text('BEFORE',left.x,left.y-11,left.w,8,2.8);
 c.title('설명하고\n따라 했어요',left.x,left.y,left.w,wide?38:21,wide?8.5:9.3);
 c.text('AFTER',right.x,right.y-11,right.w,8,2.8);
 c.title('선택하고\n함께 만들어요',right.x,right.y,right.w,wide?38:21,wide?8.5:9.3);
 c.art('arrow',wide?44:76,wide?43:46,wide?12:16,wide?8:10,'#415a87',{rot:wide?0:90});
 return c.b.items;
}
// 12  돌아보기 — 짝지은 메모지, 여백에 떠 있는 손그림형 별.
function recap(a){
 const c=page(a,'#3b3c53'),{wide}=c;
 c.small('REFLECT & TRY',7,7,86);
 c.title('배움의 조각을\n내일로 가져가기',7,wide?22:19,86,wide?27:24,wide?7.6:10);
 const card=(x,y,w,h,color,n,head,body)=>{
   c.art('rect',x+1.5,y+2,w,h*c.H/100,'#d9d4d3',{rot:0});
   c.rect(x,y,w,h,color);c.small(n,x+4,y+4,w-8,'#796658');c.text(head,x+4,y+(wide?12:9),w-8,wide?10:7,3.8);
   c.text(body,x+4,y+(wide?23:14),w-8,wide?14:6,2.8,'#686172',{bold:false});
 };
 if(wide){card(7,54,41,37,'#f4d5bd','01','오늘의 발견','학생이 고를수록\n배움이 깊어진다.');card(52,54,41,37,'#e3e0f3','02','내일의 실천','수업에 작은 선택\n한 번을 더한다.');}
 else{card(7,48,86,20,'#f4d5bd','01','오늘의 발견','학생이 고를수록 배움이 깊어진다.');card(7,73,86,20,'#e3e0f3','02','내일의 실천','수업에 작은 선택 한 번을 더한다.');}
 c.art('spark',wide?85:81,wide?13:8,8,8,'#d69265');return c.b.items;
}
// 13  입학 — 색종이 지붕과 아치, 햇살을 모은 따뜻한 콜라주.
function entrance(a){
 const c=page(a,'#2c4e57'),{wide}=c;
 c.circle(wide?78:70,wide?7:8,wide?17:22,'#f6c75c');
 c.small('WELCOME TO OUR SCHOOL',7,8,86);
 c.title('너의 첫 걸음을\n응원해!',7,wide?27:24,wide?63:86,wide?40:29,wide?10.5:13);
 const x=wide?65:19,y=wide?45:63,w=wide?28:62,h=wide?42:30;
 c.rect(x,y,w,h,'#e7a392');c.art('tri',x-3,y-13,w+6,(w+6)*.42,'#d56f49');
 c.round(x+w*.35,y+h*.28,w*.30,h*.72,'#fff6dd',90);
 c.rect(x+w*.09,y+h*.25,w*.15,h*.20,'#9cbfbb');c.rect(x+w*.76,y+h*.25,w*.15,h*.20,'#9cbfbb');
 c.small('2027 입학식 · 온바탕초등학교',7,wide?89:95,86);
 return c.b.items;
}
// 14  졸업 — 플럼과 크림, 졸업 연도의 대형 활자와 금빛 띠.
function graduation(a){
 const c=page(a,'#f8e9cf'),{wide}=c;
 c.rect(0,0,100,wide?16:12,'#efd5a4');c.small('GRADUATION / 온바탕초등학교',7,wide?4:3,86,'#4e2945');
 c.number('2026',7,wide?20:17,84,wide?24:20,24,'#ab8296');
 c.title('함께 자란 시간,\n더 넓은 세상으로',7,wide?51:45,86,wide?31:31,wide?8.7:11);
 c.small('너의 모든 내일을 응원해',7,wide?90:86,86,'#d6c5cf');
 return c.b.items;
}
// 15  운동회 — 빨강/레몬의 스포츠 그래픽과 사선 트랙.
function sports(a){
 const c=page(a,'#fdf4d8'),{wide}=c;
 c.rect(wide?70:0,wide?0:69,wide?30:100,wide?100:31,'#eee990');
 for(let i=0;i<4;i++)c.art('rect',wide?72+i*6:8+i*23,wide?9:72,wide?1:1.4,wide?47:39,'#d13335',{rot:wide?14:77});
 c.small('ONE TEAM, ONE HEART',7,8,wide?62:86);
 c.title('함께\n뛰자!',7,wide?23:24,wide?65:86,wide?52:39,wide?19:22);
 c.text('온바탕 한마음 운동회',7,wide?81:78,wide?76:86,8,3.5,wide?WHITE:'#a7232c');
 c.small('11.06  09:30 · 우리 학교 운동장',7,wide?92:92,86,wide?'#ffe4b7':'#a7232c');
 return c.b.items;
}
// 16  전시 — 미술관 캡션과 비대칭 추상 작품 세 점.
function exhibition(a){
 const c=page(a,'#2d302b'),{wide}=c;
 c.small('YOUNG ARTISTS / 2026',7,7,86);
 c.title('생각이\n작품이 되다',7,wide?26:20,wide?37:86,wide?45:27,wide?10:12);
 const frames=wide?[[48,20,18,54],[70,35,23,43]]:[[7,56,36,31],[50,50,43,37]];
 frames.forEach(([x,y,w,h],i)=>{
   c.rect(x-1,y-2,w+2,h+4,'#383c36');c.rect(x,y,w,h,i?'#b7b7dd':'#dc9878');
   c.art(i?'quarter':'circle',x+w*.15,y+h*.18,w*.72,w*.72,i?'#64568d':'#f3d7ae');
   c.rule(x,y+h+7,w,'#75796d',.25);
 });
 c.small('학생 작품전 · 11.06—11.13 · 열린 복도',7,94,86);
 return c.b.items;
}
// 17  학부모 — 창문과 식물의 실루엣, 세이지/종이의 차분함.
function parents(a){
 const c=page(a,'#264d43'),{wide}=c;
 c.rect(wide?64:0,wide?0:64,wide?36:100,wide?100:36,'#d2dfcd');
 const x=wide?69:29,y=wide?16:67,w=wide?24:42;
 c.round(x,y,w,wide?65:28,'#f6eedb',95);
 c.art('plant',x+4,y+(wide?31:10),w-8,(w-8)*1.2,'#5c8765');
 c.small('함께 키우는 내일',7,8,wide?56:86);
 c.title('우리 아이의 성장,\n함께 이야기해요',7,wide?33:25,wide?57:86,wide?35:29,wide?8.2:10.8);
 c.small('2026 학부모 설명회',7,wide?79:55,wide?55:86);
 c.small('담임 김온유 · 11.06 14:00',7,wide?91:94,86);
 return c.b.items;
}
// 18  감사 — 큰 원형 꽃과 대담하게 배치한 감사의 말.
function appreciation(a){
 const c=page(a,'#913f4c'),{wide}=c;
 const cx=wide?84:73,cy=wide?41:18,d=wide?14:20;
 for(let i=0;i<5;i++){const r=i*Math.PI*2/5;c.circle(cx+Math.cos(r)*8-d/2,cy+Math.sin(r)*8,d,'#efa4a1');}
 c.circle(cx-6,cy+5,12,'#f9d67d');
 c.small('A LITTLE NOTE OF THANKS',7,8,86);
 c.title('당신 덕분에\n한 뼘 더 자랐어요',7,wide?35:39,wide?62:86,wide?36:30,wide?8.3:10);
 c.rule(7,wide?82:83,wide?53:86,'#d59191');
 c.small('고마운 마음을 담아 · 우리 반 모두',7,wide?89:90,86);
 return c.b.items;
}
// 19  포럼 — 컨퍼런스 대형 활자, 국제 행사 같은 숫자와 세로 색면.
function forum(a){
 const c=page(a,'#e9eddd'),{wide}=c;
 c.rect(wide?73:0,wide?0:76,wide?27:100,wide?100:24,'#d6ed70');
 c.small('EDUCATION / COMMUNITY / FUTURE',7,7,wide?64:86);
 c.title('다음의 학교를\n함께 그리다',7,wide?25:28,wide?69:86,wide?44:33,wide?10.5:13);
 c.rule(7,wide?79:69,wide?60:86,'#7f8c7b');
 c.small('온바탕 교육 포럼',7,wide?86:80,wide?62:86,wide?'#e9eddd':'#233a2e');
 c.number('26',wide?78:70,wide?66:83,wide?17:23,wide?28:12,wide?17:13,'#233a2e');
 c.small('11.06  14:00',7,94,wide?60:60,wide?'#e9eddd':'#233a2e');
 return c.b.items;
}
// 20  로드맵 — 지도의 노선도와 크게 찍힌 세 지점.
function roadmap(a){
 const c=page(a,'#1a4f64'),{wide}=c;
 c.small('IDEA → ACTION',7,7,86);
 c.title('작은 시작,\n확실한 한 걸음',7,wide?24:21,wide?46:86,wide?40:28,wide?8:10.8);
 const pts=wide?[[60,39],[74,64],[88,37]]:[[20,62],[50,76],[80,62]];
 pts.slice(1).forEach((p,i)=>{const q=pts[i];c.path(q[0],q[1],p[0],p[1],'#76adbc',.8);});
 pts.forEach(([x,y],i)=>{const r=5/c.H*100,halfLine=3.4*LINE/2/c.H*100;c.circle(x-5,y-r,10,['#f2bd6b','#d1dec0','#8bbdcd'][i]);c.text('0'+(i+1),x-4,y-halfLine,8,8,3.4,'#1a4f64',{align:'c',bold:true});c.text(['발견','실행','돌아보기'][i],x-11,y+r+5,22,9,3.2,'#1a4f64',{align:'c'});});
 c.small('이번 달부터 한 가지씩',7,92,86);return c.b.items;
}
// 21  토론 — 기사 인터뷰처럼 큰 따옴표와 한 문장 질문.
function discussion(a){
 const c=page(a,'#322d63'),{wide}=c;
 c.art('quote',wide?72:68,wide?17:10,wide?20:25,wide?15:19,'#b8b3e1');
 c.small('LET’S TALK / ROUND 01',7,8,86);
 c.title('어떻게 하면\n더 나아질까요?',7,wide?33:30,86,wide?39:34,wide?11:12.5);
 c.rect(0,wide?83:84,100,wide?17:16,'#322d63');
 c.text('혼자 1분  →  짝과 3분  →  함께 5분',7,wide?88:89,86,8,3.2,WHITE);
 return c.b.items;
}
// 22  비교 — 양쪽을 다른 색과 구조로 구분하는 선택 카드.
function comparison(a){
 const c=page(a,'#293d52'),{wide}=c;
 c.small('ONE QUESTION, TWO POSSIBILITIES',7,7,86);c.title('어떤 길을 선택할까?',7,wide?21:19,86,wide?15:16,7.7);
 const y=wide?45:46,h=wide?44:42;
 c.rect(7,y,40,h,'#d5e3ed');c.rect(53,y,40,h,'#f1d5b1');
 c.number('A',11,y+4,12,wide?17:10,11,'#315371');c.number('B',57,y+4,12,wide?17:10,11,'#835537');
 c.text('깊게 파고들기',11,y+(wide?25:17),32,10,3.7);c.text('넓게 연결하기',57,y+(wide?25:17),32,10,3.7);
 c.text('한 문제에 집중',11,y+(wide?36:31),32,8,2.7,'#516b7f');c.text('다른 생각과 만나기',57,y+(wide?36:31),32,8,2.7,'#81604b');
 return c.b.items;
}
// 23  결정 — 도장 같은 체크와 정돈된 에디토리얼 문장.
function decision(a){
 const c=page(a,'#f3efe1'),{wide}=c;
 c.small('DECISION RECORD',7,8,86,'#a3c6b9');
 c.title('우리는 이렇게\n하기로 했습니다.',7,wide?27:25,wide?64:86,wide?38:32,wide?9.5:11.5);
 c.circle(wide?77:68,wide?25:64,wide?18:24,'#d8df8c');
 c.art('check',wide?81:73,wide?34:68,wide?10:14,wide?9:13,'#244d43');
 c.rule(7,wide?77:83,wide?61:86,'#73968b');
 c.text('매주 금요일, 수업 아이디어 한 가지 공유하기',7,wide?84:89,wide?86:86,wide?10:9,3.1);
 return c.b.items;
}
// 24  할 일 — 실제 회의 보드의 헤더와 목록, 작은 색깔 진행 점.
function tasks(a){
 const c=page(a,'#27363d'),{wide}=c;
 c.small('NEXT ACTION BOARD',7,7,86);
 c.title('아이디어를 실행으로',7,wide?21:21,86,wide?17:16,7.5);
 c.rect(7,wide?46:46,86,wide?11:9,'#27363d');
 c.text('할 일',11,wide?48:48,40,7,2.9,WHITE);c.text('담당',61,wide?48:48,13,7,2.9,WHITE);c.text('기한',80,wide?48:48,12,7,2.9,WHITE);
 const ys=wide?[62,74,86]:[60,73,86];
 [['수업 아이디어 모으기','김온유','11.06'],['첫 활동 함께 만들기','이바다','11.13'],['결과 나누고 돌아보기','모두','11.20']].forEach(([task,who,when],i)=>{
  const y=ys[i];c.circle(8,y+1,1.7,['#559185','#dfb46a','#9aa8cb'][i]);c.text(task,13,y,45,9,3.2);c.text(who,61,y,14,9,2.9);c.text(when,80,y,12,9,2.8);c.rule(7,y+10,86,'#c5d0cf',.25);
 });
 return c.b.items;
}
// 25  안내 — 밝은 옐로의 큰 검정 활자, 오른쪽 티켓형 정보.
function notice(a){
 const c=page(a,'#272d2b'),{wide}=c;
 c.small('GOOD TO KNOW',7,7,86);c.rule(7,19,86,'#272d2b');
 c.title('처음 와도\n괜찮아요.',7,wide?31:23,wide?47:86,wide?42:29,wide?11:13);
 c.rect(wide?60:7,wide?29:64,wide?33:86,wide?56:27,'#fff7d4');
 const x=wide?64:12,y=wide?35:68,w=wide?25:76;
 c.text('우리 동네 배움잔치',x,y,w,wide?15:8,3.4);
 c.text('11.06  오후 2시\n온바탕 문화센터\n누구나 무료로 참여',x,y+(wide?23:12),w,wide?25:14,2.8);
 return c.b.items;
}
// 26  모집 — 입장권의 양쪽 색면과 구멍 장식.
function registration(a){
 const c=page(a,'#793e43'),{wide}=c;
 c.small('OPEN CALL / 함께할 사람',7,7,86);c.title('배우는 금요일,\n함께해요.',7,wide?23:24,wide?59:86,wide?35:30,wide?10:12);
 c.rect(7,wide?69:64,wide?63:86,wide?23:26,'#f1cebb');
 c.rect(wide?70:7,wide?69:90,wide?23:86,wide?23:10,'#793e43');
 c.circle(wide?65:2,wide?72:86,8,'#fff7ed');
 c.small('11.06까지 · 교사 20명 모집',12,wide?74:69,wide?54:74);
 c.text('수업 나눔 모임 / 매주 금요일',12,wide?84:80,wide?54:74,8,2.8);
 c.text('JOIN US',wide?73:12,wide?77:92,wide?17:76,8,3.5,WHITE,{align:'c'});
 return c.b.items;
}
// 27  안전 — 국제 안전 표식 같은 짙은 코발트와 노란 그래픽.
function rules(a){
 const c=page(a,'#173b74'),{wide}=c;
 c.art('tri',wide?77:72,wide?7:8,wide?16:21,wide?14:18,'#eec945');
 c.text('!',wide?82:79,wide?11:10,wide?6:8,wide?12:10,7,'#173b74',{align:'c'});
 c.small('SAFETY FIRST',7,8,wide?65:61);
 c.title('즐거움의 시작은\n서로를 지키는 것',7,wide?23:25,wide?79:86,wide?31:31,wide?8.1:10);
 const list=['이동은 천천히, 차례는 함께','어려울 땐 곁의 선생님께','마친 자리는 처음처럼'];
 list.forEach((s,i)=>{const y=(wide?63:66)+i*(wide?11:9);c.number('0'+(i+1),7,y,12,8,3.7,'#b39222');c.text(s,24,y,69,8,3.2);});
 return c.b.items;
}
// 28  방향 안내 — 시원한 화살표, 층수와 장소만으로 방향을 전달.
function direction(a){
 const c=page(a,'#f8f3dc'),{wide}=c;
 c.rect(wide?69:0,wide?0:72,wide?31:100,wide?100:28,'#d9e9b5');
 c.small('THIS WAY / 행사장 안내',7,7,wide?61:86);
 c.number('2F',7,wide?24:22,wide?48:86,wide?38:28,wide?26:34);
 c.text('온바탕 강당',7,wide?71:61,wide?60:86,wide?15:9,5.9);
 c.art('arrow',wide?72:31,wide?43:80,wide?23:39,wide?14:20,'#284b3e');
 c.small('오른쪽 계단으로 올라오세요',7,wide?91:93,wide?86:86,wide?'#f8f3dc':'#284b3e');
 return c.b.items;
}
// 29  준비물 — 체크보드와 둥근 마스킹 테이프의 수첩 디자인.
function checklist(a){
 const c=page(a,'#3b4b53'),{wide}=c;
 c.art('rect',wide?60:42,wide?7:11,wide?25:31,wide?9:11,'#e2b08c',{rot:8});
 c.small('BEFORE WE START',7,8,86);
 c.title('가볍게 챙기고,\n즐겁게 시작해요.',7,wide?25:26,wide?49:86,wide?42:29,wide?8.4:10.5);
 const x=wide?59:7,y=wide?41:65,w=wide?34:86;
 ['충전된 노트북','나눌 수업 아이디어','서로를 반기는 마음'].forEach((s,i)=>{
  const yy=y+i*(wide?14:9);c.round(x,yy,5,wide?8:4,'#dfebe7',22);c.art('check',x+.7,yy+1,3.8,3.5,'#4d7e72');c.text(s,x+9,yy,w-9,wide?10:7,3);
 });
 return c.b.items;
}
// 30  캠페인 — 상징으로 만든 지구, 메인 카피와 실천 숫자.
function campaign(a){
 const c=page(a,'#175445'),{wide}=c;
 c.circle(wide?64:24,wide?12:12,wide?32:52,'#c8ddbb');
 c.art('leaf',wide?71:36,wide?24:20,wide?17:27,wide?21:32,'#55886a',{rot:-22});
 c.title('오늘 한 번,\n지구를 가볍게',7,wide?27:48,wide?61:86,wide?40:26,wide?9.4:11.5);
 c.tag('ONE SMALL CHANGE',7,7,wide?41:63,'#175445',WHITE);
 c.rect(0,wide?83:85,100,wide?17:15,'#175445');
 c.text('텀블러 한 번 · 전등 한 번 · 걷기 한 번',7,wide?88:90,86,8,3.3,WHITE);
 return c.b.items;
}

const entries=[
 ['행사 · 무대','event-opening','행사 표지',opening,true,'행사 시작 오프닝 축제 에디토리얼','#153f38'],
 ['행사 · 무대','event-welcome','환영 무대',ceremony,false,'입장 개회식 환영 문화 축제 파스텔','#fff5df'],
 ['행사 · 무대','event-agenda','행사 식순',agenda,false,'시간표 순서 진행 프로그램','#f2eee3'],
 ['행사 · 무대','event-award','시상 · 축하',award,false,'상장 수상 축하 시상식 네이비 골드','#0b162c'],
 ['행사 · 무대','event-break','쉬는 시간',intermission,false,'휴식 대기 재개 인터미션','#fff1d9'],
 ['행사 · 무대','event-closing','행사 마무리',eventClosing,false,'폐회 감사 끝 타이포','#fff8ec'],
 ['연수 · 워크숍','training-cover','연수 표지',workshop,true,'교사 특강 세미나 워크샵 AI 테크','#0e2630'],
 ['연수 · 워크숍','training-speaker','강사 소개',speaker,false,'프로필 소개 발표자 컨퍼런스','#f7eee7'],
 ['연수 · 워크숍','training-goals','연수 목표',goals,false,'목표 배움 세가지 키네틱','#183a34'],
 ['연수 · 워크숍','training-practice','실습 안내',handsOn,false,'직접 만들기 준비물 활동 콜라주','#f8f1df'],
 ['연수 · 워크숍','training-change','배움 전과 후',beforeAfter,false,'비교 변화 이전 이후','#f5f3ee'],
 ['연수 · 워크숍','training-recap','배움 돌아보기',recap,false,'회고 마무리 실천 메모','#f7f3ec'],
 ['학교 · 공동체','school-entrance','입학 · 새 출발',entrance,true,'입학식 개학 환영 콜라주','#fff4de'],
 ['학교 · 공동체','school-graduation','졸업 표지',graduation,true,'졸업식 축하 플럼 크림','#4e2945'],
 ['학교 · 공동체','school-sports','운동회 응원',sports,false,'체육대회 청백 응원 스포츠','#bd3034'],
 ['학교 · 공동체','school-exhibition','작품 전시',exhibition,false,'전시회 발표회 축제 갤러리','#f5f1e8'],
 ['학교 · 공동체','school-parents','학부모 설명회',parents,false,'상담 학급 가정 안내 세이지','#f6eedb'],
 ['학교 · 공동체','school-thanks','감사 인사',appreciation,false,'감사 마음 스승의날 꽃','#fce8df'],
 ['회의 · 포럼','meeting-cover','포럼 표지',forum,true,'토론 연구회 세미나 회의 컨퍼런스','#233a2e'],
 ['회의 · 포럼','meeting-roadmap','실행 로드맵',roadmap,false,'타임라인 과정 계획 지도','#edf3ed'],
 ['회의 · 포럼','meeting-discussion','토론 질문',discussion,false,'대화 질문 나눔 인터뷰','#f1edfb'],
 ['회의 · 포럼','meeting-compare','두 안 비교',comparison,false,'비교 장단점 선택','#f7f4ec'],
 ['회의 · 포럼','meeting-decision','회의 결정',decision,false,'의사결정 약속 합의','#244d43'],
 ['회의 · 포럼','meeting-tasks','할 일 정리',tasks,false,'담당 기한 실행 계획 보드','#edf3f0'],
 ['안내 · 캠페인','guide-notice','참여 안내',notice,true,'공지 행사 장소 시간 옐로','#f4d765'],
 ['안내 · 캠페인','guide-registration','신청 · 모집',registration,false,'참가 신청 등록 모집 티켓','#fff7ed'],
 ['안내 · 캠페인','guide-rules','안전 약속',rules,false,'안전 수칙 규칙 코발트','#f8f1d7'],
 ['안내 · 캠페인','guide-direction','오시는 길',direction,false,'장소 방향 안내 화살표 웨이파인딩','#284b3e'],
 ['안내 · 캠페인','guide-checklist','준비물 점검',checklist,false,'체크리스트 준비 확인 수첩','#f7f3e8'],
 ['안내 · 캠페인','guide-campaign','실천 캠페인',campaign,false,'홍보 환경 참여 실천 지구','#f1efd8'],
];
export const OCCASION_LAYOUTS=entries.map(([group,id,name,items,cover,keywords,bg])=>Object.freeze({
 id:'occasion-'+id,name,group,category:group,occasion:true,keywords,tags:keywords.split(' '),ratio:'16:9',cover,bg,items,
}));
export function matchesLayout(layout,query=''){
 const words=String(query).trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
 const haystack=[layout?.name,layout?.group,layout?.keywords].filter(Boolean).join(' ').toLocaleLowerCase();
 return words.every(word=>haystack.includes(word));
}
