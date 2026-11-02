import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanHtmlFlow,htmlFlowPages} from '../app/html-lesson-flow.js';
import {cleanHtmlLesson} from '../app/html-lesson-runtime.js';
import {createHtmlLesson} from '../app/html-lesson.js';
import {matchItems,looksChanged} from '../src/motion.js';
const image='data:image/png;base64,iVBORw0KGgo=';
const item=()=>({id:'epiece123',t:'text',text:'별의 움직임',x:30,y:50,w:20,h:15,rot:15,op:75,image});
const flow=()=>({version:1,bg:'#fffdf5',tr:'move',travel:{ms:2400,ease:'direct'},items:[item()]});
const lesson=()=>({version:1,id:'dlesson123',title:'이어지는 수업',pages:[{id:'pfirst123',aspect:16/9,image,flow:flow()}]});

test('offline layers retain connections, projected geometry and timing without executable markup',async()=>{
  const raw=lesson();raw.pages[0].flow.items[0].morphKey='mchain123';raw.pages[0].flow.items[0].text='</script><img onerror=alert(1)>';
  raw.pages[0].flow.items[0].onclick='alert(1)';raw.pages[0].flow.html='<script>bad()</script>';
  const before=structuredClone(raw),clean=cleanHtmlLesson(raw);
  assert.equal(clean.pages[0].flow.items[0].morphKey,'mchain123');assert.equal(clean.pages[0].flow.travel.ms,2400);
  assert.equal(clean.pages[0].flow.html,undefined);assert.equal(clean.pages[0].flow.items[0].onclick,undefined);
  const html=await createHtmlLesson(raw).text();assert.doesNotMatch(html,/<img onerror/);assert.match(html,/connect-src 'none'/);
  assert.deepEqual(raw,before);assert.deepEqual(cleanHtmlLesson(clean),clean);
});
test('legacy pages stay static and only both sides of supported morphs get layers',()=>{
  const raw=lesson();delete raw.pages[0].flow;assert.equal(cleanHtmlLesson(raw).pages[0].flow,undefined);
  assert.deepEqual([...htmlFlowPages([{items:[]},{items:[],tr:'move'},{items:[],tr:'fade'},{items:[],tr:'move',activity:{}},{items:[],tr:'move'}])],[0,1]);
  assert.deepEqual([...htmlFlowPages([{items:[],video:{}},{items:[],tr:'move'}])],[]);
});
test('layer data rejects external assets, invalid geometry, duplicate IDs and oversized content',()=>{
  for(const change of [it=>it.image='https://example.com/a.png',it=>it.image='data:image/svg+xml,<svg/>',it=>it.x=Infinity,it=>it.w=-1,it=>it.op=101,it=>it.morphKey='javascript:bad',it=>it.text='x'.repeat(4097)]){
    const raw=flow();change(raw.items[0]);assert.throws(()=>cleanHtmlFlow(raw));
  }
  assert.throws(()=>cleanHtmlFlow({...flow(),bg:'url(https://example.com)'}));
  assert.throws(()=>cleanHtmlFlow({...flow(),items:[item(),item()]}));
  assert.throws(()=>cleanHtmlFlow({...flow(),items:Array(161).fill(item())}));
  const raw=lesson();raw.pages[0].activity={};assert.throws(()=>cleanHtmlLesson(raw));
});
test('shared morph matching retains explicit links, opt-out and raster appearance crossfades',()=>{
  const a=cleanHtmlFlow(flow()),b=cleanHtmlFlow(flow());b.items[0].id='eother123';
  assert.deepEqual(matchItems(a.items,b.items),[[0,0]]);
  a.items[0].morphKey='off';assert.deepEqual(matchItems(a.items,b.items),[]);
  a.items[0].morphKey=b.items[0].morphKey='mchain123';b.items[0].text='달의 움직임';
  assert.deepEqual(matchItems(a.items,b.items),[[0,0]]);assert.equal(looksChanged(a.items[0],b.items[0]),true);
});
