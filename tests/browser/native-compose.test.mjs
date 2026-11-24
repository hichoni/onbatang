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
 if(input.task==='polish')return {kind:'slides',say:'선택한 제목의 크기와 색을 바꿨어요.',ops:[{op:'style',item:input.slides[0].items[0].key,style:{size:6,color:'#be5e2d'}}],receipt:'모의 응답 · 실제 차감 없음'};
 return {kind:'slides',title:'질문에서 시작하는 수업',say:'17장 구성을 받았어요.',receipt:'모의 응답 · 실제 차감 없음',ops:Array.from({length:window.shortAnswer?2:input.count},(_,i)=>({op:'page',title:(i+1)+'번째 이야기',bg:i%2?'#102b31':'#f5f1e8',notes:(i+1)+'번째 이야기를 나누겠습니다.',tr:'fade',items:[{t:'shape',shape:'circle',x:80,y:50,w:20,h:35.56,color:'#d5a846',lp:'breathe',morphKey:'mshared01'},{t:'text',text:(i+1)+'. 질문에서 꿈으로',x:40,y:40,w:66,size:5,color:i%2?'#ffffff':'#102b31',align:'l',bold:true},{t:'text',text:'작은 물음이 만드는 수업의 변화',x:40,y:65,w:66,size:2.5,color:i%2?'#ffffff':'#102b31',align:'l'}]}))};
}}});window.ready=true;
</script>`;
for(const engine of ['chromium','webkit'])test(engine+' native generation → selected edit/undo → manual text → save/reopen → all 17 slides',{skip:!process.env.MINICAN_PLAYWRIGHT_PATH,timeout:150000},async t=>{
 const server=createServer(async(req,res)=>{try{const path=new URL(req.url,'http://local').pathname;if(path==='/fixture.html'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(fixture);}const f=resolve(root,'.'+decodeURIComponent(path));if(!f.startsWith(resolve(root)+sep))throw Error('path');res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2','.json':'application/json'})[extname(f)]||'application/octet-stream');res.end(await readFile(f));}catch{res.writeHead(404);res.end();}});
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));t.after(()=>new Promise(ok=>server.close(ok)));
 const pw=await import(pathToFileURL(process.env.MINICAN_PLAYWRIGHT_PATH).href),browser=await pw[engine].launch({headless:true,...(engine==='chromium'?{channel:'msedge'}:{})});t.after(()=>browser.close());
 const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const origin='http://127.0.0.1:'+server.address().port;
 await context.addInitScript(()=>{try{localStorage.setItem('onbatang-tour-seen-v1:editor','1');localStorage.setItem('onbatang-tour-seen-v1:news-0.45','1');}catch{}});
 await context.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
 await page.goto(origin+'/fixture.html');await page.waitForFunction(()=>window.ready);
 await page.locator('[data-presentation-start]').click();await page.getByLabel('만들 발표',{exact:true}).fill('선생님께 질문이 수업을 바꾸는 방법을 설명하는 발표');await page.getByLabel('발표 장 수',{exact:true}).fill('17');
 await page.evaluate(()=>window.shortAnswer=true);await page.locator('[data-compose-ask]').click();await page.getByText(/요청한 17장이 모두 있어야/).waitFor();assert.equal(await page.locator('[data-compose-apply]').isDisabled(),true);
 await page.evaluate(()=>window.shortAnswer=false);await page.locator('[data-compose-ask]').click();await page.waitForFunction(()=>document.querySelectorAll('.onba-compose-previews article').length===17);
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('native-fixture.native-compose-v1')).proposal.slides),undefined,'draft stores asset references, not repeated photos in every rendered slide');
 if(process.env.NATIVE_COMPOSE_SHOT)await page.screenshot({path:process.env.NATIVE_COMPOSE_SHOT+'-'+engine+'-proposal.png'});
 assert.equal(await page.locator('iframe').count(),0);await page.locator('[data-compose-apply]').click();await page.locator('.cv-canvas .fe-stage').waitFor();await page.evaluate(async()=>{(await import('/app/tour.js')).stopTour();});
 await page.locator('.cv-canvas .fi-text').first().click();await page.locator('[data-assist-toggle]').click();await page.getByLabel('선택한 요소만',{exact:true}).check();await page.locator('.cv-assist-wish').fill('이 제목만 더 크게 하고 주황색으로 바꿔');await page.locator('[data-assist-ask]').click();await page.locator('[data-assist-apply]').waitFor();
 assert.equal(await page.evaluate(()=>window.asked.at(-1).slides[0].items.length),1);await page.locator('[data-assist-apply]').click();await page.locator('[data-assist-undo]').waitFor();await page.locator('[data-assist-undo]').click();await page.locator('.cv-assist-close').click();
 await page.locator('.cv-canvas .fi-text').first().dblclick();const edit=page.locator('.cv-canvas [contenteditable]:not([contenteditable="false"])');await edit.fill('질문 하나로 시작하는 수업');await page.locator('.cv-name').click();
 await page.locator('.cv-back').click();await page.getByRole('button',{name:'질문에서 시작하는 수업 열기',exact:true}).waitFor();const saved=await page.evaluate(()=>window.readSaved());assert.equal(saved[0].slides.length,17);assert.equal(saved[0].slides[0].items[1].text,'질문 하나로 시작하는 수업');assert.equal(saved[0].slides[0].items[1].size,5);const id=saved[0].id;
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
