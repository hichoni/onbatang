import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve,extname,sep} from 'node:path';

test('download choices wait for confirmation and remain usable on short and narrow screens',
 {skip:!process.env.MINICAN_PLAYWRIGHT_PATH,timeout:60000},async t=>{
  const hosted=!!process.env.MINICAN_HOST_ROOT;
  const root=resolve(process.env.MINICAN_HOST_ROOT||fileURLToPath(new URL('../../',import.meta.url))),base=hosted?'/minican':'';
  const server=createServer(async(req,res)=>{try{
    const pathname=new URL(req.url,'http://localhost').pathname;
    if(pathname==='/download-ui-fixture.html'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end('<!doctype html><body>Self-authored download UI fixture</body>');}
    const file=resolve(root,'.'+decodeURIComponent(pathname));if(!file.startsWith(root+sep)){res.writeHead(403);return res.end();}
    res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2','.png':'image/png'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));
  }catch{res.writeHead(404);res.end();}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const {chromium}=await import(pathToFileURL(process.env.MINICAN_PLAYWRIGHT_PATH).href);
  const browser=await chromium.launch({channel:process.env.MINICAN_BROWSER||'msedge',headless:true});t.after(()=>browser.close());
  const page=await browser.newPage({viewport:{width:1280,height:600}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
  const origin=`http://127.0.0.1:${server.address().port}`;
  await page.goto(origin+'/download-ui-fixture.html');
  const recordId=await page.evaluate(async base=>{
    const {newRecord}=await import(base+'/app/designs.js'),store=await import(base+'/app/store.js');
    store.setStorageName(base?'gailab-minican':'minican');
    const record=newRecord('16:9');record.name='내려받기 화면 검증';
    record.slides=['#ff5500','#0055ff'].map((bg,index)=>({id:`pdownloadui00${index}`,bg,items:[
      {id:`edownloadui00${index}`,t:'text',text:`Self-authored page ${index+1}`,x:50,y:50,w:70,size:5},
    ]}));
    await store.putDesign(record);(await import(base+'/app/tour.js')).markTourSeen('editor');return record.id;
  },base);
  await page.goto(origin+(hosted?'/minican-app.html':'/app/index.html'));
  await page.getByRole('button',{name:'내려받기 화면 검증 열기',exact:true}).click();await page.locator('.cv-name').waitFor();
  await page.evaluate(async base=>(await import(base+'/app/tour.js')).stopTour(),base);
  let downloadCount=0;page.on('download',()=>downloadCount++);
  const dialog=page.locator('.cv-down-ask'),save=page.locator('[data-download-save]');
  async function choose(selector){
    const target=page.locator(selector);await target.focus();await page.keyboard.press('Enter');
    assert.equal(await page.locator(selector).getAttribute('aria-pressed'),'true',`${selector} is selected`);
    assert.equal(await page.locator(selector).evaluate(node=>node===document.activeElement),true,`${selector} keeps keyboard focus after changing options`);
  }
  async function settleAnimations(){
    await page.evaluate(async()=>{
      const finite=document.getAnimations().filter(animation=>animation.effect?.getTiming().iterations!==Infinity);
      await Promise.all(finite.map(animation=>animation.finished.catch(()=>{})));
    });
  }
  async function layout(label){
    await settleAnimations();
    const value=await dialog.evaluate(node=>{
      const box=node.closest('.modal-panel').getBoundingClientRect(),footer=node.querySelector('.cv-down-footer').getBoundingClientRect();
      const body=node.querySelector('.cv-down-body'),button=node.querySelector('[data-download-save]').getBoundingClientRect();
      const summary=node.querySelector('.cv-down-summary').getBoundingClientRect(),front=document.elementFromPoint((summary.left+summary.right)/2,(summary.top+summary.bottom)/2);
      return {panel:{left:box.left,right:box.right,top:box.top,bottom:box.bottom},footer:{top:footer.top,bottom:footer.bottom},button:{top:button.top,bottom:button.bottom},body:{height:body.clientHeight,scroll:body.scrollHeight,overflow:getComputedStyle(body).overflowY},summaryInFront:!!front?.closest('.cv-down-footer'),width:innerWidth,height:innerHeight,documentWidth:document.documentElement.scrollWidth};
    });
    assert.ok(value.panel.left>=0&&value.panel.right<=value.width+1,`${label}: dialog fits horizontally`);
    assert.ok(value.panel.top>=0&&value.panel.bottom<=value.height+1,`${label}: dialog fits vertically`);
    assert.ok(value.footer.top>=0&&value.footer.bottom<=value.height+1,`${label}: footer stays in the viewport`);
    assert.ok(value.button.top>=0&&value.button.bottom<=value.height+1,`${label}: final download button remains visible`);
    assert.ok(value.documentWidth<=value.width+1,`${label}: no page-wide horizontal overflow`);
    assert.equal(value.summaryInFront,true,`${label}: background notifications never cover the selection summary`);
    assert.ok(value.body.height>0,`${label}: options have usable vertical space`);
    if(value.body.scroll>value.body.height+1)assert.match(value.body.overflow,/auto|scroll/,`${label}: overflowing options can scroll`);
    return value;
  }
  async function capture(name,{fromTop=true}={}){
    if(!process.env.DOWNLOAD_UI_SCREENSHOT_DIR)return;
    const directory=resolve(process.env.DOWNLOAD_UI_SCREENSHOT_DIR);await mkdir(directory,{recursive:true});
    if(fromTop)await dialog.locator('.cv-down-body').evaluate(node=>{node.scrollTop=0;});
    await settleAnimations();
    await page.screenshot({path:resolve(directory,name+'.png')});
  }
  async function readDownload(){
    const waiting=page.waitForEvent('download');await save.click();const download=await waiting;
    const stream=await download.createReadStream(),chunks=[];for await(const chunk of stream)chunks.push(chunk);
    return {name:download.suggestedFilename(),bytes:Buffer.concat(chunks)};
  }
  async function bitmap(bytes,mime){
    return page.evaluate(async({encoded,mime})=>{
      const raw=atob(encoded),data=Uint8Array.from(raw,char=>char.charCodeAt(0));
      const image=await createImageBitmap(new Blob([data],{type:mime})),canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
      const context=canvas.getContext('2d');context.drawImage(image,0,0);image.close();
      return {width:canvas.width,height:canvas.height,pixel:[...context.getImageData(4,4,1,1).data]};
    },{encoded:bytes.toString('base64'),mime});
  }
  await page.locator('.cv-down-btn').click();await dialog.waitFor();
  assert.equal(await page.locator('.download-panel').getAttribute('role'),'dialog');
  assert.equal(await page.locator('.download-panel').getAttribute('aria-modal'),'true');
  assert.equal(await page.locator('#app').evaluate(node=>node.inert),true,'background editor is inactive while choosing an export');
  await save.focus();await page.keyboard.press('Tab');
  assert.equal(await page.locator('.download-panel .modal-close').evaluate(node=>node===document.activeElement),true,'Tab wraps inside the dialog');
  await page.keyboard.press('Shift+Tab');assert.equal(await save.evaluate(node=>node===document.activeElement),true,'Shift+Tab also stays inside the dialog');
  await choose('[data-type=png]');await choose('[data-scope=one]');await choose('[data-size=small]');
  await layout('short desktop PNG');await capture('download-short-desktop');
  assert.equal(downloadCount,0,'choosing format, scope and size must not create a file');
  assert.equal(await dialog.isVisible(),true,'choosing size keeps the dialog open for review');
  const png=await readDownload();assert.match(png.name,/\.png$/);assert.deepEqual([...png.bytes.subarray(0,8)],[137,80,78,71,13,10,26,10]);
  const pngImage=await bitmap(png.bytes,'image/png');assert.equal(pngImage.width,1080);assert.equal(pngImage.height,608);assert.deepEqual(pngImage.pixel,[255,85,0,255]);
  await page.locator('.cv-down-btn').click();await choose('[data-type=pptx]');await choose('[data-pptx=image]');await choose('[data-scope=all]');
  assert.equal(await save.getAttribute('data-pptx-save')!==null,true,'PPTX uses the same final action');
  await layout('short desktop PPTX');await capture('download-pptx-desktop');
  assert.equal(downloadCount,1,'PPTX mode and scope changes only select options');
  const video=page.locator('[data-type=video]');
  if(await video.isEnabled()){
    await choose('[data-type=video]');await choose('[data-size=hd]');
    assert.equal(await page.locator('.cv-film').count(),0,'selecting video does not start a recording');
    assert.equal(downloadCount,1);await layout('short desktop video');
  }
  await page.keyboard.press('Escape');assert.equal(await dialog.count(),0);assert.equal(downloadCount,1,'closing options never downloads');
  assert.equal(await page.locator('#app').evaluate(node=>node.inert),false,'Escape restores the background editor');
  assert.equal(await page.locator('.cv-down-btn').evaluate(node=>node===document.activeElement),true,'Escape returns focus to the download button');
  assert.equal(await page.locator('.cv-name').inputValue(),'내려받기 화면 검증','cancel leaves the editor and its document intact');
  await page.setViewportSize({width:390,height:700});await page.locator('.cv-down-btn').click();
  await choose('[data-type=png]');await layout('narrow phone PNG');await capture('download-png-phone');
  await choose('[data-type=pptx]');await choose('[data-pptx=editable]');await layout('narrow phone PPTX');await capture('download-pptx-phone');
  if(await video.isEnabled()){
    await choose('[data-type=video]');await layout('narrow phone video');await capture('download-video-phone');
    assert.equal(await page.locator('.cv-film').count(),0,'mobile video selection also waits for confirmation');
  }
  await choose('[data-type=jpg]');await choose('[data-scope=all]');await choose('[data-size=small]');
  const narrow=await layout('narrow phone JPG');
  assert.ok(narrow.body.scroll>narrow.body.height,'on a narrow screen the choices scroll inside the dialog');
  await dialog.locator('.cv-down-body').evaluate(node=>{node.scrollTop=node.scrollHeight;});
  await layout('narrow phone JPG after scrolling');await capture('download-phone',{fromTop:false});
  assert.equal(downloadCount,1,'narrow-screen choices still require confirmation');
  const jpgZip=await readDownload();assert.match(jpgZip.name,/\.zip$/);assert.equal(jpgZip.bytes.readUInt32LE(0),0x04034b50);
  const files=[];let offset=0;
  while(jpgZip.bytes.readUInt32LE(offset)===0x04034b50){
    const length=jpgZip.bytes.readUInt32LE(offset+18),nameLength=jpgZip.bytes.readUInt16LE(offset+26),extra=jpgZip.bytes.readUInt16LE(offset+28),name=jpgZip.bytes.toString('utf8',offset+30,offset+30+nameLength),start=offset+30+nameLength+extra;
    files.push({name,bytes:jpgZip.bytes.subarray(start,start+length)});offset=start+length;
  }
  assert.equal(files.length,2,'all slides remain one ZIP with the complete deck');
  for(const [index,file] of files.entries()){
    assert.match(file.name,/\.jpg$/);assert.deepEqual([...file.bytes.subarray(0,2)],[255,216]);
    const image=await bitmap(file.bytes,'image/jpeg');assert.equal(image.width,1080);assert.equal(image.height,608);
    const expected=index===0?[255,85,0]:[0,85,255];
    for(let channel=0;channel<3;channel++)assert.ok(Math.abs(image.pixel[channel]-expected[channel])<=3,`slide ${index+1} keeps its color and deck order`);
  }
  assert.equal(downloadCount,2,'each confirmation produces exactly one download');
  const saved=await page.evaluate(async({base,recordId})=>(await import(base+'/app/store.js')).getDesign(recordId),{base,recordId});
  assert.equal(saved.name,'내려받기 화면 검증');assert.equal(saved.slides.length,2);assert.deepEqual(saved.slides.map(slide=>slide.items[0].text),['Self-authored page 1','Self-authored page 2']);
  assert.deepEqual(errors,[]);
 });
