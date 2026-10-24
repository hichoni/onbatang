// Local-only browser contract: no real accounts, uploads or network services.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve,extname,sep} from 'node:path';
const root=resolve(fileURLToPath(new URL('../../',import.meta.url))),options={skip:!process.env.MINICAN_PLAYWRIGHT_PATH,timeout:60000};
const html=`<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/src/editor.css"><link rel="stylesheet" href="/app/app.css"><body class="mc-app"><main id="app"></main><script type="module">
import {startMinican} from '/app/app.js';import {newRecord} from '/app/designs.js';import {putDesign,getDesign,listDesigns,setStorageName} from '/app/store.js';
setStorageName('account-host-fixture');const seed=newRecord('16:9');seed.name='계정 목록 검수 그림';seed.slides[0].items=[{t:'text',text:'원래 문장',x:50,y:50,w:80,size:5}];await putDesign(seed);window.seedId=seed.id;window.allowClose=true;window.calls=[];
const accountAction={label:'내 계정 수업',editorTitle:'내 수업 검수',open:async context=>{window.calls.push({from:context.from,id:context.designId,drawings:(await listDesigns()).length,persisted:context.designId?await getDesign(context.designId):null});const box=context.inline.root,heading=document.createElement('h3');heading.textContent='내부 수업 목록';const open=document.createElement('button');open.textContent='결과 편집본 열기';open.onclick=async()=>{const record=await getDesign(seed.id);record.slides[0].items.push({t:'text',text:'학생 답 보존',x:50,y:75,w:80,size:3});await putDesign(record);await context.inline.openDesign(seed.id,{tab:'text'});};box.append(heading,open);return {requestClose:async()=>{if(!window.allowClose)return false;await context.inline.close();return true;},dispose(){window.disposed=(window.disposed||0)+1;}};}};
const cloudAction={label:'내 클라우드',editorTitle:'내 클라우드 검수',open:async context=>{window.cloudCalls=(window.cloudCalls||0)+1;const heading=document.createElement('h3');heading.textContent='내 클라우드 목록';context.inline.root.append(heading);return {dispose(){}};}};
const sync={pull:async()=>new Promise(resolve=>window.releasePull=()=>resolve({records:[],deleted:[]})),push:async()=>{},drop:async()=>{}};
await startMinican({storage:'account-host-fixture',...(location.search?'':{accountAction,cloudAction,sync})});window.ready=true;
</script>`;
async function setup(t,publicOnly=false){
 const server=createServer(async(req,res)=>{try{const path=new URL(req.url,'http://localhost').pathname;if(path==='/fixture.html'){res.setHeader('Content-Type','text/html');return res.end(html);}const f=resolve(root,'.'+decodeURIComponent(path));if(!f.startsWith(root+sep))throw Error('path');res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2','.html':'text/html'})[extname(f)]||'application/octet-stream');res.end(await readFile(f));}catch{res.writeHead(404);res.end();}});
 await new Promise(done=>server.listen(0,'127.0.0.1',done));t.after(()=>new Promise(done=>server.close(done)));
 const {chromium}=await import(pathToFileURL(process.env.MINICAN_PLAYWRIGHT_PATH).href),browser=await chromium.launch({channel:'msedge',headless:true});t.after(()=>browser.close());
 const context=await browser.newContext({reducedMotion:'reduce'}),origin=`http://127.0.0.1:${server.address().port}`,external=[];await context.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():(external.push(route.request().url()),route.abort()));
 const page=await context.newPage();await page.goto(origin+'/fixture.html'+(publicOnly?'?public':''));await page.waitForFunction(()=>window.ready);return {page,external};
}
test('public standalone has no account list without the explicit host action',options,async t=>{const {page,external}=await setup(t,true);assert.equal(await page.locator('[data-account-action]').count(),0);assert.equal(await page.locator('[data-cloud-action]').count(),0);assert.deepEqual(external,[]);});
test('내 클라우드 has its own home button and opens in the same full screen, apart from the lesson list',options,async t=>{
 const {page,external}=await setup(t);const cloud=page.locator('[data-cloud-action]');await cloud.waitFor();assert.match(await cloud.innerText(),/내 클라우드/);
 await page.evaluate(()=>window.releasePull());await cloud.click();await page.getByText('내 클라우드 목록',{exact:true}).waitFor();
 assert.equal(await page.getByRole('heading',{name:'내 클라우드 검수',exact:true}).count(),1);assert.equal(await page.getByText('내부 수업 목록',{exact:true}).count(),0);
 assert.equal(await page.evaluate(()=>[window.cloudCalls,window.calls.length]).then(v=>v.join()),'1,0');
 await page.getByRole('button',{name:'내 그림으로 돌아가기',exact:true}).click();await page.locator('[data-cloud-action]').waitFor();assert.deepEqual(external,[]);
});
test('account lists open inside home/editor, preserve saves and leave for an already persisted result',options,async t=>{
 const {page,external}=await setup(t),url=page.url();await page.locator('[data-account-action]').click();await page.getByText('내부 수업 목록',{exact:true}).waitFor();
 await page.evaluate(()=>window.releasePull());await page.getByText('내부 수업 목록',{exact:true}).waitFor();
 assert.deepEqual(await page.evaluate(()=>window.calls.map(c=>({from:c.from,drawings:c.drawings}))),[{from:'home',drawings:1}]);assert.equal(page.url(),url);
 await page.getByRole('button',{name:'내 그림으로 돌아가기',exact:true}).click();await page.locator('.cv-item .cv-thumb').first().click();
 await page.locator('.cv-name').fill('저장 후 수업 목록');await page.locator('[data-account-action]').click();await page.getByText('내부 수업 목록',{exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>window.calls.at(-1).persisted.name),'저장 후 수업 목록');
 await page.evaluate(()=>window.allowClose=false);await page.locator('.fe-tab[data-tab=bg]').click();assert.equal(await page.getByText('내부 수업 목록',{exact:true}).count(),1);
 await page.evaluate(()=>window.allowClose=true);await page.locator('.fe-tab[data-tab=bg]').click();await page.locator('[data-inline-import]').waitFor({state:'detached'});assert.equal(await page.locator('.cv-name').inputValue(),'저장 후 수업 목록');
 await page.locator('[data-account-action]').click();await page.getByRole('button',{name:'결과 편집본 열기',exact:true}).click();await page.locator('[data-inline-import]').waitFor({state:'detached'});
 assert.match(await page.locator('.cv-canvas').innerText(),/학생 답 보존/);assert.equal(page.url(),url);assert.deepEqual(external,[]);
});
