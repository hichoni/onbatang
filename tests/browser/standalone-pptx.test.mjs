import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve,extname,sep} from 'node:path';
import {unzipSync} from 'fflate';

const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const fixture=name=>resolve(root,'tools/fixtures/pptx',name);
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const options={skip:!process.env.MINICAN_PLAYWRIGHT_PATH,timeout:300000};
const slideFiles=files=>Object.keys(files).filter(name=>/^ppt\/slides\/slide\d+\.xml$/.test(name));
const xml=(files,path)=>new TextDecoder().decode(files[path]);

async function setup(t,{base=''}={}){
 const unexpectedPaths=[],requests=[],errors=[],external=[],workers=[];let serviceWorkers=0;
 const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2','.png':'image/png','.jpg':'image/jpeg'};
 const server=createServer(async(req,res)=>{try{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(base&&!pathname.startsWith(base+'/')){unexpectedPaths.push(pathname);res.writeHead(404);return res.end();}
  const local=pathname.slice(base.length);
  if(local==='/isolated.html'){
   res.setHeader('Content-Type',mime['.html']);
   return res.end(`<!doctype html><html lang="ko"><head><link rel="icon" href="data:,"></head><body class="mc-app"><main id="app"></main><script type="module">import {startOnbatang} from './app/standalone.js';await startOnbatang({storage:'standalone-isolated'});</script></body></html>`);
  }
  const file=resolve(root,'.'+decodeURIComponent(local));if(!file.startsWith(root+sep)){res.writeHead(403);return res.end();}
  res.setHeader('Content-Type',mime[extname(file)]||'application/octet-stream');res.end(await readFile(file));
 }catch{res.writeHead(404);res.end();}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const origin=`http://127.0.0.1:${server.address().port}`;
 const {chromium}=await import(pathToFileURL(process.env.MINICAN_PLAYWRIGHT_PATH).href);
 const downloadsPath=resolve(root,'work/standalone-pptx-downloads');await mkdir(downloadsPath,{recursive:true});
 const browser=await chromium.launch({channel:process.env.MINICAN_BROWSER||'msedge',headless:true,downloadsPath});
 t.after(()=>browser.close());
 // Playwright's built-in serviceWorkers:'block' probes navigator.serviceWorker
 // without a try/catch in opaque sandbox frames. Keep registration blocked
 // without manufacturing a SecurityError in the real PPT preview iframe.
 const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce',serviceWorkers:'allow',acceptDownloads:true});
 await context.addInitScript(()=>{try{const api=navigator.serviceWorker;if(api)api.register=async()=>undefined;}catch{}});
 context.on('serviceworker',()=>serviceWorkers++);
 await context.route('**/*',route=>{
  const url=new URL(route.request().url());
  if(['data:','blob:','about:'].includes(url.protocol))return route.continue();
  if(url.origin!==origin){external.push(url.origin);return route.abort('blockedbyclient');}
  requests.push(url.pathname);return route.continue();
 });
 const page=await context.newPage();page.setDefaultTimeout(45000);
 page.on('pageerror',error=>errors.push(error.message));page.on('worker',worker=>workers.push(worker.url()));
 const entry=origin+base+'/app/index.html';
 async function checkIsolation(){
  assert.deepEqual(errors,[],'no uncaught page errors, including sandbox preview frames');
  assert.deepEqual(external,[],'the standalone flow makes no off-origin requests');
  assert.equal(serviceWorkers,0,'no service worker escapes the isolated test context');
  assert.deepEqual(unexpectedPaths,[],'subpath hosting must not fall back to absolute root assets');
  assert.ok(workers.some(url=>url.startsWith(origin+base+'/app/pptx-import/vendor/pptx-worker.js')),'real bundled conversion worker ran');
  assert.ok(requests.includes(base+'/app/pptx-import/vendor/preview-frame.html'),'real sandbox preview frame loaded');
 }
 return {page,context,entry,origin,base,requests,checkIsolation};
}

async function enterImport(page,entry){
 await page.goto(entry);
 await page.getByRole('button',{name:'PPTX 가져오기',exact:true}).click();
 await page.getByLabel('PPTX 파일 선택',{exact:true}).waitFor({state:'attached'});
}
async function inspectFile(page,name,count){
 await page.getByLabel('PPTX 파일 선택',{exact:true}).setInputFiles(fixture(name));
 await page.waitForFunction(count=>document.querySelectorAll('[data-page-select]').length===count&&document.querySelector('[data-import-save]')?.disabled===false,count,{timeout:120000});
 assert.equal(await page.locator('[data-page-select]:checked').count(),count,'all available original pages are selected by default');
 await page.locator('[data-preview-mode=pptx][aria-pressed=true]').waitFor();
 await page.waitForFunction(()=>{const image=document.querySelector('[data-large-preview] img');return image?.complete&&image.naturalWidth>0;},null,{timeout:120000});
}
async function saveImport(page){
 await page.locator('[data-import-save]').click();
 await page.locator('[data-import-result=complete]').waitFor({timeout:120000});
 await page.locator('[data-open-material=view]').click();
 await page.locator('[data-pptx-page="0"][aria-current=true]').waitFor();
}
async function readLibrary(page,base,storage='minican'){
 return page.evaluate(async({base,storage})=>{
  const {createPptxLibrary}=await import(base+'/app/pptx-import/library.js');
  const library=createPptxLibrary({storage});
  try{
   const graphs=await library.listMaterials(),originals=[],sources=[];
   for(const graph of graphs){
    originals.push(await library.getMaterial({id:graph.materialRef.id,revision:0}));
    const blob=await library.repository.readAsset(graph.manifest.sourceAssetId);
    const digest=await crypto.subtle.digest('SHA-256',await blob.arrayBuffer());
    sources.push({bytes:blob.size,sha256:Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('')});
   }
   return {graphs,originals,sources};
  }finally{await library.close();}
 },{base,storage});
}
async function downloadBy(page,action){
 const pending=page.waitForEvent('download',{timeout:150000});await action();const download=await pending;
 const stream=await download.createReadStream(),chunks=[];for await(const chunk of stream)chunks.push(chunk);
 return {name:download.suggestedFilename(),bytes:Buffer.concat(chunks)};
}
async function exportAll(page,mode){
 await page.locator('[data-pptx-export]').click();
 const dialog=page.getByRole('dialog',{name:'PPTX 내려받기',exact:true});
 await dialog.locator(`input[name=pptx-mode][value=${mode}]`).check();
 const result=await downloadBy(page,()=>dialog.locator('[data-pptx-export-confirm]').click());
 await dialog.waitFor({state:'detached'});return {...result,files:unzipSync(result.bytes)};
}

test('standalone UI keeps all 21 pages across automatic parts, real editing, immutable reopen and both whole-deck PPTX exports',options,async t=>{
 const {page,entry,base,checkIsolation}=await setup(t),bytes=await readFile(fixture('self-authored-21-pages.pptx'));
 await enterImport(page,entry);await inspectFile(page,'self-authored-21-pages.pptx',21);await saveImport(page);
 const original=await readLibrary(page,base);assert.equal(original.graphs.length,1);
 const graph=original.graphs[0];assert.deepEqual(graph.documents.map(row=>row.payload.slides.length),[20,1]);
 assert.deepEqual(graph.pages.map(row=>row.pageNumber),Array.from({length:21},(_,i)=>i+1));
 assert.deepEqual(graph.documents.map(row=>row.revision),[0,0]);assert.equal(graph.materialRef.revision,0);
 assert.deepEqual(original.sources,[{bytes:bytes.length,sha256:sha256(bytes)}]);
 assert.equal(await page.locator('[data-pptx-page]').count(),21);
 for(let index=0;index<21;index++){
  await page.locator(`[data-pptx-page="${index}"]`).click();
  await page.locator(`[data-pptx-page="${index}"][aria-current=true]`).waitFor();
  assert.match(await page.locator('.op-sheet').innerText(),new RegExp(`직접 만든 ${index+1}쪽:`),'each part remains in original sequence in the actual viewer');
 }
 await page.locator('[data-pptx-page="0"]').click();await page.locator('[data-pptx-page="0"][aria-current=true]').waitFor();
 await page.locator('[data-pptx-edit]').click();await page.locator('.cv-name').waitFor();
 await page.getByRole('button',{name:'안내 닫기',exact:true}).click();
 await page.locator('.cv-name').fill('편집한 첫 파트 이름');
 await page.locator('.cv-canvas .fe-card > .fi-text').dblclick();
 await page.keyboard.press('Control+End');await page.keyboard.insertText(' · 편집한 본문');await page.keyboard.press('Escape');
 await page.locator('.cv-back').click();
 await page.locator('[data-pptx-save]').waitFor();await page.locator('[data-pptx-save]').click();
 await page.waitForFunction(()=>document.querySelector('[data-pptx-status]')?.textContent.includes('편집본을 저장했어요'));
 const edited=await readLibrary(page,base);assert.equal(edited.graphs[0].materialRef.revision,1);
 assert.deepEqual(edited.graphs[0].documents.map(row=>row.revision),[1,0]);
 assert.equal(edited.graphs[0].documents[0].payload.name,'편집한 첫 파트 이름');
 assert.match(edited.graphs[0].pages[0].page.items[0].text,/ · 편집한 본문$/);
 assert.deepEqual(edited.originals,original.originals,'every source page, element, source reference and asset descriptor stays identical in material revision zero');
 assert.deepEqual(edited.sources,original.sources);
 await enterImport(page,entry);await page.locator('[data-library-tab]').click();
 await page.locator('[data-pptx-material]').waitFor();assert.equal(await page.locator('[data-pptx-material]').count(),1,'the library shows a single material, not two disconnected parts');
 await page.locator('[data-pptx-material]').getByRole('button',{name:'자료 열기',exact:true}).click();
 await page.locator('[data-pptx-page="20"]').waitFor();
 const reopened=await readLibrary(page,base);assert.deepEqual(reopened,edited,'a fresh page reopens the exact pinned material and source');
 const source=await downloadBy(page,()=>page.locator('[data-pptx-original]').click());assert.deepEqual(source.bytes,bytes,'original download is byte-for-byte unchanged');
 for(const mode of ['editable','image']){
  const output=await exportAll(page,mode);assert.equal(slideFiles(output.files).length,21);
  assert.match(output.name,mode==='image'?/이미지\.pptx$/:/편집\.pptx$/);
  for(let number=1;number<=21;number++){
   const slide=xml(output.files,`ppt/slides/slide${number}.xml`);
   if(mode==='editable'){assert.match(slide,new RegExp(`직접 만든 ${number}쪽:`));assert.match(slide,/<p:txBody>/);}
   else{assert.match(slide,/<p:pic>/);assert.doesNotMatch(slide,/<p:txBody>/);}
  }
  if(mode==='editable')assert.match(xml(output.files,'ppt/slides/slide1.xml'),/편집한 본문/,'native export contains the latest actual text edit');
 }
 assert.deepEqual(await readLibrary(page,base),edited,'downloads never create another material revision or change original bytes');
 await page.locator('.op-history summary').click();await page.locator('[data-pptx-original-material]').click();
 await page.waitForFunction(()=>document.querySelector('.op-history')?.textContent.includes('자료 저장본 0'));
 assert.equal(await page.locator('[data-pptx-page]').count(),21);
 assert.doesNotMatch(await page.locator('.op-sheet').innerText(),/편집한 본문/,'historical view never overlays a newer shared editor draft');
 assert.equal(await page.locator('[data-pptx-edit]').count(),0);assert.equal(await page.locator('[data-pptx-save]').count(),0,'the immutable historical viewer has no edit or save action');
 const historical=await exportAll(page,'editable');assert.doesNotMatch(xml(historical.files,'ppt/slides/slide1.xml'),/편집한 본문/);
 assert.deepEqual(await readLibrary(page,base),edited,'historical export is read-only');
 await page.locator('[data-pptx-latest]').click();
 await page.waitForFunction(()=>document.querySelector('.op-history')?.textContent.includes('자료 저장본 1'));
 assert.match(await page.locator('.op-sheet').innerText(),/편집한 본문/);
 // A real editor aspect change affects only its 20-page part. The whole-deck
 // exporter must explain the mixed-size limitation instead of stretching it.
 await page.locator('[data-pptx-edit]').click();await page.locator('.cv-name').waitFor();
 await page.locator('.cv-shape[data-ratio="16:9"]').click();await page.locator('[data-fit=fit]').click();
 await page.locator('.cv-back').click();await page.locator('[data-pptx-save]').waitFor();
 await page.locator('[data-pptx-save]').click();
 await page.waitForFunction(()=>document.querySelector('[data-pptx-status]')?.textContent.includes('편집본을 저장했어요'));
 const resized=await readLibrary(page,base);assert.equal(resized.graphs[0].materialRef.revision,2);
 let unexpectedDownloads=0;const unexpectedDownload=()=>unexpectedDownloads++;page.on('download',unexpectedDownload);
 await page.locator('[data-pptx-export]').click();const blocked=page.getByRole('dialog',{name:'PPTX 내려받기',exact:true});
 await blocked.locator('[data-pptx-export-confirm]').click();
 await blocked.getByRole('status').filter({hasText:'파트마다 슬라이드 비율이 달라요.'}).waitFor();
 assert.equal(unexpectedDownloads,0,'mixed-size material is not silently stretched into a download');
 await blocked.getByRole('button',{name:'취소',exact:true}).click();page.off('download',unexpectedDownload);
 assert.deepEqual(await readLibrary(page,base),resized,'failed export preserves the saved edit and every original revision');
 assert.deepEqual(resized.originals,original.originals);assert.deepEqual(resized.sources,original.sources);
 await checkIsolation();
});

test('standalone import under a subpath uses local preview/font assets and keeps host storage namespaces independent',options,async t=>{
 const {page,entry,origin,base,requests,checkIsolation}=await setup(t,{base:'/schoolgo'});
 await enterImport(page,entry);await inspectFile(page,'self-authored-4x3.pptx',2);
 await page.locator('input[name=slide-import-mode][value=image]').check();
 await page.getByRole('button',{name:'2쪽 미리보기',exact:true}).click();
 await page.locator('[data-page-number="2"][data-active=true]').waitFor();
 await page.locator('[data-font-settings]').click();
 const fonts=page.getByRole('dialog',{name:'글꼴 교체 설정',exact:true});
 await fonts.locator('input[name=font-scope][value=current]').check();
 await fonts.getByRole('checkbox').uncheck();
 const selects=fonts.locator('[data-font-source] select');assert.ok(await selects.count()>0);
 for(const select of await selects.all())await select.selectOption('gowun-dodum');
 await page.waitForFunction(()=>document.querySelector('[data-font-apply]')?.disabled===false);
 await fonts.locator('[data-font-apply]').click();await fonts.waitFor({state:'detached'});
 await saveImport(page);
 const saved=await readLibrary(page,base);assert.equal(saved.graphs.length,1);
 const pages=saved.graphs[0].pages;assert.deepEqual(pages.map(row=>row.pageNumber),[1,2]);
 assert.equal(pages[0].page.items.length,1);assert.equal(pages[0].page.items[0].t,'image','page one keeps the actual rendered PPT raster');
 assert.ok(pages[1].page.items.some(item=>item.t==='text'&&item.font==='gowun-dodum'),'page two remains editable with the UI-selected OFL font');
 assert.ok(requests.some(path=>path.startsWith(base+'/app/fonts/')&&path.endsWith('.woff2')),'font bytes load from the deployment subpath');
 await page.goto(origin+base+'/isolated.html');
 await page.getByRole('button',{name:'PPTX 가져오기',exact:true}).click();await page.locator('[data-library-tab]').click();
 await page.getByText('가져온 PPT가 아직 없어요.',{exact:true}).waitFor();assert.equal(await page.locator('[data-pptx-material]').count(),0);
 const isolated=await readLibrary(page,base,'standalone-isolated');assert.deepEqual(isolated.graphs,[],'the second configured namespace never sees the first host material');
 assert.deepEqual(await readLibrary(page,base),saved,'opening another host namespace does not change the first one');
 await enterImport(page,entry);await page.locator('[data-library-tab]').click();await page.locator('[data-pptx-material]').waitFor();
 await page.locator('[data-pptx-material]').getByRole('button',{name:'자료 열기',exact:true}).click();await page.locator('[data-pptx-page="1"]').waitFor();
 await checkIsolation();
});

test('a material transaction quota failure keeps its saved parts and retries the same batch without duplicate document heads or destructive reinitialization',options,async t=>{
 const {page,entry,base,checkIsolation}=await setup(t);
 await enterImport(page,entry);await inspectFile(page,'self-authored-21-pages.pptx',21);
 await page.evaluate(()=>{
  const add=IDBObjectStore.prototype.add;
  window.standaloneQuotaProbe={failures:0,materialAttempts:0,documentAdds:0};
  window.restoreStandaloneQuotaProbe=()=>{IDBObjectStore.prototype.add=add;};
  IDBObjectStore.prototype.add=function(...args){
   if(this.transaction.db.name==='minican-pptx-v1'){
    if(this.name==='revisions')window.standaloneQuotaProbe.documentAdds++;
    if(this.name==='materialRevisions'){
     window.standaloneQuotaProbe.materialAttempts++;
     if(!window.standaloneQuotaProbe.failures){window.standaloneQuotaProbe.failures++;throw new DOMException('Self-authored quota failure','QuotaExceededError');}
    }
   }
   return add.apply(this,args);
  };
 });
 const durable=()=>page.evaluate(async()=>{
  const {createPptxLibrary}=await import('/app/pptx-import/library.js'),library=createPptxLibrary();
  try{
   const heads=(await library.repository.listHeads()).sort((a,b)=>a.id.localeCompare(b.id));
   const materials=await library.listMaterials();
   const open=indexedDB.open('minican-pptx-v1'),db=await new Promise((yes,no)=>{open.onsuccess=()=>yes(open.result);open.onerror=()=>no(open.error);});
   try{
    const names=['heads','revisions','assets','materials','materialRevisions'],tx=db.transaction(names,'readonly');
    const counts=Object.fromEntries(await Promise.all(names.map(async name=>{
     const request=tx.objectStore(name).count();return [name,await new Promise((yes,no)=>{request.onsuccess=()=>yes(request.result);request.onerror=()=>no(request.error);})];
    })));
    return {heads,materials,counts};
   }finally{db.close();}
  }finally{await library.close();}
 });
 await page.locator('[data-import-save]').click();await page.locator('[data-import-result=partial]').waitFor();
 assert.equal(await page.locator('[data-import-result=complete]').count(),0,'saving all parts is not falsely reported as a completed material');
 assert.equal(await page.locator('[data-result-document]').count(),2,'the recovery screen retains both already saved parts');
 const shown=await page.locator('[data-result-document] .oi-help').allTextContents();
 assert.deepEqual(shown.flatMap(text=>text.match(/^원본 ([\d, ]+)쪽/)[1].split(',').map(Number)),Array.from({length:21},(_,i)=>i+1),'the recovery screen still identifies all 21 saved source pages');
 const failed=await durable();assert.deepEqual(failed.counts,{heads:2,revisions:2,assets:1,materials:0,materialRevisions:0},'the failed material transaction is atomic while earlier document commits survive');
 assert.deepEqual(failed.materials,[]);assert.deepEqual(failed.heads.map(row=>row.revision),[0,0]);
 const batchIds=failed.heads.map(row=>row.sidecar.importReport.importBatch.id);assert.equal(new Set(batchIds).size,1);
 const guarded=await page.evaluate(async()=>{
  const {startOnbatang}=await import('/app/standalone.js'),root=document.querySelector('#app'),children=[...root.childNodes],retry=root.querySelector('[data-import-retry]'),html=root.innerHTML;
  let rejected=false;try{await startOnbatang({root,storage:'must-not-start'});}catch(error){rejected=error.message==='minican already started';}
  return {rejected,sameChildren:children.length===root.childNodes.length&&children.every((node,i)=>node===root.childNodes[i]),sameRetry:retry===root.querySelector('[data-import-retry]'),sameHtml:html===root.innerHTML,unwantedDatabase:(await indexedDB.databases()).some(db=>db.name.startsWith('must-not-start'))};
 });
 assert.deepEqual(guarded,{rejected:true,sameChildren:true,sameRetry:true,sameHtml:true,unwantedDatabase:false},'second initialization rejects before touching the current recovery UI or creating another database');
 await page.locator('[data-import-retry]').click();await page.locator('[data-import-result=complete]').waitFor();
 const recovered=await durable();assert.deepEqual(recovered.counts,{heads:2,revisions:2,assets:1,materials:1,materialRevisions:1});
 assert.deepEqual(recovered.heads,failed.heads,'retry reuses the exact saved documents instead of writing new IDs or revisions');
 assert.equal(recovered.materials[0].manifest.batchId,batchIds[0],'retry finalizes the original batch');
 assert.deepEqual(recovered.materials[0].pages.map(row=>row.pageNumber),Array.from({length:21},(_,i)=>i+1));
 assert.deepEqual(await page.evaluate(()=>window.standaloneQuotaProbe),{failures:1,materialAttempts:2,documentAdds:2});
 await page.evaluate(()=>{window.restoreStandaloneQuotaProbe();delete window.restoreStandaloneQuotaProbe;delete window.standaloneQuotaProbe;});
 await page.locator('[data-open-material=view]').click();await page.locator('[data-pptx-page="20"]').waitFor();
 await enterImport(page,entry);await page.locator('[data-library-tab]').click();await page.locator('[data-pptx-material]').waitFor();
 assert.equal(await page.locator('[data-pptx-material]').count(),1);assert.deepEqual(await durable(),recovered,'recovered material and its original receipts survive a full page reload');
 await checkIsolation();
});

test('My materials imports preserve edited text, restore the same page on cancel, and block navigation until the real editor transaction succeeds',options,async t=>{
 const {page,entry,base,checkIsolation}=await setup(t);
 await enterImport(page,entry);await inspectFile(page,'self-authored-21-pages.pptx',21);await saveImport(page);
 const original=await readLibrary(page,base),oldGraph=original.graphs[0],oldId=oldGraph.documents[0].id;
 const readDraft=id=>page.evaluate(async({base,id})=>(await import(base+'/app/store.js')).getDesign(id),{base,id});
 await page.locator('[data-pptx-page="1"]').click();await page.locator('[data-pptx-page="1"][aria-current=true]').waitFor();
 await page.locator('[data-pptx-edit]').click();await page.locator('.cv-name').waitFor();
 await page.getByRole('button',{name:'안내 닫기',exact:true}).click();
 await page.locator('.cv-slide[data-slide="1"][aria-pressed=true]').waitFor();
 const beforeEdit=await readDraft(oldId),oldText=beforeEdit.slides[1].items.find(item=>item.t==='text').text;
 // Fail the actual storage transaction, including the editor's debounced
 // autosave, rather than substituting a navigation callback or a fake status.
 await page.evaluate(()=>{
  const put=IDBObjectStore.prototype.put;window.editorImportFailures=0;
  window.restoreEditorImportStorage=()=>{IDBObjectStore.prototype.put=put;};
  IDBObjectStore.prototype.put=function(...args){
   const request=put.apply(this,args);
   if(this.transaction.db.name==='minican'&&this.name==='designs'){
    window.editorImportFailures++;this.transaction.abort();
   }
   return request;
  };
 });
 await page.locator('.cv-canvas .fe-card > .fi-text').first().dblclick();
 await page.keyboard.press('Control+End');await page.keyboard.insertText(' · 업로드 전 편집');await page.keyboard.press('Escape');
 await page.locator('.fe-tab[data-tab="upload"]').click();
 await page.locator('[data-upload-tab="ppt"]').click();
 await page.evaluate(()=>{window.editorImportCanvas=document.querySelector('.cv-canvas');});
 const importButton=page.getByRole('button',{name:'내 PPT 올리기',exact:true});
 for(let attempt=0;attempt<2;attempt++){
  await importButton.click();
  await page.locator('.cv-status.bad').filter({hasText:'가져오기로 이동하지 않았어요'}).waitFor();
  await page.waitForFunction(()=>!document.querySelector('[data-document-import]')?.disabled);
  assert.equal(await page.evaluate(()=>document.querySelector('.cv-canvas')===window.editorImportCanvas),true,'a failed save retains the same live editor DOM');
  assert.equal(await page.locator('.op-root').isVisible(),false,'failed persistence never opens the PPT workspace');
  await page.locator('.cv-slide[data-slide="1"][aria-pressed=true]').waitFor();
  await page.locator('.fe-tab[data-tab="upload"][aria-selected=true]').waitFor();
  assert.equal(await page.locator('.cv-canvas .fe-card > .fi-text').first().innerText(),oldText+' · 업로드 전 편집');
  assert.deepEqual(await readDraft(oldId),beforeEdit,'aborted transactions leave the prior saved drawing intact');
 }
 assert.ok(await page.evaluate(()=>window.editorImportFailures>=2));
 await page.evaluate(()=>{window.restoreEditorImportStorage();delete window.restoreEditorImportStorage;});
 await importButton.click();await page.getByLabel('PPTX 파일 선택',{exact:true}).waitFor();
 assert.equal(await page.locator('[data-import-result]').count(),0,'editor import starts at fresh file selection instead of the previous completion screen');
 const flushed=await readDraft(oldId);assert.equal(flushed.slides[1].items.find(item=>item.t==='text').text,oldText+' · 업로드 전 편집');
 assert.deepEqual(flushed.source,beforeEdit.source);assert.deepEqual(flushed.assetRefs,beforeEdit.assetRefs);
 await page.getByRole('button',{name:'PPT 가져오기 닫기',exact:true}).click();
 await page.locator('.cv-slide[data-slide="1"][aria-pressed=true]').waitFor();
 await page.locator('.fe-tab[data-tab="upload"][aria-selected=true]').waitFor();
 assert.equal(await page.locator('.cv-canvas .fe-card > .fi-text').first().innerText(),oldText+' · 업로드 전 편집');
 assert.equal(await page.locator('.cv-name').inputValue(),beforeEdit.name);
 assert.equal(await page.locator('.op-root').isVisible(),false);
 assert.deepEqual(await readDraft(oldId),flushed,'cancel restores the saved document without another edit or revision');
 await page.locator('.cv-back').click();await page.locator('[data-pptx-save]').waitFor({state:'attached'});
 assert.equal(await page.locator('[data-pptx-save]').isVisible(),true,'leaving the restored editor returns to its original material, not the hidden material behind a new file screen');
 await page.locator('[data-pptx-page="1"][aria-current=true]').waitFor();
 assert.equal(await page.locator('[data-pptx-page]').count(),21);
 assert.match(await page.locator('.op-sheet').innerText(),/업로드 전 편집/);
 await page.locator('[data-pptx-save]').click();
 await page.waitForFunction(()=>document.querySelector('[data-pptx-status]')?.textContent.includes('편집본을 저장했어요'));
 const restored=await readLibrary(page,base);assert.equal(restored.graphs[0].materialRef.id,oldGraph.materialRef.id);assert.equal(restored.graphs[0].materialRef.revision,1);
 assert.equal(restored.graphs[0].pages[1].page.items.find(item=>item.t==='text').text,oldText+' · 업로드 전 편집');
 assert.deepEqual(restored.originals,original.originals,'saving after cancellation keeps the original material revision zero');
 assert.deepEqual(restored.sources,original.sources,'saving after cancellation keeps the original PPT bytes');
 await page.locator('[data-pptx-edit]').click();await page.locator('.cv-slide[data-slide="1"][aria-pressed=true]').waitFor();
 await page.locator('.fe-tab[data-tab="upload"]').click();
 await page.locator('[data-upload-tab="ppt"]').click();
 await importButton.click();await inspectFile(page,'self-authored-4x3.pptx',2);
 await page.locator('[data-import-save]').click();await page.locator('[data-import-result=complete]').waitFor();
 await page.locator('[data-open-material=view]').click();await page.locator('[data-pptx-page="1"]').waitFor();
 assert.equal(await page.locator('[data-pptx-page]').count(),2);
 const imported=await readLibrary(page,base),newGraph=imported.graphs.find(graph=>graph.materialRef.id!==oldGraph.materialRef.id);
 assert.ok(newGraph);assert.equal(newGraph.pages.length,2);assert.equal(imported.graphs.length,2);
 assert.deepEqual(imported.originals.find(graph=>graph.materialRef.id===oldGraph.materialRef.id),original.originals[0]);
 assert.deepEqual(await readDraft(oldId),flushed,'importing another deck does not overwrite the drawing left behind');
 await page.locator('[data-pptx-page="0"]').click();await page.locator('[data-pptx-edit]').click();await page.locator('.cv-name').waitFor();
 await page.locator('.cv-name').fill('내 자료에서 가져온 새 PPT');
 const newText=await page.locator('.cv-canvas .fe-card > .fi-text').first().innerText();
 await page.locator('.cv-canvas .fe-card > .fi-text').first().dblclick();
 await page.keyboard.press('Control+End');await page.keyboard.insertText(' · 새 PPT 편집');await page.keyboard.press('Escape');
 await page.locator('.cv-back').click();await page.locator('[data-pptx-save]').waitFor();await page.locator('[data-pptx-save]').click();
 await page.waitForFunction(()=>document.querySelector('[data-pptx-status]')?.textContent.includes('편집본을 저장했어요'));
 const saved=await readLibrary(page,base),newSaved=saved.graphs.find(graph=>graph.materialRef.id===newGraph.materialRef.id);
 assert.equal(newSaved.materialRef.revision,1);assert.equal(newSaved.documents[0].payload.name,'내 자료에서 가져온 새 PPT');
 assert.equal(newSaved.pages[0].page.items.find(item=>item.t==='text').text,newText+' · 새 PPT 편집');
 assert.deepEqual(saved.originals,imported.originals,'saving the newly imported deck preserves both immutable source materials');
 assert.deepEqual(saved.sources,imported.sources);
 await enterImport(page,entry);await page.locator('[data-library-tab]').click();await page.locator('[data-pptx-material]').first().waitFor();
 assert.equal(await page.locator('[data-pptx-material]').count(),2);
 await page.locator(`[data-pptx-material="${newGraph.materialRef.id}"]`).getByRole('button',{name:'자료 열기',exact:true}).click();
 await page.locator('[data-pptx-page="0"][aria-current=true]').waitFor();
 assert.equal(await page.locator('[data-pptx-page]').count(),2);assert.match(await page.locator('.op-sheet').innerText(),/새 PPT 편집/);
 assert.deepEqual(await readLibrary(page,base),saved,'a reload reopens the exact new saved material and both source originals');
 assert.deepEqual(await readDraft(oldId),flushed,'the earlier editor draft survives import, cancellation, the new edit, and a full reload');
 await page.locator('[data-pptx-edit]').click();await page.locator('.cv-name').waitFor();
 assert.equal(await page.locator('.cv-name').inputValue(),'내 자료에서 가져온 새 PPT');
 assert.equal(await page.locator('.cv-canvas .fe-card > .fi-text').first().innerText(),newText+' · 새 PPT 편집');
 await checkIsolation();
});
