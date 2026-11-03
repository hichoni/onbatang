import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanEffect } from '../src/effect-assets.js';
import { sceneContent, chartExample } from '../src/effect-scenes.js';
import { cleanEffectTargets } from '../src/effect-player.js';
import { REVEALS } from '../src/reveal-scenes.js';
import { CLUE_CARD } from '../src/clue-card.js';
import { cleanMotionCues } from '../src/motion-cues.js';
import {cleanCinemaTracks,cinemaEnd} from '../src/cinema-layout.js';

test('scene layout is bounded, portable and idempotent without changing an original slide',()=>{
  const tracks=[{key:'phrase2',text:'새 구절',dx:45,dy:-19,scale:1.4,start:2250,duration:900},
    {key:'phrase1',dx:Infinity,start:-1,scale:999,duration:999999},
    {key:'phrase2',text:'duplicate'},{key:'unknown',text:'ignored'}];
  const effect=cleanEffect({id:'beatintro',sceneTracks:tracks},{t:'text',text:'원래 문장'});
  assert.deepEqual(effect.sceneTracks,[tracks[0],{key:'phrase1',start:0,scale:2.5,duration:10000}]);
  assert.deepEqual(cleanEffect(effect),effect);
  assert.deepEqual(cleanEffectTargets([{x:50,y:40,w:30,h:20,rot:0,effect,content:{t:'text',text:'원래 문장'}}])[0].effect,effect);
  assert.equal(cinemaEnd(effect.id,effect),10000);
  assert.deepEqual(cleanCinemaTracks('rollingnumber',[{key:'number',text:'bad'},{key:'caption',text:'가'.repeat(100)}]),[{key:'caption',text:'가'.repeat(72)}]);
  assert.deepEqual(cleanCinemaTracks('paperhorizon',[{key:'sun',text:'ignored',dy:-999}]),[{key:'sun',dy:-180}]);
  assert.equal(cleanEffect({id:'signal',sceneTracks:tracks}).sceneTracks,undefined);
  assert.equal(tracks[1].scale,999);
});

test('cinematic overrides stay on their own effect and survive cleaning without replacing slide text',()=>{
  const item={t:'text',text:'이 장의 원래 문장'};
  const raw={id:'rollingnumber',sceneText:'완성률 90.5%',turns:99,legMs:1300,accent:'#A15369'};
  assert.deepEqual(cleanEffect(raw,item),{id:'rollingnumber',when:'press',turns:8,sceneText:'완성률 90.5%',accent:'#a15369'});
  assert.equal(cleanEffect({...raw,sceneText:'숫자 없음'},item),null);
  assert.equal(cleanEffect(raw,{t:'image'}),null);
  assert.equal(sceneContent('rollingnumber',item,raw.sceneText).text,'완성률 90.5%');
  assert.deepEqual(cleanEffect({id:'fieldroute',depth:130,accent:'url(https://example.org)',sceneText:'  '},item),{id:'fieldroute',when:'press'});
  assert.deepEqual(cleanEffect({id:'paperhorizon',depth:0},item),{id:'paperhorizon',when:'press',depth:0});
  assert.equal(cleanEffect({id:'beatintro',sceneText:'해'.repeat(80)},item).sceneText.length,72);
  assert.equal(item.text,'이 장의 원래 문장');
});

test('teacher observation order survives cleaning and offline targets without changing old effects',()=>{
  const stops=[[91,' 결론 '],[0,'<첫 순간>'],[47,'가'.repeat(40)]];
  const effect=cleanEffect({id:'spectrum',when:'open',observe:true,stops});
  assert.deepEqual(effect,{id:'spectrum',when:'press',observe:true,
    stops:[[91,'결론'],[0,'<첫 순간>'],[47,'가'.repeat(28)]]});
  assert.deepEqual(cleanEffectTargets([{x:50,y:50,w:30,h:10,rot:0,effect}])[0].effect,effect);
  assert.deepEqual(cleanEffect(effect),effect);
  assert.deepEqual(cleanEffect({id:'spectrum',stops}),{id:'spectrum',when:'press'});
  assert.deepEqual(cleanEffect({id:'signal',observe:true}),{id:'signal',when:'press',observe:true});
  assert.equal(cleanEffect({id:'cluecard',observe:true,stops}).observe,undefined);
  assert.deepEqual(cleanMotionCues([[25.2,'A'],[25.4,'duplicate'],[Infinity,'bad'],[-1,'bad'],['5','bad'],[100,' ']]),
    [[25,'A'],[100,'관찰 2']]);
  assert.equal(cleanMotionCues(Array.from({length:9},(_,i)=>[i,'🙂'.repeat(40)])).length,6);
  assert.equal(Array.from(cleanMotionCues([[0,'🙂'.repeat(40)]])[0][1]).length,28);
  assert.deepEqual(stops[0],[91,' 결론 ']);
});

test('authored clue cards keep bounded questions and ordered clues; the current text box supplies the answer',()=>{
  const item={t:'text',text:'  RGB  색상 '};
  const effect=cleanEffect({id:'cluecard',when:'open',prompt:'🍏'.repeat(82),hints:[' 첫 단서  ','','두'.repeat(70),'초과']},item);
  assert.equal(effect.when,'open');assert.equal(Array.from(effect.prompt).length,80);
  assert.deepEqual(effect.hints,['첫 단서','두'.repeat(64)]);
  assert.equal(CLUE_CARD.last(item,effect),3);
  const row={x:50,y:20,w:16,h:5,rot:0,effect,content:item};
  assert.deepEqual(cleanEffectTargets([row])[0].content,{t:'text',text:'RGB 색상'});
  assert.deepEqual(cleanEffectTargets([{...row,content:{...item,text:'바꾼 답'}}])[0].effect,effect);
  for(const text of ['', '글'.repeat(81)])assert.equal(cleanEffect({id:'cluecard'},{t:'text',text}),null);
  assert.equal(cleanEffect({id:'cluecard'},{t:'image'}),null);
  const direct=cleanEffect({id:'cluecard',prompt:[],hints:'x'},item);
  assert.deepEqual(direct,{id:'cluecard',when:'press'});assert.equal(CLUE_CARD.next(0,item,direct),'정답 공개');
  assert.deepEqual(cleanEffect({...effect,id:'signal'},item),{id:'signal',when:'open'});
});

test('scene content follows the selected item, with bounded text and signed chart values',()=>{
  const text={t:'text',text:'🍎'.repeat(73)};
  assert.equal(sceneContent('kinetic',text).text,'🍎'.repeat(71)+'…');
  assert.equal(text.text,'🍎'.repeat(73));
  const chart={...chartExample,kind:'hbar',series:[{name:'증감',values:[-3.2,0,12,4]}]};
  const saved={x:10,y:20,w:30,h:40,rot:0,effect:{id:'bars',pace:'fast',palette:'iris',when:'open'},content:chart};
  assert.deepEqual(cleanEffectTargets([saved])[0].content.series,chart.series);
  assert.equal(cleanEffectTargets([{...saved,content:text}]).length,0);
  assert.equal(cleanEffectTargets([{...saved,content:{...chart,kind:'pie'}}]).length,0);
  assert.equal(cleanEffect({id:'bars'},text),null);
  assert.deepEqual(cleanEffect({id:'orbit',palette:'unknown',pace:999}),{id:'orbit',when:'press'});
});

test('question effects require compatible pieces and never serialize the source photo into the lesson',()=>{
  const chart={...chartExample,kind:'line'};
  assert.equal(cleanEffect({id:'forecast'},chart).when,'press');
  assert.equal(cleanEffect({id:'forecast'},{...chart,labels:['하나']}),null);
  assert.equal(cleanEffect({id:'forecast'},chartExample),null);
  assert.equal(cleanEffect({id:'initials'},{t:'text',text:'ABC'}),null);
  assert.equal(cleanEffect({id:'initials'},{t:'text',text:'가'.repeat(17)}),null);
  assert.equal(sceneContent('initials',{t:'text',text:'  ㄲ   꿀  '}).text,'ㄲ 꿀');
  assert.equal(REVEALS.find(a=>a.id==='initials').last({text:'봄'}),1);
  const result=cleanEffectTargets([{x:2,y:3,w:4,h:5,rot:22,effect:{id:'lens',when:'open'},content:{t:'image',url:'https://example.com/secret.png'}}]);
  assert.deepEqual(result[0].content,{t:'image'});
  assert.equal(result[0].effect.when,'press');
});
