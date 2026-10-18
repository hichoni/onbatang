import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve,extname,sep} from 'node:path';

test('actual Edge exports editable objects and visible image slides without missing photos or input writes',
 {skip:!process.env.MINICAN_PLAYWRIGHT_PATH,timeout:60000},async t=>{
  const hosted=!!process.env.MINICAN_HOST_ROOT,root=resolve(process.env.MINICAN_HOST_ROOT||fileURLToPath(new URL('../../',import.meta.url))),base=hosted?'/minican':'';
  const server=createServer(async(req,res)=>{try{
    const pathname=new URL(req.url,'http://localhost').pathname;
    if(pathname==='/export-test.html'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(`<!doctype html><link rel="stylesheet" href="${base}/src/editor.css"><body style="font-family:Arial">Self-authored export fixture</body>`);}
    const file=resolve(root,'.'+decodeURIComponent(pathname));if(!file.startsWith(root+sep)){res.writeHead(403);return res.end();}
    res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2','.png':'image/png'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));
  }catch{res.writeHead(404);res.end();}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const {chromium}=await import(pathToFileURL(process.env.MINICAN_PLAYWRIGHT_PATH).href),browser=await chromium.launch({channel:process.env.MINICAN_BROWSER||'msedge',headless:true});t.after(()=>browser.close());
  const browserPage=await browser.newPage(),errors=[];browserPage.on('pageerror',error=>errors.push(error.message));
  const origin=`http://127.0.0.1:${server.address().port}`;await browserPage.goto(origin+'/export-test.html');
  const result=await browserPage.evaluate(async base=>{
    const {createPptx}=await import(base+'/app/pptx.js'),{configure}=await import(base+'/src/model.js');
    configure({aspect:16/9,maxItems:40,maxPhotos:10,maxText:120});
    const canvas=document.createElement('canvas');canvas.width=80;canvas.height=40;const ctx=canvas.getContext('2d');ctx.fillStyle='#ff0000';ctx.fillRect(0,0,40,40);ctx.fillStyle='#0000ff';ctx.fillRect(40,0,40,40);const url=canvas.toDataURL();
    const slides=[{id:'pexport001',bg:'#ffffff',items:[
      {id:'etext001',t:'text',text:'Editable text\nSecond line',x:50,y:15,w:80,size:4,typeface:'Arial',layout:'slide',align:'l'},
      {id:'eshape001',t:'shape',shape:'rect',x:25,y:55,w:20,h:20,color:'#00ff00'},
      {id:'ephoto001',t:'image',url,x:70,y:55,w:30,h:30,mask:'none'},
      {id:'estar001',t:'shape',shape:'star',x:50,y:85,w:20,h:20,color:'#ff0000'},
    ]}];
    const before=JSON.stringify(slides),editable=await createPptx({slides,size:{width:960,height:540,unit:'px'}}),image=await createPptx({slides,mode:'image',size:{width:960,height:540,unit:'px'}});
    function unzip(bytes){const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),entries={};let offset=0;while(view.getUint32(offset,true)===0x04034b50){const len=view.getUint32(offset+18,true),n=view.getUint16(offset+26,true),e=view.getUint16(offset+28,true),name=new TextDecoder().decode(bytes.slice(offset+30,offset+30+n)),start=offset+30+n+e;entries[name]=bytes.slice(start,start+len);offset=start+len;}return entries;}
    const editFiles=unzip(editable.bytes),imageFiles=unzip(image.bytes),xml=new TextDecoder().decode(editFiles['ppt/slides/slide1.xml']),doc=new DOMParser().parseFromString(xml,'application/xml');
    const ns='http://schemas.openxmlformats.org/presentationml/2006/main',a='http://schemas.openxmlformats.org/drawingml/2006/main';
    const textShape=[...doc.getElementsByTagNameNS(ns,'sp')].find(node=>node.getElementsByTagNameNS(ns,'cNvPr')[0]?.getAttribute('name')==='etext001');
    async function pixels(bytes){const blob=new Blob([bytes],{type:'image/png'}),image=await createImageBitmap(blob),canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const c=canvas.getContext('2d');c.drawImage(image,0,0);image.close();const rgba=c.getImageData(0,0,canvas.width,canvas.height).data;let red=0,blue=0,green=0,opaque=0,transparent=0;for(let i=0;i<rgba.length;i+=4){if(rgba[i+3]>200){opaque++;if(rgba[i]>200&&rgba[i+1]<70&&rgba[i+2]<70)red++;if(rgba[i+2]>200&&rgba[i]<70&&rgba[i+1]<70)blue++;if(rgba[i+1]>200&&rgba[i]<70&&rgba[i+2]<70)green++;}if(rgba[i+3]===0)transparent++;}return {width:canvas.width,height:canvas.height,red,blue,green,opaque,transparent};}
    const fallbackName=Object.keys(editFiles).filter(name=>name.startsWith('ppt/media/')).at(-1),wholeName=Object.keys(imageFiles).find(name=>name.startsWith('ppt/media/'));
    let failed;
    try{await createPptx({slides:[{bg:'paper',items:[{id:'emissing001',t:'image',url:'data:image/png;base64,bm90YXBpY3R1cmU=',x:50,y:50,w:30,h:30}]}],mode:'image'});}catch(error){failed=error.code;}
    return {inputUnchanged:before===JSON.stringify(slides),xmlValid:!doc.querySelector('parsererror'),nativeTexts:doc.getElementsByTagNameNS(ns,'txBody').length,nativeShapes:doc.getElementsByTagNameNS(ns,'sp').length,pictures:doc.getElementsByTagNameNS(ns,'pic').length,textHeight:Number(textShape.getElementsByTagNameNS(a,'ext')[0].getAttribute('cy')),warnings:editable.warnings,whole:await pixels(imageFiles[wholeName]),fallback:await pixels(editFiles[fallbackName]),failed};
  },base);
  assert.equal(result.inputUnchanged,true);assert.equal(result.xmlValid,true);assert.equal(result.nativeTexts,1);assert.equal(result.nativeShapes,2);assert.equal(result.pictures,2);
  assert.ok(result.textHeight>500000&&result.textHeight<1300000,`DOM-measured multiline height ${result.textHeight}`);
  assert.equal(result.warnings.some(warning=>warning.code==='TEXT_HEIGHT_APPROXIMATE'),false);
  assert.equal(result.warnings.filter(warning=>warning.code==='ELEMENT_RASTERIZED').length,1);
  assert.ok(result.whole.red>500&&result.whole.blue>500&&result.whole.green>500,'whole-slide PNG has every authored color');
  assert.ok(result.fallback.red>500&&result.fallback.transparent>100000,'individual fallback has its drawing and transparent surrounding pixels');
  assert.equal(result.failed,'IMAGE_UNAVAILABLE');assert.deepEqual(errors,[]);
  const recordId=await browserPage.evaluate(async base=>{
    const {newRecord}=await import(base+'/app/designs.js'),store=await import(base+'/app/store.js');
    store.setStorageName(base?'gailab-minican':'minican');
    const record=newRecord('16:9');record.name='자체 제작 PPTX 내려받기';
    record.slides=[1,2].map(number=>({id:`pdownload00${number}`,bg:'paper',items:[{id:`edownload00${number}`,t:'text',text:`Native page ${number}`,x:50,y:50,w:70,size:5}]}));
    await store.putDesign(record);(await import(base+'/app/tour.js')).markTourSeen('editor');return record.id;
  },base);
  await browserPage.goto(origin+(hosted?'/minican-app.html':'/app/index.html'));
  await browserPage.getByRole('button',{name:'자체 제작 PPTX 내려받기 열기',exact:true}).click();await browserPage.locator('.cv-name').waitFor();
  await browserPage.evaluate(async base=>(await import(base+'/app/tour.js')).stopTour(),base);
  await browserPage.locator('.cv-name').fill('저장 전 마지막 이름');
  let downloads=0;browserPage.on('download',()=>downloads++);
  async function downloadPptx(mode,scope){
    await browserPage.locator('.cv-down-btn').click();await browserPage.locator('[data-type=pptx]').click();await browserPage.locator(`[data-pptx=${mode}]`).click();await browserPage.locator(`[data-scope=${scope}]`).click();
    const waiting=browserPage.waitForEvent('download');await browserPage.locator('[data-pptx-save]').click();const download=await waiting;
    const stream=await download.createReadStream(),chunks=[];for await(const chunk of stream)chunks.push(chunk);const bytes=Buffer.concat(chunks),files=new Map();
    let offset=0;while(bytes.readUInt32LE(offset)===0x04034b50){const length=bytes.readUInt32LE(offset+18),nameLength=bytes.readUInt16LE(offset+26),extra=bytes.readUInt16LE(offset+28),name=bytes.toString('utf8',offset+30,offset+30+nameLength),start=offset+30+nameLength+extra;files.set(name,bytes.subarray(start,start+length));offset=start+length;}
    await browserPage.locator('.cv-pptx-export').getByRole('button',{name:'닫기',exact:true}).click();return {files,name:download.suggestedFilename()};
  }
  const allEditable=await downloadPptx('editable','all');assert.equal(allEditable.name,'저장 전 마지막 이름.pptx');
  const slidePaths=files=>[...files.keys()].filter(name=>/^ppt\/slides\/slide\d+\.xml$/.test(name));
  assert.equal(slidePaths(allEditable.files).length,2);assert.match(allEditable.files.get('ppt/slides/slide2.xml').toString(),/Native page 2/);
  const imageAll=await downloadPptx('image','all');assert.equal(slidePaths(imageAll.files).length,2);
  assert.match(imageAll.files.get('ppt/slides/slide1.xml').toString(),/<p:pic>/);assert.doesNotMatch(imageAll.files.get('ppt/slides/slide1.xml').toString(),/<p:txBody>/);
  const current=await downloadPptx('editable','one');assert.equal(slidePaths(current.files).length,1);
  const saved=await browserPage.evaluate(async({base,recordId})=>(await import(base+'/app/store.js')).getDesign(recordId),{base,recordId});
  assert.equal(saved.name,'저장 전 마지막 이름');assert.equal(saved.slides.length,2);
  await browserPage.evaluate(()=>{window.originalExportPut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){const request=window.originalExportPut.apply(this,args);if(this.name==='designs')this.transaction.abort();return request;};});
  await browserPage.locator('.cv-name').fill('저장 실패해도 남는 이름');
  await browserPage.locator('.cv-down-btn').click();await browserPage.locator('[data-type=pptx]').click();await browserPage.locator('[data-pptx-save]').click();
  await browserPage.locator('.cv-pptx-export [role=alert]').waitFor();assert.equal(downloads,3,'a failed editor save must not download an older draft');
  assert.equal(await browserPage.locator('.cv-name').inputValue(),'저장 실패해도 남는 이름');
  await browserPage.evaluate(()=>{IDBObjectStore.prototype.put=window.originalExportPut;delete window.originalExportPut;});
  assert.deepEqual(errors,[]);
});
