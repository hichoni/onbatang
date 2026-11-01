import { effectArt } from './effect-assets.js';
import { easeFn } from './easing.js';

// Cards and the observation controls sample the same authored timeline.
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

export function effectFrames(id,options) {
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
  return {svg,duration:length,paint(progress){
    for(const track of tracks)track(progress*length);
  }};
}

export function runEffectFrames(frames,start,duration,onFrame,onEnd) {
  let timer,previous=performance.now(),elapsed=start*duration;
  frames.paint(start);
  function tick(){
    if(!frames.svg.isConnected){onEnd(false);return;}
    if(document.hidden){onEnd(false);return;}
    const now=performance.now();
    // Keep a delayed first paint from jumping straight to the poster on a busy phone.
    elapsed+=Math.min(100,now-previous);
    previous=now;
    const progress=Math.min(1,elapsed/duration);
    frames.paint(progress);
    onFrame?.(progress);
    if(progress===1){onEnd(true);return;}
    timer=setTimeout(tick,1000/30);
  }
  timer=setTimeout(tick,1000/30);
  return ()=>clearTimeout(timer);
}
