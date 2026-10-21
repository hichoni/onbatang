import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve,extname,sep} from 'node:path';
import {cropImage} from '../../src/crop.js';
const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const html=`<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/src/editor.css"><body><main id="editor" style="max-width:1100px;margin:auto"></main><script type="module">
import {createEditor} from '/src/editor.js';import {configure} from '/src/model.js';import {newRecord} from '/app/designs.js';import {getDesign,putDesign,setStorageName} from '/app/store.js';
setStorageName('crop-browser-fixture');configure({aspect:1});let record=await getDesign('dcropbrowser001');if(!record){record=newRecord('1:1');record.id='dcropbrowser001';const c=document.createElement('canvas');c.width=200;c.height=100;const x=c.getContext('2d');x.fillStyle='#ef0000';x.fillRect(0,0,50,100);x.fillStyle='#00cc00';x.fillRect(50,0,100,100);x.fillStyle='#0000ef';x.fillRect(150,0,50,100);record.slides[0].items=[{id:'ecropbrowser001',t:'image',url:c.toDataURL(),x:50,y:50,w:60,h:30,rot:0,mask:'none'}];await putDesign(record);}window.originalUrl=record.slides[0].items[0].url;
window.editor=createEditor({design:record.slides[0],onChange:()=>{record.slides[0]=window.editor.getDesign();window.saved=putDesign(record);}});window.editor.mount(document.querySelector('main'));window.ready=true;
</script>`;
test('in-place crop opens on double click, trims and pans on the slide, cancels, reopens and exports matching pixels', {skip:!process.env.MINICAN_PLAYWRIGHT_PATH,timeout:90000},async t=>{
 const server=createServer(async(req,res)=>{try{const p=new URL(req.url,'http://localhost').pathname;if(p==='/fixture.html'){res.setHeader('Content-Type','text/html');return res.end(html);}const file=resolve(root,'.'+decodeURIComponent(p));if(!file.startsWith(root+sep))throw Error();res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404);res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const {chromium}=await import(pathToFileURL(process.env.MINICAN_PLAYWRIGHT_PATH).href),browser=await chromium.launch({channel:'msedge',headless:true});t.after(()=>browser.close());
 const page=await browser.newPage({viewport:{width:1360,height:1000},reducedMotion:'reduce'}),errors=[];page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/fixture.html`);await page.waitForFunction(()=>window.ready);
 const photo=page.locator('.fe-card .fi-image'),source=page.locator('[data-image-crop]'),frame=source.locator('.fe-crop-rect');
 const near=(a,b,tolerance=1.2)=>assert.ok(Math.abs(a-b)<tolerance,`${a} ≈ ${b}`);
 const original=await page.evaluate(()=>window.editor.getDesign().items[0]),photoBox=await photo.boundingBox();
 async function dragHandle(corner,dx,dy){const h=await source.locator(`[data-corner=${corner}]`).boundingBox();await page.mouse.move(h.x+h.width/2,h.y+h.height/2);await page.mouse.down();await page.mouse.move(h.x+h.width/2+dx,h.y+h.height/2+dy,{steps:6});await page.mouse.up();}
 await photo.dblclick();await source.waitFor();
 assert.equal(await source.evaluate(n=>!!n.closest('.fe-stage')),true,'crop is on the original stage');
 assert.equal(await page.locator('.fe-pop:not([hidden])').count(),0,'no separate miniature crop popup');
 const actualBox=await source.boundingBox();for(const key of ['x','y','width','height'])near(actualBox[key],photoBox[key]);
 assert.equal(await source.locator('[data-corner]').count(),8);
 const box=await source.boundingBox();await dragHandle('w',box.width*.25,0);await dragHandle('e',-box.width*.25,0);
 assert.deepEqual(await page.evaluate(()=>window.editor.getDesign().items[0]),original,'preview never writes the document');
 await mkdir(resolve(root,'work'),{recursive:true});await page.screenshot({path:resolve(root,'work/image-crop-inplace-desktop.png'),fullPage:true});
 await page.locator('.fe-stage').press('Enter');
 let crop=await page.evaluate(()=>window.editor.getDesign().items[0]);for(const [key,value]of Object.entries({x:.25,y:0,w:.5,h:1}))near(crop.crop[key],value,.0001);near(crop.w,30,.005);assert.equal(crop.url,await page.evaluate(()=>window.originalUrl));
 await page.getByRole('button',{name:'실행 취소',exact:true}).click();assert.equal(await page.evaluate(()=>window.editor.getDesign().items[0].crop),undefined);
 await page.getByRole('button',{name:'다시 실행',exact:true}).click();assert.deepEqual(await page.evaluate(()=>window.editor.getDesign().items[0].crop),crop.crop);await photo.click();
 await page.getByRole('button',{name:'이미지 자르기',exact:true}).click();await source.waitFor();await page.getByRole('button',{name:'원본 전체',exact:true}).click();await page.getByRole('button',{name:'원본 전체',exact:true}).press('Escape');assert.deepEqual(await page.evaluate(()=>window.editor.getDesign().items[0].crop),crop.crop);
 await page.evaluate(()=>window.saved);await page.reload();await page.waitForFunction(()=>window.ready);assert.deepEqual(await page.evaluate(()=>window.editor.getDesign().items[0].crop),crop.crop);
 const output=await page.evaluate(async()=>{
  const design=window.editor.getDesign(),{designToCanvas}=await import('/src/export.js'),{createPptx}=await import('/app/pptx.js');
  const rendered=await designToCanvas(design,{width:400,aspect:1}),ctx=rendered.canvas.getContext('2d');
  const pixel=(x,y)=>[...ctx.getImageData(x,y,1,1).data];
  const ppt=await createPptx({slides:[design],size:{width:400,height:400,unit:'px'}}),v=new DataView(ppt.bytes.buffer);let pos=0,xml='';
  while(v.getUint32(pos,true)===0x04034b50){const len=v.getUint32(pos+18,true),n=v.getUint16(pos+26,true),e=v.getUint16(pos+28,true),name=new TextDecoder().decode(ppt.bytes.slice(pos+30,pos+30+n)),start=pos+30+n+e;if(name==='ppt/slides/slide1.xml')xml=new TextDecoder().decode(ppt.bytes.slice(start,start+len));pos=start+len;}
  return {left:pixel(150,200),middle:pixel(200,200),right:pixel(250,200),xml};
 });
 assert.deepEqual(output.left,[0,204,0,255]);assert.deepEqual(output.middle,[0,204,0,255]);assert.deepEqual(output.right,[0,204,0,255]);assert.match(output.xml,/<a:srcRect l="25000" t="0" r="25000" b="0"\/>/);
 await photo.dblclick();await source.waitFor();
 const fixed=await frame.boundingBox(),full=await source.boundingBox();await page.mouse.move(fixed.x+fixed.width/2,fixed.y+fixed.height/2);await page.mouse.down();await page.mouse.move(fixed.x+fixed.width/2+full.width*.1,fixed.y+fixed.height/2,{steps:6});await page.mouse.up();
 const panned=await frame.boundingBox();for(const key of ['x','y','width','height'])near(panned[key],fixed[key],.2);
 await page.locator('.fe-stage').click({position:{x:40,y:40}});assert.equal(await source.count(),0,'outside click applies');
 const moved=await page.evaluate(()=>window.editor.getDesign().items[0]);near(moved.crop.x,.15,.002);assert.equal(moved.x,crop.x);assert.equal(moved.w,crop.w);
 await page.getByRole('button',{name:'실행 취소',exact:true}).click();assert.deepEqual(await page.evaluate(()=>window.editor.getDesign().items[0].crop),crop.crop,'one undo restores the whole pan gesture');
 for(const [rot,fx,fy]of [[37,true,false],[-65,false,true],[90,true,true]]){
  await page.evaluate(value=>window.editor.setDesign({bg:'paper',items:[value]}),{...original,rot,fx,fy});
  await photo.dblclick();await source.waitFor();const width=await source.evaluate(n=>n.offsetWidth),a=rot*Math.PI/180,local=-width*.2*(fx?-1:1);
  await dragHandle('e',local*Math.cos(a),local*Math.sin(a));await page.locator('[data-crop-apply]').click();
  const actual=await page.evaluate(()=>window.editor.getDesign().items[0]),expected=cropImage({...original,rot,fx,fy},{x:0,y:0,w:.8,h:1});
  for(const key of ['x','y','w','h'])near(actual[key],expected[key],.2);near(actual.crop.w,.8,.003);
 }
 await page.evaluate(value=>window.editor.setDesign({bg:'paper',items:[value]}),{...original,lock:true});await photo.dblclick();assert.equal(await source.count(),0,'locked photo cannot crop');
 await page.evaluate(value=>window.editor.setDesign({bg:'paper',items:[value]}),crop);await page.setViewportSize({width:390,height:844});await photo.click();await page.getByRole('button',{name:'이미지 자르기',exact:true}).click();await source.waitFor();
 await page.screenshot({path:resolve(root,'work/image-crop-inplace-mobile.png'),fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.getByRole('button',{name:'자르기 취소',exact:true}).click();assert.deepEqual(await page.evaluate(()=>window.editor.getDesign().items[0].crop),crop.crop);
 assert.deepEqual(errors,[]);
});
