import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve,extname,sep} from 'node:path';

const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const sourcePath=process.env.MINICAN_GAI_PPTX||resolve(root,'tools/fixtures/pptx/self-authored-21-pages.pptx');
const sourcePages=Number(process.env.MINICAN_GAI_PAGE_COUNT||21);
const options={skip:!process.env.MINICAN_PLAYWRIGHT_PATH,timeout:240000};
const sha=value=>createHash('sha256').update(value).digest('hex');

// A deliberately tiny deterministic adapter, speaking the same public
// GAIClassroom protocol. It tests the shared sandbox without depending on a
// sibling Gai repository, a live model, an account or a paid QA environment.
function fixtureClassroom(initial,bridge){
 let snapshot=initial,adapter;const pending=new Map();
 const api={get connected(){return true;},get snapshot(){return snapshot;},
  connect(value){adapter=value;adapter.restore(snapshot.me.checkpoint);adapter.onRoom(snapshot);setTimeout(()=>api.publish(adapter.capture()),0);return{dispose(){adapter=null;}};},
  publish(patch){const request=crypto.randomUUID();return new Promise((yes,no)=>{pending.set(request,{yes,no});parent.postMessage({type:'gai-classroom-report',bridge,request,patch},'*');});}
 };
 window.GAIClassroom=api;
 addEventListener('message',event=>{const d=event.data;if(event.source!==parent||d?.bridge!==bridge)return;if(d.type==='gai-classroom-state'){snapshot=d.snapshot;adapter?.onRoom(snapshot);}if(d.type==='gai-classroom-result'){const p=pending.get(d.request);if(p){pending.delete(d.request);d.error?p.no(Error(d.error)):p.yes(snapshot);}}});
}

const initial={connected:true,room:{phase:'running',round:1,message:''},me:{id:'local',nickname:'교사',checkpoint:{onbatangRestoreMarker:'ONBATANG_APP_CHECKPOINT'}},participants:[]};
const counterHtml='<main><h1>수업 절차 연습</h1><p>버튼을 눌러 활동 단계를 진행해요.</p><button id="step">다음 단계 실행</button><output id="count" aria-live="polite">0</output><p id="version"></p></main>';
const counterCss='*{box-sizing:border-box}body{margin:0;padding:24px;background:#f1f7f3;color:#273f3a;font:18px/1.6 system-ui}main{max-width:640px;margin:auto}button{min-height:48px;padding:12px 18px;background:#287467;color:white;border:0;border-radius:12px;font:inherit}output{display:block;font-size:3rem;margin:16px 0}';
const counterJs=`let count=0;const out=document.getElementById('count');function draw(){out.textContent=String(count);}function capture(){return {progress:Math.min(100,count*10),score:count,completed:false,answer:count+'단계 완료',checkpoint:{count},state:{count}};}document.getElementById('step').onclick=async()=>{count++;draw();await GAIClassroom.publish(capture());};GAIClassroom.connect({capture,restore(saved){count=Number.isInteger(saved.count)?saved.count:0;draw();},onRoom(){}});draw();`;
const documentHead=`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'none'; img-src data:; object-src 'none'; frame-src 'none'; form-action 'none'">`;
const safe=value=>JSON.stringify(value).replace(/</g,'\\u003c');
const providerModule=`
const initial=${safe(initial)},sdk=${fixtureClassroom.toString()},appHtml=${safe(counterHtml)},css=${safe(counterCss)},js=${safe(counterJs)},head=${safe(documentHead)};
export function createFixtureProvider(){
 let sequence=0;window.gaiFixtureCalls=[];window.gaiFixtureConnections=0;
 return {async connect(){window.gaiFixtureConnections++;return {label:'자동 검증용 가이X'};},async generate(input,{signal}={}){
  if(signal?.aborted)throw new DOMException('cancelled','AbortError');window.gaiFixtureCalls.push(structuredClone(input));sequence++;
  if(input.prompt.includes('설명만'))return {kind:'answer',answer:'현재 수업 다음에 실행 활동을 추가할 수 있어요.'};
  const title=sequence===1?'단계 연습 초안':'수업 단계 활동';
  const project={title,template:'freeform',mode:'free',specification:{schemaVersion:1,description:'직접 만든 검증용 단계 활동',accent:'green',items:[],app:{version:1,html:appHtml,css,js}}};
  const document=head+'<title>'+title+'</title><style>'+css+'</style></head><body>'+appHtml+'<script>('+sdk.toString()+')('+JSON.stringify(initial)+',"ONBATANG_APP_BRIDGE_TOKEN");'+js+'document.getElementById("version").textContent='+JSON.stringify(title)+';<'+'/script></body></html>';
  return {kind:'app',activity:{title,instructions:'수업 순서에 따라 단계를 실행하고 결과를 저장해요.',document,project},summary:sequence===1?'첫 활동을 만들었어요.':'말씀한 수업 흐름에 맞춰 수정했어요.'};
 }};
}`;

async function setup(t,{width,height}){
 const errors=[],external=[],requests=[];
 const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2','.png':'image/png','.jpg':'image/jpeg'};
 const server=createServer(async(req,res)=>{try{
  const path=new URL(req.url,'http://localhost').pathname;
  if(path==='/gai-test.html'){res.setHeader('Content-Type',mime['.html']);return res.end('<!doctype html><html lang="ko"><meta name="viewport" content="width=device-width,initial-scale=1"><body class="mc-app"><main id="app"></main><script type="module">import {startOnbatang} from "/app/standalone.js";import {createFixtureProvider} from "/gai-test-provider.js";await startOnbatang({appMaker:createFixtureProvider()});</script></body></html>');}
  if(path==='/gai-test-provider.js'){res.setHeader('Content-Type',mime['.js']);return res.end(providerModule);}
  const file=resolve(root,'.'+decodeURIComponent(path));if(!file.startsWith(root+sep)){res.writeHead(403);return res.end();}
  res.setHeader('Content-Type',mime[extname(file)]||'application/octet-stream');res.end(await readFile(file));
 }catch{res.writeHead(404);res.end();}});
 await new Promise(done=>server.listen(0,'127.0.0.1',done));t.after(()=>new Promise(done=>server.close(done)));
 const origin=`http://127.0.0.1:${server.address().port}`,{chromium}=await import(pathToFileURL(process.env.MINICAN_PLAYWRIGHT_PATH).href);
 // Edge/Playwright cannot inspect opaque OOPIFs reliably on this Windows runtime.
 // Disable process isolation only for this test; the product sandbox/CSP stays enabled.
 const browser=await chromium.launch({channel:process.env.MINICAN_BROWSER||'msedge',headless:true,args:['--disable-features=IsolateOrigins,site-per-process','--disable-site-isolation-trials']});t.after(()=>browser.close());
 const context=await browser.newContext({viewport:{width,height},hasTouch:width<700,isMobile:width<700,reducedMotion:'reduce',acceptDownloads:true});
 await context.addInitScript(()=>{try{localStorage.setItem('onbatang-tour-seen-v1:editor','1');if(navigator.serviceWorker)navigator.serviceWorker.register=async()=>undefined;}catch{}});
 await context.route('**/*',route=>{const url=new URL(route.request().url());if(['data:','blob:','about:'].includes(url.protocol))return route.continue();if(url.origin!==origin){external.push(url.origin);return route.abort('blockedbyclient');}requests.push(url.pathname);return route.continue();});
 const page=await context.newPage();page.setDefaultTimeout(45000);page.on('pageerror',error=>errors.push(error.message));
 return {page,entry:origin+'/gai-test.html',errors,external,requests};
}

async function importDeck(page,entry){
 await page.goto(entry);await page.locator('.cv-hero .cv-new-btn').click();await page.locator('.fe-tab[data-tab=upload]').click();await page.locator('[data-upload-tab=ppt]').click();await page.locator('[data-document-import]').click();
 await page.locator('[data-inline-import]').getByLabel('PPTX 파일 선택',{exact:true}).setInputFiles(sourcePath);
 await page.waitForFunction(n=>document.querySelectorAll('[data-page-select]').length===n&&document.querySelector('[data-import-save]')?.disabled===false,sourcePages,{timeout:120000});
 await page.locator('[data-import-save]').click();await page.locator('[data-inline-import]').waitFor({state:'detached',timeout:120000});await waitPages(page,sourcePages);
}
const waitPages=(page,count)=>page.waitForFunction(n=>document.querySelectorAll('[data-material-page]').length===n,count);
async function readLibrary(page){return page.evaluate(async()=>{
 const library=(await import('/app/pptx-import/library.js')).createPptxLibrary({storage:'minican'});
 try{const graphs=await library.listMaterials(),originals=[],sources=[];for(const graph of graphs){originals.push(await library.getMaterial({id:graph.materialRef.id,revision:0}));const blob=await library.repository.readAsset(graph.manifest.sourceAssetId);sources.push({bytes:blob.size,sha256:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),n=>n.toString(16).padStart(2,'0')).join('')});}return{graphs,originals,sources};}finally{await library.close();}
});}
async function reopen(page,name,count){await page.locator('.cv-back').click();await page.locator('.cv-home-title').waitFor();await page.reload();await page.getByRole('button',{name:name+' 열기',exact:true}).click();await waitPages(page,count);}
const appFrame=scope=>scope.frameLocator('.gai-app-frame').frameLocator('[data-gai-app-content]');

test('a visited part keeps its persisted draft basis when another full part sends an app there', {...options,skip:options.skip||sourcePages!==21},async t=>{
 const {page,entry}=await setup(t,{width:1440,height:1000});await importDeck(page,entry);
 const before=await readLibrary(page),first=page.locator('[data-material-page="0"]'),last=page.locator('[data-material-page="20"]');
 const firstPart=await first.getAttribute('data-document-id'),lastPart=await last.getAttribute('data-document-id');
 assert.notEqual(firstPart,lastPart,'the 21-page fixture spans two immutable parts');
 // Merely visiting a PPT normalizes the editor view. It must not replace the
 // stored comparison basis with that unsaved rendering when we leave it.
 await last.click();
 await page.locator('[data-material-page="20"][aria-pressed=true]').waitFor();
 await first.click();await page.locator('[data-material-page="0"][aria-pressed=true]').waitFor();
 await page.locator('[data-add-gai-app]').click();const maker=page.locator('.gai-maker');
 await maker.getByRole('button',{name:'가이X 연결',exact:true}).click();
 await maker.getByRole('button',{name:'가이X 연결됨',exact:true}).waitFor();
 await maker.getByRole('textbox',{name:'가이X에게 요청',exact:true}).fill('이 쪽 뒤에 짧은 단계 활동 앱을 만들어줘.');
 await maker.getByRole('button',{name:'보내기',exact:true}).click();await appFrame(maker).getByRole('button',{name:'다음 단계 실행',exact:true}).waitFor();
 await maker.getByRole('button',{name:'이 앱을 슬라이드에 넣기',exact:true}).click();
 try{await maker.waitFor({state:'detached',timeout:8000});}catch(error){throw new Error('cross-part app save: '+await maker.locator('.gai-maker-status').innerText(),{cause:error});}
 await waitPages(page,22);
 assert.equal(await page.locator('[data-material-page="1"]').getAttribute('data-document-id'),lastPart,'the full first part reserves app/result space in the previously visited part');
 const after=await readLibrary(page);assert.deepEqual(after.originals,before.originals);assert.deepEqual(after.sources,before.sources);
 const originalIds=before.graphs[0].pages.map(row=>row.page.id),pages=after.graphs[0].pages;
 assert.equal(pages[1].page.activity.kind,'gai-app');
 assert.deepEqual(pages.filter(row=>!row.page.activity).map(row=>row.page.id),originalIds);
 await page.locator('.cv-show-btn').click();const show=page.locator('.cv-show'),runtime=appFrame(show);
 await runtime.getByRole('button',{name:'다음 단계 실행',exact:true}).click();
 await show.getByRole('button',{name:'결과를 다음 슬라이드에 저장',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.cv-show-count')?.textContent==='3 / 23');
 assert.match(await show.locator('.cv-show-stage').innerText(),/1단계 완료/);
});
async function capture(page,width,name){if(!process.env.MINICAN_GAI_REPORT)return;const dir=resolve(root,'work',process.env.MINICAN_GAI_REPORT);assert.ok(dir.startsWith(resolve(root,'work')+sep));await mkdir(dir,{recursive:true});await page.screenshot({path:resolve(dir,`${width}-${name}.png`),fullPage:true,animations:'disabled'});}

for(const [width,height]of [[1440,1000],[390,844]])test(`Gai conversation creates an app inside a PPT, restores its state and saves the next-slide result (${width}px)`,options,async t=>{
 const sourceBytes=await readFile(sourcePath),{page,entry,errors,external}=await setup(t,{width,height});await importDeck(page,entry);
 await reopen(page,await page.locator('.cv-name').inputValue(),sourcePages);
 const original=await readLibrary(page),originalGraph=original.graphs[0],ids=originalGraph.pages.map(row=>row.page.id),after=Math.min(9,sourcePages-2),activityIndex=after+1,resultIndex=after+2;
 await page.locator(`[data-material-page="${after}"]`).click();await page.locator(`[data-material-page="${after}"][aria-pressed=true]`).waitFor();
 await page.locator('[data-add-gai-app]').click();const maker=page.locator('.gai-maker');await maker.waitFor();
 await maker.getByRole('button',{name:'가이X 연결',exact:true}).click();await maker.getByRole('button',{name:'가이X 연결됨',exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>window.gaiFixtureConnections),1);
 await maker.getByRole('textbox',{name:'가이X에게 요청',exact:true}).fill('이 슬라이드 다음에서 쓸 단계 실행 활동을 만들어줘.');await maker.getByRole('button',{name:'보내기',exact:true}).click();
 const preview=appFrame(maker);try{await preview.getByRole('button',{name:'다음 단계 실행',exact:true}).waitFor({timeout:10000});}catch(error){await capture(page,width,'preview-failed');throw new Error(JSON.stringify({phase:'first preview',status:await maker.locator('.gai-maker-status').innerText(),errors,frames:page.frames().map(f=>f.url())}),{cause:error});}
 assert.equal(await preview.locator('#version').innerText(),'단계 연습 초안');
 await preview.getByRole('button',{name:'다음 단계 실행',exact:true}).click();assert.equal(await preview.locator('#count').innerText(),'1');
 await maker.getByRole('button',{name:'결과를 다음 슬라이드에 저장',exact:true}).click();
 await maker.locator('.gai-maker-status').filter({hasText:'미리보기 결과'}).waitFor();assert.equal(await page.locator('[data-material-page]').count(),sourcePages,'preview execution does not create a lesson slide');
 assert.deepEqual(await readLibrary(page),original,'previewing does not alter the pinned source');

 await maker.getByRole('textbox',{name:'가이X에게 요청',exact:true}).fill('제목을 수업 단계 활동으로 바꾸고, 같은 버튼과 진행 기록을 유지해줘.');await maker.getByRole('button',{name:'보내기',exact:true}).click();
 await preview.locator('#version').filter({hasText:'수업 단계 활동'}).waitFor();
 const calls=await page.evaluate(()=>window.gaiFixtureCalls);assert.equal(calls.length,2);
 const context=JSON.parse(calls[0].context);assert.equal(context.totalSlides,sourcePages);assert.equal(context.insertAfter,after+1);assert.equal(context.referenceOnly,true);
 assert.deepEqual(context.slides.map(s=>s.position),[after+1]);assert.equal(calls[0].images.length,1);assert.equal(calls[0].images[0].name,`온바탕 ${after+1}쪽.jpg`);assert.ok(calls[0].context.length<=14000);assert.doesNotMatch(calls[0].context,/data:image\//);
 assert.equal(calls[0].project,null);assert.equal(calls[1].project.template,'freeform');assert.equal(calls[1].conversation.length,1);assert.match(calls[1].conversation[0].prompt,/단계 실행 활동/);
 assert.equal(await maker.locator('.gai-app-frame').getAttribute('sandbox'),'allow-scripts');
 await capture(page,width,'chat-preview');await maker.locator('.gai-maker-preview').scrollIntoViewIfNeeded();await capture(page,width,'app-preview');
 // Teachers can leave the conversation and resume the local draft without an AI call.
 await maker.getByRole('button',{name:'편집으로 돌아가기',exact:true}).click();await maker.waitFor({state:'detached'});
 await page.locator('[data-add-gai-app]').click();await maker.waitFor();await preview.locator('#version').filter({hasText:'수업 단계 활동'}).waitFor();
 assert.equal(await page.evaluate(()=>window.gaiFixtureCalls.length),2);assert.match(await maker.locator('.gai-maker-log').innerText(),/수업 흐름에 맞춰 수정/);
 await maker.getByRole('button',{name:'이 앱을 슬라이드에 넣기',exact:true}).click();await maker.waitFor({state:'detached'});await waitPages(page,sourcePages+1);
 await page.locator(`[data-material-page="${activityIndex}"][aria-pressed=true]`).waitFor();const activityId=await page.locator(`[data-material-page="${activityIndex}"]`).getAttribute('data-page-id'),name=await page.locator('.cv-name').inputValue();

 await page.locator('.cv-show-btn').click();const show=page.locator('.cv-show'),runtime=appFrame(show);await runtime.getByRole('button',{name:'다음 단계 실행',exact:true}).waitFor();
 assert.equal(await show.locator('.cv-show-count').innerText(),`${activityIndex+1} / ${sourcePages+1}`);assert.equal(await runtime.locator('#count').innerText(),'0','refined app starts with its own checkpoint');
 for(let i=0;i<3;i++)await runtime.getByRole('button',{name:'다음 단계 실행',exact:true}).click();
 assert.equal(await runtime.locator('#count').innerText(),'3');assert.equal(await show.locator('.cv-show-count').innerText(),`${activityIndex+1} / ${sourcePages+1}`,'in-frame interaction never changes the presentation page');
 await capture(page,width,'app-in-presentation');await show.getByRole('button',{name:'결과를 다음 슬라이드에 저장',exact:true}).click();
 await page.waitForFunction(text=>document.querySelector('.cv-show-count')?.textContent===text,`${resultIndex+1} / ${sourcePages+2}`);
 assert.match(await show.locator('.cv-show-stage').innerText(),/3단계 완료/);await capture(page,width,'saved-result');
 await show.getByRole('button',{name:'발표 끝내기 (Esc)',exact:true}).click();await show.waitFor({state:'detached'});await waitPages(page,sourcePages+2);

 const saved=await readLibrary(page),graph=saved.graphs[0],activity=graph.pages[activityIndex].page,result=graph.pages[resultIndex].page;
 assert.equal(activity.id,activityId);assert.equal(activity.activity.kind,'gai-app');assert.equal(activity.activity.title,'수업 단계 활동');assert.equal(activity.activity.project.template,'freeform');assert.equal(activity.activity.state.count,3);
 assert.equal(result.source.kind,'result');assert.ok(result.items.some(item=>item.t==='text'&&item.text==='3단계 완료'));
 assert.deepEqual(graph.pages.map(row=>row.page.id),[...ids.slice(0,after+1),activity.id,result.id,...ids.slice(after+1)]);
 assert.deepEqual(saved.originals,original.originals);assert.deepEqual(saved.sources,[{bytes:sourceBytes.length,sha256:sha(sourceBytes)}]);
 for(let pass=0;pass<2;pass++){
  await reopen(page,name,sourcePages+2);assert.deepEqual(await readLibrary(page),saved);
  await page.locator(`[data-material-page="${activityIndex}"]`).click();await page.locator('.cv-show-btn').click();await runtime.getByRole('button',{name:'다음 단계 실행',exact:true}).waitFor();
  assert.equal(await runtime.locator('#count').innerText(),'3','saved app checkpoint restores in the sandbox after reload');
  await show.getByRole('button',{name:'다음 장',exact:true}).click();assert.match(await show.locator('.cv-show-stage').innerText(),/3단계 완료/);await show.getByRole('button',{name:'발표 끝내기 (Esc)',exact:true}).click();
 }
 // Editing routes back into the conversation, and an answer-only response may
 // not silently replace or reset the app and its saved classroom checkpoint.
 await page.locator(`[data-material-page="${activityIndex}"]`).click();await page.locator('[data-edit-activity]').click();await maker.waitFor();await preview.getByRole('button',{name:'다음 단계 실행',exact:true}).waitFor();
 assert.equal(await preview.locator('#count').innerText(),'3');await maker.getByLabel('PPT 수업 흐름 함께 전달',{exact:true}).uncheck();
 await maker.getByRole('textbox',{name:'가이X에게 요청',exact:true}).fill('지금 앱이 수업에서 어떻게 쓰이는지 설명만 해줘.');await maker.getByRole('button',{name:'보내기',exact:true}).click();await maker.locator('.gai-maker-log').filter({hasText:'현재 수업 다음에 실행 활동'}).waitFor();
 assert.equal(await page.evaluate(()=>window.gaiFixtureCalls.at(-1).context),'');assert.deepEqual(await page.evaluate(()=>window.gaiFixtureCalls.at(-1).images),[]);assert.equal(await preview.locator('#count').innerText(),'3');
 await maker.getByRole('button',{name:'편집으로 돌아가기',exact:true}).click();await maker.waitFor({state:'detached'});assert.deepEqual(await readLibrary(page),saved,'discarding an app conversation does not alter the saved material');
 assert.equal(sha(await readFile(sourcePath)),sha(sourceBytes));assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 // The public standalone does not offer GaiX creation or editing. Existing apps
 // still execute with their saved checkpoint, without connecting an account.
 await page.goto(new URL('/app/index.html',entry).href);await page.getByRole('button',{name:name+' 열기',exact:true}).click();await waitPages(page,sourcePages+2);
 assert.equal(await page.locator('[data-add-gai-app]').count(),0);await page.locator(`[data-material-page="${activityIndex}"]`).click();assert.equal(await page.locator('[data-edit-activity]').isVisible(),false);
 await page.locator('.cv-show-btn').click();await runtime.getByRole('button',{name:'다음 단계 실행',exact:true}).waitFor();assert.equal(await runtime.locator('#count').innerText(),'3');await show.getByRole('button',{name:'발표 끝내기 (Esc)',exact:true}).click();assert.deepEqual(await readLibrary(page),saved);
 if(process.env.MINICAN_GAI_REPORT){const dir=resolve(root,'work',process.env.MINICAN_GAI_REPORT);await mkdir(dir,{recursive:true});await writeFile(resolve(dir,`${width}-report.json`),JSON.stringify({scope:'common local UI with deterministic appMaker provider',viewport:{width,height},source:{pages:sourcePages,bytes:sourceBytes.length,sha256:sha(sourceBytes)},result:{pages:sourcePages+2,revision:graph.materialRef.revision,checkpoint:{count:3}},context:{totalSlides:context.totalSlides,nonemptyTextPages:context.slides.filter(s=>s.text).map(s=>s.position),emptyTextPages:context.slides.filter(s=>!s.text).map(s=>s.position),characters:calls[0].context.length},checks:['create and refine conversation','leave and resume conversation draft','bounded ordered PPT text context','context opt-out','opaque sandbox preview','preview no material mutation','present app inside slide','next-slide result','checkpoint restored twice','original source and revision zero preserved','answer-only edit preserves app'],notRun:['real AI generation','real account authentication','physical device','production deployment'],paidQa:false,browserToolLimitation:'Edge/Playwright OOPIF inspection requires site-isolation process flags disabled; product opaque sandbox and CSP remain enabled'},null,2)+'\n');}
});

for(const [width,height]of [[1440,1000],[390,844]])test(`chosen PPT references and an independent cross-part app position survive draft and save (${width}px)`,{...options,skip:options.skip||sourcePages!==21},async t=>{
 const {page,entry,errors,external}=await setup(t,{width,height});await importDeck(page,entry);const original=await readLibrary(page),before=original.graphs[0];
 assert.equal(await page.getByRole('button',{name:'픽셀아트 활동 넣기',exact:true}).count(),1);assert.equal(await page.locator('[data-add-gai-app] img.gai-owl').count(),1);
 await page.locator('[data-add-gai-app]').click();const maker=page.locator('.gai-maker');await maker.getByRole('button',{name:'선택 해제',exact:true}).click();
 for(const n of [2,3,4])await maker.getByRole('checkbox',{name:`${n}쪽 참고`,exact:true}).check();
 await maker.getByRole('checkbox',{name:'5쪽 참고',exact:true}).click();await maker.locator('.gai-maker-status').filter({hasText:'최대 3쪽'}).waitFor();assert.equal(await maker.getByRole('checkbox',{name:'5쪽 참고',exact:true}).isChecked(),false);
 const afterPageId=before.pages[20].page.id;await maker.getByRole('combobox',{name:'앱 넣을 위치',exact:true}).selectOption(afterPageId);
 assert.match(await maker.locator('.gai-maker-current-slide').innerText(),/21쪽/);assert.ok(await maker.locator('.gai-maker-slide-large > *').count());
 await maker.getByRole('button',{name:'편집으로 돌아가기',exact:true}).click();await page.locator('[data-add-gai-app]').click();await maker.getByRole('button',{name:'보내기',exact:true}).waitFor();
 await page.waitForFunction(()=>document.querySelector('.gai-maker-compose button[type=submit]')?.disabled===false);
 assert.equal(await maker.getByRole('combobox',{name:'앱 넣을 위치',exact:true}).inputValue(),afterPageId);assert.equal(await maker.getByRole('checkbox',{name:'2쪽 참고',exact:true}).isChecked(),true);
 await maker.getByRole('button',{name:'가이X 연결',exact:true}).click();await maker.getByRole('button',{name:'가이X 연결됨',exact:true}).waitFor();
 await maker.getByRole('textbox',{name:'가이X에게 요청',exact:true}).fill('이 수업을 마친 뒤에 실행할 단계를 만들어줘.');await maker.getByRole('button',{name:'보내기',exact:true}).click();await appFrame(maker).getByRole('button',{name:'다음 단계 실행',exact:true}).waitFor();
 const [call]=await page.evaluate(()=>window.gaiFixtureCalls),reference=JSON.parse(call.context);assert.deepEqual(reference.slides.map(v=>v.position),[2,3,4]);assert.equal(reference.insertAfter,21);assert.equal(reference.placement.pageId,afterPageId);assert.deepEqual(call.images.map(v=>v.name),['온바탕 2쪽.jpg','온바탕 3쪽.jpg','온바탕 4쪽.jpg']);assert.ok(call.images.every(v=>v.mimeType==='image/jpeg'&&v.data.length<=409600));
 await page.locator('.cv-activity-config').evaluate(node=>node.scrollTop=0);if(process.env.MINICAN_GAI_REPORT)await page.screenshot({path:resolve(root,'work',process.env.MINICAN_GAI_REPORT,`${width}-chosen-slide-flow.png`),fullPage:false});await maker.getByRole('checkbox',{name:'선택한 슬라이드 화면도 전달',exact:true}).uncheck();await maker.getByRole('textbox',{name:'가이X에게 요청',exact:true}).fill('수업 단계 활동으로 제목을 바꿔줘.');await maker.getByRole('button',{name:'보내기',exact:true}).click();await appFrame(maker).locator('#version').filter({hasText:'수업 단계 활동'}).waitFor();assert.deepEqual(await page.evaluate(()=>window.gaiFixtureCalls.at(-1).images),[]);
 await maker.getByRole('button',{name:'이 앱을 슬라이드에 넣기',exact:true}).click();await maker.waitFor({state:'detached'});await waitPages(page,22);
 const saved=await readLibrary(page),pages=saved.graphs[0].pages;assert.deepEqual(pages.slice(0,21).map(v=>v.page.id),before.pages.map(v=>v.page.id));assert.equal(pages[21].page.origin.pageId,afterPageId);assert.equal(pages[21].page.origin.documentId,before.pages[20].document.id);assert.equal(pages[21].page.activity.title,'수업 단계 활동');assert.deepEqual(saved.originals,original.originals);assert.deepEqual(saved.sources,original.sources);
 await reopen(page,await page.locator('.cv-name').inputValue(),22);assert.deepEqual(await readLibrary(page),saved);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
});
