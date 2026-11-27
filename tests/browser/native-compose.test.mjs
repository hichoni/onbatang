// Local native UI integration. The AI response is a fixture, never a live paid call.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve,extname,sep} from 'node:path';
const root=fileURLToPath(new URL('../../',import.meta.url));
const fixture=`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/src/editor.css"><link rel="stylesheet" href="/app/app.css"><body class="mc-app"><main id="app"></main><script type="module">
import {startMinican} from '/app/app.js';import {listDesigns} from '/app/store.js';
window.readSaved=()=>listDesigns();window.asked=[];
await startMinican({storage:'native-fixture',resume:true,activityAuthoring:true,appMaker:{connect:async()=>({label:'연결됨'}),generate:async(input)=>{
 window.asked.push(input);
 if(input.task==='polish'&&window.elementAction)return {kind:'slides',say:'말풍선과 글을 추가했어요.',ops:window.elementAction==='remove'?[{op:'remove',item:input.slides[0].items.at(-1).key}]:[{op:'add',slide:input.slides[0].key,element:{t:'shape',shape:'circle',x:80,y:75,w:10,h:17.78,color:'#d5a846',lp:'breathe'}},{op:'add',slide:input.slides[0].key,element:{t:'text',text:'함께 묻는 질문',x:50,y:85,w:50,size:2.4,color:'#12343b'}}]};
 if(input.task==='polish')return {kind:'slides',say:'선택한 제목의 크기와 색을 바꿨어요.',ops:[{op:'style',item:input.slides[0].items[0].key,style:{size:6,color:'#be5e2d'}}],receipt:'모의 응답 · 실제 차감 없음'};
 return {kind:'slides',title:'질문에서 시작하는 수업',say:'17장 구성을 받았어요.',receipt:'모의 응답 · 실제 차감 없음',ops:Array.from({length:window.shortAnswer?2:input.count},(_,i)=>({op:'page',title:(i+1)+'번째 이야기',bg:i%2?'#102b31':'#f5f1e8',notes:(i+1)+'번째 이야기를 나누겠습니다.',tr:'fade',items:[{t:'shape',shape:'circle',x:80,y:50,w:20,h:35.56,color:'#d5a846',lp:'breathe',morphKey:'mshared01'},{t:'text',text:(i+1)+'. 질문에서 꿈으로',x:40,y:40,w:66,size:5,color:i%2?'#ffffff':'#102b31',align:'l',bold:true},{t:'text',text:'작은 물음이 만드는 수업의 변화',x:40,y:65,w:66,size:2.5,color:i%2?'#ffffff':'#102b31',align:'l'}]}))};
}}});window.ready=true;
</script>`;
// An AI answer opens on the review desk first; returning puts the same card back in the panel.
const leaveDesk=async page=>{const desk=page.getByRole('region',{name:'AI-G 결과 작업대'});await desk.waitFor();await desk.getByRole('button',{name:'편집기로 돌아가기'}).click();await desk.waitFor({state:'detached'});};
for(const engine of ['chromium','webkit'])test(engine+' native generation → selected edit/undo → manual text → save/reopen → all 17 slides',{skip:!process.env.MINICAN_PLAYWRIGHT_PATH,timeout:150000},async t=>{
 const server=createServer(async(req,res)=>{try{const path=new URL(req.url,'http://local').pathname;if(path==='/fixture.html'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(fixture);}const f=resolve(root,'.'+decodeURIComponent(path));if(!f.startsWith(resolve(root)+sep))throw Error('path');res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2','.json':'application/json'})[extname(f)]||'application/octet-stream');res.end(await readFile(f));}catch{res.writeHead(404);res.end();}});
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));t.after(()=>new Promise(ok=>server.close(ok)));
 const pw=await import(pathToFileURL(process.env.MINICAN_PLAYWRIGHT_PATH).href),browser=await pw[engine].launch({headless:true,...(engine==='chromium'?{channel:'msedge'}:{})});t.after(()=>browser.close());
 const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const origin='http://127.0.0.1:'+server.address().port;
 await context.addInitScript(()=>{try{localStorage.setItem('onbatang-tour-seen-v1:editor','1');localStorage.setItem('onbatang-tour-seen-v1:news-0.45','1');}catch{}});
 await context.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
 await page.goto(origin+'/fixture.html');await page.waitForFunction(()=>window.ready);
 // 실제 운영 장애: 기존 미저장 자료로 localStorage가 가득 차도 새 발표 초안은 보존한다.
 await page.evaluate(()=>{localStorage.setItem('unsaved-user-data','preserve me');let size=1<<20,i=0;while(size>=1){try{localStorage.setItem('quota-filler-'+i,'x'.repeat(size));i++;}catch{size=Math.floor(size/2);}}});
 await page.locator('[data-presentation-start]').click();await page.locator('.cv-canvas .fe-stage').waitFor();assert.equal(await page.locator('.cv-assist-box .onba-compose').count(),1);await page.getByLabel('만들 발표',{exact:true}).fill('선생님께 질문이 수업을 바꾸는 방법을 설명하는 발표');await page.getByLabel('발표 장 수',{exact:true}).fill('17');await page.getByLabel('제작 방식',{exact:true}).selectOption('direct');
 await page.evaluate(()=>window.shortAnswer=true);await page.locator('[data-compose-ask]').click();await page.getByText(/요청한 17장이 모두 있어야/).waitFor();assert.equal(await page.locator('[data-compose-apply]').isDisabled(),true);
 await page.evaluate(()=>window.shortAnswer=false);await page.locator('[data-compose-ask]').click();await page.waitForFunction(()=>document.querySelectorAll('.onba-compose-previews article').length===17);
 await page.waitForFunction(async()=>{const q=indexedDB.open('onbatang-native-ai-drafts-v1',1);return new Promise(ok=>{q.onsuccess=()=>{const db=q.result,r=db.transaction('drafts').objectStore('drafts').getAll();r.onsuccess=()=>{db.close();ok(r.result.some(d=>d?.proposal?.result?.ops?.length===17));};};});});
 const draft=await page.evaluate(()=>new Promise(ok=>{const q=indexedDB.open('onbatang-native-ai-drafts-v1',1);q.onsuccess=()=>{const db=q.result,r=db.transaction('drafts').objectStore('drafts').getAll();r.onsuccess=()=>{db.close();ok(r.result.find(d=>d?.proposal));};};}));
 assert.equal(draft.proposal.slides,undefined,'draft stores asset references, not repeated photos in every rendered slide');
 assert.equal(await page.evaluate(()=>localStorage.getItem('unsaved-user-data')),'preserve me');
 assert.equal(await page.getByRole('alert').filter({visible:true}).count(),0,'a full localStorage does not fail the new draft store');
 // 같은 키의 쓰기는 순서를 지키고, 다시 열면 마지막 값이 남는다. 옛 localStorage 초안은 옮긴 후에만 비운다.
 await page.evaluate(async()=>{for(const k of Object.keys(localStorage))if(k.startsWith('quota-filler-'))localStorage.removeItem(k);localStorage.setItem('legacy-draft',JSON.stringify({prompt:'이전 초안',proposal:null}));});
 assert.deepEqual(await page.evaluate(async()=>{const {aiDraftStore}=await import('/app/ai-draft-store.js'),first=aiDraftStore('legacy-draft');const migrated=await first.read();const a=first.write({prompt:'첫 수정'}),b=first.write({prompt:'마지막 수정'});await Promise.all([a,b]);return {migrated:migrated.prompt,current:(await aiDraftStore('legacy-draft').read()).prompt,legacy:localStorage.getItem('legacy-draft')};}),{migrated:'이전 초안',current:'마지막 수정',legacy:null});
 if(process.env.NATIVE_COMPOSE_SHOT)await page.screenshot({path:process.env.NATIVE_COMPOSE_SHOT+'-'+engine+'-proposal.png'});
 assert.equal(await page.locator('iframe').count(),0);
 const calls=await page.evaluate(()=>window.asked.length);await page.locator('.cv-back').click();await page.getByRole('button',{name:'그림 1 열기',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.onba-compose-previews article').length===17);assert.equal(await page.evaluate(()=>window.asked.length),calls,'reopening a proposal never calls AI again');
 await page.locator('[data-compose-apply]').click();await page.locator('.cv-canvas .fe-stage').waitFor();await page.evaluate(async()=>{(await import('/app/tour.js')).stopTour();});
 await page.locator('[data-assist-pane="edit"]').waitFor({state:'visible'});
 await page.locator('[data-compose-undo]').click();assert.equal(await page.locator('.cv-slide[data-slide]').count(),1);assert.equal(await page.locator('.cv-canvas .fi-text').count(),0);await page.keyboard.press('Control+y');await page.waitForFunction(()=>document.querySelectorAll('.cv-slide[data-slide]').length===17);
 await page.locator('.cv-canvas .fi-text').first().click();await page.locator('.cv-assist-options summary').click();await page.getByLabel('선택한 요소만',{exact:true}).check();await page.locator('.cv-assist-wish').fill('이 제목만 더 크게 하고 주황색으로 바꿔');await page.locator('[data-assist-ask]').click();await leaveDesk(page);await page.locator('[data-assist-apply]').waitFor({timeout:8000}).catch(async e=>{e.message+=' '+await page.locator('.cv-assist-box').innerText();throw e;});
 assert.equal(await page.evaluate(()=>window.asked.at(-1).slides[0].items.length),1);await page.locator('[data-assist-apply]').click();await page.locator('[data-assist-undo]').waitFor();await page.locator('[data-assist-undo]').click();
 await page.getByLabel('지금 장(1장)',{exact:true}).check();await page.evaluate(()=>window.elementAction='add');await page.locator('.cv-assist-wish').fill('말풍선과 함께 묻는 질문이라는 글을 추가해');await page.locator('[data-assist-ask]').click();await leaveDesk(page);const added=page.locator('[data-assist-card]').last();await added.locator('[data-assist-apply]').click();await page.locator('.cv-canvas').getByText('함께 묻는 질문',{exact:true}).waitFor();
 await page.evaluate(()=>window.elementAction='remove');await page.locator('.cv-assist-wish').fill('함께 묻는 질문 글만 지워');await page.locator('[data-assist-ask]').click();await leaveDesk(page);const removed=page.locator('[data-assist-card]').last();await removed.locator('[data-assist-apply]').click();assert.equal(await page.locator('.cv-canvas').getByText('함께 묻는 질문',{exact:true}).count(),0);await removed.locator('[data-assist-undo]').click();await page.locator('.cv-canvas').getByText('함께 묻는 질문',{exact:true}).waitFor();
 await page.locator('.cv-assist-close').click();
 await page.locator('.cv-canvas .fi-text').first().dblclick();const edit=page.locator('.cv-canvas [contenteditable]:not([contenteditable="false"])');await edit.fill('질문 하나로 시작하는 수업');await page.locator('.cv-name').click();
 await page.locator('.cv-back').click();await page.getByRole('button',{name:'질문에서 시작하는 수업 열기',exact:true}).waitFor();const saved=await page.evaluate(()=>window.readSaved());assert.equal(saved[0].slides.length,17);assert.equal(saved[0].slides[0].items[1].text,'질문 하나로 시작하는 수업');assert.equal(saved[0].slides[0].items[1].size,5);assert.equal(saved[0].slides[0].items.at(-1).text,'함께 묻는 질문');const id=saved[0].id;
 await page.reload();await page.waitForFunction(()=>window.ready);await page.getByRole('button',{name:'질문에서 시작하는 수업 열기',exact:true}).click();await page.locator('.cv-show-btn').click();
 for(let i=0;i<17;i++){await page.waitForFunction(i=>document.querySelector('.cv-show-count')?.textContent.replace(/\s/g,'')===(i+1)+'/17',i);assert.ok(await page.locator('.cv-show-stage .fi-text').count()>0);const text=await page.locator('.cv-show-stage').textContent();assert.ok(text.includes(i===0?'질문 하나로 시작하는 수업':(i+1)+'. 질문에서 꿈으로'));if(i<16)await page.getByRole('button',{name:'다음 장',exact:true}).click();}
 if(process.env.NATIVE_COMPOSE_SHOT)await page.screenshot({path:process.env.NATIVE_COMPOSE_SHOT+'-'+engine+'-finale.png'});
 await page.getByRole('button',{name:'앞 장',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.cv-show-count')?.textContent.replace(/\s/g,'')==='16/17');
 await page.setViewportSize({width:390,height:844});assert.ok(await page.locator('.cv-show-stage .fi-text').first().isVisible());
 await page.getByRole('button',{name:'다음 장',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.cv-show-count')?.textContent.replace(/\s/g,'')==='17/17');
 if(process.env.NATIVE_COMPOSE_SHOT)await page.screenshot({path:process.env.NATIVE_COMPOSE_SHOT+'-'+engine+'-mobile.png'});
 await page.setViewportSize({width:1440,height:1000});
 await page.keyboard.press('Escape');assert.equal((await page.evaluate(()=>window.readSaved()))[0].id,id);assert.deepEqual(errors,[]);
 const publicPage=await context.newPage();await publicPage.goto(origin+'/app/index.html');await publicPage.locator('.cv-home-title').waitFor();assert.equal(await publicPage.locator('[data-presentation-start]').count(),0);
});
