// 행사·연수·학교·회의에서 바로 고쳐 쓰는 온바탕 자체 제작 틀.
// 외부 이미지나 글꼴을 가져오지 않는다. 모든 글과 꾸밈은 편집 가능한 요소다.
// board는 도형 높이를 너비 단위로 받으므로, 여기서는 세로 자리를 비율로 변환한다.
import { board, TITLE_FONT, LINE } from './templates.js';

const INK = '#20332f', PAPER = '#fffdf5', WHITE = '#ffffff';
const PALETTES = {
  event: { bg: '#153f38', ink: WHITE, accent: '#f2c979', soft: '#2d5e54' },
  training: { bg: '#f0f4ff', ink: '#263765', accent: '#5164d9', soft: '#dde5ff' },
  school: { bg: '#fff7ec', ink: '#44342f', accent: '#d75d3a', soft: '#ffe0bf' },
  meeting: { bg: '#f1f6f3', ink: INK, accent: '#287566', soft: '#d8eae2' },
  guide: { bg: '#fff8e0', ink: '#45391e', accent: '#9c5b16', soft: '#f7e9ae' },
};

const lineWidth = (t) => [...t].reduce((n, c) => n + (/\s/.test(c) ? .36 : /[A-Za-z0-9.,:;!/-]/.test(c) ? .65 : 1), 0);
function canvas(aspect, palette) {
  const a = Number.isFinite(aspect) && aspect > 0 ? aspect : 16 / 9;
  const b = board(a), H = b.H, p = PALETTES[palette];
  const shape = (id, x, y, w, h, color = p.accent, more = {}) => b.shape(id, {left:x, top:y * H / 100, w, h:h * H / 100, color, ...more});
  // Fit both dimensions before creating a text box; a narrow portrait and an
  // original custom PPT ratio receive the same content without clipping it.
  const text = (value, x, y, w, h, {size=5, color=p.ink, align='l', bold=false, title=false} = {}) => {
    const lines = String(value).split('\n');
    const max = Math.max(...lines.map(lineWidth), 1);
    const fit = Math.min(size, w / max * .93, h * H / 100 / (lines.length * LINE));
    b.text(value, {left:x, top:y * H / 100, w, size:Math.max(2.6, Math.floor(fit * 10) / 10), color, align, bold, ...(title && TITLE_FONT ? {font:TITLE_FONT} : {})});
  };
  const rule = (x,y,w,color=p.soft) => b.shape('rect',{left:x,top:y*H/100,w,h:.6,color});
  const label = (value,x=8,y=8,w=60) => text(value,x,y,w,7,{size:2.8,bold:true});
  const title = (value,x=8,y=21,w=84,h=28,size=9) => text(value,x,y,w,h,{size,title:true,bold:true});
  const footer = (value='날짜 · 장소 · 이름을 고쳐 쓰세요') => text(value,8,89,84,7,{size:2.6});
  const panel = (x,y,w,h,color=WHITE) => shape('round',x,y,w,h,color,{r:12});
  // Decorative symbols keep their original proportions. Panels grow with the
  // page, but a person/sun/arrow must not stretch on a tall phone poster.
  const mark = (id,x,y,w,h,color=p.accent) => {
    const naturalHeight=h*56.25/100;
    b.shape(id,{left:x,top:y*H/100+(h*H/100-naturalHeight)/2,w,h:naturalHeight,color});
  };
  return {b,H,p,shape,text,rule,label,title,footer,panel,mark};
}

function opening(a) {
  const c=canvas(a,'event');
  c.mark('ring',71,9,23,23); c.mark('circle',79,65,12,18,c.p.soft);
  c.label('우리의 이야기가 시작되는 날');
  c.title('함께 여는\n새로운 무대',8,27,77,40,10);
  c.rule(8,75,25,c.p.accent); c.footer('행사 이름 · 날짜 · 주최 기관'); return c.b.items;
}
function ceremony(a) {
  const c=canvas(a,'event');
  c.shape('rect',0,0,5,100,c.p.accent); c.mark('spark',83,13,8,12);
  c.label('OPENING CEREMONY',11); c.title('오늘의 주인공을\n환영합니다',11,29,78,38,9);
  c.panel(11,74,76,10,c.p.soft); c.text('시작 전 휴대전화를 무음으로 바꿔 주세요',15,76,68,7,{size:2.7});
  return c.b.items;
}
function agenda(a) {
  const c=canvas(a,'event'); c.label('함께하는 시간'); c.title('오늘의 순서',8,17,84,15,7);
  ['마음을 여는 인사','함께 나누는 이야기','축하와 기념 촬영','다음을 약속하는 시간'].forEach((t,i)=>{
    const y=38+i*11; c.text(`0${i+1}`,8,y,10,8,{size:3.4,color:c.p.accent,bold:true});
    c.text(t,23,y,67,8,{size:3.6}); if(i<3)c.rule(23,y+9,67);
  }); c.footer('세부 시간과 진행자를 자유롭게 바꿔 쓰세요'); return c.b.items;
}
function award(a) {
  const c=canvas(a,'event'); c.mark('ring',34,7,32,20); c.mark('spark',45,11,10,11);
  c.text('축하합니다',8,35,84,13,{size:6,align:'c',title:true});
  c.text('빛나는 도전상',8,53,84,15,{size:7.4,bold:true,align:'c',color:c.p.accent});
  c.text('수상자 이름',8,75,84,9,{size:4,align:'c'}); return c.b.items;
}
function intermission(a) {
  const c=canvas(a,'event'); c.mark('circle',8,17,28,44,c.p.soft); c.mark('pause',14,29,15,21,c.p.accent);
  c.title('잠시 쉬어 갑니다',41,26,51,24,7); c.text('다시 만나는 시간\n오후 2시 10분',41,59,51,19,{size:3.4});
  c.footer('휴식 시간과 재개 시각을 고쳐 쓰세요'); return c.b.items;
}
function eventClosing(a) {
  const c=canvas(a,'event'); c.rule(8,13,84,c.p.accent);
  c.text('오늘의 만남이\n내일의 시작이 되기를',8,28,84,36,{size:8,align:'c',title:true});
  c.text('함께해 주셔서 고맙습니다',8,73,84,10,{size:3.7,align:'c'}); c.rule(8,88,84,c.p.accent); return c.b.items;
}
function workshop(a) {
  const c=canvas(a,'training'); c.mark('rect',76,0,24,100,c.p.soft); c.mark('circle',80,13,13,20,c.p.accent);
  c.label('교사 성장 워크숍'); c.title('배우고 만들고\n내 수업에 연결하기',8,26,76,38,8.7);
  c.text('연수 주제와 대상을 이곳에 써 주세요',8,70,75,10,{size:3}); c.footer('진행자 이름 · 연수 날짜'); return c.b.items;
}
function speaker(a) {
  const c=canvas(a,'training'); c.label('오늘 함께할 사람'); c.title('강사 소개',8,19,84,14,7);
  c.panel(8,41,26,39,c.p.soft); c.mark('person',14,46,14,28,c.p.accent);
  c.text('이름을 써 주세요',42,43,50,12,{size:4.8,bold:true});
  c.text('소속 · 하는 일\n함께 나눌 경험\n연락할 수 있는 곳',42,61,50,25,{size:3.2}); return c.b.items;
}
function goals(a) {
  const c=canvas(a,'training'); c.label('연수에서 가져갈 것'); c.title('오늘의 세 가지 목표',8,19,84,15,6.5);
  ['새로운 관점으로 바라보기','직접 만들며 이해하기','내 수업에 한 가지 적용하기'].forEach((v,i)=>{
    const y=42+i*15; c.panel(8,y,84,12); c.text(`${i+1}`,12,y+2,8,8,{size:3.6,bold:true,color:c.p.accent}); c.text(v,25,y+2,61,8,{size:3.3});
  }); return c.b.items;
}
function handsOn(a) {
  const c=canvas(a,'training'); c.label('직접 해 보는 시간'); c.title('나만의 수업 도구 만들기',8,19,84,15,6.1);
  c.panel(8,41,39,34,c.p.accent); c.text('만들 것',12,45,31,8,{size:3.4,bold:true,color:WHITE}); c.text('내 교실에서 쓸\n작은 아이디어 하나',12,57,31,15,{size:3.1,color:WHITE});
  c.text('진행 순서',55,42,37,8,{size:3.5,bold:true}); c.text('1  아이디어 적기\n2  직접 만들기\n3  짝과 나누기',55,56,37,24,{size:3});
  c.footer('준비물 · 활동 시간 · 함께할 사람'); return c.b.items;
}
function beforeAfter(a) {
  const c=canvas(a,'training'); c.label('배움이 만든 변화'); c.title('이전의 수업 → 다음 수업',8,18,84,15,6.2);
  c.panel(8,41,39,41); c.panel(53,41,39,41,c.p.soft);
  c.text('이전에는',12,46,31,9,{size:3.5,bold:true}); c.text('설명하고\n따라 했어요',12,61,31,17,{size:3.2});
  c.text('이제는',57,46,31,9,{size:3.5,bold:true}); c.text('선택하고\n함께 만들어요',57,61,31,17,{size:3.2}); return c.b.items;
}
function recap(a) {
  const c=canvas(a,'training'); c.label('연수 마무리'); c.title('배움 한 줄 · 실천 한 가지',8,18,84,15,6.1);
  c.shape('rect',8,42,2,35,c.p.accent); c.text('오늘 새롭게 알게 된 것은',16,43,76,9,{size:3.3,bold:true}); c.rule(16,57,72,c.p.accent);
  c.text('내일 수업에서 해 볼 것은',16,67,76,9,{size:3.3,bold:true}); c.rule(16,81,72,c.p.accent); return c.b.items;
}
function entrance(a) {
  const c=canvas(a,'school'); c.mark('sun',74,9,17,22); c.mark('school',68,66,23,24);
  c.label('새로운 시작을 함께 축하해요'); c.title('반가워요\n우리 학교에 온 것을',8,29,81,36,8);
  c.footer('입학식 · 학교 이름 · 날짜'); return c.b.items;
}
function graduation(a) {
  const c=canvas(a,'school'); c.mark('ring',75,6,17,24,c.p.soft); c.mark('spark',80,9,7,10);
  c.text('GRADUATION',8,10,60,8,{size:2.8,bold:true}); c.title('함께 자란 시간\n더 넓은 세상으로',8,30,84,38,8.7);
  c.rule(8,78,22,c.p.accent); c.footer('졸업을 축하합니다 · 학교 이름'); return c.b.items;
}
function sports(a) {
  const c=canvas(a,'school'); c.shape('rect',0,0,100,11,c.p.accent);
  c.text('우리 학교 한마음 운동회',8,19,84,20,{size:7,title:true,bold:true});
  c.panel(8,49,39,25,c.p.accent); c.panel(53,49,39,25,'#296b62');
  c.text('도전하는 우리',12,55,31,11,{size:3.5,color:WHITE,bold:true,align:'c'}); c.text('응원하는 우리',57,55,31,11,{size:3.5,color:WHITE,bold:true,align:'c'});
  c.footer('함께 즐기고 · 서로 지키고 · 끝까지 응원해요'); return c.b.items;
}
function exhibition(a) {
  const c=canvas(a,'school'); c.label('우리의 생각이 작품이 되다'); c.title('작은 작가들의 전시회',8,19,84,19,6.2);
  [[8,48,23,28],[37,43,25,35],[68,50,24,26]].forEach(([x,y,w,h],i)=>{
    c.panel(x,y,w,h,i===1?c.p.accent:c.p.soft); c.mark(i===1?'spark':'circle',x+6,y+5,w-12,h-10,i===1?WHITE:c.p.accent);
  }); c.footer('전시 기간 · 장소 · 함께 만든 사람들'); return c.b.items;
}
function parents(a) {
  const c=canvas(a,'school'); c.label('가정과 학교가 함께'); c.title('우리 아이의 성장을\n함께 이야기합니다',8,23,84,34,7.5);
  c.panel(8,67,84,15); c.text('학부모 설명회 · 학년과 반 이름',13,71,74,8,{size:3.1,bold:true}); c.footer('담임 이름 · 날짜 · 연락 방법'); return c.b.items;
}
function appreciation(a) {
  const c=canvas(a,'school'); c.mark('heart',41,10,18,21,c.p.accent);
  c.text('마음을 전합니다',8,43,84,15,{size:7,align:'c',title:true});
  c.text('곁에서 함께해 주신\n모든 분께 감사합니다',8,65,84,20,{size:4,align:'c'}); return c.b.items;
}
function forum(a) {
  const c=canvas(a,'meeting'); c.shape('rect',0,0,100,6,c.p.accent);
  c.label('함께 묻고 함께 답하는 자리',8,15); c.title('다음의 학교를\n함께 그리다',8,34,84,34,9.2);
  c.mark('bubble',77,70,13,15,c.p.accent); c.footer('포럼 주제 · 참여자 · 날짜'); return c.b.items;
}
function roadmap(a) {
  const c=canvas(a,'meeting'); c.label('우리의 다음 걸음'); c.title('실행으로 이어지는 로드맵',8,19,84,15,6.1);
  c.rule(16,56,68,c.p.accent);
  ['준비','실행','돌아보기'].forEach((s,i)=>{const x=8+i*30; c.mark('circle',x+7,49,10,16,c.p.accent); c.text(`${i+1}`,x+7,51,10,9,{size:3.1,color:WHITE,align:'c',bold:true}); c.text(s,x,72,24,10,{size:3.4,align:'c',bold:true});}); return c.b.items;
}
function discussion(a) {
  const c=canvas(a,'meeting'); c.label('서로의 관점을 듣는 시간'); c.title('우리가 함께 풀 질문',8,19,84,15,6.4);
  c.panel(8,42,84,27,c.p.accent); c.text('어떻게 하면 더 나아질까요?',13,49,74,15,{size:4.7,color:WHITE,bold:true,align:'c'});
  c.text('혼자 생각하기  →  짝과 나누기  →  함께 모으기',8,80,84,10,{size:2.9,align:'c'}); return c.b.items;
}
function comparison(a) {
  const c=canvas(a,'meeting'); c.label('선택을 위한 비교'); c.title('두 가지 안을 살펴봅니다',8,19,84,15,6.4);
  ['첫 번째 안','두 번째 안'].forEach((t,i)=>{const x=8+i*44;c.panel(x,41,40,42,i?c.p.soft:WHITE);c.text(t,x+4,47,32,9,{size:3.8,bold:true}); c.text('좋은 점\n살펴볼 점\n필요한 것',x+4,62,32,20,{size:2.9});});return c.b.items;
}
function decision(a) {
  const c=canvas(a,'meeting'); c.label('회의에서 결정한 것'); c.title('오늘의 약속',8,18,84,16,7);
  c.mark('check',8,47,10,15,c.p.accent); c.text('우리는 이렇게 하기로 했습니다',25,46,67,11,{size:3.8,bold:true});
  c.text('결정한 내용을 짧게 써 주세요.\n담당자와 시작 날짜를 함께 적어요.',25,63,67,20,{size:3.1});c.footer('다음 점검 날짜 · 확인 방법');return c.b.items;
}
function tasks(a) {
  const c=canvas(a,'meeting');c.label('회의 뒤에 남기는 실행');c.title('할 일 · 담당 · 기한',8,18,84,15,6.7);
  c.shape('rect',8,40,84,11,c.p.accent);c.text('할 일',12,42,35,8,{size:2.9,color:WHITE,bold:true});c.text('담당',54,42,15,8,{size:2.9,color:WHITE,bold:true});c.text('기한',75,42,13,8,{size:2.9,color:WHITE,bold:true});
  ['첫 번째 실천','두 번째 실천','함께 확인하기'].forEach((v,i)=>{const y=55+i*12;c.text(v,12,y,39,9,{size:3});c.text('이름',54,y,15,9,{size:3});c.text('날짜',75,y,13,9,{size:3});c.rule(8,y+10,84);});return c.b.items;
}
function notice(a) {
  const c=canvas(a,'guide');c.shape('rect',0,0,100,14,c.p.accent);c.text('꼭 알아두세요',8,3,84,8,{size:3.3,bold:true,color:WHITE});
  c.title('행사 참여 안내',8,26,84,21,8);c.text('언제  날짜와 시간\n어디서  장소와 오는 길\n누가  참여 대상',8,58,84,29,{size:3.6});return c.b.items;
}
function registration(a) {
  const c=canvas(a,'guide');c.label('관심 있는 분을 기다립니다');c.title('함께할 분을 모십니다',8,20,84,20,6.7);
  c.panel(8,48,84,35,WHITE);c.text('신청 기간 · 참여 대상\n신청 방법 · 문의할 곳\n준비물과 참가 안내',13,54,74,25,{size:3.4});c.footer('신청 링크나 QR 그림을 내 자료에서 넣어 보세요');return c.b.items;
}
function rules(a) {
  const c=canvas(a,'guide');c.label('즐거운 시간을 위한 약속');c.title('함께 지켜 주세요',8,20,84,16,7);
  ['차례를 기다리고 서로 배려해요','안내에 따라 안전하게 움직여요','쓴 자리는 깨끗하게 정리해요'].forEach((v,i)=>{const y=46+i*15;c.mark('check',8,y,8,10,c.p.accent);c.text(v,23,y,69,10,{size:3.3});});return c.b.items;
}
function direction(a) {
  const c=canvas(a,'guide');c.label('오시는 분께 안내합니다');c.title('행사장으로 가는 길',8,20,84,16,7);
  c.mark('arrow',8,48,25,24,c.p.accent);c.text('2층 강당',43,47,49,14,{size:6,bold:true});c.text('오른쪽 계단으로 올라오세요',43,69,49,12,{size:3});c.footer('층 · 장소 · 이동 방향을 고쳐 쓰세요');return c.b.items;
}
function checklist(a) {
  const c=canvas(a,'guide');c.label('시작 전에 한 번 더');c.title('준비물 확인',8,20,84,17,7.5);
  ['필요한 자료를 챙겼나요?','참여 방법을 확인했나요?','함께할 사람을 만났나요?'].forEach((v,i)=>{const y=46+i*15;c.shape('round',8,y,8,10,WHITE,{line:2,lc:c.p.accent});c.text(v,23,y,69,10,{size:3.3});});return c.b.items;
}
function campaign(a) {
  const c=canvas(a,'guide');c.mark('sun',73,9,18,23,c.p.accent);c.label('작은 실천이 모이는 캠페인');
  c.title('오늘 한 가지\n함께 바꿔 봐요',8,31,84,36,8.5);c.panel(8,77,84,12,c.p.accent);c.text('우리의 실천 문장을 여기에 써 주세요',13,79,74,8,{size:3.2,bold:true,color:WHITE});return c.b.items;
}

const entries = [
  ['event','행사 · 무대','event-opening','행사 표지',opening,true,'행사 시작 오프닝 축제'],
  ['event','행사 · 무대','event-welcome','환영 무대',ceremony,false,'입장 개회식 환영'],
  ['event','행사 · 무대','event-agenda','행사 식순',agenda,false,'시간표 순서 진행'],
  ['event','행사 · 무대','event-award','시상 · 축하',award,false,'상장 수상 축하'],
  ['event','행사 · 무대','event-break','쉬는 시간',intermission,false,'휴식 대기 재개'],
  ['event','행사 · 무대','event-closing','행사 마무리',eventClosing,false,'폐회 감사 끝'],
  ['training','연수 · 워크숍','training-cover','연수 표지',workshop,true,'교사 특강 세미나 워크샵'],
  ['training','연수 · 워크숍','training-speaker','강사 소개',speaker,false,'프로필 소개 발표자'],
  ['training','연수 · 워크숍','training-goals','연수 목표',goals,false,'목표 배움 세가지'],
  ['training','연수 · 워크숍','training-practice','실습 안내',handsOn,false,'직접 만들기 준비물 활동'],
  ['training','연수 · 워크숍','training-change','배움 전과 후',beforeAfter,false,'비교 변화 이전 이후'],
  ['training','연수 · 워크숍','training-recap','배움 돌아보기',recap,false,'회고 마무리 실천'],
  ['school','학교 · 공동체','school-entrance','입학 · 새 출발',entrance,true,'입학식 개학 환영'],
  ['school','학교 · 공동체','school-graduation','졸업 표지',graduation,true,'졸업식 축하'],
  ['school','학교 · 공동체','school-sports','운동회 응원',sports,false,'체육대회 청백 응원'],
  ['school','학교 · 공동체','school-exhibition','작품 전시',exhibition,false,'전시회 발표회 축제'],
  ['school','학교 · 공동체','school-parents','학부모 설명회',parents,false,'상담 학급 가정 안내'],
  ['school','학교 · 공동체','school-thanks','감사 인사',appreciation,false,'감사 마음 스승의날'],
  ['meeting','회의 · 포럼','meeting-cover','포럼 표지',forum,true,'토론 연구회 세미나 회의'],
  ['meeting','회의 · 포럼','meeting-roadmap','실행 로드맵',roadmap,false,'타임라인 과정 계획'],
  ['meeting','회의 · 포럼','meeting-discussion','토론 질문',discussion,false,'대화 질문 나눔'],
  ['meeting','회의 · 포럼','meeting-compare','두 안 비교',comparison,false,'비교 장단점 선택'],
  ['meeting','회의 · 포럼','meeting-decision','회의 결정',decision,false,'의사결정 약속 합의'],
  ['meeting','회의 · 포럼','meeting-tasks','할 일 정리',tasks,false,'담당 기한 실행 계획'],
  ['guide','안내 · 캠페인','guide-notice','참여 안내',notice,true,'공지 행사 장소 시간'],
  ['guide','안내 · 캠페인','guide-registration','신청 · 모집',registration,false,'참가 신청 등록 모집'],
  ['guide','안내 · 캠페인','guide-rules','안전 약속',rules,false,'안전 수칙 규칙'],
  ['guide','안내 · 캠페인','guide-direction','오시는 길',direction,false,'장소 방향 안내 화살표'],
  ['guide','안내 · 캠페인','guide-checklist','준비물 점검',checklist,false,'체크리스트 준비 확인'],
  ['guide','안내 · 캠페인','guide-campaign','실천 캠페인',campaign,false,'홍보 환경 참여 실천'],
];

/** 기본 목록에 이어 붙인다. id는 저장 자료와 충돌하지 않게 occasion- 접두어를 쓴다. */
export const OCCASION_LAYOUTS = entries.map(([palette,group,id,name,items,cover,keywords]) => Object.freeze({
  id:`occasion-${id}`, name, group, category:group, occasion:true, keywords, tags:keywords.split(' '), ratio:'16:9', cover, bg:PALETTES[palette].bg, items,
}));

/** 검색어를 여러 개 입력하면 모두 포함된 틀을 찾는다. UI에서 원본 목록을 바꾸지 않고 사용한다. */
export function matchesLayout(layout, query='') {
  const words=String(query).trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const haystack=[layout?.name,layout?.group,layout?.keywords].filter(Boolean).join(' ').toLocaleLowerCase();
  return words.every((word)=>haystack.includes(word));
}
