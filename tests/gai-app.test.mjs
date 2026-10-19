import test from 'node:test';
import assert from 'node:assert/strict';
import {newGaiActivity,cleanGaiActivity,cleanGaiPatch,cleanGaiResult,gaiAppCover,gaiAppResult,GAI_APP_CHECKPOINT_MARKER} from '../src/gai-app.js';
import {cleanActivity} from '../src/activity.js';
import {cleanDesign} from '../src/model.js';
import {newRecord,migrateRecord,copyRecord,copySlide} from '../app/designs.js';
import {createHtmlLesson} from '../app/html-lesson.js';
const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF1sAAAAASUVORK5CYII=';
const activity=()=>newGaiActivity({title:'내 단계 활동',instructions:'단계를 진행해요.',document:`<script>const bridge="ONBATANG_APP_BRIDGE_TOKEN",checkpoint=${GAI_APP_CHECKPOINT_MARKER};</script>`,project:{title:'내 단계 활동',template:'freeform',specification:{app:{html:'<button>실행</button>',css:'',js:''}}},state:{count:2}});

test('generated app source and checkpoint survive sanitization, JSON reopening and copies without execution',()=>{
 let record=newRecord('16:9');record.slides[0].activity=activity();const before=structuredClone(record);
 for(let i=0;i<2;i++)record=migrateRecord(JSON.parse(JSON.stringify({...record,slides:record.slides.map(p=>cleanDesign(p))})));
 assert.deepEqual(record.slides[0].activity,before.slides[0].activity);
 assert.notEqual(copyRecord(record).slides[0].activity.id,record.slides[0].activity.id);
 assert.notEqual(copySlide(record.slides,0)[0][1].activity.id,record.slides[0].activity.id);
 assert.equal(cleanActivity(undefined),undefined);assert.deepEqual(cleanActivity(record.slides[0].activity),record.slides[0].activity);
});

test('app contract rejects missing bridge, non-JSON state, dangerous property names and UTF-8 byte overflow',()=>{
 for(const mutate of [a=>a.document=a.document.replace('ONBATANG_APP_BRIDGE_TOKEN','other'),a=>a.document=a.document.replace(GAI_APP_CHECKPOINT_MARKER,'{}'),a=>a.version=2,a=>a.state={n:Infinity},a=>a.state={n:undefined},a=>a.state=JSON.parse('{"__proto__":{"bad":true}}'),a=>a.state={text:'한'.repeat(6000)},a=>a.project={text:'x'.repeat(420000)},a=>a.state=new Date(),a=>a.title='x'.repeat(81)]){
  const a=activity();mutate(a);assert.throws(()=>cleanGaiActivity(a),{code:'INVALID_ACTIVITY'});
 }
 const valid=activity();valid.state={text:'한'.repeat(5900)};assert.ok(cleanGaiActivity(valid));
});

test('classroom reports are bounded and images cannot request URLs or executable formats',()=>{
 assert.deepEqual(cleanGaiPatch({checkpoint:{count:3},state:{step:3},answer:'3단계',progress:30,score:3,completed:false,source:'app'}),{checkpoint:{count:3},state:{step:3},answer:'3단계',progress:30,score:3,completed:false});
 for(const patch of [{checkpoint:[]},{state:{text:'한'.repeat(2000)}},{answer:'x'.repeat(2001)},{progress:101},{score:Infinity},{completed:1},{url:'https://example.com'},{source:'host'}])assert.throws(()=>cleanGaiPatch(patch),{code:'INVALID_ACTIVITY'});
 for(const invalid of ['https://example.com/picture.png','data:image/svg+xml,<svg/>','data:image/png;base64,iVBORw0KGgo='])assert.throws(()=>cleanGaiResult({image:invalid}),{code:'INVALID_ACTIVITY'});
 const result=cleanGaiResult({state:{count:3},image,answer:'완료',score:3,completed:true});assert.equal(result.image,image);
 for(const aspect of [.25,1,4/3,16/9,4]){
  assert.equal(cleanDesign(gaiAppCover(activity(),aspect)).items.length,4);
  const page=cleanDesign(gaiAppResult(activity(),result,aspect));assert.equal(page.source.kind,'result');assert.equal(page.activity,undefined);assert.equal(page.items[1].url,image);assert.ok(page.items[1].h<=53.001);
  const longAnswer='가'.repeat(2000),longPage=cleanDesign(gaiAppResult(activity(),{...result,answer:longAnswer},aspect));assert.equal(longPage.items[2].text,longAnswer,'the complete result answer remains editable');
 }
});

test('HTML exports app source as inert escaped JSON and preserves it with no outside script tag',async()=>{
 const a=activity();a.document+='</script><img src=x onerror="window.bad=true">';a.state={answer:'</script>\u2028'};
 const html=await createHtmlLesson({title:'수업',pages:[{id:'pgai123456',image,aspect:16/9,activity:a}]}).text();
 assert.doesNotMatch(html,/<img src=x/);assert.equal((html.match(/<\/script>/g)||[]).length,2);
 const seed=JSON.parse(html.match(/id="onbatang-lesson-data">([\s\S]*?)<\/script>/)[1]);assert.deepEqual(seed.pages[0].activity,a);
 assert.match(html,/frame-src 'none'/);assert.doesNotMatch(html,/<script\b[^>]*\bsrc=/i);
 const resultData=cleanGaiResult({state:{count:4},answer:'가'.repeat(2000),image});
 const resultHtml=await createHtmlLesson({title:'결과 수업',pages:[{id:'presult123',image,aspect:16/9,result:true,resultData}]}).text();
 const resultSeed=JSON.parse(resultHtml.match(/id="onbatang-lesson-data">([\s\S]*?)<\/script>/)[1]);assert.deepEqual(resultSeed.pages[0].resultData,resultData,'raster result does not discard the full answer or checkpoint');
});
