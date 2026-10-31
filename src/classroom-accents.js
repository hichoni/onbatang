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
  {id:'corona',name:'일식의 광환',hint:'가장자리에서 바깥으로 빛의 실이 번져요',ink:['#FFE9A4','#FFB15B','#F59684'],draw:corona},
  {id:'equalizer',name:'음악의 맥박',hint:'높이가 다른 음파가 두 박자로 뛰어요',ink:['#FFD098','#FF93A0','#ADA9FF'],draw:equalizer},
  {id:'leafvein',name:'잎맥 그리기',hint:'중심 줄기에서 가느다란 잎맥이 뻗어요',ink:['#61C69E','#BDD866','#F2D48B'],draw:leafvein},
  {id:'shutter',name:'조리개 셔터',hint:'여섯 조각이 돌아 닫혔다가 열려요',ink:['#FFD784','#FFA389','#A6BDDD'],draw:shutter},
  {id:'registration',name:'색판 맞추기',hint:'어긋난 세 윤곽이 기준점에서 포개져요',ink:['#58CCC6','#FF9096','#FBD177'],draw:registration},
  {id:'speedlines',name:'결승선 질주',hint:'길이가 다른 궤적이 한 방향으로 치고 나가요',ink:['#FFE39C','#8DDCC3','#FFA483'],draw:speedlines},
];
