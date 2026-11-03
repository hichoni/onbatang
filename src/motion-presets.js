import {cinemaSettings, cinemaTuning, sceneContent} from './effect-scenes.js';

export const MOTION_PRESET_KEY='onbatang-motion-presets-v1';
export const MOTION_PRESET_LIMIT=60;
const format='onbatang-motion-presets',limitBytes=500000;
const copy=value=>structuredClone(value);
const nameOf=value=>typeof value==='string'?Array.from(value.trim()).slice(0,40).join(''):'';
const uid=()=>globalThis.crypto.randomUUID();

export function presetOptions(effectId,raw={}){
  if(!Object.hasOwn(cinemaTuning,effectId)||!raw||typeof raw!=='object')throw Error('지원하는 시네마 움직임을 골라 주세요.');
  const out=cinemaSettings(effectId,raw);
  if(['original','lagoon','sunset','iris'].includes(raw.palette))out.palette=raw.palette;
  if(effectId!=='beatintro'&&['normal','slow','fast'].includes(raw.pace))out.pace=raw.pace;
  return out;
}
export function presetForContent(preset,keepWords=true){
  const options=presetOptions(preset.effectId,preset.options);
  if(keepWords){
    delete options.sceneText;
    if(options.sceneTracks)options.sceneTracks=options.sceneTracks.map(({text,...rest})=>rest);
  }
  return options;
}
function cleanPreset(raw){
  if(!raw||typeof raw.id!=='string'||!raw.id||raw.id.length>100||!nameOf(raw.name))throw Error('프리셋의 이름이나 형식이 올바르지 않아요.');
  const options=presetOptions(raw.effectId,raw.options);
  if(!sceneContent(raw.effectId,{t:'text',text:''},options.sceneText))throw Error('프리셋의 미리보기 문구를 확인해 주세요.');
  return {id:raw.id,name:nameOf(raw.name),effectId:raw.effectId,options};
}
function decode(text){
  if(text.length>limitBytes)throw Error('프리셋 파일은 500KB 이하로 골라 주세요.');
  let data;try{data=JSON.parse(text);}catch{throw Error('프리셋 파일을 읽을 수 없어요. 기존 보관함은 그대로예요.');}
  if(data?.format!==format||data.version!==1||!Array.isArray(data.presets)||data.presets.length>MOTION_PRESET_LIMIT)throw Error('지원하지 않는 프리셋 파일이에요. 기존 보관함은 그대로예요.');
  const presets=data.presets.map(cleanPreset);
  if(new Set(presets.map(p=>p.id)).size!==presets.length)throw Error('중복된 프리셋 번호가 있어요. 기존 보관함은 그대로예요.');
  return presets;
}
const encode=presets=>JSON.stringify({format,version:1,presets});

// Read again for each write so another tab's additions are not replaced by an old UI snapshot.
// Invalid/newer data and quota failures never fall back to overwriting the existing library.
export function createPresetLibrary(storage){
  const list=()=>{const text=storage.getItem(MOTION_PRESET_KEY);return text===null?[]:decode(text);};
  function write(rows){
    if(rows.length>MOTION_PRESET_LIMIT)throw Error('최대 60개까지 보관해요. 파일로 백업한 뒤 필요 없는 프리셋을 지워 주세요.');
    const text=encode(rows);if(text.length>limitBytes)throw Error('보관함 저장 범위를 넘었어요.');
    try{storage.setItem(MOTION_PRESET_KEY,text);}catch{throw Error('이 브라우저에 저장할 공간이나 권한이 없어요. 기존 프리셋은 그대로예요.');}
  }
  function update(id,fn){const rows=list(),index=rows.findIndex(p=>p.id===id);if(index<0)throw Error('다른 창에서 변경된 프리셋이에요. 목록을 다시 확인해 주세요.');const result=fn(rows,index);write(rows);return copy(result);}
  const api={list,
    save(effectId,raw,content,name){
      if(!nameOf(name))throw Error('프리셋 이름을 입력해 주세요.');
      const options=presetOptions(effectId,raw),scene=sceneContent(effectId,content,options.sceneText);
      if(!scene)throw Error('저장할 움직임의 문구를 확인해 주세요.');
      options.sceneText=scene.text;
      const preset=cleanPreset({id:uid(),effectId,name,options}),rows=list();rows.push(preset);write(rows);return copy(preset);
    },
    rename(id,name){if(!nameOf(name))throw Error('프리셋 이름을 입력해 주세요.');return update(id,(rows,i)=>(rows[i]={...rows[i],name:nameOf(name)}));},
    duplicate(id){return update(id,(rows,i)=>{const preset={...copy(rows[i]),id:uid(),name:nameOf(rows[i].name.slice(0,35)+' 사본')};rows.push(preset);return preset;});},
    remove(id){return update(id,(rows,i)=>rows.splice(i,1)[0]);},
    export(){return encode(list());},
    import(text){
      const incoming=decode(text),rows=list();let added=0,skipped=0;
      for(const preset of incoming){
        if(rows.some(p=>p.effectId===preset.effectId&&p.name===preset.name&&JSON.stringify(p.options)===JSON.stringify(preset.options))){skipped++;continue;}
        rows.push({...preset,id:uid()});added++;
      }
      write(rows);return {added,skipped};
    },
  };
  return api;
}
