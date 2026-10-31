import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,mkdtemp,writeFile,unlink,rmdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
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

async function setup(t,{viewport={width:1440,height:1000},touch=false,hostRoot}={}){
 const servedRoot=hostRoot?resolve(hostRoot):root;
 const errors=[],external=[],workers=[],requests=[];
 const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2','.png':'image/png','.jpg':'image/jpeg'};
 const server=createServer(async(req,res)=>{try{
  if(new URL(req.url,'http://localhost').pathname==='/authoring-test.html'){res.setHeader('Content-Type',mime['.html']);return res.end('<!doctype html><html lang="ko"><meta name="viewport" content="width=device-width,initial-scale=1"><body class="mc-app"><main id="app"></main><script type="module">import {startOnbatang} from "/app/standalone.js";await startOnbatang({activityAuthoring:true});</script></body></html>');}
  const pathname=new URL(req.url,'http://localhost').pathname,file=resolve(servedRoot,'.'+decodeURIComponent(pathname));
  if(!file.startsWith(servedRoot+sep)){res.writeHead(403);return res.end();}
  res.setHeader('Content-Type',mime[extname(file)]||'application/octet-stream');res.end(await readFile(file));
 }catch{res.writeHead(404);res.end();}});
 await new Promise(done=>server.listen(0,'127.0.0.1',done));
 t.after(()=>new Promise(done=>server.close(done)));
 const origin=`http://127.0.0.1:${server.address().port}`;
 const {chromium}=await import(pathToFileURL(process.env.MINICAN_PLAYWRIGHT_PATH).href);
 const browser=await chromium.launch({channel:process.env.MINICAN_BROWSER||'msedge',headless:true});t.after(()=>browser.close());
 const context=await browser.newContext({viewport,isMobile:touch,hasTouch:touch,reducedMotion:'reduce',acceptDownloads:true});
 await context.addInitScript(()=>{try{localStorage.setItem('onbatang-tour-seen-v1:editor','1');localStorage.setItem('onbatang-tour-seen-v1:news-0.45','1');const sw=navigator.serviceWorker;if(sw)sw.register=async()=>undefined;}catch{}});
 await context.route('**/*',route=>{const url=new URL(route.request().url());if(['data:','blob:','about:'].includes(url.protocol))return route.continue();if(url.origin!==origin){external.push(url.origin);return route.abort('blockedbyclient');}requests.push(url.pathname);return route.continue();});
 const page=await context.newPage();page.setDefaultTimeout(45000);
 page.on('pageerror',error=>errors.push(error.message));page.on('worker',worker=>workers.push(worker.url()));
 return {page,entry:origin+(hostRoot?'/minican-app.html':'/authoring-test.html'),async verifyIsolation(){
  assert.deepEqual(errors,[],'no uncaught editor, activity or sandbox-preview errors');
  assert.deepEqual(external,[],'pixel activities and local exports make no off-origin requests');
  assert.ok(workers.some(url=>url.includes('pptx')&&url.includes('worker')),'the real conversion worker ran');
  assert.ok(requests.some(url=>url.includes('preview-frame.html')),'the real PPT preview frame loaded');
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

test('two-slide comparison crosses imported PPT parts without changing the presentation or source',options,async t=>{
 const hash=sha256(await readFile(sourcePath)),hostRoot=process.env.MINICAN_HOST_ROOT;
 const {page,entry,verifyIsolation}=await setup(t,{hostRoot});
 await importDeck(page,hostRoot?entry:new URL('/app/index.html',entry).href);
 await page.locator('.cv-back').click();await page.locator('.cv-home-title').waitFor();await page.reload();
 await page.locator('.cv-deck .cv-thumb').click();await waitPages(page,pageCount);
 const visible=await page.locator('[data-material-page]').evaluateAll(nodes=>nodes.filter(n=>!n.getAttribute('aria-label')?.includes('발표에서 숨김')).length);
 await page.locator('.cv-show-btn').click();await page.getByRole('button',{name:'두 장 비교 (D)',exact:true}).click();
 const d=page.getByRole('dialog',{name:'두 장 비교',exact:true});
 await d.waitFor();
 const r=d.getByLabel('비교할 장',{exact:true});
 assert.equal(await r.locator('option').count(),visible);
 const last=await r.locator('option').last().innerText();assert.match(last,/원본/);
 await r.selectOption({index:visible-1});
 const stage=d.locator('.obc-stage'),rect=await stage.boundingBox();
 await page.mouse.move(rect.x+rect.width*.2,rect.y+rect.height*.5);await page.mouse.down();
 await page.mouse.move(rect.x+rect.width*.8,rect.y+rect.height*.5,{steps:4});await page.mouse.up();
 assert.ok(Math.abs(Number(await d.getByRole('slider').inputValue())-80)<=1);
 assert.deepEqual(await stage.locator('.obc-layer').evaluateAll(nodes=>nodes.map(n=>n.dataset.page)),['1',String(visible)]);
 await d.getByRole('button',{name:'비교 닫기'}).click();await d.waitFor({state:'detached'});
 assert.equal(await page.locator('.cv-show-count').innerText(),'1 / '+visible);
 await page.keyboard.press('Escape');await waitPages(page,pageCount);
 await page.locator('.cv-down-btn').click();await page.locator('[data-type=html]').click();
 const pending=page.waitForEvent('download');await page.locator('[data-download-save]').click();
 const dir=await mkdtemp(resolve(tmpdir(),'compare-ppt-')),file=resolve(dir,'lesson.html');
 t.after(async()=>{await unlink(file);await rmdir(dir);});await (await pending).saveAs(file);
 const offline=await page.context().browser().newContext({offline:true,viewport:{width:390,height:844}});
 const opened=await offline.newPage();await opened.goto(pathToFileURL(file).href);
 await opened.getByRole('button',{name:/발표 모드/}).click();await opened.getByRole('button',{name:'두 장 비교 (D)'}).click();
 const choices=opened.getByRole('dialog',{name:'두 장 비교'}).getByLabel('비교할 장',{exact:true});
 assert.equal(await choices.locator('option').count(),visible);assert.equal(await choices.locator('option').last().innerText(),last);
 await choices.selectOption({index:visible-1});
 assert.ok(await opened.locator('.obc-layer img').last().evaluate(async img=>{await img.decode();return img.naturalWidth>0;}));
 assert.equal(sha256(await readFile(sourcePath)),hash);await verifyIsolation();
});

test('an imported PPT reopens with its authored clue card and original page order',options,async t=>{
 const hash=sha256(await readFile(sourcePath)),hostRoot=process.env.MINICAN_HOST_ROOT;
 const {page,entry,verifyIsolation}=await setup(t,{hostRoot});
 await importDeck(page,hostRoot?entry:new URL('/app/index.html',entry).href);
 const pageIds=()=>page.locator('[data-material-page]').evaluateAll(nodes=>nodes.map(n=>n.dataset.pageId));
 const ids=await pageIds();
 const text=page.locator('.cv-canvas .fe-stage .fi-text').filter({hasText:/\S/}).first();
 const answer=(await text.innerText()).trim().replace(/\s+/g,' ');
 assert.ok(answer && Array.from(answer).length<=80);
 await text.click();
 if(!await page.locator('[data-make-clue-card]').isVisible())await page.locator('.fe-tab[data-tab=text]').click();
 await page.locator('[data-make-clue-card]').click();
 await page.getByLabel('학생에게 보여 줄 질문').fill('표지에는 어떤 말이 있었나요?');
 await page.getByLabel('힌트 1 (선택)').fill('첫 장을 떠올려 보세요.');
 await page.getByLabel('그래픽 효과 재생 시점').selectOption('open');
 await page.locator('[data-apply-effect]').click();
 await page.locator('.cv-back').click();await page.locator('.cv-home-title').waitFor();await page.reload();
 await page.locator('.cv-deck .cv-thumb').click();await waitPages(page,pageCount);assert.deepEqual(await pageIds(),ids);
 await page.locator('.cv-show-btn').click();
 const card=page.locator('.cv-show [data-effect-playing=cluecard]');
 await card.waitFor();assert.match(await card.textContent(),/표지에는/);
 await card.getByRole('button',{name:'힌트 1 공개'}).click();assert.match(await card.textContent(),/첫 장을/);
 await card.getByRole('button',{name:'정답 공개'}).click();
 const revealed=await card.locator('svg text[font-weight="700"]').allTextContents();
 assert.equal(revealed.join('').replace(/\s/g,''),answer.replace(/\s/g,''));
 assert.equal(sha256(await readFile(sourcePath)),hash);await verifyIsolation();
});

test('photo study samples a chosen PPT pixel, pauses, draws and reopens the result in the editor and offline HTML',options,async t=>{
 const originalHash=sha256(await readFile(sourcePath)),hostRoot=process.env.MINICAN_HOST_ROOT;
 const {page,entry,verifyIsolation}=await setup(t,{hostRoot});
 await importDeck(page,hostRoot?entry:new URL('/app/index.html',entry).href);
 const order=()=>page.locator('[data-material-page]').evaluateAll(nodes=>nodes.map(n=>n.dataset.pageId));
 const original=await order(),at=Math.min(2,pageCount-2);
 await page.locator('[data-material-page="'+at+'"]').click();
 await page.locator('[data-material-page="'+at+'"][aria-pressed=true]').waitFor();
 await page.locator('.fe-tab[data-tab=motion]').click();await page.locator('[data-photo-study]').click();
 const picker=page.locator('.ps-picker'),bounds=await picker.locator('canvas').boundingBox();
 assert.ok(bounds);await picker.click({position:{x:Math.floor(bounds.width*.69),y:Math.floor(bounds.height*.41)}});
 await picker.press('ArrowRight');
 const point=await picker.evaluate(button=>{
   const canvas=button.querySelector('canvas'),marker=button.querySelector('.ps-marker');
   const x=Math.floor(parseFloat(marker.style.left)*canvas.width/100),y=Math.floor(parseFloat(marker.style.top)*canvas.height/100);
   const rgb=[...canvas.getContext('2d').getImageData(x,y,1,1).data].slice(0,3);
   return {x,y,rgb,color:'#'+rgb.map(v=>v.toString(16).padStart(2,'0')).join('')};
 });
 await page.getByRole('button',{name:'다음에 수업 장 넣기'}).click();
 await waitPages(page,pageCount+1).catch(async error=>{throw Error(error.message+' '+await page.locator('.ps-setup .pixel-status').allTextContents());});
 const inserted=await order();assert.deepEqual(inserted.filter(id=>original.includes(id)),original);
 assert.ok(!original.includes(inserted[at+1]));
 await page.locator('.cv-show-btn').click();
 async function paint(surface,control,{checkTimer=false}={}){
   const intro=surface.locator('.ps-intro');
   await intro.locator('[aria-label="선택한 사진과 관찰할 점"]').waitFor();assert.equal(await intro.getAttribute('data-phase'),'0');
   await control.click();assert.equal(await intro.getAttribute('data-phase'),'1');assert.equal(await intro.locator('.ps-values').isVisible(),false);
   if(checkTimer){
     await page.clock.install();
     const auto=show.getByRole('button',{name:/자동 넘기기/});
     await auto.click();await page.clock.fastForward(120000);
     assert.equal(await intro.getAttribute('data-phase'),'1','automatic playback waits for the teacher');
     await auto.click();
   }
   const offset=await intro.locator('.ps-stage svg').evaluate((svg,p)=>{
     const pixel=new DOMPoint(p.x+.5,p.y+.5).matrixTransform(svg.querySelector('g').getScreenCTM()),b=svg.getBoundingClientRect();
     return Math.hypot(pixel.x-b.left-b.width/2,pixel.y-b.top-b.height/2);
   },point);assert.ok(offset<2,'zoom centers the chosen pixel: '+offset);
   await control.click();assert.deepEqual((await intro.locator('.ps-values b').allTextContents()).map(Number),point.rgb);
   await control.click();assert.equal(await surface.locator('[data-pixel]').count(),64);
   assert.ok((await surface.locator('[data-pixel="0"]').getAttribute('aria-label')).includes(point.color));
 }
 const show=page.locator('.cv-show');
 await paint(show,show.getByRole('button',{name:'다음 장',exact:true}),{checkTimer:true});
 await show.locator('[data-pixel="9"]').click();
 await show.getByRole('button',{name:'결과를 다음 슬라이드에 저장'}).click();
 await show.locator('.cv-show-stage').getByText('사진 속으로 들어가기 · 결과',{exact:true}).first().waitFor();
 await show.getByRole('button',{name:'발표 끝내기 (Esc)'}).click();
 await waitPages(page,pageCount+2);const saved=await order();
 await page.locator('.cv-back').click();await page.locator('.cv-home-title').waitFor();await page.reload();
 await page.locator('.cv-deck .cv-thumb').click();await waitPages(page,pageCount+2);assert.deepEqual(await order(),saved);
 const visible=await page.locator('[data-material-page]:not(.skip)').evaluateAll(nodes=>nodes.map(n=>n.dataset.pageId));
 const activityAt=visible.indexOf(inserted[at+1]);
 assert.deepEqual(saved.filter(id=>original.includes(id)),original);assert.equal(saved[at+1],inserted[at+1]);assert.ok(!inserted.includes(saved[at+2]));
 if(!hostRoot){
   const lib=await readLibrary(page),activity=lib.graphs[0].pages[at+1].page.activity;
   assert.equal(activity.photoStudy.x,point.x);assert.equal(activity.photoStudy.y,point.y);
   assert.equal(activity.cells[9],0);assert.equal(lib.sources[0].sha256,originalHash);
   assert.deepEqual(lib.originals[0].pages.map(v=>v.page.id),original);
 }
 await page.locator('.cv-down-btn').click();const dialog=page.getByRole('dialog',{name:'내려받기',exact:true});
 await dialog.locator('[data-type=html]').click();
 const download=page.waitForEvent('download',{timeout:150000});await dialog.locator('[data-download-save]').click();
 const temp=await mkdtemp(resolve(tmpdir(),'onbatang-photo-')),file=resolve(temp,'lesson.html'),copy=resolve(temp,'lesson-with-result.html');
 t.after(async()=>{for(const path of [file,copy])await unlink(path).catch(error=>{if(error.code!=='ENOENT')throw error;});await rmdir(temp);});
 await (await download).saveAs(file);
 const offline=await page.context().browser().newContext({offline:true,viewport:{width:390,height:844},reducedMotion:'reduce'});
 t.after(()=>offline.close());const player=await offline.newPage();
 await player.goto(pathToFileURL(file).href);
 const data=await player.evaluate(()=>JSON.parse(document.getElementById('onbatang-lesson-data').textContent).pages.map(p=>({id:p.id,result:p.result,image:p.result?p.image.slice(0,22):'',color:p.activity?.palette[0],cell:p.activity?.cells[9]})));
 assert.deepEqual(data.map(p=>p.id),visible);assert.equal(data[activityAt].color,point.color);assert.equal(data[activityAt].cell,0);assert.equal(data[activityAt+1].result,true);
 assert.match(data[activityAt+1].image,/^data:image\/png/);
 const next=player.getByRole('button',{name:'다음',exact:true});
 for(let i=0;i<activityAt;i++)await next.click();await paint(player,next);
 await player.locator('[data-pixel="10"]').click();
 await player.getByRole('button',{name:'결과를 다음 슬라이드에 저장'}).click();
 const resultCount=(activityAt+2)+' / '+(visible.length+1)+'쪽 · 결과';
 assert.equal(await player.locator('.lesson-count').innerText(),resultCount);await player.reload();
 assert.equal(await player.locator('.lesson-count').innerText(),resultCount);
 const ready=player.waitForEvent('download');
 await player.getByRole('button',{name:'현재 수업 내려받기'}).click();await (await ready).saveAs(copy);
 const fresh=await page.context().browser().newContext({offline:true});t.after(()=>fresh.close());const opened=await fresh.newPage();await opened.goto(pathToFileURL(copy).href);
 assert.equal(await opened.evaluate(i=>JSON.parse(document.getElementById('onbatang-lesson-data').textContent).pages[i].activity.cells[10],activityAt),0);
 assert.equal(await opened.locator('.lesson-count').innerText(),'1 / '+(visible.length+1)+'쪽');
 assert.equal(sha256(await readFile(sourcePath)),originalHash);await verifyIsolation();
});

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

 // Seed an existing activity through an explicit authoring host, then use the
 // real public entry for all participation, result saving and reopening.
 await page.goto(new URL('/app/index.html',entry).href);await page.getByRole('button',{name:name+' 열기',exact:true}).click();await waitPages(page,pageCount+1);
 assert.equal(await page.locator('[data-add-activity]').count(),0);assert.equal(await page.locator('[data-add-gai-app]').count(),0);
 await page.locator(`[data-material-page="${activityIndex}"]`).click();assert.equal(await page.locator('[data-edit-activity]').isVisible(),false);

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
