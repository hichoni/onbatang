import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanEffect } from '../src/effect-assets.js';
import { sceneContent, chartExample } from '../src/effect-scenes.js';
import { cleanEffectTargets } from '../src/effect-player.js';

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
