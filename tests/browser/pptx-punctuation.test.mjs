// Self-authored punctuation fixture. No teacher content or font binaries.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve,extname,sep} from 'node:path';

test('Office punctuation keeps the last stop on the line in DOM and image export, editing and device reopen',
 {skip:!process.env.MINICAN_PLAYWRIGHT_PATH,timeout:60000},async t=>{
 const hosted=!!process.env.MINICAN_HOST_ROOT,root=resolve(process.env.MINICAN_HOST_ROOT||fileURLToPath(new URL('../../',import.meta.url))),base=hosted?'/minican':'';
 const html=`<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="${base}/src/editor.css"><style>body{margin:0;font-family:Arial}#preview{width:1000px}#editor{height:740px}</style><main id="preview"></main><main id="editor"></main>`;
 const server=createServer(async(req,res)=>{try{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname==='/fixture.html'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html);}
  const file=resolve(root,'.'+decodeURIComponent(pathname));if(!file.startsWith(root+sep)){res.writeHead(403);return res.end();}
  res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json','.woff2':'font/woff2'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));
 }catch{res.writeHead(404);res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const {chromium}=await import(pathToFileURL(process.env.MINICAN_PLAYWRIGHT_PATH).href),browser=await chromium.launch({channel:process.env.MINICAN_BROWSER||'msedge',headless:true});t.after(()=>browser.close());
 const page=await browser.newPage({viewport:{width:1400,height:1500},reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));t.after(()=>assert.deepEqual(errors,[]));
 await page.goto(`http://127.0.0.1:${server.address().port}/fixture.html`);
 const prepared=await page.evaluate(async base=>{
  const model=await import(base+'/src/model.js'),{designView}=await import(base+'/src/render.js'),{createEditor}=await import(base+'/src/editor.js');
  model.configure({aspect:16/9,fonts:[{id:'fixture',name:'검증 글꼴',family:'Arial'}]});
  const text='Classroom punctuation test!',ctx=document.createElement('canvas').getContext('2d');ctx.font='32px Arial';
  const whole=ctx.measureText(text).width,core=ctx.measureText(text.slice(0,-1)).width,width=(whole+core)/2;
  const source={kind:'pptx',sourceDocumentId:'spunctuation20261018',pageNumber:1,objectId:'2'};
  const ordinary={id:'eordinary20261018',t:'text',text,font:'fixture',x:50,y:60,w:width/10,size:3.2,align:'c',color:'#111111'};
  const imported={...ordinary,id:'edefault20261018',source,y:12,h:12,lh:1.25,valign:'middle',typeface:'Arial'};
  const items=[imported,{...imported,id:'etrue20261018',y:28,hangingPunct:true},{...imported,id:'efalse20261018',y:44,hangingPunct:false},ordinary,{...imported,id:'emulti20261018',text:'First paragraph!\n\nLast paragraph.',y:82,h:30,w:70},{...imported,id:'enowrap20261018',text,y:98,nowrap:true}];
  window.punctuationFixture=model.cleanDesign({id:'ppunctuation20261018',bg:'#ffffff',items},{keepSpaces:true});
  document.querySelector('#preview').replaceChildren(designView(window.punctuationFixture));
  window.punctuationEditor=createEditor({design:{...window.punctuationFixture,items:[window.punctuationFixture.items[0]]}});window.punctuationEditor.mount(document.querySelector('#editor'));
  await document.fonts.ready;
  window.punctuationMeasure=node=>{
   const walker=document.createTreeWalker(node,NodeFilter.SHOW_TEXT),ys=[];let text;
   while(text=walker.nextNode()){const range=document.createRange();range.selectNodeContents(text);for(const r of range.getClientRects())if(r.width>.1&&r.height>.1)ys.push(Math.round(r.y*10)/10);}
   return {text:node.textContent,lines:[...new Set(ys)].length,width:parseFloat(getComputedStyle(node).width),size:parseFloat(getComputedStyle(node).fontSize),hangs:node.querySelectorAll('.fi-text-hang').length};
  };
  return {whole,core,width,items:window.punctuationFixture.items};
 },base);
 assert.ok(prepared.core<prepared.width&&prepared.width<prepared.whole,'only the final punctuation exceeds the authored frame');
 const measure=()=>page.locator('#preview .fi-text').evaluateAll(nodes=>nodes.map(window.punctuationMeasure));
 const shown=await measure();assert.deepEqual(shown.map(s=>s.lines),[1,1,2,2,2,1]);
 assert.deepEqual(shown.map(s=>s.hangs),[1,1,0,0,2,0]);
 for(let i=0;i<shown.length;i++){assert.equal(shown[i].text,prepared.items[i].text);assert.equal(shown[i].size,32);}
 assert.ok(Math.abs(shown[0].width-prepared.width)<.02);
 const raster=await page.evaluate(async base=>{
  const {designSheet}=await import(base+'/src/export.js'),bands=[];
  for(const index of [0,2]){
   const result=await designSheet(window.punctuationFixture,[{items:[index],bg:false,box:{x:0,y:0,w:1000,h:563},at:{x:0,y:0}}],{width:1000,height:563,sheetWidth:1000,sheetHeight:563});
   const data=result.canvas.getContext('2d').getImageData(0,0,1000,563).data,rows=[];
   for(let y=0;y<563;y++){let ink=false;for(let x=0;x<1000;x++)if(data[(y*1000+x)*4+3]>0){ink=true;break;}if(ink)rows.push(y);}
   bands.push(rows.filter((y,i)=>!i||y>rows[i-1]+3).length);
  }
  return bands;
 },base);
 assert.deepEqual(raster,[1,2],'PNG renderer follows the same punctuation fitting without shrinking the font');
 const decorations=await page.evaluate(async base=>{
  const {cleanDesign}=await import(base+'/src/model.js'),{designSheet}=await import(base+'/src/export.js');
  const width=1000,height=563,text='AB!',ctx=document.createElement('canvas').getContext('2d'),results=[];
  for(const style of [{size:3.2,color:'#111111'},{size:2.4,color:'#2351ab'}]){
  ctx.font=`${style.size*10}px Arial`;
  const authored={...window.punctuationFixture.items[0],...style,text,x:50,y:50,w:6,h:20,valign:'top',align:'l',under:true};
  const original=JSON.stringify(authored),frameLeft=width*(authored.x-authored.w/2)/100;
  const coreRight=frameLeft+ctx.measureText(text.slice(0,-1)).width;
  const roi={x:Math.floor(frameLeft),y:Math.floor(height*(authored.y-authored.h/2)/100),w:Math.ceil(ctx.measureText(text).width)+2,h:64};
  const render=async patch=>{
   const design=cleanDesign({bg:'#ffffff',items:[{...authored,...patch}]},{keepSpaces:true});
   const result=await designSheet(design,[{items:[0],bg:false,box:{x:0,y:0,w:width,h:height},at:{x:0,y:0}}],{width,height,sheetWidth:width,sheetHeight:height});
   return result.canvas.getContext('2d').getImageData(roi.x,roi.y,roi.w,roi.h).data;
  };
  const control=await render({hangingPunct:false}),actual=await render({hangingPunct:true}),plain=await render({hangingPunct:true,under:false});
  let changedPixelsAwayFromJoin=0,changedJoinPixels=0,punctuationUnderlinePixels=0,missingPunctuationUnderlinePixels=0;
  for(let offset=0;offset<control.length;offset+=4){
   const x=roi.x+(offset/4)%roi.w;
   if(control.slice(offset,offset+4).some((value,channel)=>value!==actual[offset+channel])){
    // Separate decoration fragments antialias their shared edge. Only that
    // one column may differ; the glyphs and both underline interiors must match.
    if(x===Math.floor(coreRight))changedJoinPixels++;else changedPixelsAwayFromJoin++;
   }
   if(x>=Math.ceil(coreRight)&&control[offset+3]>128&&plain[offset+3]===0){
    punctuationUnderlinePixels++;
    if(actual[offset+3]!==control[offset+3])missingPunctuationUnderlinePixels++;
   }
  }
  results.push({fontSize:style.size*10,color:style.color,changedPixelsAwayFromJoin,changedJoinPixels,punctuationUnderlinePixels,missingPunctuationUnderlinePixels,inputUnchanged:JSON.stringify(authored)===original});
  }
  return results;
 },base);
 for(const decoration of decorations){
 assert.ok(decoration.punctuationUnderlinePixels>=8,'the final punctuation has actual underline pixels, beyond CSS declarations');
 assert.equal(decoration.missingPunctuationUnderlinePixels,0,'hanging punctuation keeps its underline in exported image pixels');
 assert.equal(decoration.changedPixelsAwayFromJoin,0,`glyph and underline interior pixels match without duplicate painting: ${JSON.stringify(decoration)}`);
 assert.ok(decoration.changedJoinPixels<=4,'only one antialiased underline join column may differ');
 assert.equal(decoration.inputUnchanged,true,'decoration rendering keeps the authored text, font and frame unchanged');
 }
 const item=page.locator('#editor .fe-card > .fi-text');await item.dblclick();
 assert.equal(await item.locator('.fi-text-flow').count(),0,'editing starts with plain text so IME/caret never enters a zero-width span');
 assert.equal(await item.textContent(),prepared.items[0].text);
 await page.keyboard.press('Control+End');await page.keyboard.insertText(' 한글');
 await item.evaluate(node=>{
  node.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true,data:''}));
  node.dispatchEvent(new CompositionEvent('compositionupdate',{bubbles:true,data:'검증'}));
  node.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'검증'}));
 });
 assert.equal(await item.locator('.fi-text-flow').count(),0,'composition events do not trigger a decorative rerender');
 await page.keyboard.press('Escape');
 assert.equal(await page.evaluate(()=>window.punctuationEditor.getDesign().items[0].text),prepared.items[0].text+' 한글');
 await item.dblclick();await page.keyboard.press('Control+End');await page.keyboard.press('Backspace');await page.keyboard.press('Backspace');await page.keyboard.press('Backspace');await page.keyboard.press('Escape');
 assert.equal(await page.evaluate(()=>window.punctuationEditor.getDesign().items[0].text),prepared.items[0].text);
 assert.equal(await item.locator('.fi-text-hang').count(),1,'endEdit reconstructs the punctuation rendering');
 const stored=await page.evaluate(async base=>{
  const store=await import(base+'/app/store.js'),{migrateRecord}=await import(base+'/app/designs.js');store.setStorageName('self-authored-punctuation');
  const record=migrateRecord({id:'dpunctuation20261018',name:'문장부호 직접 만든 표본',size:{width:1000,height:562.5,unit:'px'},slides:[window.punctuationFixture]});await store.putDesign(record);return store.getDesign(record.id);
 },base);
 await page.reload();const reopened=await page.evaluate(async base=>{
  const store=await import(base+'/app/store.js'),model=await import(base+'/src/model.js'),{designView}=await import(base+'/src/render.js');store.setStorageName('self-authored-punctuation');model.configure({aspect:16/9,fonts:[{id:'fixture',name:'검증 글꼴',family:'Arial'}]});
  const record=await store.getDesign('dpunctuation20261018');document.querySelector('#preview').replaceChildren(designView(record.slides[0]));return record;
 },base);
 assert.deepEqual(reopened,stored);assert.equal(reopened.slides[0].items[2].hangingPunct,false);
 assert.equal(await page.locator('#preview .fi-text').nth(0).locator('.fi-text-hang').count(),1);
 assert.equal(await page.locator('#preview .fi-text').nth(2).locator('.fi-text-hang').count(),0);
 });
