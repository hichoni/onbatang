// Real conversion worker, editor DOM, IndexedDB and PPTX export. Synthetic files only.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve,extname,sep} from 'node:path';
import {unzipSync,zipSync} from 'fflate';
// 공용 첫 쪽은 새로 고치면 꾸미던 그림을 다시 연다(v0.42). 목록에서 다시 여는 것을 보려고 그때는 내 그림으로 나간다.
const reloadToList=async page=>{await page.reload();await page.waitForFunction(()=>!document.getElementById('onba-splash'));if(await page.evaluate(()=>document.body.classList.contains('cv-editing'))){await page.locator('.cv-back').click();await page.locator('.cv-home-title').waitFor();}};

const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const options={skip:!process.env.MINICAN_PLAYWRIGHT_PATH,timeout:300000};
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const decode=bytes=>new TextDecoder().decode(bytes);
const encode=text=>new TextEncoder().encode(text);
const dimensions=xml=>{const match=/<p:sldSz\b[^>]*\bcx="(\d+)"[^>]*\bcy="(\d+)"/.exec(xml);assert.ok(match);return {width:Number(match[1]),height:Number(match[2]),unit:'emu'};};

async function setup(t){
 const server=createServer(async(req,res)=>{try{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname==='/seed.html'){res.setHeader('Content-Type','text/html');return res.end('<!doctype html><link rel="icon" href="data:,"><body>Synthetic aspect fixtures');}
  const file=resolve(root,'.'+decodeURIComponent(pathname));if(!file.startsWith(root+sep)){res.writeHead(403);return res.end();}
  res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2','.png':'image/png'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));
 }catch{res.writeHead(404);res.end();}});
 await new Promise(done=>server.listen(0,'127.0.0.1',done));t.after(()=>new Promise(done=>server.close(done)));
 const {chromium}=await import(pathToFileURL(process.env.MINICAN_PLAYWRIGHT_PATH).href),browser=await chromium.launch({channel:process.env.MINICAN_BROWSER||'msedge',headless:true});t.after(()=>browser.close());
 const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce',acceptDownloads:true}),origin='http://127.0.0.1:'+server.address().port,errors=[],external=[];
 await context.addInitScript(()=>{try{const api=navigator.serviceWorker;if(api)api.register=async()=>undefined;}catch{}});
 await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin===origin||['data:','blob:','about:'].includes(url.protocol))return route.continue();external.push(url.origin);return route.abort();});
 const page=await context.newPage();page.setDefaultTimeout(45000);page.on('pageerror',error=>errors.push(error.name));await page.goto(origin+'/seed.html');
 const square=await page.evaluate(async()=>{const {newRecord}=await import('/app/designs.js'),store=await import('/app/store.js');store.setStorageName('minican');const record=newRecord('1:1');record.name='기존 정사각형';record.slides[0].items=[{t:'text',text:'기존 정사각형 원문',x:50,y:50,w:70,size:5}];const saved=await store.putDesign(record);(await import('/app/tour.js')).markTourSeen('editor');return saved;});
 return {page,origin,square,errors,external};
}
async function graph(page,id){return page.evaluate(async id=>{const library=(await import('/app/pptx-import/library.js')).createPptxLibrary({storage:'minican'});try{return id?await library.getMaterial({id}):await library.listMaterials();}finally{await library.close();}},id);}
async function openLibrary(page){
 if(!await page.locator('[data-inline-import]').count()){
  if(await page.locator('.cv-home-title').isVisible())await page.locator('.cv-hero .cv-new-btn').click();
  await page.locator('.cv-name').waitFor();await page.locator('.fe-tab[data-tab=upload]').click();await page.locator('[data-upload-tab=ppt]').click();await page.locator('[data-document-import]').click();
 }
 const inline=page.locator('[data-inline-import]');await inline.waitFor();
 if(await inline.locator('.op-material').isVisible())await inline.getByRole('button',{name:'내 PPT 자료',exact:true}).click();
 else if(!await inline.locator('[data-pptx-material]').count())await inline.getByRole('button',{name:'이미 가져온 자료 보기',exact:true}).click();
 await inline.locator('[data-pptx-material]').first().waitFor();
}
async function openMaterial(page,id){await openLibrary(page);await page.locator(`[data-inline-import] [data-pptx-material="${id}"]`).getByRole('button',{name:'자료 열기',exact:true}).click();await page.locator('[data-inline-import] [data-pptx-page="0"]').waitFor();}
async function assertCanvas(page,ratio,{label,preset}={}){
 await page.locator('.cv-canvas .fe-card').waitFor();
 await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
 const state=await page.evaluate(async()=>{const card=document.querySelector('.cv-canvas .fe-card'),box=card.getBoundingClientRect(),shell=document.querySelector('.cv-app');return {actual:box.width/box.height,paint:Number(card.style.getPropertyValue('--fe-ratio')),shell:Number(shell.style.getPropertyValue('--cv-aspect')),global:(await import('/src/model.js')).settings().aspect,selected:[...document.querySelectorAll('.cv-shape[aria-pressed=true]')].map(node=>node.dataset.ratio),current:document.querySelector('[data-canvas-ratio]')?.textContent||null};});
 for(const key of ['actual','paint','shell','global'])assert.ok(Math.abs(state[key]-ratio)<.002,`${label||ratio}: ${key} matches the stored slide size (${state[key]})`);
 if(preset!==undefined)assert.deepEqual(state.selected,preset?[preset]:[]);
 if(label)assert.equal(state.current,label,'the header describes the exact source/current ratio rather than implying a square canvas');
}
async function exportDeck(page,mode){
 await page.locator('[data-pptx-export]').click();const dialog=page.getByRole('dialog',{name:'PPTX 내려받기',exact:true});await dialog.locator(`input[value=${mode}]`).check();
 const pending=page.waitForEvent('download',{timeout:120000});await dialog.locator('[data-pptx-export-confirm]').click();const download=await pending,stream=await download.createReadStream(),chunks=[];for await(const chunk of stream)chunks.push(chunk);await dialog.waitFor({state:'detached'});return unzipSync(Buffer.concat(chunks));
}

test('imported 16:9, 4:3 and custom 17:10 canvases follow original dimensions across square/material switches, saves, reopen and both PPTX modes',options,async t=>{
 const {page,origin,square,errors,external}=await setup(t),original=await readFile(resolve(root,'tools/fixtures/pptx/self-authored-4x3.pptx')),originalHash=digest(original),records=[];
 const cases=[{id:'16:9',width:12192000,height:6858000,preset:'16:9'},{id:'4:3',width:9144000,height:6858000,preset:null},{id:'17:10',width:11658600,height:6858000,preset:null}];
 for(const entry of cases){
  const files=unzipSync(original);files['ppt/presentation.xml']=encode(decode(files['ppt/presentation.xml']).replace(/<p:sldSz\b[^>]*\/>/,`<p:sldSz cx="${entry.width}" cy="${entry.height}"/>`));const bytes=zipSync(files);
  await page.goto(origin+'/app/index.html');await page.locator('.cv-home-title').waitFor();assert.equal(await page.locator('.cv-import-btn').count(),0);await page.locator('.cv-hero .cv-new-btn').click();await page.locator('.cv-name').waitFor();await page.locator('.fe-tab[data-tab=upload]').click();await page.locator('[data-upload-tab=ppt]').click();await page.locator('[data-document-import]').click();
  await page.locator('[data-inline-import]').getByLabel('PPTX 파일 선택',{exact:true}).setInputFiles({name:`self-authored-${entry.id.replace(':','-')}.pptx`,mimeType:'application/vnd.openxmlformats-officedocument.presentationml.presentation',buffer:Buffer.from(bytes)});
  await page.waitForFunction(()=>document.querySelectorAll('[data-inline-import] [data-page-select]').length===2&&document.querySelector('[data-inline-import] [data-import-save]')?.disabled===false,null,{timeout:120000});
  await page.locator('[data-inline-import] [data-import-save]').click();await page.locator('[data-inline-import]').waitFor({state:'detached',timeout:120000});await page.locator('.cv-name').waitFor();
  const imported=(await graph(page)).find(value=>value.documents[0].payload.originalSize.width===entry.width);assert.ok(imported);const payload=imported.documents[0].payload;
  assert.deepEqual(payload.originalSize,{width:entry.width,height:entry.height,unit:'emu'});assert.deepEqual(payload.size,{width:entry.width/9525,height:entry.height/9525,unit:'px'});assert.equal(payload.source.sha256,digest(bytes));
  // The live editor serializes its active page through cleanDesign (four-decimal
  // geometry/default fields); unopened pages retain the original payload.
  const expectedSlides=await page.evaluate(async slides=>{const {cleanDesign}=await import('/src/model.js');return slides.map((slide,index)=>index===0?cleanDesign(slide):slide);},payload.slides);
  await assertCanvas(page,entry.width/entry.height,{label:`원본 비율 · ${entry.id}`,preset:entry.preset});
  const name=`크기 유지 ${entry.id}`;await page.getByRole('textbox',{name:'그림 이름',exact:true}).fill(name);await page.locator('.cv-back').click();await page.locator('.cv-home-title').waitFor();await openMaterial(page,imported.materialRef.id);await page.locator('[data-inline-import] [data-pptx-save]').click();await page.waitForFunction(()=>document.querySelector('[data-inline-import] [data-pptx-status]')?.textContent.includes('편집본을 저장했어요'));
  const saved=await graph(page,imported.materialRef.id);assert.deepEqual(saved.documents[0].payload.size,payload.size);assert.deepEqual(saved.documents[0].payload.originalSize,payload.originalSize);assert.deepEqual(saved.documents[0].payload.assets,payload.assets);assert.deepEqual(saved.documents[0].payload.source,payload.source);
  assert.deepEqual(saved.documents[0].payload.slides,expectedSlides,'opening at the original ratio only applies the existing active-page serialization contract; it never reshapes authored geometry');
  for(const mode of ['editable','image']){const output=await exportDeck(page,mode);assert.deepEqual(dimensions(decode(output['ppt/presentation.xml'])),payload.originalSize);}
  records.push({...entry,materialId:imported.materialRef.id,documentId:payload.id,saved});
 }
 // Recreate the app/module realm, then alternate source sizes with a pre-existing square drawing.
 await reloadToList(page);await page.locator('.cv-home-title').waitFor();await openLibrary(page);
 for(const entry of [records[2],records[0],records[1]]){
  await page.locator(`[data-pptx-material="${entry.materialId}"]`).getByRole('button',{name:'자료 열기',exact:true}).click();await page.locator('[data-pptx-edit]').click();await assertCanvas(page,entry.width/entry.height,{label:`원본 비율 · ${entry.id}`,preset:entry.preset});
  await page.locator('.cv-back').click();await page.locator('.cv-home-title').waitFor();
  await page.evaluate(async id=>(await import('/app/app.js')).openSavedDesign(id),square.id);await assertCanvas(page,1,{preset:'1:1'});await page.locator('.cv-back').click();
  await page.locator('.cv-home-title').waitFor();await openLibrary(page);assert.deepEqual(await graph(page,entry.materialId),entry.saved);
 }
 // A deliberate teacher size change must stop claiming the original ratio.
 const changed=records[2];await page.locator(`[data-pptx-material="${changed.materialId}"]`).getByRole('button',{name:'자료 열기',exact:true}).click();await page.locator('[data-pptx-edit]').click();
 await page.locator('.cv-shape[data-ratio="4:5"]').click();await page.locator('.cv-fit[data-fit=keep]').click();await assertCanvas(page,4/5,{label:'현재 비율 · 4:5',preset:'4:5'});
 const resized=await page.evaluate(async id=>(await import('/app/app.js')).flushSavedDesign(id),changed.documentId);assert.deepEqual(resized.originalSize,changed.saved.documents[0].payload.originalSize);assert.deepEqual(resized.source,changed.saved.documents[0].payload.source);assert.deepEqual(resized.size,{width:4,height:5,unit:'px'});
 const unchanged=await page.evaluate(async id=>(await import('/app/store.js')).getDesign(id),square.id);assert.deepEqual(unchanged,square);assert.equal(digest(await readFile(resolve(root,'tools/fixtures/pptx/self-authored-4x3.pptx'))),originalHash);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
});
