import {COLLECTIONS,createCollectionSlides} from './design-collections.js';
import {configure} from '../src/model.js';
import {ONBATANG_FONTS,ONBATANG_TITLE_FONT} from './fonts.js';
import {setTitleFont} from './templates.js';
import {registerFonts} from '../src/fonts.js';
import {mountPlayer} from './player.js';

export function startCollectionPreview(shelf){
  const select=shelf.querySelector('#story-choice'),stage=shelf.querySelector('#story-stage');
  const previous=shelf.querySelector('#story-prev'),next=shelf.querySelector('#story-next'),count=shelf.querySelector('#story-count');
  const stories=COLLECTIONS.filter(set=>set.beats);
  if(!select.options.length)for(const set of stories)select.add(new Option(set.name,set.id));
  let player;
  configure({aspect:16/9,maxItems:40,fonts:ONBATANG_FONTS});
  setTitleFont(ONBATANG_TITLE_FONT);
  registerFonts(ONBATANG_FONTS);
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
