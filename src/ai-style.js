// A narrow patch vocabulary shared by the host and the native editor.
export const STYLE_KEYS=['x','y','w','h','size','color','align','bold','rot','op'];
export function stylePatch(raw,item,aspect=16/9){
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||!item||item.lock||!['text','shape','image','emoji','art'].includes(item.t))return null;
 if(Object.keys(raw).some(k=>!STYLE_KEYS.includes(k)))return null;
 const out={},limits={x:[0,100],y:[0,100],w:[item.t==='text'?10:item.t==='image'?5:2,100],h:[item.t==='image'?5:.6,100],size:[1.8,18],rot:[-180,180],op:[10,100]};
 for(const [k,v] of Object.entries(raw)){
  if(k==='h'&&item.t==='text'||['size','align','bold'].includes(k)&&item.t!=='text'||k==='color'&&!['text','shape'].includes(item.t))return null;
  if(limits[k]){if(!Number.isFinite(v)||v<limits[k][0]||v>limits[k][1])return null;out[k]=Math.round(v*100)/100;}
  else if(k==='color'){if(typeof v!=='string'||!/^#[0-9a-f]{6}$/i.test(v))return null;out[k]=v;}
  else if(k==='align'){if(!['l','c','r'].includes(v))return null;out[k]=v;}
  else if(k==='bold'){if(typeof v!=='boolean')return null;out[k]=v;}
 }
 const next={...item,...out};
 if(next.x-next.w/2<-.01||next.x+next.w/2>100.01)return null;
 if(Number.isFinite(next.h)&&(next.y-next.h/2<-.01||next.y+next.h/2>100.01))return null;
 return Object.keys(out).length?out:null;
}
