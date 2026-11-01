// Faint construction lines keep each study legible even at its first frame.
function spectrum({part,ink}) {
  const glass='M-34 29 L-5 -39 L35 29 Z';
  part('path',{d:glass,fill:ink[1],'fill-opacity':.09,stroke:ink[1],'stroke-width':1.4});
  part('path',{d:'M-5 -39 L9 17 L35 29 M9 17 L-34 29',fill:'none',stroke:ink[1],opacity:.32});
  const beam=(d,color,delay,duration,width)=>{
    const line={d,fill:'none',stroke:color,'stroke-width':width,'stroke-linecap':'round'};
    part('path',{...line,opacity:.17});
    part('path',{...line,pathLength:1,'stroke-dasharray':'1 1'},
      [{strokeDashoffset:1},{strokeDashoffset:0}],delay,duration);
  };
  beam('M-92 34 L-24 5 L20 3','#fff7e1',0,820,2.8);
  const exits=[5,13,21,29,37];
  const colors=[ink[0],ink[0],ink[1],ink[2],ink[2]];
  exits.forEach((y,i)=>{
    beam('M20 3 L90 '+y,colors[i],740+i*40,670,i%2?1.2:2.5);
    part('circle',{cx:90,cy:y,r:1.8,fill:colors[i]},[{opacity:0},{opacity:1}],1260+i*40,180);
  });
}

function pixelweave({part,ink}) {
  const rows=['.11.11.','1122211','1223221','.12321.','..121..','...1...'];
  // Fixed cell positions and offsets also make reverse scrubbing deterministic.
  for(let row=0;row<rows.length;row++){
    for(let col=0;col<7;col++){
      const x=(col-3)*13-6,y=(row-2.5)*13-6;
      part('rect',{x,y,width:12,height:12,rx:2,fill:ink[1],'fill-opacity':.06});
      const color=Number(rows[row][col]);
      if(!color)continue;
      const dx=(col%2?1:-1)*(22+row*4),dy=(row%2?1:-1)*(8+col*2);
      part('rect',{x,y,width:12,height:12,rx:2,fill:ink[color-1]},[
        {transform:'translate('+dx+'px,'+dy+'px)',opacity:.08},
        {transform:'translate(0,0)',opacity:1},
      ],row*140+col*48,600);
    }
  }
}

export const OBSERVATION_ACCENTS=[
  {id:'spectrum',name:'프리즘 분광',hint:'빛이 유리 안에서 꺾이고 여러 색으로 퍼지는 지점을 찾아보세요.',
    ink:['#ffb47d','#85f2d8','#96a6ff'],draw:spectrum,stops:[[18,'입사광'],[46,'프리즘 안'],[95,'퍼진 빛']]},
  {id:'pixelweave',name:'픽셀 직조',hint:'흩어진 색 조각이 격자에 모여 하트 한 개를 완성해요.',
    ink:['#ff7898','#ffb59e','#ffe8b9'],draw:pixelweave,stops:[[8,'흩어진 칸'],[49,'맞춰지는 칸'],[100,'완성된 하트']]},
  {id:'aurorafold',name:'오로라 물결',hint:'여러 겹의 빛이 천천히 들리고, 색의 결이 겹쳐져요.',
    ink:['#71f3c0','#79b9ff','#c9a5ff'],draw:aurorafold,stops:[[12,'빛의 실'],[54,'겹쳐지는 물결'],[94,'열린 커튼']]},
  {id:'paperstar',name:'종이별 펼침',hint:'접힌 색종이가 다섯 방향으로 열리며 별이 돼요.',
    ink:['#ffd599','#ff9b9b','#b8aeff'],draw:paperstar,stops:[[8,'접힌 종이'],[48,'열리는 면'],[96,'다섯 꼭짓점']]},
];

function aurorafold({part,ink}) {
  for(let i=0;i<12;i++){
    const y=33-i*4;
    const d='M-94 '+y+' C-55 '+(y-47)+' -37 '+(y+38)+' -3 '+(y-14)+
      ' S54 '+(y-38)+' 94 '+(y-12);
    part('path',{d,fill:'none',stroke:ink[Math.floor(i/4)],'stroke-width':i%4===0?2.2:1.1,
      'stroke-linecap':'round'},[
      {transform:'translate(0px,18px) scaleY(.22)',opacity:.08},
      {transform:'translate(0px,-3px) scaleY(1.05)',opacity:.85,offset:.52},
      {transform:'translate(0px,0px) scaleY(1)',opacity:.7},
    ],i*25,1000);
  }
  for(const [x,y] of [[-71,-44],[-34,-53],[41,-43],[76,-29]]){
    part('circle',{cx:x,cy:y,r:1.2,fill:ink[1]},[{opacity:0},{opacity:.85}],300,700);
  }
}

function paperstar({part,ink}) {
  for(let i=0;i<5;i++){
    const rotation='rotate('+i*72+')';
    for(const [d,color] of [['M0 0 L0 -58 L14 -19 Z',ink[i%3]],['M0 0 L-14 -19 L0 -58 Z',ink[(i+1)%3]]]){
      part('path',{d,fill:color,transform:rotation,'stroke-width':.5,stroke:color},[
        {transform:'rotate(-42deg) scale(.14)',opacity:.25},
        {transform:'rotate(3deg) scale(1.05)',opacity:1,offset:.67},
        {transform:'rotate(0deg) scale(1)',opacity:1},
      ],i*75,900);
    }
    part('path',{d:'M0 -6 L0 -50',transform:rotation,fill:'none',stroke:'#fff5df','stroke-width':.7,
      pathLength:1,'stroke-dasharray':'1 1'},[{strokeDashoffset:1,opacity:0},{strokeDashoffset:0,opacity:.65}],570+i*40,460);
  }
}
