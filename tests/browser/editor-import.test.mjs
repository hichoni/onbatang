// Actual editor navigation with local IndexedDB and in-memory account callbacks.
// No account SDK, credential, mail or remote request is involved.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve,extname,sep} from 'node:path';

const options={skip:!process.env.MINICAN_PLAYWRIGHT_PATH,timeout:60000};
const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
async function setup(t,{sync=false}={}){
 const html=`<!doctype html><html lang="ko"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,">
  <link rel="stylesheet" href="/src/editor.css"><link rel="stylesheet" href="/app/app.css"><link rel="stylesheet" href="/app/brand.css">
  <body class="mc-app"><main id="app"></main><script type="module">
  import {startMinican,openSavedDesign} from '/app/app.js';
  import {newRecord} from '/app/designs.js';import {getDesign,putDesign,setStorageName} from '/app/store.js';
  window.calls=[];window.pushed=[];window.callbackMode='throw';window.syncFail=true;window.holdSync=false;
  const storage=${JSON.stringify(sync?'editor-import-sync':'editor-import-blank')};setStorageName(storage);
  let seed;if(${sync}){seed=newRecord('16:9');seed.name='계정 모의 검수';seed.slides[0].items=[{t:'text',text:'처음 합성 본문',x:50,y:50,w:80,size:5}];seed=await putDesign(seed);window.seedId=seed.id;}
  const account={pull:async()=>({records:seed?[seed]:[],deleted:[]}),drop:async()=>{},push:async record=>{
   window.pushed.push(structuredClone(record));if(window.holdSync)await new Promise(done=>window.releaseSync=done);
   if(window.syncFail)throw Error('synthetic-account-rejection');
  }};
  await startMinican({storage,...(${sync}?{sync:account}:{}),importAction:{label:'PPT 가져오기',editorLabel:'내 PPT 올리기',open:async context=>{
   const saved=await getDesign(context.designId);window.calls.push({...context,persistedAtCallback:!!saved,blankAtCallback:saved?.slides.every(page=>!page.items.length)});
   if(window.callbackMode==='throw')throw Error('synthetic-open-rejection');
   if(window.callbackMode==='cancel'){await openSavedDesign(context.designId,{slideIndex:context.slideIndex,tab:'upload'});return;}
   if(window.callbackMode==='other'){const other=newRecord('16:9');other.name='다른 활성 그림';await putDesign(other);window.otherId=other.id;await openSavedDesign(other.id,{tab:'upload'});throw Error('synthetic-after-other-editor');}
  }}});window.ready=true;
  </script></body></html>`;
 const server=createServer(async(req,res)=>{try{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname==='/editor-import-test.html'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html);}
  const file=resolve(root,'.'+decodeURIComponent(pathname));if(!file.startsWith(root+sep)){res.writeHead(403);return res.end();}
  res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2','.woff':'font/woff','.png':'image/png','.webp':'image/webp'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));
 }catch{res.writeHead(404);res.end();}});
 await new Promise(done=>server.listen(0,'127.0.0.1',done));t.after(()=>new Promise(done=>server.close(done)));
 const {chromium}=await import(pathToFileURL(process.env.MINICAN_PLAYWRIGHT_PATH).href);
 const browser=await chromium.launch({channel:process.env.MINICAN_BROWSER||'msedge',headless:true});t.after(()=>browser.close());
 const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),errors=[],external=[];
 const origin='http://127.0.0.1:'+server.address().port;
 await page.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin===origin||['data:','blob:','about:'].includes(url.protocol))return route.continue();external.push(url.origin);return route.abort();});
 page.on('pageerror',error=>errors.push(error.name));await page.goto(origin+'/editor-import-test.html');await page.waitForFunction(()=>window.ready===true);
 return {page,errors,external};
}
async function stopTour(page){await page.evaluate(async()=>{(await import('/app/tour.js')).stopTour();});}
const importButton=page=>page.locator('[data-document-import]');

test('new blank editor is durably saved before import, restores upload on rejection/cancel, and never overwrites another active editor',options,async t=>{
 const {page,errors,external}=await setup(t);
 await page.locator('.cv-hero .cv-new-btn').click();await stopTour(page);
 assert.equal(await page.locator('.fe-quick').filter({hasText:'내 자료'}).count(),1);
 await page.locator('.fe-tab[data-tab="upload"]').click();
 assert.match(await page.locator('.fe-panel').textContent(),/내 사진·PPT를 올리거나 유튜브 영상을 넣어요/);
 assert.equal(await importButton(page).textContent(),'내 PPT 올리기');
 await importButton(page).click();
 await page.waitForFunction(()=>window.calls.length===1&&document.querySelector('.fe-tab[data-tab="upload"].on')&&!document.querySelector('#app').inert);
 const first=await page.evaluate(async()=>({call:window.calls[0],records:await (await import('/app/store.js')).listDesigns(),name:document.querySelector('.cv-name').value}));
 assert.equal(first.call.from,'editor');assert.equal(first.call.slideIndex,0);assert.equal(first.call.persistedAtCallback,true);assert.equal(first.call.blankAtCallback,true);
 assert.equal(first.records.length,1);assert.equal(first.records[0].id,first.call.designId);assert.equal(first.records[0].name,first.name);assert.deepEqual(first.records[0].slides[0].items,[]);
 await page.evaluate(()=>window.callbackMode='cancel');await importButton(page).click();
 await page.waitForFunction(()=>window.calls.length===2&&document.querySelector('.fe-tab[data-tab="upload"].on')&&!document.querySelector('#app').inert);
 assert.equal(await page.evaluate(()=>window.calls[1].designId),first.call.designId);assert.equal(await page.locator('.cv-name').inputValue(),first.name);
 await page.evaluate(()=>window.callbackMode='other');await importButton(page).click();
 await page.waitForFunction(()=>window.calls.length===3&&document.querySelector('.cv-name')?.value==='다른 활성 그림'&&!document.querySelector('#app').inert);
 const other=await page.evaluate(async()=>{const {getDesign}=await import('/app/store.js');return {sameOriginal:!!await getDesign(window.calls[0].designId),otherExists:!!await getDesign(window.otherId),otherId:window.otherId};});
 assert.equal(other.sameOriginal,true);assert.equal(other.otherExists,true);assert.notEqual(other.otherId,first.call.designId);
 assert.equal(await page.locator('.fe-tab[data-tab="upload"].on').count(),1);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
});

test('account callback rejection keeps the same editor and local body, then successful sync permits exactly one import with the latest body',options,async t=>{
 const {page,errors,external}=await setup(t,{sync:true});
 await page.getByRole('button',{name:'계정 모의 검수 열기',exact:true}).click();await stopTour(page);
 await page.locator('.cv-canvas .fi-text').dblclick();await page.locator('.cv-canvas [contenteditable]').fill('동기화와 가져오기 직전 수정한 합성 본문');await page.keyboard.press('Tab');
 await page.locator('.cv-name').fill('동기화 실패 뒤에도 유지');await page.locator('.fe-tab[data-tab="upload"]').click();
 await page.evaluate(()=>{window.originalNameNode=document.querySelector('.cv-name');window.originalCanvas=document.querySelector('.cv-canvas');});
 await importButton(page).click();
 await page.waitForFunction(()=>document.querySelector('.cv-alert')?.textContent.includes('계정에 올리지 못했어요.')&&!document.querySelector('#app').inert);
 const failed=await page.evaluate(async()=>({calls:window.calls.length,sameName:window.originalNameNode===document.querySelector('.cv-name'),sameCanvas:window.originalCanvas===document.querySelector('.cv-canvas'),record:await (await import('/app/store.js')).getDesign(window.seedId)}));
 assert.equal(failed.calls,0);assert.equal(failed.sameName,true);assert.equal(failed.sameCanvas,true);assert.equal(failed.record.name,'동기화 실패 뒤에도 유지');assert.equal(failed.record.slides[0].items[0].text,'동기화와 가져오기 직전 수정한 합성 본문');
 await page.evaluate(()=>{window.syncFail=false;window.holdSync=true;window.callbackMode='success';document.querySelector('[data-document-import]').click();document.querySelector('[data-document-import]').click();});
 await page.waitForFunction(()=>typeof window.releaseSync==='function');
 assert.equal(await page.evaluate(()=>window.calls.length),0);assert.equal(await page.locator('#app').evaluate(node=>node.inert),true);
 assert.equal(await page.evaluate(()=>window.originalNameNode===document.querySelector('.cv-name')),true);
 await page.evaluate(()=>{window.holdSync=false;window.releaseSync();});
 await page.waitForFunction(()=>window.calls.length===1&&document.querySelector('#app').dataset.view==='home');
 const success=await page.evaluate(async()=>({call:window.calls[0],saved:await (await import('/app/store.js')).getDesign(window.seedId),pushed:window.pushed.at(-1)}));
 assert.equal(success.call.persistedAtCallback,true);assert.equal(success.call.designId,success.saved.id);assert.equal(success.call.slideIndex,0);
 assert.equal(success.pushed.id,success.saved.id);assert.equal(success.pushed.name,success.saved.name);assert.deepEqual(success.pushed.slides,success.saved.slides);
 assert.equal(success.saved.slides[0].items[0].text,'동기화와 가져오기 직전 수정한 합성 본문');assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
});
