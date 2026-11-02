import {el} from './ui.js';

/** Move the existing controls, with their original handlers and host guards. */
export function documentMenu(groups) {
  return el('details', {class:'cv-document-menu'},
    el('summary', {'aria-label':'문서 메뉴'}, '문서', el('span', {'aria-hidden':'true'}, '⌄')),
    el('div', {class:'cv-document-options'}, ...groups.map(([label,...controls]) =>
      el('section', {}, el('h3', {text:label}), ...controls.filter(Boolean)))));
}

/** Only local view state lives here; drawing data and commands stay in editor.js. */
export function bindEditorWorkspace(shell) {
  const controller=new AbortController();
  const on=(node,type,fn,options={})=>node.addEventListener(type,fn,{...options,signal:controller.signal});
  const pageToggle=shell.querySelector('.cv-pages-toggle'),propToggle=shell.querySelector('.cv-properties-toggle');
  const pages=shell.querySelector('.cv-strip'),properties=shell.querySelector('.cv-properties');
  const compact=window.matchMedia('(max-width:899px)');
  const setDrawer=(kind,open)=>{
    shell.classList.toggle(`${kind}-open`,open);
    (kind==='pages'?pageToggle:propToggle).setAttribute('aria-expanded',String(open));
  };
  const closeTools=(focus=false)=>{
    if(focus&&shell.querySelector('.fe-tabbody')?.contains(document.activeElement))shell.querySelector('.fe-tab.on')?.focus({preventScroll:true});
    shell.classList.add('folded');
  };
  const openTools=()=>{shell.classList.remove('folded');if(compact.matches){setDrawer('pages',false);setDrawer('properties',false);}};
  on(pageToggle,'click',()=>{const open=!shell.classList.contains('pages-open');closeTools();setDrawer('properties',false);setDrawer('pages',open);if(open){if(pages.classList.contains('cv-tray-collapsed'))pages.querySelector('.cv-tray-toggle')?.click();pages.querySelector('.cv-slide.on')?.focus({preventScroll:true});}});
  on(propToggle,'click',()=>{const open=!shell.classList.contains('properties-open');closeTools();setDrawer('pages',false);setDrawer('properties',open);if(open)properties.querySelector('.cv-properties-close')?.focus({preventScroll:true});});
  on(properties.querySelector('.cv-properties-close'),'click',()=>{setDrawer('properties',false);propToggle.focus({preventScroll:true});});
  on(pages,'click',event=>{if(compact.matches&&event.target.closest('.cv-slide:not(.add)'))setDrawer('pages',false);});
  on(shell.querySelector('.cv-canvas'),'pointerdown',()=>{closeTools();setDrawer('pages',false);setDrawer('properties',false);});
  const menus=()=>[...shell.querySelectorAll('.cv-document-menu[open]')];
  on(document,'pointerdown',event=>{for(const menu of menus())if(!menu.contains(event.target))menu.open=false;});
  on(shell,'click',event=>{
    // Let a shape picker stay open for comparison; commands open their own UI.
    const menu=event.target.closest('.cv-document-menu');
    if(menu&&event.target.closest('button')&&!event.target.closest('.cv-shapes'))menu.open=false;
  });
  on(shell,'keydown',event=>{
    if(event.key!=='Escape'||event.defaultPrevented)return;
    const menu=menus()[0];
    if(menu){menu.open=false;menu.querySelector('summary').focus();event.preventDefault();return;}
    if(!shell.classList.contains('folded')){closeTools(true);event.preventDefault();return;}
    for(const kind of ['pages','properties'])if(shell.classList.contains(`${kind}-open`)){
      setDrawer(kind,false);(kind==='pages'?pageToggle:propToggle).focus();event.preventDefault();return;
    }
  });
  on(compact,'change',()=>{
    // Do not leave focus in a drawer that becomes hidden after resizing.
    if(compact.matches){if(pages.contains(document.activeElement))pageToggle.focus();if(properties.contains(document.activeElement))propToggle.focus();}
    setDrawer('pages',false);setDrawer('properties',false);
  });
  const showCanvas=()=>{closeTools();setDrawer('pages',false);setDrawer('properties',false);};
  return {openTools,showCanvas,closeTools:()=>closeTools(true),inserted:()=>{if(compact.matches)closeTools();},destroy:()=>controller.abort()};
}
