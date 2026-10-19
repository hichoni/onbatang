// Small user preferences, separate from design history and source documents.
const hex=value=>typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value)?value.toLowerCase():null;
const colors=value=>[...new Set((Array.isArray(value)?value:[]).map(hex).filter(Boolean))].slice(0,12);
export function cleanPalettes(value={}) {
  if(!value||typeof value!=='object')value={};
  return {version:1,active:Number.isInteger(value.active)&&value.active>=0&&value.active<4?value.active:0,
    recent:colors(value.recent),slots:Array.from({length:4},(_,i)=>({name:typeof value.slots?.[i]?.name==='string'?value.slots[i].name.replace(/[\u0000-\u001f]/g,'').slice(0,18):`팔레트 ${i+1}`,colors:colors(value.slots?.[i]?.colors)}))};
}
export function updatePalettes(state,action){
  const next=cleanPalettes(state),slot=next.slots[next.active],color=hex(action.color);
  if(action.type==='select'&&Number.isInteger(action.index)&&action.index>=0&&action.index<4)next.active=action.index;
  if(action.type==='rename'&&typeof action.name==='string')slot.name=action.name.slice(0,18);
  if((action.type==='recent'||action.type==='add')&&color)next.recent=colors([color,...next.recent]);
  if(action.type==='add'&&color)slot.colors=colors([...slot.colors.filter(c=>c!==color),color].slice(-12));
  if(action.type==='remove'&&color)slot.colors=slot.colors.filter(c=>c!==color);
  return cleanPalettes(next);
}
