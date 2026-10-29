// Local browser regression: rectangle selection can start on the desk, with no
// production account, network service, or user document involved.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

test('desk-to-paper marquee selects in either direction, adds with Shift and leaves controls/touch alone',
 {skip:!process.env.MINICAN_PLAYWRIGHT_PATH,timeout:60000},async t=>{
 const hosted=!!process.env.MINICAN_HOST_ROOT;
 const root=resolve(process.env.MINICAN_HOST_ROOT||fileURLToPath(new URL('../../',import.meta.url))),base=hosted?'/minican':'';
 const fixture=`<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="${base}/src/editor.css">
 <style>body{margin:0}.desk{position:relative;display:grid;place-items:center;width:1000px;height:620px;background:#eeece1}.fe-stage{width:640px}.desk>button{position:absolute;top:10px;left:10px}</style>
 <div class="desk"><button>바깥 도구</button></div><div class="tools"></div><div class="panel"></div>
 <script type="module">
 import{createEditor}from'${base}/src/editor.js';import{configure}from'${base}/src/model.js';
 configure({aspect:16/9});const desk=document.querySelector('.desk');
 const editor=createEditor();desk.append(editor.stage);document.querySelector('.tools').append(editor.toolbar);document.querySelector('.panel').append(editor.panel);
 editor.setSelectionSurface(desk);editor.setDesign({bg:'#ffffff',items:[
 {id:'edeskleft001',t:'shape',shape:'rect',x:20,y:50,w:12,h:12,color:'#087f5b'},
 {id:'edeskright01',t:'shape',shape:'rect',x:75,y:50,w:12,h:12,color:'#e67700'},
 {id:'edesklocked1',t:'shape',shape:'rect',x:50,y:50,w:14,h:14,color:'#ced4da',lock:true}]});
 window.editor=editor;window.ready=true;</script>`;
 const server=createServer(async(req,res)=>{try{
  const p=new URL(req.url,'http://localhost').pathname;
  if(p==='/fixture.html'){res.setHeader('Content-Type','text/html;charset=utf-8');return res.end(fixture);}
  const f=resolve(root,'.'+decodeURIComponent(p));if(!f.startsWith(root+sep))throw Error('path');
  res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[extname(f)]||'application/octet-stream');res.end(await readFile(f));
 }catch{res.writeHead(404);res.end();}});
 await new Promise(done=>server.listen(0,'127.0.0.1',done));t.after(()=>new Promise(done=>server.close(done)));
 const{chromium}=await import(pathToFileURL(process.env.MINICAN_PLAYWRIGHT_PATH).href);
 const browser=await chromium.launch({channel:process.env.MINICAN_BROWSER||'msedge',headless:true});t.after(()=>browser.close());
 const page=await browser.newPage({viewport:{width:1100,height:850}});await page.goto(`http://127.0.0.1:${server.address().port}/fixture.html`);await page.waitForFunction(()=>window.ready);
 const paper=await page.locator('.fe-stage').boundingBox(),y=paper.y+paper.height/2;
 const selected=()=>page.locator('.fi.sel').count();
 const drag=async(x1,y1,x2,y2)=>{await page.mouse.move(x1,y1);await page.mouse.down();await page.mouse.move(x2,y2,{steps:8});await page.mouse.up();};
 await drag(paper.x-70,y-90,paper.x+paper.width*.35,y+90);assert.equal(await selected(),1);
 await page.keyboard.down('Shift');await drag(paper.x+paper.width+65,y+90,paper.x+paper.width*.6,y-90);await page.keyboard.up('Shift');
 assert.equal(await selected(),2,'Shift adds the second item without the locked one');
 await page.getByRole('button',{name:'바깥 도구',exact:true}).click();assert.equal(await selected(),2,'a desk control does not clear selection');
 await page.locator('.desk').dispatchEvent('pointerdown',{pointerType:'touch',pointerId:31,button:0,isPrimary:true,clientX:10,clientY:300});
 assert.equal(await selected(),2,'touch panning is not treated as a mouse marquee');
 await page.mouse.click(paper.x-45,y,{button:'right'});assert.equal(await selected(),2,'secondary click does not begin a rectangle');
 await page.mouse.click(paper.x-45,y);assert.equal(await selected(),0,'a plain empty click clears selection');
 await drag(paper.x+paper.width+60,y+90,paper.x-60,y-90);assert.equal(await selected(),2,'reverse outside-to-outside crossing selects both free items');
 assert.equal(await page.locator('.fe-marquee').isVisible(),false,'no rectangle remains after release');
 await page.evaluate(()=>window.editor.setSelectionSurface(null));await page.mouse.click(paper.x-40,y);assert.equal(await selected(),2,'detaching removes the background listener');
 await page.evaluate(()=>window.editor.setSelectionSurface(document.querySelector('.desk')));await page.mouse.click(paper.x-40,y);assert.equal(await selected(),0,'reattaching restores the background listener');
 await drag(paper.x+15,y-90,paper.x+paper.width+60,y+90);assert.equal(await selected(),2,'paper-to-desk selection still works');
 const before=await page.evaluate(()=>window.editor.getDesign());
 await page.evaluate(()=>window.editor.destroy());assert.equal(await page.locator('.desk.fe-selection-surface').count(),0);
 assert.deepEqual(before.items.map(i=>[i.id,i.x,i.y]),[['edeskleft001',20,50],['edeskright01',75,50],['edesklocked1',50,50]],'selection never moves source content');
});
