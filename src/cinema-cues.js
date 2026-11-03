// Stable tie order matches the visual timeline. Overlaps become separate clicks;
// authored duration and positive gaps are preserved, never added twice.
export function cinemaCues(rows,factor=1){
  const ordered=rows.filter(r=>r.editable&&Number.isFinite(r.start)&&Number.isFinite(r.duration))
    .map((r,index)=>({...r,index,start:Math.max(0,r.start)*factor,duration:Math.max(1,r.duration)*factor}))
    .sort((a,b)=>a.start-b.start||a.index-b.index);
  let previousEnd=0;
  return ordered.map(row=>{
    const wait=Math.max(0,row.start-previousEnd);previousEnd=Math.max(previousEnd,row.start+row.duration);
    return {...row,wait};
  });
}
