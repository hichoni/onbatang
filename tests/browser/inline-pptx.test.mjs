// In-place editor import with actual Edge, local IndexedDB and synthetic PPTX.
// Network is restricted to the test server; account callbacks are in memory.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve,extname,sep} from 'node:path';
import {unzipSync} from 'fflate';

const root=resolve(fileURLToPath(new URL('../../',import.meta.url))),fixture=resolve(root,'tools/fixtures/pptx/self-authored-4x3.pptx');
const options={skip:!process.env.MINICAN_PLAYWRIGHT_PATH,timeout:180000};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const genericHtml=`<!doctype html><html lang="ko"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,">
<link rel="stylesheet" href="/src/editor.css"><link rel="stylesheet" href="/app/app.css"><link rel="stylesheet" href="/app/brand.css"><body class="mc-app"><main id="app"></main>
<script type="module">
import {startMinican} from '/app/app.js';import {newRecord} from '/app/designs.js';import {putDesign,getDesign,setStorageName} from '/app/store.js';
setStorageName('inline-mock');let seed=newRecord('16:9');seed.name='합성 인라인 계정 검증';seed.slides[0].items=[{t:'text',text:'실행 취소할 원래 문장',x:50,y:50,w:80,size:5}];seed=await putDesign(seed);window.seedId=seed.id;
window.inlineCalls=[];window.disposed=0;window.syncFail=true;window.holdSync=false;window.allowClose=true;window.failOpen=false;
const sync={pull:async()=>({records:[seed],deleted:[]}),drop:async()=>{},push:async record=>{window.lastPushed=structuredClone(record);if(window.holdSync)await new Promise(done=>window.releaseSync=done);if(window.syncFail)throw Error('synthetic-sync-failure');}};
await startMinican({storage:'inline-mock',sync,importAction:{label:'합성 가져오기',editorLabel:'내 PPT 올리기',editorMode:'inline',open:async context=>{
 const saved=await getDesign(context.designId);window.inlineCalls.push({designId:context.designId,slideIndex:context.slideIndex,persisted:!!saved,inlineRoot:context.inline?.root instanceof HTMLElement,liveEditor:!!document.querySelector('.cv-canvas')});
 if(window.failOpen)throw Error('synthetic-provider-failure');window.inlineContext=context.inline;
 const button=document.createElement('button');button.textContent='합성 작업 취소';button.dataset.syntheticCancel='';button.onclick=async()=>{if(window.allowClose)await context.inline.close();};context.inline.root.append(button);
 return {requestClose:async()=>{if(!window.allowClose)return false;await context.inline.close();return true;},dispose:()=>window.disposed++};
}}});window.ready=true;
</script></body></html>`;

async function setup(t,{generic=false,missingFont=false}={}){
 const errors=[],external=[],requests=[],navigations=[],workers=[];let serviceWorkers=0;
 const server=createServer(async(req,res)=>{try{const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname==='/inline-mock.html'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(genericHtml);}
  const file=resolve(root,'.'+decodeURIComponent(pathname));if(!file.startsWith(root+sep)){res.writeHead(403);return res.end();}
  res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.woff':'font/woff'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));
 }catch{res.writeHead(404);res.end();}});await new Promise(done=>server.listen(0,'127.0.0.1',done));t.after(()=>new Promise(done=>server.close(done)));
 const origin='http://127.0.0.1:'+server.address().port,{chromium}=await import(pathToFileURL(process.env.MINICAN_PLAYWRIGHT_PATH).href),browser=await chromium.launch({channel:process.env.MINICAN_BROWSER||'msedge',headless:true});t.after(()=>browser.close());
 const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce',acceptDownloads:true,serviceWorkers:'allow'});
 await context.addInitScript(({missingFont})=>{
  try{const api=navigator.serviceWorker;if(api)api.register=async()=>undefined;localStorage.setItem('onbatang-tour-seen-v1:editor','1');}catch{}
  if(self!==top&&missingFont){document.fonts.load=()=>Promise.reject(new DOMException('Synthetic missing font','NetworkError'));}
  if(self===top){window.previewFallbacks=[];addEventListener('message',event=>{if(event.origin==='null'&&event.data?.type==='result')for(const warning of event.data.result?.warnings||[])if(warning.code==='FONT_FALLBACK')window.previewFallbacks.push(warning.pageNumber);});}
 },{missingFont});
 context.on('serviceworker',()=>serviceWorkers++);await context.route('**/*',route=>{const url=new URL(route.request().url());if(['data:','blob:','about:'].includes(url.protocol))return route.continue();if(url.origin!==origin){external.push(url.origin);return route.abort();}requests.push({path:url.pathname,method:route.request().method()});return route.continue();});
 const page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',error=>errors.push(error.name));page.on('worker',worker=>workers.push(worker.url()));page.on('framenavigated',frame=>{if(frame===page.mainFrame())navigations.push(new URL(frame.url()).pathname);});
 const entry=origin+(generic?'/inline-mock.html':'/app/index.html');await page.goto(entry);if(generic)await page.waitForFunction(()=>window.ready);else await page.locator('.cv-home-title').waitFor();
 return {page,entry,navigations,workers,async isolated({worker=false}={}){assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.equal(serviceWorkers,0);assert.ok(requests.every(value=>value.method==='GET'));if(worker)assert.ok(workers.some(url=>url.includes('/app/pptx-import/vendor/pptx-worker.js')));}};
}
async function enterPpt(page){if(!await page.locator('.fe-tab[data-tab=upload][aria-selected=true]').count())await page.locator('.fe-tab[data-tab=upload]').click();await page.locator('[data-upload-tab=ppt]').click();}
async function rememberEditor(page){await page.evaluate(()=>{window.inlineEditorNodes={shell:document.querySelector('.cv-app'),name:document.querySelector('.cv-name'),canvas:document.querySelector('.cv-canvas'),panel:document.querySelector('.cv-side')};window.inlineHomeTransitions=0;window.inlineObserver?.disconnect();window.inlineObserver=new MutationObserver(records=>{for(const record of records)if(record.type==='attributes'&&record.target.dataset.view==='home')window.inlineHomeTransitions++;});window.inlineObserver.observe(document.querySelector('.cv-app-root'),{attributes:true,attributeFilter:['data-view']});});}
async function sameEditor(page){assert.deepEqual(await page.evaluate(()=>Object.fromEntries(Object.entries(window.inlineEditorNodes).map(([key,node])=>[key,node.isConnected&&node===document.querySelector(({shell:'.cv-app',name:'.cv-name',canvas:'.cv-canvas',panel:'.cv-side'})[key])]))),{shell:true,name:true,canvas:true,panel:true});}
async function readLibrary(page){return page.evaluate(async()=>{const library=(await import('/app/pptx-import/library.js')).createPptxLibrary();try{const graphs=await library.listMaterials(),originals=[],sources=[];for(const graph of graphs){originals.push(await library.getMaterial({id:graph.materialRef.id,revision:0}));const blob=await library.repository.readAsset(graph.manifest.sourceAssetId);sources.push({bytes:blob.size,sha256:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),n=>n.toString(16).padStart(2,'0')).join('')});}return {graphs,originals,sources};}finally{await library.close();}});}
const draft=(page,id)=>page.evaluate(async id=>(await import('/app/store.js')).getDesign(id),id);
async function inspect(page){await page.locator('[data-inline-import]').getByLabel('PPTX 파일 선택',{exact:true}).setInputFiles(fixture);await page.waitForFunction(()=>document.querySelectorAll('[data-inline-import] [data-page-select]').length===2&&document.querySelector('[data-inline-import] [data-import-save]')?.disabled===false,null,{timeout:90000});await page.waitForFunction(()=>{const img=document.querySelector('[data-inline-import] [data-large-preview] img');return img?.complete&&img.naturalWidth>0;});}
async function editorDownload(page,mode){
 await page.locator('.cv-down-btn').click();const dialog=page.getByRole('dialog',{name:'내려받기',exact:true});
 await dialog.locator('[data-type=pptx]').click();await dialog.locator('[data-scope=all]').click();await dialog.locator(`[data-pptx=${mode}]`).click();
 const pending=page.waitForEvent('download',{timeout:90000});await dialog.locator('[data-pptx-save]').click();const download=await pending,stream=await download.createReadStream(),chunks=[];for await(const chunk of stream)chunks.push(chunk);await dialog.waitFor({state:'detached'});await page.locator('.cv-pptx-export').getByRole('button',{name:'닫기',exact:true}).click();return unzipSync(Buffer.concat(chunks));
}

test('generic inline import preserves the live editor and undo through sync failure, duplicate attempts, cancellation and provider rejection',options,async t=>{
 const {page,navigations,isolated}=await setup(t,{generic:true});await page.getByRole('button',{name:'합성 인라인 계정 검증 열기',exact:true}).click();
 await page.locator('.cv-canvas .fi-text').dblclick();await page.locator('.cv-canvas [contenteditable]').fill('인라인을 열기 전에 고친 문장');await page.keyboard.press('Escape');await enterPpt(page);await rememberEditor(page);const navCount=navigations.length;
 await page.locator('[data-document-import]').click();await page.locator('.cv-status.bad').filter({hasText:'계정에 올리지 못했어요'}).waitFor();await sameEditor(page);assert.equal(await page.evaluate(()=>window.inlineCalls.length),0);assert.equal((await draft(page,await page.evaluate(()=>window.seedId))).slides[0].items[0].text,'인라인을 열기 전에 고친 문장');
 await page.evaluate(()=>{window.syncFail=false;window.holdSync=true;document.querySelector('[data-document-import]').click();document.querySelector('[data-document-import]').click();});await page.waitForFunction(()=>typeof window.releaseSync==='function');assert.equal(await page.evaluate(()=>window.inlineCalls.length),0);await sameEditor(page);await page.evaluate(()=>{window.holdSync=false;window.releaseSync();});await page.locator('[data-synthetic-cancel]').waitFor();
 await sameEditor(page);assert.equal(await page.evaluate(()=>window.inlineCalls.length),1);assert.deepEqual(await page.evaluate(()=>window.inlineCalls[0]),{designId:await page.evaluate(()=>window.seedId),slideIndex:0,persisted:true,inlineRoot:true,liveEditor:true});
 await page.evaluate(()=>window.allowClose=false);await page.locator('[data-inline-import-close]').click();assert.equal(await page.locator('[data-synthetic-cancel]').count(),1,'a provider guard can keep its current job visible');
 await page.evaluate(()=>window.allowClose=true);await page.locator('[data-inline-import-close]').click();await page.locator('[data-synthetic-cancel]').waitFor({state:'detached'});await sameEditor(page);assert.equal(await page.evaluate(()=>window.disposed),1);
 await page.locator('.cv-canvas .fe-stage').focus();await page.keyboard.press('Control+z');assert.equal(await page.locator('.cv-canvas .fi-text').innerText(),'실행 취소할 원래 문장','cancel leaves the original undo stack intact');await page.keyboard.press('Control+Shift+z');assert.equal(await page.locator('.cv-canvas .fi-text').innerText(),'인라인을 열기 전에 고친 문장');
 await page.evaluate(()=>window.failOpen=true);await enterPpt(page);await page.locator('[data-document-import]').click();await page.waitForFunction(()=>window.inlineCalls.length===2&&!document.querySelector('#app').inert);await sameEditor(page);assert.equal(await page.locator('[data-synthetic-cancel]').count(),0);assert.equal(navigations.length,navCount);assert.equal(await page.evaluate(()=>window.inlineHomeTransitions),0);await isolated();
});

test('standalone inline file/slide/font/image workflow keeps editor DOM until completion and preserves the old two-page material through partial retry, reload and PPTX export',options,async t=>{
 const {page,entry,navigations,isolated}=await setup(t,{missingFont:true}),input=await readFile(fixture),inputHash=sha(input);
 await page.locator('.cv-hero .cv-new-btn').click();await page.locator('.cv-name').fill('가져오기 전 빈 그림');await enterPpt(page);await rememberEditor(page);const navCount=navigations.length;
 await page.locator('[data-document-import]').click();await page.locator('[data-inline-import]').getByLabel('PPTX 파일 선택',{exact:true}).waitFor({state:'attached'});await sameEditor(page);assert.equal(new URL(page.url()).pathname,new URL(entry).pathname);assert.equal(navigations.length,navCount);
 await inspect(page);await sameEditor(page);await page.locator('[data-import-save]').click();await page.waitForFunction(()=>document.querySelector('.cv-name')?.value==='self-authored-4x3'&&!document.querySelector('[data-inline-import]'));
 const first=await readLibrary(page),oldGraph=first.graphs[0],oldId=oldGraph.documents[0].id;assert.equal(oldGraph.pages.length,2);assert.equal(first.sources[0].sha256,inputHash);assert.equal(await page.evaluate(()=>window.inlineHomeTransitions),0);
 await page.locator('.cv-slide[data-slide="1"]').click();const oldText=await page.locator('.cv-canvas .fi-text').first().innerText();await page.locator('.cv-canvas .fi-text').first().dblclick();await page.keyboard.press('Control+End');await page.keyboard.insertText(' · 인라인 편집 보존');await page.keyboard.press('Escape');await enterPpt(page);await rememberEditor(page);await page.locator('[data-document-import]').click();await page.locator('[data-inline-import]').getByLabel('PPTX 파일 선택',{exact:true}).waitFor({state:'attached'});await sameEditor(page);
 let savedOld=await draft(page,oldId);assert.equal(savedOld.slides[1].items.find(item=>item.t==='text').text,oldText+' · 인라인 편집 보존');
 await inspect(page);await page.locator('[data-page-number="2"] .oi-thumbnail').click();await page.locator('[data-font-settings]').click();const fonts=page.getByRole('dialog',{name:'글꼴 교체 설정',exact:true});await fonts.locator('input[name=font-scope][value=all]').check();await fonts.locator('select').first().selectOption('gowun-dodum');await page.waitForFunction(()=>document.querySelector('[data-font-apply]')?.disabled===false);await fonts.locator('[data-font-apply]').click();
 await page.locator('input[name=slide-import-mode][value=image]').check();await page.waitForFunction(()=>window.previewFallbacks.length>0);await sameEditor(page);
 await page.waitForFunction(()=>{const img=document.querySelector('[data-inline-import] [data-large-preview] img');return img?.complete&&img.naturalWidth>0;});
 await page.evaluate(()=>{for(const node of document.querySelectorAll('[data-inline-import] .oi-content,.cv-inline-import-body'))node.scrollTop=0;});
 await mkdir(resolve(root,'work/inline-pptx-qa'),{recursive:true});await page.screenshot({path:resolve(root,'work/inline-pptx-qa/desktop.png')});await page.setViewportSize({width:390,height:844});await page.screenshot({path:resolve(root,'work/inline-pptx-qa/narrow.png')});await page.setViewportSize({width:1440,height:1000});
 await page.locator('[data-inline-import-close]').click();await page.locator('[data-inline-import]').waitFor({state:'detached'});await sameEditor(page);assert.equal(await page.locator('.cv-slide.on').getAttribute('data-slide'),'1');assert.equal(await page.locator('.cv-canvas .fi-text').first().innerText(),oldText+' · 인라인 편집 보존');
 await page.locator('.cv-canvas .fe-stage').focus();await page.keyboard.press('Control+z');assert.equal(await page.locator('.cv-canvas .fi-text').first().innerText(),oldText);await page.keyboard.press('Control+Shift+z');
 const redone=await page.evaluate(async id=>(await import('/app/app.js')).flushSavedDesign(id),oldId);assert.deepEqual(redone.slides,savedOld.slides);assert.deepEqual(redone.originalSize,savedOld.originalSize);savedOld=redone;
 await enterPpt(page);await page.locator('[data-document-import]').click();await inspect(page);await page.locator('[data-page-number="2"] .oi-thumbnail').click();await page.locator('input[name=slide-import-mode][value=image]').check();
 await page.evaluate(()=>{const add=IDBObjectStore.prototype.add;window.inlineQuotaFailures=0;window.restoreInlineQuota=()=>IDBObjectStore.prototype.add=add;IDBObjectStore.prototype.add=function(...args){if(this.transaction.db.name==='minican-pptx-v1'&&this.name==='materialRevisions'&&!window.inlineQuotaFailures){window.inlineQuotaFailures++;throw new DOMException('Synthetic material failure','QuotaExceededError');}return add.apply(this,args);};});
 await page.locator('[data-import-save]').click();await page.locator('[data-import-result=partial]').waitFor();await sameEditor(page);assert.equal(await page.evaluate(()=>window.inlineQuotaFailures),1);assert.deepEqual(await draft(page,oldId),savedOld);const partial=await readLibrary(page);assert.equal(partial.graphs.length,1);
 assert.equal(await page.locator('[data-inline-import] [data-open-document]').evaluateAll(buttons=>buttons.length>0&&buttons.every(button=>button.disabled)),true,'a partial inline import cannot replace the editor before all selected pages have a durable material');
 await page.locator('[data-inline-import-close]').click();await page.locator('[data-import-result=partial]').waitFor();await sameEditor(page);
 await page.locator('[data-import-retry]').click();await page.waitForFunction(()=>!document.querySelector('[data-import-retry]')&&document.querySelector('.cv-name')?.value==='self-authored-4x3');await page.evaluate(()=>window.restoreInlineQuota());
 const imported=await readLibrary(page),newGraph=imported.graphs.find(graph=>graph.materialRef.id!==oldGraph.materialRef.id);assert.ok(newGraph);assert.equal(imported.graphs.length,2);assert.deepEqual(await draft(page,oldId),savedOld);assert.deepEqual(imported.originals.find(graph=>graph.materialRef.id===oldGraph.materialRef.id),first.originals[0]);assert.ok(imported.sources.every(source=>source.sha256===inputHash));assert.equal(newGraph.pages[1].page.items.length,1);assert.equal(newGraph.pages[1].page.items[0].t,'image');
 assert.equal(navigations.length,navCount);assert.equal(await page.evaluate(()=>window.inlineHomeTransitions),0);assert.ok(await page.evaluate(()=>window.previewFallbacks.length)>0);
 await page.locator('.cv-name').fill('새 인라인 PPT 저장');const finalDraft=await page.evaluate(async id=>(await import('/app/app.js')).flushSavedDesign(id),newGraph.documents[0].id);assert.equal(finalDraft.name,'새 인라인 PPT 저장');
 for(const mode of ['editable','image']){const files=await editorDownload(page,mode),xml=new TextDecoder().decode(files['ppt/presentation.xml']);assert.match(xml,/<p:sldSz cx="9144000" cy="6858000"/);assert.equal(Object.keys(files).filter(name=>/^ppt\/slides\/slide\d+\.xml$/.test(name)).length,2);}
 await page.reload();await page.getByRole('button',{name:'새 인라인 PPT 저장 열기',exact:true}).click();await page.locator('.cv-name').waitFor();assert.equal(await page.locator('.cv-name').inputValue(),'새 인라인 PPT 저장');assert.deepEqual(await draft(page,oldId),savedOld);assert.deepEqual(await readLibrary(page),imported);assert.equal(sha(await readFile(fixture)),inputHash);await isolated({worker:true});
});
