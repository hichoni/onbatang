// Shared, local-only brand motion. Progress is shown only when work reports it.
// Use the active document's DOM directly, including when a host supplies an iframe.
const el=(tag,attrs={},...children)=>{
  const node=document.createElement(tag);
  for(const [key,value]of Object.entries(attrs)){
    if(value===false||value==null)continue;
    if(key==='class')node.className=value;
    else if(key==='text')node.textContent=value;
    else if(key==='dataset')Object.assign(node.dataset,value);
    else node.setAttribute(key,value===true?'':value);
  }
  node.append(...children);return node;
};

export function onbatangLoading({title='온바탕을 준비하고 있어요',detail='잠시만 기다려주세요.',compact=false}={}) {
  const heading=el('strong',{class:'onba-loading-title',text:title});
  const note=el('span',{class:'onba-loading-detail',text:detail});
  const progress=el('progress',{'aria-label':title,hidden:true});
  const art=el('span',{class:'onba-loading-art','aria-hidden':'true'});
  // Exact paths from brand/symbol.svg, split only for motion; no external asset.
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','-24 -20 180 126');svg.setAttribute('focusable','false');
  for(const [index,fill,d]of [
    [0,'#286F62','M8 17C12 7 23 3 36 3C49 3 55 10 58 22C61 34 71 37 80 44C91 53 89 64 81 72C73 81 56 81 42 81H23C10 81 4 77 3 67C1 53 2 31 8 17Z'],
    [1,'#E5AF70','M66 5C78 3 99 4 110 9C124 15 128 27 128 43V49C128 53 125 54 122 50C113 39 101 34 86 30C72 27 66 20 63 11C62 8 63 6 66 5Z'],
    [2,'#EEEADD','M62 29C68 37 77 39 90 44C104 50 113 59 113 69C113 78 104 82 89 81H83C93 74 98 65 96 56C94 45 81 41 71 36C67 34 64 32 62 29Z']
  ]){const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('fill',fill);path.setAttribute('d',d);path.setAttribute('class',`onba-loading-piece piece-${index}`);svg.append(path);}
  art.append(svg);
  const node=el('div',{class:`onba-loading${compact?' is-compact':''}`,role:'status','aria-live':'polite',dataset:{onbatangLoading:''}},
    art,el('div',{class:'onba-loading-copy'},heading,note,progress));
  return {node,update({title:nextTitle,detail:nextDetail,completed,total}={}){
    if(nextTitle!==undefined)heading.textContent=nextTitle;
    if(nextDetail!==undefined)note.textContent=nextDetail;
    if(Number.isFinite(completed)&&Number.isFinite(total)&&total>0){progress.hidden=false;progress.max=total;progress.value=Math.max(0,Math.min(total,completed));}
    else progress.hidden=true;
  }};
}
