import {fontFamilyOf} from '../src/model.js';

// Five beats per story. The same drawing parts move or change size as the story advances.
// Drawing coordinates are in a little illustration frame, in square units (including on portrait paper).
export const ANIMATED_COLLECTIONS = [
  {id:'sundial',headingFont:'gowun-batang',name:'그림자 관측소',label:'SHADOW ALMANAC',tags:['과학','태양','관찰','비교'],layout:'right',bg:'#172A39',ink:'#FFF2D5',accent:'#F8BA72',rule:'#738789',effect:'suntrack',
    beats:[
      ['관찰 시작','그림자\n관측소','같은 장소에 막대를 세우고 그림자를 살펴요.'],
      ['오전','서쪽으로 난\n긴 그림자','막대 밑에서 그림자 끝까지 거리를 재요.'],
      ['한낮','짧아진\n그림자','오전 기록과 포개어 길이와 방향을 비교해요.'],
      ['오후','동쪽으로\n기운 그림자','막대를 그대로 두고 달라진 점을 찾아요.'],
      ['관찰 기록','해의 자리와\n그림자','두 시각을 골라 그림자가 옮겨 간 까닭을 말해요.']]},
  {id:'wayfinder',headingFont:'do-hyeon',name:'학교 축제 길찾기',label:'CAMPUS WAYFINDING',tags:['학교 축제','행사','안내도','비교'],layout:'left',bg:'#F5F0DE',ink:'#193B3D',accent:'#AA412C',rule:'#A5B5A7',effect:'routewalk',
    beats:[
      ['행사 안내','학교 축제\n길찾기','정문에서 공연장까지 방문객의 길을 그려요.'],
      ['갈림길','어디에서\n망설일까?','처음 온 사람이 어느 갈림길에서 멈출지 짚어요.'],
      ['안내판 설치','표식을\n놓을 자리','앞 장과 나란히 보며 표식이 필요한 곳을 찾아요.'],
      ['경로 확인','한 번 더\n걸어 보기','정문에서 출발해 같은 색의 표식을 따라가요.'],
      ['안내도 완성','무대 앞에서\n만나요','처음 안내도와 포개어 더 찾기 쉬워진 곳을 말해요.']]},
  {id:'eclipse',headingFont:'do-hyeon',name:'해를 가리는 달',label:'SOLAR ATLAS',tags:['과학','우주','일식'],layout:'right',bg:'#101C35',ink:'#FFF3D5',accent:'#FFB34D',rule:'#53627A',effect:'corona',
    beats:[
      ['관측 예고','해를 가리는\n작은 달','기록 사진을 보며 두 원의 위치를 따라가요.'],
      ['첫 접촉','두 원이\n만나는 순간','해의 어느 쪽 가장자리부터 달라졌나요?'],
      ['관측 스케치','남은 빛의\n모양 그리기','가려진 부분과 밝은 부분을 나눠 그려요.'],
      ['금환일식','한 바퀴 남은\n빛의 고리','달 둘레로 해가 보이는 까닭을 이야기해요.'],
      ['관측 정리','움직인 것은\n무엇이었을까?','처음과 끝의 위치를 한 그림에 표시해요.']]},
  {id:'groove',headingFont:'bagel-fat-one',name:'우리 학교 레코드',label:'SCHOOL RECORDS',tags:['음악회','공연','축제'],layout:'left',bg:'#302033',ink:'#FFF2DB',accent:'#FF926E',rule:'#886576',effect:'equalizer',
    beats:[
      ['개막','우리 학교\n레코드','오늘의 무대를 한 장의 음반에 담았습니다.'],
      ['첫 무대','첫 음을\n기다리며','연주할 친구들과 첫 곡을 소개해요.'],
      ['함께 듣기','겹쳐 들리는\n두 가지 소리','서로 다른 악기가 만나는 곳에 귀 기울여요.'],
      ['앵콜','한 번 더,\n우리의 후렴','객석과 무대가 함께 부를 구절을 골라요.'],
      ['마지막 곡','오늘의 소리를\n기억해요','오래 남은 한 소리를 연주자에게 전해요.']]},
  {id:'sprout',headingFont:'gowun-batang',name:'씨앗 관찰 수첩',label:'BOTANICAL PLATE',tags:['생명','관찰','생태'],layout:'right',bg:'#F2EEDC',ink:'#193D32',accent:'#857127',rule:'#A6AB88',effect:'leafvein',
    beats:[
      ['표본 등록','씨앗 관찰\n수첩','심은 씨앗의 이름과 날짜를 적어 두세요.'],
      ['땅속 관찰','맨 먼저 나온\n흰 뿌리','어느 방향으로 자라는지 선을 따라가요.'],
      ['줄기 관찰','흙을 밀고\n올라왔어요','어제의 높이와 오늘의 높이를 비교해요.'],
      ['잎 관찰','두 잎 사이의\n작은 변화','잎의 모양과 색을 자세히 그려 보세요.'],
      ['관찰 기록','한 알에서\n한 포기로','달라진 점 한 가지를 관찰 기록에 남겨요.']]},
  {id:'screening',headingFont:'do-hyeon',name:'세 컷 영화제',label:'STUDENT CINEMA',tags:['영화제','미디어','국어'],layout:'band',bg:'#F5E7CC',ink:'#251E25',accent:'#A43C32',rule:'#B3A48E',effect:'shutter',
    beats:[
      ['상영 안내','세 컷 영화제','우리 반이 만든 짧은 영화를 상영합니다.'],
      ['첫 번째 컷','어디에서 시작할까?','첫 컷에서 시간과 장소의 단서를 찾아요.'],
      ['두 번째 컷','무엇이 달라졌지?','다음 컷으로 옮기며 생긴 변화를 짚어요.'],
      ['세 번째 컷','끝에 남길 한 장면','마지막에 보여 줄 행동 하나를 골라요.'],
      ['엔딩 크레디트','이름이 오르는 시간','촬영과 소리, 편집을 맡은 친구들을 소개해요.']]},
  {id:'overprint',headingFont:'gugi',name:'두 색 인쇄실',label:'PRINT WORKSHOP',tags:['미술','연수','디자인'],layout:'left',bg:'#F9EBCC',ink:'#252B39',accent:'#AE3847',rule:'#ABA389',effect:'registration',
    beats:[
      ['연수 표지','두 색\n인쇄실','두 장의 색판으로 한 장의 포스터를 만들어요.'],
      ['첫 번째 판','먼저 찍을\n한 가지 형태','첫 판에 남길 큰 모양과 여백을 정해요.'],
      ['두 번째 판','한 칸 옆으로\n밀어 보기','판의 위치를 바꾸며 색의 경계를 살펴봐요.'],
      ['맞춰 찍기','두 기준점을\n포개는 순간','십자 표시를 맞추고 달라진 윤곽을 찾아요.'],
      ['작업실 전시','내 포스터에\n이름 붙이기','색을 고른 이유와 작품 이름을 함께 적어요.']]},
  {id:'relay',headingFont:'jua',name:'바통이 지나간 자리',label:'FIELD DAY',tags:['운동회','체육','협동'],layout:'band',bg:'#123D36',ink:'#F8F4D9',accent:'#EADC78',rule:'#609285',effect:'speedlines',
    beats:[
      ['운동회 개회','바통이 지나간 자리','출발선부터 결승선까지 네 사람이 한 팀이에요.'],
      ['출발선','첫 주자의 신호','진행자의 신호를 보고 자기 레인에서 출발해요.'],
      ['교대 구간','바통을 이어 주기','받는 친구의 손을 보고 바통을 건네요.'],
      ['마지막 직선','결승선까지 함께','마지막 주자를 응원할 구호를 외쳐요.'],
      ['완주 기록','우리가 함께 달린 길','기록 옆에 친구에게 고마웠던 순간을 적어요.']]},
];

function eclipse(draw,n){
  const stars=[[10,15],[27,8],[86,13],[93,62],[18,64],[81,69]];
  stars.forEach(([x,y],i)=>draw('star'+i,'spark',x,y,i%2?2:3,i%2?2:3,'#B9CDE1'));
  draw('halo','circle',53,39,54,54,'#A16C40');
  draw('sun','circle',53,39,49,49,'#FFD675');
  draw('moon','circle',[22,28,40,53,81][n],39,43,43,'#17243C');
  draw('orbit','rect',52,77,73,.7,'#637187');
  draw('marker','diamond',[20,30,42,53,83][n],77,3,3,'#FFCD73');
}

function groove(draw,n){
  draw('sleeve','rect',50,42,94,76,'#CA796E');
  draw('label','circle',46,42,69,69,'#262435');
  for(let i=0;i<3;i++)draw('groove'+i,'circle',46,42,61-i*6,61-i*6,'#262435',{line:.32,lc:'#716777'});
  draw('paper','circle',46,42,26,26,'#F2C781');
  draw('spindle','circle',46,42,3.5,3.5,'#302033');
  const angle=[-38,8,35,78,126][n]*Math.PI/180;
  draw('dot','circle',46+9*Math.cos(angle),42+9*Math.sin(angle),3,3,'#AC494C');
  const x=[81,70,66,62,82][n],y=[58,57,55,53,57][n],dx=x-83,dy=y-16;
  draw('arm','rect',(83+x)/2,(16+y)/2,Math.hypot(dx,dy),2.1,'#FFF2DB',{rot:Math.atan2(dy,dx)*180/Math.PI});
  draw('joint','circle',83,16,7,7,'#564050');
  draw('needle','rect',x,y,4,8,'#FFF1CD',{rot:21});
}

function sprout(draw,n){
  const green='#306749',lime='#7F9C4E',soil='#AD7046',top=[53,50,35,24,13][n];
  draw('plate','rect',50,41,88,76,'#E3E2C5');
  draw('ground','rect',50,66,88,25,soil);
  for(let i=0;i<5;i++)draw('tick'+i,'rect',14,15+i*9,i%2?3:6,.8,'#74866B');
  for(const [i,[x,y]] of [[20,64],[79,60],[66,72],[35,70],[85,73]].entries())
    draw('soil'+i,'pill',x,y,3+i*.4,1.2,'#895B40',{rot:i%2?13:-15});
  if(n)draw('root','rect',51,56+n*1.7,1.5,3+n*3.4,'#F2D5A4',{rot:-8});
  draw('seed','pill',50,n?55:35,n?7:30,n?5:20,'#825236',{rot:-35});
  draw('hilum','pill',n?50:52,n?55:35,n?2:13,n?1:4,'#D6AE71',{rot:-39});
  if(n>1)draw('rootlet','rect',53,57+n*2,1,4+n,'#EACB98',{rot:37});
  if(n>0)draw('stem','rect',50,(54+top)/2,2.1,54-top,green);
  if(n>1){
    const size=[0,0,8,14,17][n];draw('leaf-l','leaf',50-size*.35,top+2,size,size*1.2,green,{rot:-58});
    draw('leaf-r','leaf',50+size*.36,top,size,size*1.15,lime,{rot:52});
  }
  if(n===4)draw('young-leaf','leaf',52,27,8,10,'#61894B',{rot:55});
}

function screening(draw,n){
  draw('film','rect',50,20,98,38,'#272735');
  for(let i=0;i<8;i++){
    draw('perf-top'+i,'rect',9+i*11.7,4,4.5,1.8,'#EEE1C7');
    draw('perf-base'+i,'rect',9+i*11.7,36,4.5,1.8,'#EEE1C7');
  }
  for(let i=0;i<3;i++){
    const x=20+i*30,active=n===4||i===n-1;
    draw('frame'+i,'rect',x,20,27,23,active?'#F6C961':'#8C919F');
    const silhouette=active?'#AA513E':'#555B70';
    if(i===0){
      draw('ridge','tri',x-3,24,18,13,silhouette);
      draw('distant-sun','circle',x+6,15,5,5,'#F9EBC9');
    }else if(i===1){
      draw('door','rect',x-3,21,10,17,silhouette);
      draw('doorlight','rect',x-2,22,4,12,'#F3CD98');
      draw('shadow','tri',x+5,26,9,6,silhouette);
    }else{
      draw('profile','circle',x+3,16,10,10,silhouette);
      draw('shoulder','pill',x+3,26,17,8,silhouette);
    }
  }
  draw('cue','rect',[50,20,50,80,50][n],32,[72,15,15,15,72][n],1.4,'#F08A70');
}

function overprint(draw,n){
  const dx=[-5,-10,8,0,2][n],dy=[-3,4,-6,0,1][n];
  draw('paper','rect',50,41,84,76,'#ECDCB6');
  for(const [i,[x,y]] of [[16,12],[84,69]].entries()){
    draw('cross-h'+i,'rect',x,y,7,.8,'#364D50');
    draw('cross-v'+i,'rect',x,y,.8,7,'#364D50');
  }
  for(let i=0;i<3;i++){
    draw('teal'+i,'pill',42+i*7,32+i*9,41,8,'#338D89',{rot:-35});
  }
  for(let i=0;i<3;i++){
    draw('red'+i,'pill',42+i*7+dx,32+i*9+dy,37,3,'#D24F58',{rot:-35});
  }
  draw('proof','circle',74+dx,19+dy,7,7,'#D24F58');
}

function relay(draw,n){
  draw('track','rect',50,20,98,36,'#BA6549');
  for(let i=0;i<4;i++)draw('lane'+i,'rect',50,7+i*8.5,98,.65,'#F5D8AE');
  for(let i=0;i<3;i++)draw('zone'+i,'rect',31+i*17,20,1,6,'#FFD789',{rot:23});
  for(let i=0;i<6;i++)draw('finish'+i,'rect',87+(i%2)*2,7+i*4.3,2,4.3,'#FFF4D0');
  const x=[13,23,48,75,88][n];
  draw('streak','rect',x-5,20,11,1.1,'#FBEA9F');
  draw('baton','pill',x,20,12,3.4,'#203B3B',{rot:-27});
  draw('grip','rect',x+2,19,2.8,3.3,'#FBE472',{rot:-27});
}

function sundial(draw,n){
  draw('plate','circle',50,41,77,77,'#35535A',{line:.5,lc:'#80928B'});
  draw('face','circle',50,41,67,67,'#203C49',{line:.4,lc:'#769389'});
  for(let i=0;i<12;i++){
    const angle=i*Math.PI/6;
    draw('tick'+i,'rect',50+30*Math.sin(angle),41-30*Math.cos(angle),.7,i%3?2:4,'#C3C9A8',{rot:i*30});
  }
  // Map view, north at the top. Morning sunlight comes from the east;
  // the fixed post casts a shorter, northward shadow at solar noon.
  const dx=[-25,-19,0,18,26][n],dy=[-5,-12,-9,-12,-6][n];
  draw('shadow','pill',50+dx/2,41+dy/2,Math.hypot(dx,dy),3.8,'#86ACC0',{rot:Math.atan2(dy,dx)*180/Math.PI});
  draw('post','circle',50,41,6,6,'#F9E2B3');draw('cap','circle',50,41,2,2,'#9E7451');
  const x=[84,78,50,22,16][n],y=[49,62,77,62,49][n];
  draw('halo','circle',x,y,10,10,'#A57044');draw('sun','circle',x,y,6.2,6.2,'#FFD58C');
}

function wayfinder(draw,n){
  draw('paper','rect',50,41,94,76,'#C9D8BE');
  for(const [i,[x,y,w,h]] of [[25,20,30,17],[66,22,23,21],[22,57,25,18],[52,63,16,14]].entries()){
    draw('building'+i,'rect',x,y,w,h,'#819E91');
    draw('roof'+i,'rect',x-1,y-1,w-2,h-2,'#F4EFDB');
  }
  draw('avenue','rect',50,40,94,6,'#FAF6DF');draw('crossroad','rect',44,41,6,76,'#FAF6DF');
  draw('lane','rect',82,50,5,38,'#FAF6DF');draw('stage','rect',82,68,19,10,'#294D52');
  const route=[[10,40],[32,40],[44,40],[82,40],[82,62]];
  // Signposts stay where installed; the visitor travels from the gate to the stage.
  for(let i=0;i<3;i++){const x=[13,44,82][i];draw('sign'+i,'diamond',x,34,n>=i+2?5:2,n>=i+2?5:2,n>=i+2?'#AE452A':'#A7B7A0');}
  const [x,y]=route[n];draw('visitor-ring','circle',x,y,9,9,'#F7BE70');
  draw('visitor','circle',x,y,5,5,'#923E2A');
}

const drawings={eclipse,groove,sprout,screening,overprint,relay,sundial,wayfinder};
export function animatedPlate(c,set,index){
  const {wide,a,ink}=c,band=set.layout==='band',left=set.layout==='left';
  const [role,heading,prompt]=set.beats[index],height=band?40:82;
  const lines=[];
  for(const word of prompt.split(' ')){
    const last=lines.length-1,limit=band?10:14;
    if(last<0||lines[last].length+1+word.length>limit)lines.push(word);
    else lines[last]+=' '+word;
  }
  const box=wide
    ? band?{x:7,y:21,w:86,h:41}:{x:left?5:54,y:22,w:42,h:62}
    : {x:7,y:45,w:86,h:40};
  const k=Math.min(box.w/100,box.h/a/height);
  const ox=box.x+(box.w-100*k)/2,oy=box.y/a+(box.h/a-height*k)/2;
  function draw(key,kind,x,y,w,h,color,extra={}){
    c.b.shape(kind,{left:ox+(x-w/2)*k,top:oy+(y-h/2)*k,w:w*k,h:h*k,color,layerKey:key,layout:'slide',...extra});
  }
  drawings[set.id](draw,index);
  c.label(set.label,7,6,60,ink);
  c.text('0'+(index+1)+' / 05',72,6,21,8,2.7,set.accent,{align:'r',bold:true});
  c.line(7,16,86,set.rule,.3);
  if(band&&wide){
    c.title(heading,7,65,52,18,7.5);
    c.text(lines.join('\n'),63,65,30,24,3.2);
  }else{
    const x=wide&&left?53:7,w=wide?40:86;
    c.title(heading,x,wide?28:20,w,wide?36:22,wide?9:8.8);
    if(wide)c.text(lines.join('\n'),x,68,w,19,3.2);
    else c.text(prompt,7,85,86,7,3.0);
  }
  c.line(7,93,86,set.rule,.3);
  c.text(role,7,94,69,5,2.7,ink,{bold:true});
  // One beat has an entrance accent. On other pages the heading can be pressed to replay it.
  const feature=c.b.items.find(item=>item.text===heading);
  if(feature.font && fontFamilyOf(set.headingFont))feature.font=set.headingFont;
  feature.effect={id:set.effect,when:index===3?'open':'press'};
  return c.b.items;
}
