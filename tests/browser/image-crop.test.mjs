import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve,extname,sep} from 'node:path';
const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const html=`<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/src/editor.css"><body><main id="editor" style="max-width:1100px;margin:auto"></main><script type="module">
import {createEditor} from '/src/editor.js';import {configure} from '/src/model.js';import {newRecord} from '/app/designs.js';import {getDesign,putDesign,setStorageName} from '/app/store.js';
setStorageName('crop-browser-fixture');configure({aspect:1});let record=await getDesign('dcropbrowser001');if(!record){record=newRecord('1:1');record.id='dcropbrowser001';const c=document.createElement('canvas');c.width=200;c.height=100;const x=c.getContext('2d');x.fillStyle='#ef0000';x.fillRect(0,0,50,100);x.fillStyle='#00cc00';x.fillRect(50,0,100,100);x.fillStyle='#0000ef';x.fillRect(150,0,50,100);record.slides[0].items=[{id:'ecropbrowser001',t:'image',url:c.toDataURL(),x:50,y:50,w:60,h:30,rot:0,mask:'none'}];await putDesign(record);}window.originalUrl=record.slides[0].items[0].url;
window.editor=createEditor({design:record.slides[0],onChange:()=>{record.slides[0]=window.editor.getDesign();window.saved=putDesign(record);}});window.editor.mount(document.querySelector('main'));window.ready=true;
</script>`;
test('image crop UI applies once, cancels, undoes/redoes, reopens and exports matching PNG/native PPTX', {skip:!process.env.MINICAN_PLAYWRIGHT_PATH,timeout:60000},async t=>{
 const server=createServer(async(req,res)=>{try{const p=new URL(req.url,'http://localhost').pathname;if(p==='/fixture.html'){res.setHeader('Content-Type','text/html');return res.end(html);}const file=resolve(root,'.'+decodeURIComponent(p));if(!file.startsWith(root+sep))throw Error();res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404);res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const {chromium}=await import(pathToFileURL(process.env.MINICAN_PLAYWRIGHT_PATH).href),browser=await chromium.launch({channel:'msedge',headless:true});t.after(()=>browser.close());
 const page=await browser.newPage({viewport:{width:1360,height:1000},reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/fixture.html`);await page.waitForFunction(()=>window.ready);
 await page.locator('.fe-card .fi-image').click();await page.getByRole('button',{name:'이미지 자르기',exact:true}).click();await page.locator('[data-image-crop]').waitFor();
 for(const [name,value]of [['가로','50'],['왼쪽','25']]){const input=page.getByRole('spinbutton',{name:`자르기 ${name} (%)`,exact:true});await input.fill(value);await input.press('Tab');}
 await page.locator('[data-crop-apply]').click();
 let crop=await page.evaluate(()=>window.editor.getDesign().items[0]);assert.deepEqual(crop.crop,{x:.25,y:0,w:.5,h:1});assert.equal(crop.w,30);assert.equal(crop.url,await page.evaluate(()=>window.originalUrl));
 await page.getByRole('button',{name:'실행 취소',exact:true}).click();assert.equal(await page.evaluate(()=>window.editor.getDesign().items[0].crop),undefined);
 await page.getByRole('button',{name:'다시 실행',exact:true}).click();assert.deepEqual(await page.evaluate(()=>window.editor.getDesign().items[0].crop),crop.crop);await page.locator('.fe-card .fi-image').click();
 await page.getByRole('button',{name:'이미지 자르기',exact:true}).click();await page.locator('[data-image-crop]').waitFor();await page.getByRole('button',{name:'원본 전체',exact:true}).click();await page.getByRole('spinbutton',{name:'자르기 가로 (%)',exact:true}).press('Escape');assert.deepEqual(await page.evaluate(()=>window.editor.getDesign().items[0].crop),crop.crop);
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
 await page.locator('.fe-card .fi-image').click();await page.getByRole('button',{name:'이미지 자르기',exact:true}).click();await page.locator('[data-image-crop]').waitFor();
 const preview=page.locator('[data-image-crop]'),box=await preview.boundingBox(),handle=preview.locator('[data-corner=se]');const h=await handle.boundingBox();await page.mouse.move(h.x+h.width/2,h.y+h.height/2);await page.mouse.down();await page.mouse.move(h.x+h.width/2-box.width*.1,h.y+h.height/2-box.height*.1,{steps:5});await page.mouse.up();assert.ok(Number(await page.getByRole('spinbutton',{name:'자르기 가로 (%)',exact:true}).inputValue())<50);
 await mkdir(resolve(root,'work'),{recursive:true});await page.screenshot({path:resolve(root,'work/image-crop-desktop.png'),fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:resolve(root,'work/image-crop-mobile.png'),fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 assert.deepEqual(errors,[]);
});
