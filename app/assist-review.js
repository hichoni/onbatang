import {el} from './ui.js';
import {aiDraftStore,rememberReview} from './ai-draft-store.js';

// Move the existing result and its controls together. Preview, selection,
// apply and undo continue to use the same proposal as the assistant panel.
export function createReviewDesk(shell) {
  let session=null;
  function close({focus=true}={}) {
    if(!session)return;
    const {node,moved,pages,trigger,onClose}=session;
    session=null;
    for(const [item,marker] of moved)marker.replaceWith(item);
    for(const {node:page,wasOpen} of pages){
      page.hidden=false;
      if(wasOpen!==undefined)page.open=wasOpen;
    }
    node.remove();
    shell.classList.remove('onba-reviewing');
    onClose?.();
    if(focus&&trigger?.isConnected)trigger.focus({preventScroll:true});
  }
  function open({title,prompts=[],content,actions=[],pages=[],initial=0,trigger,onClose,onPage}) {
    close({focus:false});
    const heading=el('h2',{tabindex:'-1',text:title});
    const select=el('select',{'aria-label':'확인할 장'},...pages.map(({label},i)=>el('option',{value:String(i),text:label})));
    const prev=el('button',{class:'btn',type:'button','aria-label':'이전 결과 장',onClick:()=>go(select.selectedIndex-1)},'‹');
    const next=el('button',{class:'btn',type:'button','aria-label':'다음 결과 장',onClick:()=>go(select.selectedIndex+1)},'›');
    const main=el('div',{class:'onba-review-content'}),footer=el('div',{class:'onba-review-actions'});
    const nav=el('div',{class:'onba-review-nav',hidden:!pages.length},prev,select,next);
    const request=el('div',{class:'onba-review-requests'},...prompts.map(([label,text])=>el('div',{},el('b',{text:label}),el('p',{text}))));
    const exit=el('button',{class:'btn',type:'button',onClick:()=>close()},'편집기로 돌아가기');
    const node=el('section',{class:'onba-review-desk','aria-label':'AI-G 결과 작업대'},
      el('header',{},heading),el('div',{class:'onba-review-scroll'},request,nav,main),footer);
    const moved=[];
    function move(item,parent){
      const marker=document.createComment('assistant review');
      item.replaceWith(marker);
      moved.push([item,marker]);
      parent.append(item);
    }
    for(const item of content)move(item,main);
    for(const item of actions)move(item,footer);
    footer.append(exit);
    const originals=pages.map(({node})=>({node,wasOpen:node.tagName==='DETAILS'?node.open:undefined}));
    function go(i){
      if(!pages[i])return;
      select.selectedIndex=i;
      pages.forEach(({node},j)=>{
        node.hidden=j!==i;
        if(node.tagName==='DETAILS')node.open=j===i;
      });
      prev.disabled=i===0;next.disabled=i===pages.length-1;
      onPage?.(i);
    }
    select.addEventListener('change',()=>go(select.selectedIndex));
    node.addEventListener('keydown',e=>{
      if(e.key==='Escape'&&!e.defaultPrevented){e.preventDefault();close();}
      e.stopPropagation();
    });
    node.addEventListener('contextmenu',e=>e.stopPropagation());
    session={node,moved,pages:originals,trigger,onClose};
    shell.append(node);
    shell.classList.add('onba-reviewing');
    go(pages[initial]?initial:0);
    heading.focus({preventScroll:true});
  }
  return {open,close,isOpen:()=>!!session};
}

export function requestHistory(key) {
  const historyKey=key && key+'.review-history';
  const store=aiDraftStore(historyKey);
  const list=el('ol');
  const node=el('details',{class:'onba-request-history',hidden:true},el('summary',{text:'지난 요청'}),list);
  let rows=[],queue=store.read().then(saved=>{if(Array.isArray(saved))rows=saved;draw();}).catch(()=>{});
  function draw(){
    node.hidden=!rows.length;
    list.replaceChildren(...rows.map(({prompts,summary})=>el('li',{},
      ...prompts.map(([label,text])=>el('div',{},el('b',{text:label}),el('p',{text}))),
      el('small',{text:summary}))));
  }
  function record({id,prompts,summary}){
    if(!id||!prompts.length)return;
    queue=queue.then(async()=>{
      if(rows.some(row=>row.id===id))return;
      const row={id,prompts,summary};
      rows=historyKey?await rememberReview(historyKey,row):[row,...rows].slice(0,20);
      draw();
    }).catch(()=>{});
  }
  return {node,record};
}
