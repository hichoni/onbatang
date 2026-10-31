import {COLLECTIONS,createCollectionSlides} from './design-collections.js';
import {configure} from '../src/model.js';
import {ONBATANG_FONTS,ONBATANG_TITLE_FONT} from './fonts.js';
import {setTitleFont} from './templates.js';
import {registerFonts} from '../src/fonts.js';
import {mountPlayer} from './player.js';
import {designView} from '../src/render.js';
import {openSlideCompare} from './slide-compare.js';

function prepareArt(){
  configure({aspect:16/9,maxItems:40,fonts:ONBATANG_FONTS});
  setTitleFont(ONBATANG_TITLE_FONT);
  registerFonts(ONBATANG_FONTS);
}

export function compareCollection(id){
  prepareArt();
  const set=COLLECTIONS.find(story=>story.id===id),slides=createCollectionSlides(id);
  const pages=slides.map((slide,index)=>({index,key:slide.id,ratio:16/9,label:(index+1)+'쪽 · '+set.beats[index][0]}));
  const current=id==='sundial'?3:4;
  return openSlideCompare(document.body,{pages,current,
    memory:{anchor:pages[current].key,left:pages[1].key,right:pages[current].key,position:50,mode:'wipe',marks:[]},
    preview:i=>{const view=designView(slides[i]);view.style.setProperty('--fe-ratio',String(16/9));return view;}});
}

export function startCollectionPreview(shelf){
  const select=shelf.querySelector('#story-choice'),stage=shelf.querySelector('#story-stage');
  const previous=shelf.querySelector('#story-prev'),next=shelf.querySelector('#story-next'),count=shelf.querySelector('#story-count');
  const stories=COLLECTIONS.filter(set=>set.beats);
  if(!select.options.length)for(const set of stories)select.add(new Option(set.name,set.id));
  let player;
  prepareArt();
  function open(){
    player?.destroy();
    const set=stories.find(story=>story.id===select.value);
    player=mountPlayer(stage,{slides:createCollectionSlides(set.id),onChange:({at,total})=>{
      previous.disabled=at===0;next.disabled=at===total-1;
      count.textContent=(at+1)+' / '+total+' · '+set.beats[at][0];
    }});
  }
  previous.onclick=()=>player.prev();next.onclick=()=>player.next();select.onchange=open;open();
  return ()=>{player.destroy();previous.onclick=next.onclick=select.onchange=null;};
}
