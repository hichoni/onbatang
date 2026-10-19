import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve,extname,sep} from 'node:path';
import {unzipSync} from 'fflate';

const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const options={skip:!process.env.MINICAN_PLAYWRIGHT_PATH,timeout:300000};
const slideFiles=files=>Object.keys(files).filter(name=>/^ppt\/slides\/slide\d+\.xml$/.test(name));
const xml=(files,path)=>new TextDecoder().decode(files[path]);

// The optional teacher file remains outside the repository. Both paths execute
// the real import worker, editor, IndexedDB revisions and PPTX exporter, with
// every off-origin request blocked; no hosted QA account or backend is used.
const sourcePath=process.env.MINICAN_PIXEL_PPTX||resolve(root,'tools/fixtures/pptx/self-authored-21-pages.pptx');
const pageCount=Number(process.env.MINICAN_PIXEL_PAGE_COUNT||21);

async function setup(t,{viewport={width:1440,height:1000},touch=false}={}){
 const errors=[],external=[],workers=[],requests=[];
 const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2','.png':'image/png','.jpg':'image/jpeg'};
 const server=createServer(async(req,res)=>{try{
  const pathname=new URL(req.url,'http://localhost').pathname,file=resolve(root,'.'+decodeURIComponent(pathname));
  if(!file.startsWith(root+sep)){res.writeHead(403);return res.end();}
  res.setHeader('Content-Type',mime[extname(file)]||'application/octet-stream');res.end(await readFile(file));
 }catch{res.writeHead(404);res.end();}});
 await new Promise(done=>server.listen(0,'127.0.0.1',done));
 t.after(()=>new Promise(done=>server.close(done)));
 const origin=`http://127.0.0.1:${server.address().port}`;
 const {chromium}=await import(pathToFileURL(process.env.MINICAN_PLAYWRIGHT_PATH).href);
 const browser=await chromium.launch({channel:process.env.MINICAN_BROWSER||'msedge',headless:true});t.after(()=>browser.close());
 const context=await browser.newContext({viewport,isMobile:touch,hasTouch:touch,reducedMotion:'reduce',acceptDownloads:true});
 await context.addInitScript(()=>{try{localStorage.setItem('onbatang-tour-seen-v1:editor','1');const sw=navigator.serviceWorker;if(sw)sw.register=async()=>undefined;}catch{}});
 await context.route('**/*',route=>{const url=new URL(route.request().url());if(['data:','blob:','about:'].includes(url.protocol))return route.continue();if(url.origin!==origin){external.push(url.origin);return route.abort('blockedbyclient');}requests.push(url.pathname);return route.continue();});
 const page=await context.newPage();page.setDefaultTimeout(45000);
 page.on('pageerror',error=>errors.push(error.message));page.on('worker',worker=>workers.push(worker.url()));
 return {page,entry:origin+'/app/index.html',async verifyIsolation(){
  assert.deepEqual(errors,[],'no uncaught editor, activity or sandbox-preview errors');
  assert.deepEqual(external,[],'pixel activities and local exports make no off-origin requests');
  assert.ok(workers.some(url=>url.endsWith('/app/pptx-import/vendor/pptx-worker.js')),'the real conversion worker ran');
  assert.ok(requests.includes('/app/pptx-import/vendor/preview-frame.html'),'the real PPT preview frame loaded');
 }};
}

async function importDeck(page,entry){
 await page.goto(entry);await page.locator('.cv-hero .cv-new-btn').click();
 await page.locator('.fe-tab[data-tab=upload]').click();await page.locator('[data-upload-tab=ppt]').click();await page.locator('[data-document-import]').click();
 await page.locator('[data-inline-import]').getByLabel('PPTX 파일 선택',{exact:true}).setInputFiles(sourcePath);
 await page.waitForFunction(count=>document.querySelectorAll('[data-page-select]').length===count&&document.querySelector('[data-import-save]')?.disabled===false,pageCount,{timeout:120000});
 assert.equal(await page.locator('[data-page-select]:checked').count(),pageCount);
 await page.locator('[data-import-save]').click();await page.locator('[data-inline-import]').waitFor({state:'detached',timeout:120000});
 await waitPages(page,pageCount);
}
const waitPages=(page,count)=>page.waitForFunction(n=>document.querySelectorAll('[data-material-page]').length===n,count);

async function readLibrary(page){
 return page.evaluate(async()=>{
  const {createPptxLibrary}=await import('/app/pptx-import/library.js'),library=createPptxLibrary({storage:'minican'});
  try{
   const graphs=await library.listMaterials(),originals=[],sources=[];
   for(const graph of graphs){originals.push(await library.getMaterial({id:graph.materialRef.id,revision:0}));const blob=await library.repository.readAsset(graph.manifest.sourceAssetId);sources.push({bytes:blob.size,sha256:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),n=>n.toString(16).padStart(2,'0')).join('')});}
   return {graphs,originals,sources};
  }finally{await library.close();}
 });
}

async function reopen(page,name,count){
 await page.locator('.cv-back').click();await page.locator('.cv-home-title').waitFor();await page.reload();
 await page.getByRole('button',{name:name+' 열기',exact:true}).click();await waitPages(page,count);
}

async function exportAll(page,mode){
 await page.locator('.cv-down-btn').click();const dialog=page.getByRole('dialog',{name:'내려받기',exact:true});
 await dialog.locator('[data-type=pptx]').click();await dialog.locator('[data-scope=all]').click();await dialog.locator(`[data-pptx=${mode}]`).click();
 const pending=page.waitForEvent('download',{timeout:150000});await dialog.locator('[data-pptx-save]').click();const download=await pending;
 const chunks=[],stream=await download.createReadStream();for await(const chunk of stream)chunks.push(chunk);const bytes=Buffer.concat(chunks);
 await page.locator('.cv-pptx-export').getByRole('button',{name:'닫기',exact:true}).click();
 return {name:download.suggestedFilename(),bytes,files:unzipSync(bytes)};
}

async function capture(page,name){
 if(!process.env.MINICAN_PIXEL_REPORT)return;
 const dir=resolve(root,'work',process.env.MINICAN_PIXEL_REPORT);assert.ok(dir.startsWith(resolve(root,'work')+sep));
 await mkdir(dir,{recursive:true});await page.screenshot({path:resolve(dir,name+'.png'),fullPage:true});
}

async function exportHtmlAndRun(t,page,{activityIndex,resultIndex,orderedIds}){
 await page.locator('.cv-down-btn').click();const dialog=page.getByRole('dialog',{name:'내려받기',exact:true});
 await dialog.locator('[data-type=html]').click();
 assert.match(await dialog.innerText(),new RegExp(`전체 ${orderedIds.length}쪽`));
 const pending=page.waitForEvent('download',{timeout:150000});await dialog.locator('[data-download-save]').click();const download=await pending;
 const workRoot=resolve(root,'work');await mkdir(workRoot,{recursive:true});const dir=await mkdtemp(resolve(workRoot,'editor-html-test-')),file=resolve(dir,'whole-lesson.html');await download.saveAs(file);
 const bytes=await readFile(file),html=bytes.toString('utf8');
 assert.doesNotMatch(html,/<script\b[^>]*\bsrc=|<link\b|<iframe\b/i,'HTML lesson contains its runtime and styles without outside apps');
 const browser=page.context().browser(),offline=await browser.newContext({offline:true,viewport:{width:1024,height:768},acceptDownloads:true});t.after(()=>offline.close());
 const player=await offline.newPage(),errors=[],requests=[];player.on('pageerror',error=>errors.push(error.message));player.on('request',req=>requests.push(req.url()));
 await player.goto(pathToFileURL(file).href);
 assert.deepEqual(await player.evaluate(()=>JSON.parse(document.getElementById('onbatang-lesson-data').textContent).pages.map(p=>p.id)),orderedIds,'editor HTML contains every original, activity and saved result in order');
 assert.equal(await player.locator('.lesson-count').innerText(),`1 / ${orderedIds.length}쪽`);
 for(let n=0;n<activityIndex;n++)await player.getByRole('button',{name:'다음',exact:true}).click();
 await player.getByRole('button',{name:'활동 시작',exact:true}).click();
 assert.match(await player.locator('[data-pixel="0"]').getAttribute('aria-label'),/3번 색 #ef6461/);
 assert.match(await player.locator('[data-pixel="1"]').getAttribute('aria-label'),/6번 색 #57a9df/);
 await player.locator('.pixel-color').nth(3).click();await player.locator('[data-pixel="2"]').click();
 await player.getByRole('button',{name:'결과를 다음 슬라이드에 저장',exact:true}).click();
 assert.equal(await player.locator('.lesson-count').innerText(),`${resultIndex+1} / ${orderedIds.length+1}쪽 · 결과`);
 await player.reload();assert.equal(await player.locator('.lesson-count').innerText(),`${resultIndex+1} / ${orderedIds.length+1}쪽 · 결과`,'offline reload restores newly created result');
 const againPending=player.waitForEvent('download');await player.getByRole('button',{name:'현재 수업 내려받기',exact:true}).click();
 const resultFile=resolve(dir,'whole-lesson-with-result.html');await (await againPending).saveAs(resultFile);
 const fresh=await browser.newContext({offline:true,viewport:{width:390,height:844}});t.after(()=>fresh.close());const reopened=await fresh.newPage();await reopened.goto(pathToFileURL(resultFile).href);
 assert.equal(await reopened.locator('.lesson-count').innerText(),`1 / ${orderedIds.length+1}쪽`);
 for(let n=0;n<activityIndex;n++)await reopened.getByRole('button',{name:'다음',exact:true}).click();await reopened.getByRole('button',{name:'활동 시작',exact:true}).click();
 assert.match(await reopened.locator('[data-pixel="2"]').getAttribute('aria-label'),/4번 색 #ffcf56/,'downloaded HTML includes updated activity cells without browser storage');
 assert.deepEqual(errors,[]);assert.ok(requests.every(url=>url.startsWith('file:')||url.startsWith('data:')),'downloaded lesson makes no external request');
 if(process.env.MINICAN_PIXEL_REPORT){const reportDir=resolve(root,'work',process.env.MINICAN_PIXEL_REPORT);await mkdir(reportDir,{recursive:true});await writeFile(resolve(reportDir,'whole-lesson.html'),bytes);await writeFile(resolve(reportDir,'whole-lesson-with-result.html'),await readFile(resultFile));await reopened.screenshot({path:resolve(reportDir,'html-activity-mobile.png'),fullPage:true,animations:'disabled'});}
 return {pages:orderedIds.length,pagesAfterResult:orderedIds.length+1,bytes:bytes.length,sha256:sha256(bytes),offline:true,freshContextReopen:true};
}

test('PPT activity runs in the full material, saves a result immediately after it, reopens and exports without changing the source',options,async t=>{
 const sourceBytes=await readFile(sourcePath),{page,entry,verifyIsolation}=await setup(t);
 await importDeck(page,entry);
 const initial=await readLibrary(page),original=initial.graphs[0],originalIds=original.pages.map(row=>row.page.id);
 assert.deepEqual(initial.sources,[{bytes:sourceBytes.length,sha256:sha256(sourceBytes)}]);
 assert.equal(original.materialRef.revision,0);
 const afterIndex=Math.min(9,pageCount-2),activityIndex=afterIndex+1,resultIndex=afterIndex+2;
 await page.locator(`[data-material-page="${afterIndex}"]`).click();
 await page.locator(`[data-material-page="${afterIndex}"][aria-pressed=true]`).waitFor();
 await page.locator('[data-add-activity]').click();
 const setupForm=page.locator('form.pixel-setup');await setupForm.waitFor();
 await setupForm.getByLabel('활동 이름',{exact:true}).fill('수업 중 픽셀아트');
 await setupForm.getByLabel('활동 안내',{exact:true}).fill('두 가지 색으로 나만의 그림을 만들어요.');
 await setupForm.getByLabel('칸 수',{exact:true}).selectOption('8');
 await setupForm.getByRole('button',{name:'활동 슬라이드 추가',exact:true}).click();
 await setupForm.waitFor({state:'detached'});await waitPages(page,pageCount+1);
 await page.locator(`[data-material-page="${activityIndex}"][aria-pressed=true]`).waitFor();
 const activityPageId=await page.locator(`[data-material-page="${activityIndex}"]`).getAttribute('data-page-id');
 const name=await page.locator('.cv-name').inputValue();

 await page.locator('.cv-show-btn').click();await page.locator('.cv-show .pixel-app').waitFor();
 const show=page.locator('.cv-show'),runtime=show.locator('.pixel-app');
 assert.equal(await show.locator('.cv-show-count').innerText(),`${activityIndex+1} / ${pageCount+1}`,'presentation starts at the selected page in whole-material order');
 await runtime.locator('.pixel-color').nth(2).click();
 await runtime.locator('[data-pixel="0"]').click();await runtime.locator('[data-pixel="8"]').click();
 await runtime.getByRole('button',{name:'되돌리기',exact:true}).click();
 assert.match(await runtime.locator('[data-pixel="0"]').getAttribute('aria-label'),/3번 색 #ef6461/);
 assert.match(await runtime.locator('[data-pixel="8"]').getAttribute('aria-label'),/빈 칸/);
 await runtime.locator('.pixel-color').nth(5).click();await runtime.locator('[data-pixel="0"]').focus();
 await page.keyboard.press('ArrowRight');await page.keyboard.press('Space');
 assert.match(await runtime.locator('[data-pixel="1"]').getAttribute('aria-label'),/6번 색 #57a9df/);
 assert.equal(await show.locator('.cv-show-count').innerText(),`${activityIndex+1} / ${pageCount+1}`,'activity keyboard and pointer input never advances the presenter');
 await capture(page,'activity-in-presentation');
 await runtime.getByRole('button',{name:'결과를 다음 슬라이드에 저장',exact:true}).click();
 await page.waitForFunction(text=>document.querySelector('.cv-show-count')?.textContent===text,`${resultIndex+1} / ${pageCount+2}`).catch(async error=>{throw new Error(`${error.message}; presenter=${await show.locator('.cv-show-count').innerText()}; status=${await runtime.locator('.pixel-status').allTextContents()}`);});
 await show.locator('.pixel-app').waitFor({state:'detached'});
 assert.match(await show.locator('.cv-show-stage').innerText(),/수업 중 픽셀아트 · 결과/);
 await capture(page,'result-in-next-slide');

 // Back to the activity and save an unchanged drawing: reuse the same result
 // instead of generating a duplicate slide for an accidental second click.
 await show.getByRole('button',{name:'앞 장',exact:true}).click();await runtime.waitFor();
 assert.match(await runtime.locator('[data-pixel="0"]').getAttribute('aria-label'),/3번 색 #ef6461/);
 assert.match(await runtime.locator('[data-pixel="1"]').getAttribute('aria-label'),/6번 색 #57a9df/);
 await runtime.getByRole('button',{name:'결과를 다음 슬라이드에 저장',exact:true}).click();
 await page.waitForFunction(text=>document.querySelector('.cv-show-count')?.textContent===text,`${resultIndex+1} / ${pageCount+2}`).catch(async error=>{throw new Error(`${error.message}; presenter=${await show.locator('.cv-show-count').innerText()}; status=${await runtime.locator('.pixel-status').allTextContents()}`);});
 await show.getByRole('button',{name:'발표 끝내기 (Esc)',exact:true}).click();await show.waitFor({state:'detached'});await waitPages(page,pageCount+2);

 const saved=await readLibrary(page),graph=saved.graphs[0],activity=graph.pages[activityIndex].page,result=graph.pages[resultIndex].page;
 assert.equal(graph.materialRef.id,original.materialRef.id);
 assert.equal(activity.id,activityPageId);assert.equal(activity.activity.version,1);assert.equal(activity.activity.kind,'pixel-art');assert.equal(activity.activity.size,8);
 assert.equal(activity.activity.title,'수업 중 픽셀아트');assert.equal(activity.activity.instructions,'두 가지 색으로 나만의 그림을 만들어요.');
 assert.equal(activity.activity.cells.length,64);assert.equal(result.source.kind,'result');assert.ok(result.items.some(item=>item.t==='image'&&item.url.startsWith('data:image/png;base64,')));
 const orderedIds=graph.pages.map(row=>row.page.id);
 assert.deepEqual(orderedIds,[...originalIds.slice(0,afterIndex+1),activity.id,result.id,...originalIds.slice(afterIndex+1)]);
 const importedPages=graph.pages.filter(row=>originalIds.includes(row.page.id)).map(row=>row.page),originalPages=original.pages.map(row=>row.page);
 const identity=pages=>pages.map(p=>({id:p.id,source:p.source,assetRefs:p.assetRefs,items:p.items.map(item=>({id:item.id,source:item.source,assetRefs:item.assetRefs,text:item.text,url:item.url}))}));
 assert.deepEqual(identity(importedPages),identity(originalPages),'imported IDs, provenance, text and images remain unchanged');
 // Opening an imported page passes it through the editor's existing rounding
 // and default fields. Compare visual data under that same public sanitizer;
 // revision zero below must still retain the exact pre-editor source objects.
 const normalized=await page.evaluate(async rows=>{const {cleanDesign}=await import('/src/model.js');return rows.map(pages=>pages.map(p=>cleanDesign(p,{keepSpaces:true})));},[importedPages,originalPages]);
 assert.equal(sha256(JSON.stringify(normalized[0])),sha256(JSON.stringify(normalized[1])),'all imported page visuals stay equivalent after normal editor normalization');
 assert.deepEqual(saved.originals,initial.originals,'immutable material revision zero retains all original documents, elements and provenance');
 assert.deepEqual(saved.sources,initial.sources,'the uploaded PPT source bytes remain unchanged');
 const resultPixels=await page.evaluate(async url=>{const image=new Image();image.src=url;await image.decode();const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const ctx=c.getContext('2d');ctx.drawImage(image,0,0);return [0,1,8].map(i=>Array.from(ctx.getImageData((i%8+.5)*c.width/8,(Math.floor(i/8)+.5)*c.height/8,1,1).data));},result.items.find(item=>item.t==='image').url);
 assert.deepEqual(resultPixels,[[239,100,97,255],[87,169,223,255],[255,255,255,255]],'saved raster represents actual drawing, keyboard edit and undo');

 for(let pass=0;pass<2;pass++){
  await reopen(page,name,pageCount+2);assert.deepEqual(await readLibrary(page),saved,'reopening preserves the exact fixed material, activity, result and original assets');
  assert.deepEqual(await page.locator('[data-material-page]').evaluateAll(nodes=>nodes.map(node=>node.dataset.pageId)),orderedIds);
  await page.locator(`[data-material-page="${activityIndex}"]`).click();await page.locator('.cv-show-btn').click();await page.locator('.cv-show .pixel-app').waitFor();
  assert.equal(await page.locator('.cv-show .pixel-cell').count(),64,'activity stays interactive after a fresh load');
  await page.locator('.cv-show').getByRole('button',{name:'다음 장',exact:true}).click();
  assert.match(await page.locator('.cv-show-stage').innerText(),/수업 중 픽셀아트 · 결과/);
  await page.locator('.cv-show').getByRole('button',{name:'발표 끝내기 (Esc)',exact:true}).click();
 }

 const htmlExport=await exportHtmlAndRun(t,page,{activityIndex,resultIndex,orderedIds});

 const exports=[];
 for(const mode of ['editable','image']){
  const output=await exportAll(page,mode);assert.equal(slideFiles(output.files).length,pageCount+2);
  if(mode==='editable'){
   assert.match(xml(output.files,`ppt/slides/slide${activityIndex+1}.xml`),/수업 중 픽셀아트/);
   assert.match(xml(output.files,`ppt/slides/slide${resultIndex+1}.xml`),/수업 중 픽셀아트 · 결과/);
   if(!process.env.MINICAN_PIXEL_PPTX){assert.match(xml(output.files,`ppt/slides/slide${afterIndex+1}.xml`),new RegExp(`직접 만든 ${afterIndex+1}쪽`));assert.match(xml(output.files,`ppt/slides/slide${resultIndex+2}.xml`),new RegExp(`직접 만든 ${afterIndex+2}쪽`));}
  }else for(let n=1;n<=pageCount+2;n++){assert.match(xml(output.files,`ppt/slides/slide${n}.xml`),/<p:pic>/);assert.doesNotMatch(xml(output.files,`ppt/slides/slide${n}.xml`),/<p:txBody>/);}
  exports.push({mode,pages:pageCount+2,bytes:output.bytes.length,sha256:sha256(output.bytes)});
  if(process.env.MINICAN_PIXEL_REPORT){const dir=resolve(root,'work',process.env.MINICAN_PIXEL_REPORT);assert.ok(dir.startsWith(resolve(root,'work')+sep));await mkdir(dir,{recursive:true});await writeFile(resolve(dir,`${mode}.pptx`),output.bytes);}
 }
 assert.deepEqual(await readLibrary(page),saved,'export cannot modify fixed versions or stored source');
 assert.equal(sha256(await readFile(sourcePath)),sha256(sourceBytes),'the teacher/local source file is untouched');await verifyIsolation();
 if(process.env.MINICAN_PIXEL_REPORT){const dir=resolve(root,'work',process.env.MINICAN_PIXEL_REPORT);await writeFile(resolve(dir,'report.json'),JSON.stringify({scope:'isolated local browser',source:{pages:pageCount,bytes:sourceBytes.length,sha256:sha256(sourceBytes)},result:{pages:pageCount+2,activityIndex,resultIndex,revision:graph.materialRef.revision},exports,htmlExport,checks:['real worker import','middle activity insertion','whole material presentation','drawing and undo','keyboard isolation','next-slide result','duplicate save reuse','fixed revision zero preserved','two full reopens','editable and image PPTX','editor HTML export','offline HTML activity and next-slide result','HTML saved copy opens in fresh browser'],notRun:['physical device','native PowerPoint','account QA','production deployment'],paidQa:false},null,2)+'\n');}
});
