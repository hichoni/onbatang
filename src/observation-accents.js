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
];
