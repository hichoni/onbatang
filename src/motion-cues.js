export const MAX_MOTION_CUES=6;
export const MOTION_CUE_LABEL_LENGTH=28;

// Keep the teacher's presentation order, including a return to an earlier time.
export function cleanMotionCues(raw) {
  if(!Array.isArray(raw))return [];
  const cues=[],seen=new Set();
  for(const row of raw.slice(0,MAX_MOTION_CUES)){
    if(!Array.isArray(row) || !Number.isFinite(row[0]) || row[0]<0 || row[0]>100)continue;
    const at=Math.round(row[0]);
    if(seen.has(at))continue;
    const label=typeof row[1]==='string'?row[1].replace(/[\u0000-\u001f\u007f]/g,' ').trim():'';
    cues.push([at,Array.from(label).slice(0,MOTION_CUE_LABEL_LENGTH).join('') || '관찰 '+(cues.length+1)]);
    seen.add(at);
  }
  return cues;
}

export function motionCues(asset,raw) {
  const cues=cleanMotionCues(raw);
  return cues.length?cues:cleanMotionCues(asset.stops || [[25,'앞부분'],[50,'가운데'],[75,'뒷부분']]);
}
