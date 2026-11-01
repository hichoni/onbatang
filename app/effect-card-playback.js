import { effectArt } from '../src/effect-assets.js';
import { easeFn } from '../src/easing.js';

// A tap in the gallery paints one short sequence directly into the SVG.
// Use the authored keyframes, including transform order and chart baselines.
const ease = easeFn('cubic-bezier(.22,.68,.32,1)');
const mix = (a,b,t) => a+(b-a)*t;
function transformParts(value) {
  return Array.from(value.matchAll(/(\w+)\(([^)]+)\)/g), ([,name,args]) => {
    const [x,y] = args.trim().split(/[ ,]+/).map(parseFloat);
    switch(name) {
      case 'rotate': return ['rotate',x];
      case 'translateX': return ['translate',x,0];
      case 'translateY': return ['translate',0,x];
      case 'translate': return ['translate',x,y??0];
      case 'scaleX': return ['scale',x,1];
      case 'scaleY': return ['scale',1,x];
      case 'scale': return ['scale',x,y??x];
      default: throw Error('Unknown effect transform: '+name);
    }
  });
}

function transformBetween(a,b,t) {
  // CSS expands "none" to the identity of each matching transform function.
  const parts=a.length?a:b;
  return parts.map(([name,...args],i) => {
    const identity=name==='scale'?1:0;
    const values=args.map((_,j)=>mix(a[i]?.[j+1]??identity,b[i]?.[j+1]??identity,t));
    return name+'('+values.join(' ')+')';
  }).join(' ');
}

function attributeTrack(node,frames,key,attribute,initial) {
  const points=frames.flatMap((frame,i)=>frame[key]===undefined?[]:[{
    at:frame.offset??i/(frames.length-1), value:key==='transform'?transformParts(frame[key]):frame[key],
  }]);
  if (!points.length) return null;
  if (points[0].at>0) points.unshift({at:0,value:initial});
  if (points[points.length-1].at<1) points.push({at:1,value:initial});
  const interpolate=key==='transform'?transformBetween:mix;
  return progress => {
    let i=1;
    while(i<points.length-1 && progress>points[i].at)i++;
    const left=points[i-1],right=points[i];
    node.setAttribute(attribute,interpolate(left.value,right.value,(progress-left.at)/(right.at-left.at)));
  };
}

export function playEffectCard(container,id,options,onEnd) {
  const tracks=[];
  let length=0;
  const svg=effectArt(id,false,options,(node,frames,delay,duration)=>{
    const attributes=[
      attributeTrack(node,frames,'opacity','opacity',1),
      attributeTrack(node,frames,'transform','transform',[]),
      attributeTrack(node,frames,'strokeDashoffset','stroke-dashoffset',0),
    ].filter(Boolean);
    length=Math.max(length,delay+duration);
    tracks.push(ms=>{
      const p=ease((ms-delay)/duration);
      for(const paint of attributes)paint(p);
    });
  });
  container.replaceChildren(svg);
  const paint=ms=>{for(const track of tracks)track(ms);};
  paint(0);
  let timer,previous=performance.now(),elapsed=0;
  function finish(){
    clearTimeout(timer);
    if(container.firstChild===svg){
      container.replaceChildren(effectArt(id,false,options));
      onEnd();
    }
  }
  function tick(){
    if(!svg.isConnected || container.firstChild!==svg)return;
    const now=performance.now();
    // Keep a delayed first paint from jumping straight to the poster on a busy phone.
    elapsed+=Math.min(100,now-previous);
    previous=now;
    if(document.hidden || elapsed>=length){finish();return;}
    paint(elapsed);
    timer=setTimeout(tick,1000/30);
  }
  timer=setTimeout(tick,1000/30);
  return finish;
}
