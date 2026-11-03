// Optional, bounded scene edits. No field is required by an older document.
const keys={beatintro:['phrase1','phrase2','phrase3'],spotlighttitle:['light','title'],
  rollingnumber:['number','caption'],paperhorizon:['sun','landscape','title'],fieldroute:['step1','step2','step3']};
const texts={beatintro:['phrase1','phrase2','phrase3'],spotlighttitle:['title'],
  rollingnumber:['number','caption'],paperhorizon:['title'],fieldroute:['step1','step2','step3']};
export const trackLimits={dx:[-360,360],dy:[-180,180],scale:[.4,2.5],start:[0,30000],duration:[200,10000]};
export function cleanCinemaTracks(id,raw){
  if(!Array.isArray(raw)||!keys[id])return [];
  const found=new Set(),out=[];
  for(const row of raw.slice(0,12)){
    if(!row||!keys[id].includes(row.key)||found.has(row.key))continue;
    found.add(row.key);const value={key:row.key};
    for(const [name,[lo,hi]] of Object.entries(trackLimits))if(Number.isFinite(row[name])){
      value[name]=Math.round(Math.max(lo,Math.min(hi,row[name]))*100)/100;
    }
    if(texts[id].includes(row.key)&&typeof row.text==='string'){
      const text=Array.from(row.text.trim()).slice(0,72).join('');
      if(text&&(row.key!=='number'||/^[+−-]?\d[\d,]*(?:\.\d+)?[%％]?$/.test(text)&&text.replace(/\D/g,'').length<=8))value.text=text;
    }
    if(texts[id].includes(row.key)&&typeof row.teacherNote==='string'){
      const note=row.teacherNote.trim().slice(0,1000);
      if(note)value.teacherNote=note;
    }
    if(Object.keys(value).length>1)out.push(value);
  }
  return out;
}
// Student HTML omits private cue notes together with the slide's speaker notes.
export function withoutCinemaNotes(effect){
  if(!effect?.sceneTracks)return effect;
  const sceneTracks=effect.sceneTracks.map(({teacherNote,...track})=>track).filter(t=>Object.keys(t).length>1);
  const {sceneTracks:old,...rest}=effect;
  return sceneTracks.length?{...rest,sceneTracks}:rest;
}
export function cinemaEnd(id,options){
  return Math.max(0,...cleanCinemaTracks(id,options.sceneTracks).map(t=>
    t.start===undefined&&t.duration===undefined?0:(t.start??3000)+(t.duration??4000)));
}

// Layout lives outside animated groups: a reveal never overwrites the teacher's
// transform. The same part factory also feeds the deterministic Safari scrubber.
export function sceneLayerPart(part,root,options){
  function layer(key,spec,draw,timingOnly=false){
    const edit=options.sceneTracks?.find(t=>t.key===key)||{};
    const start=edit.start??spec.start,duration=edit.duration??spec.duration;
    const group=part('g',{'data-cinema-cue':key,...(timingOnly?{}:{'data-cinema-track':key,'data-track-label':spec.label,
      'data-track-text':edit.text??spec.text??'','data-track-editable':spec.text===undefined?'false':'true',
      'data-track-cx':spec.cx,'data-track-cy':spec.cy,'data-track-start':start,'data-track-duration':duration,
      transform:`translate(${spec.cx+(edit.dx||0)} ${spec.cy+(edit.dy||0)}) scale(${edit.scale??1}) translate(${-spec.cx} ${-spec.cy})`})},null,0,0,root);
    const timed=edit.start!==undefined||edit.duration!==undefined;
    // Static glyphs/pins in a moved cue must not leak before its new start.
    const gate=timed?part('g',{},[{opacity:0},{opacity:1}],start,1,group):group;
    const local=(tag,attrs,frames,delay=0,length=1050,parent=gate)=>part(tag,attrs,frames,
      frames&&timed?start+(delay-spec.start)*duration/spec.duration:delay,
      frames&&timed?length*duration/spec.duration:length,parent);
    draw(local,edit.text??spec.text);
    return group;
  }
  part.layer=(key,spec,draw)=>layer(key,spec,draw);
  part.timing=(key,spec,draw)=>layer(key,spec,draw,true);
  return part;
}
