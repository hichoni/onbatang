import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve,extname,sep} from 'node:path';
const commonRoot=resolve(fileURLToPath(new URL('../../',import.meta.url))),gai=process.env.MINICAN_RESULTS_HOST==='gai';
const root=gai?resolve(commonRoot,'../g-ai-lab-inline/dist'):commonRoot,options={skip:!process.env.MINICAN_PLAYWRIGHT_PATH,timeout:120000};
async function graph(page,ref){return page.evaluate(async({gai,ref})=>{
 if(!gai){const {storageName}=await import('/app/store.js'),lib=(await import('/app/pptx-import/library.js')).createPptxLibrary({storage:storageName()});try{return ref?await lib.getMaterial(ref):(await lib.listMaterials())[0];}finally{await lib.close();}}
 const repo=(await import('/onbatang-local-repository.js')).createLocalOnbatangRepository();try{
  const heads=await repo.listHeads({kind:'document'}),anchor=heads.find(h=>h.sidecar.materialBundle),storage=(await import('/onbatang-material-storage.js')).createMaterialStorage({repository:repo});return storage.reopenMaterial(ref||{documentId:anchor.id,revision:anchor.revision,id:anchor.sidecar.materialBundle.id});
 }finally{await repo.close();}
},{gai,ref});}
const bytes=async download=>{const chunks=[];for await(const chunk of await download.createReadStream())chunks.push(chunk);return Buffer.concat(chunks);};
for(const width of [1440,390])test(`${gai?'Gai':'common'} HTML result return previews, pins once and reopens without changing source (${width}px)`,options,async t=>{
 let lesson='';
 const server=createServer(async(req,res)=>{try{
  let path=new URL(req.url,'http://localhost').pathname;
  if(path==='/offline-fixture.html'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(lesson);}
  if(!gai&&path==='/authoring-fixture.html'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end('<!doctype html><html lang="ko"><meta name="viewport" content="width=device-width,initial-scale=1"><body class="mc-app"><main id="app"></main><script type="module">import {startOnbatang} from "/app/standalone.js";await startOnbatang({activityAuthoring:true});</script></body></html>');}
  if(gai&&path==='/community-config.js'){res.setHeader('Content-Type','text/javascript');return res.end('export default {provider:"local"}');}
  if(path.endsWith('/'))path+='index.html';const file=resolve(root,'.'+decodeURIComponent(path));if(!file.startsWith(root+sep))throw Error('path');
  res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.woff2':'font/woff2','.svg':'image/svg+xml'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));
 }catch{res.writeHead(404);res.end();}});
 await new Promise(done=>server.listen(0,'127.0.0.1',done));t.after(()=>new Promise(done=>server.close(done)));
 const {chromium}=await import(pathToFileURL(process.env.MINICAN_PLAYWRIGHT_PATH).href),browser=await chromium.launch({channel:'msedge',headless:true});t.after(()=>browser.close());
 const context=await browser.newContext({viewport:{width,height:900},acceptDownloads:true,reducedMotion:'reduce'}),origin=`http://127.0.0.1:${server.address().port}`,external=[],errors=[];
 await context.route('**/*',route=>{if(route.request().url().startsWith(origin+'/')||/^(data|blob):/.test(route.request().url()))return route.continue();external.push(route.request().url());return route.abort();});
 await context.routeWebSocket('**/*',s=>s.close());await context.addInitScript(()=>{try{localStorage.setItem('onbatang-tour-seen-v1:editor','1');}catch{}});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+(gai?'/minican-app.html':'/authoring-fixture.html'));
 await page.locator('.cv-hero .cv-new-btn').click();assert.equal(await page.locator('[data-add-gai-app]').count(),gai?1:0);await page.getByRole('tab',{name:'내 자료',exact:true}).click();await page.getByRole('tab',{name:'PPT',exact:true}).click();await page.getByRole('button',{name:'내 PPT 올리기',exact:true}).click();
 await page.locator('[data-inline-import]').getByLabel('PPTX 파일 선택',{exact:true}).setInputFiles(resolve(commonRoot,'tools/fixtures/pptx/self-authored-4x3.pptx'));
 await page.waitForFunction(()=>document.querySelector('[data-inline-import] [data-import-save]')?.disabled===false);await page.locator('[data-inline-import] [data-import-save]').click();await page.locator('[data-inline-import]').waitFor({state:'detached'});
 await page.waitForFunction(()=>document.querySelectorAll('[data-material-page]').length===2);const original=await graph(page);
 await page.locator('.cv-tray-menu>summary').click();await page.locator('[data-add-activity]').click();await page.getByRole('button',{name:'활동 슬라이드 추가',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('[data-material-page]').length===3);
 const before=await graph(page),source=before.pages.find(p=>p.page.activity).page;
 if(!gai){const name=await page.locator('.cv-name').inputValue();await page.goto(origin+'/app/');await page.getByRole('button',{name:name+' 열기',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('[data-material-page]').length===3);assert.equal(await page.locator('[data-add-activity]').count(),0);assert.equal(await page.locator('[data-add-gai-app]').count(),0);}
 await page.locator('.cv-down-btn').click();await page.locator('[data-type=html]').click();const pending=page.waitForEvent('download');await page.locator('[data-download-save]').click();lesson=(await bytes(await pending)).toString();
 assert.match(lesson,/definitionHash/);const offline=await context.newPage();offline.on('pageerror',e=>errors.push(e.message));await offline.goto(origin+'/offline-fixture.html');
 await offline.getByRole('button',{name:'다음',exact:true}).click();await offline.getByRole('button',{name:'활동 시작',exact:true}).click();await offline.locator('[data-pixel="0"]').click();await offline.locator('[data-pixel="1"]').click();await offline.getByRole('button',{name:'결과를 다음 슬라이드에 저장',exact:true}).click();
 const returned=offline.waitForEvent('download');await offline.getByRole('button',{name:'온바탕용 결과 내려받기',exact:true}).click();const json=await bytes(await returned),packet=JSON.parse(json);assert.equal(packet.results.length,1);assert.equal(packet.results[0].binding.pageId,source.id);
 await page.locator('.cv-tray-menu>summary').click();await page.locator('[data-import-lesson-results]').click();const dialog=page.getByRole('dialog',{name:'HTML 수업 결과 가져오기',exact:true});
 await dialog.getByLabel('온바탕용 결과 JSON 파일',{exact:true}).setInputFiles({name:'results.json',mimeType:'application/json',buffer:json});
 await dialog.getByRole('button',{name:'선택한 결과 저장',exact:true}).waitFor();await page.waitForFunction(()=>document.querySelector('.lesson-return-actions .btn-primary')?.disabled===false);
 assert.equal((await graph(page)).materialRef.revision,before.materialRef.revision,'preview is read-only');
 await dialog.getByRole('button',{name:'선택한 결과 저장',exact:true}).click();await dialog.waitFor({state:'detached'});await page.waitForFunction(()=>document.querySelectorAll('[data-material-page]').length===4);
 const saved=await graph(page),result=saved.pages.find(p=>p.page.source?.objectId==='html:'+packet.results[0].id).page;
 assert.equal(result.items.find(i=>i.t==='image').url,packet.results[0].image);assert.deepEqual(saved.pages.find(p=>p.page.id===source.id).page,source);assert.deepEqual(await graph(page,original.materialRef),original);
 const name=await page.locator('.cv-name').inputValue();await page.getByRole('button',{name:'내 그림',exact:true}).click();await page.reload();await page.getByRole('button',{name:name+' 열기',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('[data-material-page]').length===4);
 await page.locator('.cv-tray-menu>summary').click();await page.locator('[data-import-lesson-results]').click();await page.getByLabel('온바탕용 결과 JSON 파일',{exact:true}).setInputFiles({name:'retry.json',mimeType:'application/json',buffer:json});await page.getByText(/이미 저장한 결과 1개/).waitFor();assert.equal(await page.getByRole('button',{name:'선택한 결과 저장',exact:true}).isDisabled(),true);assert.deepEqual(await graph(page),saved);
 const foreign={...packet,target:{kind:'material',id:'mothermaterial01'}};await page.getByLabel('온바탕용 결과 JSON 파일',{exact:true}).setInputFiles({name:'foreign.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(foreign))});await page.getByText(/다른 자료의 결과예요/).waitFor();assert.deepEqual(await graph(page),saved);
 const dir=resolve(commonRoot,'work/html-results-return');await mkdir(dir,{recursive:true});await page.screenshot({path:resolve(dir,`${gai?'gai':'common'}-${width}.png`)});
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
});
