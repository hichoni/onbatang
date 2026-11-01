import { effectArt } from '../src/effect-assets.js';
import { effectFrames, runEffectFrames } from '../src/effect-frames.js';

export function playEffectCard(container,id,options,onEnd) {
  const frames=effectFrames(id,options);
  container.replaceChildren(frames.svg);
  const stop=runEffectFrames(frames,0,frames.duration,null,finish);
  function finish(){
    stop();
    if(container.firstChild===frames.svg){
      container.replaceChildren(effectArt(id,false,options));
      onEnd();
    }
  }
  return finish;
}
