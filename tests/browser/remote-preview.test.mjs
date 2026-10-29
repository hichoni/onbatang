// The real common presenter and raster exporter, with a local remote adapter.
// No live broadcast channel, account, production data or paid QA environment.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

test('presenter sends bounded current/next raster previews and updates page/black state without source assets',
 {skip:!process.env.MINICAN_PLAYWRIGHT_PATH,timeout:60000},async t=>{
 const hosted=!!process.env.MINICAN_HOST_ROOT,root=resolve(process.env.MINICAN_HOST_ROOT||fileURLToPath(new URL('../../',import.meta.url))),base=hosted?'/minican':'';
 const html=`<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="${base}/src/editor.css"><link rel="stylesheet" href="${base}/app/app.css"><body class="mc-app"><main id="app"></main><script type="module">
 import{startMinican,openSavedDesign}from'${base}/app/app.js';import{newRecord}from'${base}/app/designs.js';import{setStorageName,putDesign}from'${base}/app/store.js';
 setStorageName('remote-preview-local');const record=newRecord('16:9');record.name='발표 미리보기 검수';record.source={kind:'local',filename:'never-send-source.pptx'};
 record.slides=[{id:'premoteprev01',bg:'#f0f4ff',notes:'발표자만 보는 메모',items:[{id:'eremoteprev01',t:'shape',shape:'rect',x:50,y:50,w:55,h:32,color:'#265d97'}]},
 {id:'premoteprev02',bg:'#fff4e6',items:[{id:'eremoteprev02',t:'shape',shape:'circle',x:50,y:50,w:30,h:30,color:'#d06338'}]}];await putDesign(record);
 const tour=await import('${base}/app/tour.js');tour.markTourSeen('editor');tour.markTourSeen(tour.NEWS_KEY);
 window.updates=[];const adapter={async open({state,command}){window.remoteCommand=command;window.updates.push(state());return{update(s){window.updates.push(s)},close(){},show(){}}}};
 await startMinican({storage:'remote-preview-local',showRemote:adapter});await openSavedDesign(record.id);window.ready=true;</script>`;
 const server=createServer(async(req,res)=>{try{
  const p=new URL(req.url,'http://localhost').pathname;if(p==='/fixture.html'){res.setHeader('Content-Type','text/html;charset=utf-8');return res.end(html);}
  const f=resolve(root,'.'+decodeURIComponent(p));if(!f.startsWith(root+sep))throw Error();res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'})[extname(f)]||'application/octet-stream');res.end(await readFile(f));
 }catch{res.writeHead(404);res.end();}});
 await new Promise(done=>server.listen(0,'127.0.0.1',done));t.after(()=>new Promise(done=>server.close(done)));
 const{chromium}=await import(pathToFileURL(process.env.MINICAN_PLAYWRIGHT_PATH).href),browser=await chromium.launch({channel:process.env.MINICAN_BROWSER||'msedge',headless:true});t.after(()=>browser.close());
 const page=await browser.newPage({viewport:{width:1440,height:1000}});await page.goto(`http://127.0.0.1:${server.address().port}/fixture.html`);await page.waitForFunction(()=>window.ready);
 await page.locator('.cv-show-btn').click();await page.locator('[data-show-remote]').click();
 await page.waitForFunction(()=>window.updates.some(s=>s.preview&&s.nextPreview));
 const first=await page.evaluate(()=>window.updates.at(-1));
 assert.equal(first.at,0);assert.equal(first.total,2);assert.equal(first.notes,'발표자만 보는 메모');
 for(const url of[first.preview,first.nextPreview]){assert.match(url,/^data:image\/jpeg;base64,/);assert.ok(url.length<180000);}
 assert.notEqual(first.preview,first.nextPreview,'previews come from the two different slide designs');
 assert.equal(JSON.stringify(first).includes('never-send-source'),false);
 const dimensions=await page.evaluate(async()=>{const image=new Image();image.src=window.updates.at(-1).preview;await image.decode();return[image.naturalWidth,image.naturalHeight];});assert.deepEqual(dimensions,[320,180]);
 await page.evaluate(()=>window.remoteCommand({action:'next'}));await page.waitForFunction(()=>window.updates.at(-1).at===1);
 const second=await page.evaluate(()=>window.updates.at(-1));assert.equal(second.preview,first.nextPreview);assert.equal(second.nextPreview,'');
 await page.evaluate(()=>window.remoteCommand({action:'black'}));await page.waitForFunction(()=>window.updates.at(-1).black===true);
 await page.keyboard.press('b');await page.waitForFunction(()=>window.updates.at(-1).black===false);
 await page.keyboard.press('Escape');assert.equal(await page.locator('.cv-show').count(),0);
});
