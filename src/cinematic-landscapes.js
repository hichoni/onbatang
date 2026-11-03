import {introLines, letter, titleLines} from './effect-scenes.js';

const rise = [{opacity:0,transform:'translateY(12px)'},{opacity:1,transform:'translateY(0px)'}];

export function paperHorizon({part,ink,content,options={}}) {
  const depth=(options.depth??100)/100;
  part('rect',{width:720,height:360,fill:'#f8edd5'});
  part.layer('sun',{label:'떠오르는 해',cx:582,cy:127,start:80,duration:1760},part=>{
  const sun=part('g',{},[{transform:'translateY(86px)'},{transform:'translateY(0px)'}],80,1760);
  part('circle',{cx:582,cy:127,r:81,fill:ink[0]},null,0,0,sun);
  for(let i=0;i<9;i++){
    const dy=8+i*8,half=Math.sqrt(81*81-dy*dy);
    part('path',{d:'M'+(582-half)+' '+(127+dy)+'h'+2*half,stroke:'#fff1d5','stroke-width':1+i*.34,opacity:.68},null,0,0,sun);
  }
  });
  // Each ridge extends past the frame. A nearer sheet travels farther during the same camera move.
  const ridges=[
    ['M-94 258L76 201 135 215 257 154 375 206 478 145 526 163 598 122 820 220','#dfbca0',-13,12],
    ['M-94 291Q49 216 154 246T361 224Q446 177 536 197T820 154',ink[1],22,19],
    ['M-94 263Q48 225 152 278T398 260Q538 197 646 222T820 235',ink[2],-42,26],
    ['M-94 326Q24 303 113 314T314 288Q444 250 524 269T820 251','#28424a',64,35],
  ];
  part.layer('landscape',{label:'종이 능선',cx:360,cy:280,start:0,duration:2170},part=>{
  for(const [edge,fill,dx,dy] of ridges){
    const sheet=part('g',{},[{transform:'translate('+dx*depth+'px,'+dy*depth+'px)'},{transform:'translate(0px,0px)'}],0,2170);
    part('path',{d:edge+'V402H-94Z',fill},null,0,0,sheet);
    part('path',{d:edge,fill:'none',stroke:'#fff4d8','stroke-width':2,opacity:.65},null,0,0,sheet);
  }
  });
  // Wind lines stay above the ridge, with a shorter journey than the foreground.
  for(let i=0;i<3;i++){
    const x=472+i*17,y=61-i%2*6;
    part('path',{d:'M'+x+' '+y+'q4-2 7 2q3-4 7-4',stroke:'#715e50',fill:'none','stroke-width':1.7},
      [{opacity:0,transform:'translate(-32px,8px)'},{opacity:1,transform:'translate(0px,0px)'}],260+i*70,1680);
  }
  letter(part,'수업의 시작',36,39,17,'#594f43',{'font-weight':750});
  const titleText=options.sceneTracks?.find(t=>t.key==='title')?.text||content.text;
  const titleDuration=820+(titleLines(titleText.replace(/\s+/g,' '),460,[54,44,34,27,22,18]).lines.length-1)*155;
  part.layer('title',{label:'제목',text:content.text,cx:264,cy:117,start:300,duration:titleDuration},(part,text)=>{
  const {size,lines}=titleLines(text.replace(/\s+/g,' '),460,[54,44,34,27,22,18]);
  lines.forEach((row,i)=>{
    const y=117+(i-(lines.length-1)/2)*size*1.08;
    for(const word of row)letter(part,word.text,34+word.x,y,size,'#202e34',{'font-weight':800},rise,300+i*155,820);
  });
  });
  part('path',{d:'M36 315H80',stroke:ink[0],'stroke-width':3,pathLength:1,'stroke-dasharray':'1 1'},
    [{strokeDashoffset:1},{strokeDashoffset:0}],820,850);
  letter(part,'HORIZON  /  01',36,339,12,'#f8edd5',{'letter-spacing':2});
}

export function fieldRoute({part,ink,content,options={}}) {
  const lines=introLines(content.text);
  part('rect',{width:720,height:360,fill:'#e7e4cc'});
  // A coastal survey map, with engraved contours and a bearing grid.
  const coast='M265 -12Q396 24 404 73T482 142Q566 176 566 225T748 319';
  part('path',{d:coast+'V-14Z',fill:'#a7c8bf'});
  for(let i=0;i<13;i++)part('path',{d:coast,transform:'translate('+(-76+i*13)+' '+(14-i*2)+')',stroke:'#566e66',
    'stroke-width':i%4===0?1.6:.8,opacity:i<6?.32:.23,fill:'none'});
  for(let x=305;x<720;x+=44)part('path',{d:'M'+x+' 0v360',stroke:'#527072',opacity:.17});
  for(let y=23;y<360;y+=44)part('path',{d:'M290 '+y+'h430',stroke:'#527072',opacity:.17});
  part('path',{d:'M0 0H304L282 360H0Z',fill:'#162e36'});
  letter(part,'탐사 항로',27,51,31,'#f9efd9',{'font-weight':800});
  part('path',{d:'M27 70H259',stroke:'#66817e'});
  letter(part,'FIELD NOTES   /   '+String(lines.length).padStart(2,'0'),27,329,12,ink[0],{'letter-spacing':2});
  part('path',{d:'M666 302l-6 17 6-3 6 3z',fill:'#314e50'});
  letter(part,'N',666,299,11,'#314e50',{'text-anchor':'middle','font-weight':800});
  const legs=[
    {x:356,y:251,d:'M302 298Q315 260 356 251'},
    {x:505,y:162,d:'M356 251C416 237 414 173 505 162'},
    {x:633,y:80,d:'M505 162C573 153 558 85 633 80'},
  ];
  // Keep the route under every pin. Its moving tip samples the same path length as the stroke.
  const travel=options.legMs??650;
  for(let i=0;i<lines.length;i++){
    const delay=160+i*travel;
    part.timing('step'+(i+1),{start:delay,duration:Math.max(travel+260,820)},part=>{
    const path=part('path',{d:legs[i].d,fill:'none',stroke:'#2a4847','stroke-width':4,pathLength:1,'stroke-dasharray':'1 1'},
      [{strokeDashoffset:1},{strokeDashoffset:0}],delay,travel);
    const length=path.getTotalLength();
    const positions=Array.from({length:17},(_,n)=>{
      const {x,y}=path.getPointAtLength(length*n/16);
      return {offset:n/16,transform:'translate('+x+'px,'+y+'px)',opacity:n===0||n===16?0:1};
    });
    const tip=part('circle',{r:5,fill:ink[0],stroke:'#2a4847','stroke-width':1.5},positions,delay,travel);
    tip.parentNode.setAttribute('opacity',0);
    });
  }
  lines.forEach((line,i)=>{
    const {x,y}=legs[i], delay=160+i*travel;
    part.timing('step'+(i+1),{start:delay,duration:Math.max(travel+260,820)},part=>{
    const ring=part('g',{},rise,delay+travel-130,390);
    part('circle',{cx:x,cy:y,r:16,fill:'#203e42',stroke:'#faf1db','stroke-width':2},null,0,0,ring);
    part('text',{x,y:y+5,'text-anchor':'middle','font-family':'system-ui,sans-serif','font-size':14,'font-weight':800,fill:ink[0]},null,0,0,ring).textContent=String(i+1);
    });
    const cy=177+(i-(lines.length-1)/2)*70;
    part.layer('step'+(i+1),{label:'단계 '+(i+1),text:line,cx:156,cy:cy-8,start:delay,duration:Math.max(travel+260,820)},(part,text)=>{
    letter(part,String(i+1).padStart(2,'0'),27,cy,14,ink[0],{'font-weight':750},rise,delay,400);
    const block=titleLines(text.replace(/\s+/g,' '),199,[29,24,19,15,12]);
    block.lines.forEach((row,n)=>{
      const ty=cy+(n-(block.lines.length-1)/2)*block.size*1.07;
      for(const word of row)letter(part,word.text,60+word.x,ty,block.size,'#f7f3df',{'font-weight':800},rise,delay+250,570);
    });
    });
  });
}
