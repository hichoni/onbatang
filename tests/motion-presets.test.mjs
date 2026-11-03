import test from 'node:test';
import assert from 'node:assert/strict';
import {createPresetLibrary,presetForContent,MOTION_PRESET_KEY} from '../src/motion-presets.js';
import {cleanEffect} from '../src/effect-assets.js';

const memory=()=>{const map=new Map();return {getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,value)};};
const content={t:'text',text:'기존 문구\n새 발견\n함께 공유'};
const options={palette:'iris',bpm:120,accent:'#ABCDEF',sceneTracks:[{key:'phrase2',text:'저장한 둘째 구절',dx:24,dy:12,scale:1.2,start:1200,duration:1500}]};
test('named presets survive reopening, keep independent copies and never mutate the slide',()=>{
  const store=memory(),lib=createPresetLibrary(store),before=structuredClone(options);
  const a=lib.save('beatintro',options,content,'수업 시작'),b=lib.save('beatintro',options,content,'수업 시작');
  assert.notEqual(a.id,b.id);assert.deepEqual(options,before);
  const reopened=createPresetLibrary(store);assert.equal(reopened.list().length,2);
  const copy=reopened.duplicate(a.id);reopened.rename(copy.id,'발표 시작');reopened.remove(a.id);
  assert.deepEqual(reopened.list().map(p=>p.name),['수업 시작','발표 시작']);
  const saved=presetForContent(b,false),current=presetForContent(b,true);
  assert.equal(saved.sceneTracks[0].text,'저장한 둘째 구절');assert.equal(saved.sceneText,content.text);
  assert.equal(current.sceneText,undefined);assert.equal(current.sceneTracks[0].text,undefined);
  assert.equal(current.sceneTracks[0].start,1200);
  const effect=cleanEffect({id:'beatintro',...current},content);
  assert.equal(effect.sceneTracks[0].scale,1.2);assert.deepEqual(cleanEffect(effect,content),effect);
  assert.equal(reopened.list()[0].options.sceneTracks[0].text,'저장한 둘째 구절');
});
test('portable library merges without replacing, sanitizes input and is repeatable',()=>{
  const first=createPresetLibrary(memory()),second=createPresetLibrary(memory());
  first.save('paperhorizon',{depth:130,pace:'slow',sceneTracks:[{key:'title',scale:99,dx:20,html:'<script>bad</script>'},{key:'unknown',start:3}]},content,'새벽');
  second.save('spotlighttitle',{direction:'left'},content,'빛');
  const file=first.export();assert.deepEqual(second.import(file),{added:1,skipped:0});
  assert.deepEqual(second.import(file),{added:0,skipped:1});assert.equal(second.list()[0].name,'빛');
  const imported=second.list()[1];assert.equal(imported.options.sceneTracks[0].scale,2.5);
  assert.equal(imported.options.sceneTracks.length,1);assert.equal(imported.options.sceneTracks[0].html,undefined);
  assert.notEqual(imported.id,first.list()[0].id);
});
test('bad files, newer formats, limits and quota failure leave saved data untouched',()=>{
  const store=memory(),lib=createPresetLibrary(store);lib.save('beatintro',options,content,'보존');
  const before=store.getItem(MOTION_PRESET_KEY);
  for(const file of ['not json','{}',before.replace('"version":1','"version":2'),before.replace('beatintro','unknown')]){
    assert.throws(()=>lib.import(file));assert.equal(store.getItem(MOTION_PRESET_KEY),before);
  }
  store.setItem(MOTION_PRESET_KEY,before.replace('"version":1','"version":2'));
  assert.throws(()=>lib.save('beatintro',options,content,'덮어쓰지 않기'));
  assert.match(store.getItem(MOTION_PRESET_KEY),/"version":2/);
  store.setItem(MOTION_PRESET_KEY,before);
  const blocked=createPresetLibrary({getItem:store.getItem,setItem:()=>{throw Error('QuotaExceededError');}});
  assert.throws(()=>blocked.remove(lib.list()[0].id),/저장할 공간/);assert.equal(store.getItem(MOTION_PRESET_KEY),before);
  for(let i=1;i<60;i++)lib.save('beatintro',options,content,'움직임 '+i);
  assert.throws(()=>lib.duplicate(lib.list()[0].id),/최대 60개/);assert.equal(lib.list().length,60);
});
test('fresh writes preserve another tab and invalid numeric preview cannot be stored',()=>{
  const store=memory(),one=createPresetLibrary(store),two=createPresetLibrary(store);
  one.list();two.save('beatintro',options,content,'두 번째 창');one.save('spotlighttitle',{},content,'첫 번째 창');
  assert.equal(one.list().length,2);
  assert.throws(()=>one.save('rollingnumber',{},content,'숫자 없음'));
  const p=one.save('rollingnumber',{sceneText:'정답률 95%'},content,'정답률');
  assert.equal(cleanEffect({id:'rollingnumber',...presetForContent(p,true)},content),null);
  assert.ok(cleanEffect({id:'rollingnumber',...presetForContent(p,false)},content));
});
