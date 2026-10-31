// Standalone SVG accents. Each rest pose doubles as the accessible reduced-motion poster.
function corona({part,ink}){
  for(let i=0;i<12;i++){
    const angle=i*Math.PI/6,x=Math.cos(angle),y=Math.sin(angle);
    part('path',{d:`M${x*37} ${y*37} Q${x*53-y*5} ${y*53+x*5} ${x*(i%2?54:66)} ${y*(i%2?54:66)}`,
      fill:'none',stroke:ink[i%3],'stroke-width':i%2?1.5:3,'stroke-linecap':'round'},[
      {transform:'scale(.62)',opacity:0},{transform:'scale(1)',opacity:1,offset:.5},{transform:'scale(1.15)',opacity:0},
    ],i*24,900);
  }
  part('circle',{r:34,fill:'none',stroke:ink[0],'stroke-width':3},[{opacity:0},{opacity:1,offset:.45},{opacity:0}],0,1180);
}

function equalizer({part,ink}){
  const bars=[13,23,17,34,46,29,50,38,22,32,16,10,6];
  bars.forEach((h,i)=>part('rect',{x:-79+i*12,y:-h,width:6,height:h*2,rx:3,fill:ink[i%3]},[
    {transform:'scaleY(.08)',opacity:0},{transform:'scaleY(1)',opacity:1,offset:.34},
    {transform:'scaleY(.4)',opacity:1,offset:.58},{transform:'scaleY(.78)',opacity:.9,offset:.75},{transform:'scaleY(.08)',opacity:0},
  ],i*32,930));
}

function leafvein({part,ink}){
  const paths=['M-69 36 Q-5 26 65 -38','M-45 30 Q-45 9 -30 -5','M-24 21 Q-21 -3 -4 -18',
    'M-2 10 Q1 -14 23 -30','M-31 25 Q-9 37 17 26','M-7 13 Q17 24 42 8','M17 -3 Q43 8 61 -12'];
  paths.forEach((d,i)=>part('path',{d,fill:'none',stroke:ink[i?1+i%2:0],'stroke-width':i?2:4,
    'stroke-linecap':'round',pathLength:1,'stroke-dasharray':'1 1'},[
    {strokeDashoffset:1,opacity:0},{strokeDashoffset:0,opacity:1,offset:.6},{strokeDashoffset:0,opacity:1,offset:.84},{opacity:0},
  ],i?110+i*55:0,980));
}

function shutter({part,ink}){
  for(let i=0;i<6;i++){
    const a=i*60;
    part('path',{d:'M0 -49 L32 -36 L17 -8 L-5 -18 Z',transform:`rotate(${a})`,fill:ink[i%3]},[
      {transform:'scale(1.38) rotate(-24deg)',opacity:0},{transform:'scale(.72) rotate(7deg)',opacity:.96,offset:.43},
      {transform:'scale(.72) rotate(7deg)',opacity:.96,offset:.56},{transform:'scale(1.42) rotate(33deg)',opacity:0},
    ],0,1020);
  }
}

function registration({part,ink}){
  [[-19,7],[14,-12],[1,9]].forEach(([x,y],i)=>{
    part('rect',{x:-29,y:-20,width:58,height:40,rx:2,fill:'none',stroke:ink[i],'stroke-width':5-i*1.5},[
      {transform:`translate(${x}px,${y}px) rotate(${i*4-5}deg)`,opacity:.15},
      {transform:'none',opacity:1,offset:.65},{transform:'none',opacity:1,offset:.83},{opacity:0},
    ],i*38,1080);
  });
  for(const [x,y] of [[-50,-33],[52,33]])part('path',{d:`M${x-6} ${y}h12 M${x} ${y-6}v12`,stroke:ink[0],fill:'none','stroke-width':1.6});
}

function speedlines({part,ink}){
  for(const [i,length] of [44,76,92,58,33].entries()){
    const y=(i-2)*8;
    part('path',{d:`M${-length+16} ${y+9}l${length} -18`,stroke:ink[i%3],fill:'none','stroke-width':i===2?5:2.5,'stroke-linecap':'round'},[
      {transform:'translate(-27px,6px) scaleX(.18)',opacity:0},{transform:'none',opacity:1,offset:.42},
      {transform:'translate(42px,-8px) scaleX(.63)',opacity:0},
    ],i*50,790);
  }
  part('path',{d:'M30 -19l15 -3 -6 12',stroke:ink[0],fill:'none','stroke-width':3},[
    {transform:'translateX(-32px)',opacity:0},{opacity:1,offset:.45},{transform:'translateX(40px)',opacity:0},
  ],150,800);
}

export const CLASSROOM_ACCENTS=[
  {id:'suntrack',name:'햇빛의 호',hint:'빛이 호를 따라 움직이면 중심의 그림자가 반대편으로 돌아요.',ink:['#FFD68B','#A0C9D5','#F4AD69'],draw:suntrack},
  {id:'routewalk',name:'길찾기 표식',hint:'표식을 지나는 점이 두 번 꺾어 목적지에 도착해요.',ink:['#A6E3BD','#FFCA7C','#83CBCE'],draw:routewalk},
  {id:'corona',name:'일식의 광환',hint:'가장자리에서 바깥으로 빛의 실이 번져요',ink:['#FFE9A4','#FFB15B','#F59684'],draw:corona},
  {id:'equalizer',name:'음악의 맥박',hint:'높이가 다른 음파가 두 박자로 뛰어요',ink:['#FFD098','#FF93A0','#ADA9FF'],draw:equalizer},
  {id:'leafvein',name:'잎맥 그리기',hint:'중심 줄기에서 가느다란 잎맥이 뻗어요',ink:['#61C69E','#BDD866','#F2D48B'],draw:leafvein},
  {id:'shutter',name:'조리개 셔터',hint:'여섯 조각이 돌아 닫혔다가 열려요',ink:['#FFD784','#FFA389','#A6BDDD'],draw:shutter},
  {id:'registration',name:'색판 맞추기',hint:'어긋난 세 윤곽이 기준점에서 포개져요',ink:['#58CCC6','#FF9096','#FBD177'],draw:registration},
  {id:'speedlines',name:'결승선 질주',hint:'길이가 다른 궤적이 한 방향으로 치고 나가요',ink:['#FFE39C','#8DDCC3','#FFA483'],draw:speedlines},
];

function suntrack({part,ink}){
  part('path',{d:'M-52 22 Q0 -64 52 22',fill:'none',stroke:ink[0],'stroke-width':1.8,'stroke-dasharray':'2 4'});
  part('path',{d:'M0 2l21 13 -19 -8Z',fill:ink[1]},[
    {transform:'rotate(-19deg) scale(1.3)'},{transform:'rotate(68deg) scale(.65)',offset:.5},{transform:'rotate(142deg) scale(1.3)'}],0,1200);
  const arc=Array.from({length:13},(_,i)=>{const t=i/12;return {transform:'translate('+(-104+104*t)+'px,'+(-172*t*(1-t))+'px)',offset:t};});
  part('circle',{cx:52,cy:22,r:5.5,fill:ink[0]},arc,0,1200);
  part('circle',{cx:0,cy:3,r:3.5,fill:ink[2]});
}

function routewalk({part,ink}){
  const stops=[[-68,24],[-22,24],[-22,-19],[52,-19]];
  part('path',{d:'M-68 24h46v-43h74',fill:'none',stroke:ink[0],'stroke-width':2.2,'stroke-dasharray':'3 4'});
  stops.forEach(([x,y],i)=>part('rect',{x:x-3,y:y-3,width:6,height:6,fill:ink[1],transform:'rotate(45 '+x+' '+y+')'},
    [{opacity:.2},{opacity:1}],i*240,320));
  part('circle',{cx:52,cy:-19,r:5.3,fill:ink[2]},stops.map(([x,y])=>({transform:'translate('+(x-52)+'px,'+(y+19)+'px)'})),0,1100);
}
