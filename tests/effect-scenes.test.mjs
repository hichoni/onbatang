import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanEffect } from '../src/effect-assets.js';
import { sceneContent, chartExample } from '../src/effect-scenes.js';
import { cleanEffectTargets } from '../src/effect-player.js';
import { REVEALS } from '../src/reveal-scenes.js';
import { CLUE_CARD } from '../src/clue-card.js';

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
