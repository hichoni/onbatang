import test from 'node:test';
import assert from 'node:assert/strict';
import {cinemaCues} from '../src/cinema-cues.js';
import {cleanEffect,steppedEffect,questionEffect} from '../src/effect-assets.js';
import {cleanEffectTargets} from '../src/effect-player.js';
import {createPresetLibrary,presetForContent} from '../src/motion-presets.js';

test('phrase order is stable, retains gaps and duration, and separates overlapping cues',()=>{
  const rows=[{key:'first',editable:true,start:2800,duration:800},{key:'second',editable:true,start:1000,duration:1000},
    {key:'third',editable:true,start:1000,duration:600},{key:'background',editable:false,start:0,duration:3000}];
  const cues=cinemaCues(rows);
  assert.deepEqual(cues.map(({key,start,duration,wait})=>({key,start,duration,wait})),[
    {key:'second',start:1000,duration:1000,wait:1000},{key:'third',start:1000,duration:600,wait:0},{key:'first',start:2800,duration:800,wait:800}]);
  assert.deepEqual(cinemaCues(rows,1.5).map(c=>[c.start,c.duration,c.wait]),[[1500,1500,1500],[1500,900,0],[4200,1200,1200]]);
  assert.equal(rows[0].key,'first');
});
test('step mode is opt-in, survives presets and HTML, and cannot conflict with observation mode',()=>{
  const old={id:'beatintro',when:'open',bpm:100},item={t:'text',text:'첫 구절\n둘째 구절\n마지막 구절'};
  assert.deepEqual(cleanEffect(old),old);assert.equal(steppedEffect(old),false);
  const effect=cleanEffect({...old,reveal:'step',observe:true,stops:[[10,'첫째']]},item);
  assert.equal(effect.reveal,'step');assert.equal(effect.when,'open');assert.equal(effect.observe,undefined);
  assert.equal(steppedEffect(effect),true);assert.equal(questionEffect(effect),false);
  assert.equal(cleanEffect({id:'signal',reveal:'step'}).reveal,undefined);
  assert.equal(cleanEffect({...old,reveal:'anything'}).reveal,undefined);
  const map=new Map(),lib=createPresetLibrary({getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)});
  const saved=lib.save(effect.id,effect,item,'구절마다 공개');lib.import(lib.export());
  assert.equal(lib.list().length,1);assert.equal(presetForContent(saved).reveal,'step');
  assert.deepEqual(cleanEffectTargets([{x:50,y:40,w:80,h:20,rot:0,effect,content:item}])[0].effect,effect);
});
