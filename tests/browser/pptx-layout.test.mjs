// Self-authored layout fixture. Run on source, then MINICAN_HOST_ROOT=<g-ai-lab/dist>.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve,extname,sep} from 'node:path';
// 공용 첫 쪽은 새로 고치면 꾸미던 그림을 다시 연다(v0.42). 목록에서 다시 여는 것을 보려고 그때는 내 그림으로 나간다.
const reloadToList=async page=>{await page.reload();await page.waitForFunction(()=>!document.getElementById('onba-splash'));if(await page.evaluate(()=>document.body.classList.contains('cv-editing'))){await page.locator('.cv-back').click();await page.locator('.cv-home-title').waitFor();}};

const provenance=objectId=>({kind:'pptx',sourceDocumentId:'slayout20261018',pageNumber:1,objectId:String(objectId)});
const record={
 id:'dpptxlayout20261018',schemaVersion:1,revision:0,name:'PPT 레이아웃 직접 만든 표본',ratio:'4:3',updatedAt:1792252800000,
 size:{width:1000,height:750,unit:'px'},originalSize:{width:9525000,height:7143750,unit:'emu'},
 source:{kind:'pptx',sourceDocumentId:'slayout20261018',filename:'self-authored-layout.pptx'},assets:[],uploads:[],
 slides:[{id:'playout20261018',bg:'paper',source:{kind:'pptx',sourceDocumentId:'slayout20261018',pageNumber:1},items:[
  {id:'esmalllabel20261018',t:'text',text:'12 pt',x:12,y:12,w:3.4,h:2.4,size:1.2,lh:1,valign:'middle',nowrap:true,typeface:'Arial',align:'c',source:provenance(2)},
  {id:'emultiline20261018',t:'text',text:'Centered line one\nShort line two',x:50,y:35,w:54,h:26,size:3.2,lh:1.5,valign:'middle',nowrap:true,typeface:'Arial',align:'c',source:provenance(3)},
  {id:'etoptext20261018',t:'text',text:'Top line\nSecond line',x:25,y:72,w:30,h:16,size:1.6,lh:1.25,valign:'top',typeface:'Arial',align:'l',source:provenance(4)},
  {id:'enowrap20261018',t:'text',text:'Keep this phrase on one line',x:70,y:70,w:8,h:5,size:1.6,lh:1.2,valign:'middle',nowrap:true,typeface:'Arial',align:'l',source:provenance(5)},
  {id:'ehorizontal20261018',t:'shape',shape:'rect',x:50,y:55,w:80,h:0.18,color:'#285bd8',source:provenance(6)},
  {id:'evertical20261018',t:'shape',shape:'rect',x:7,y:45,w:0.12,h:42,color:'#285bd8',source:provenance(7)},
  {id:'etinyshape20261018',t:'shape',shape:'rect',x:92,y:12,w:0.45,h:0.4,line:0.04,lc:'#285bd8',color:'#ffffff',source:provenance(8)},
 ]}]
};
const close=(actual,expected,tolerance,message)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${message}: ${actual} ≈ ${expected}`);

test('PPT source text geometry and thin shapes survive cleaning, actual DOM, device save and reopen',
 {skip:!process.env.MINICAN_PLAYWRIGHT_PATH,timeout:60000},async t=>{
 const hosted=!!process.env.MINICAN_HOST_ROOT,root=resolve(process.env.MINICAN_HOST_ROOT||fileURLToPath(new URL('../../',import.meta.url)));
 const base=hosted?'/minican':'',dbName=hosted?'gailab-minican':'minican';
 const server=createServer(async(req,res)=>{try{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname==='/seed.html'){res.setHeader('Content-Type','text/html');return res.end('<!doctype html><body>Self-authored PPT layout fixture</body>');}
  const file=resolve(root,'.'+decodeURIComponent(pathname));if(!file.startsWith(root+sep)){res.writeHead(403);return res.end();}
  res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2','.png':'image/png'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));
 }catch{res.writeHead(404);res.end();}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const {chromium}=await import(pathToFileURL(process.env.MINICAN_PLAYWRIGHT_PATH).href),browser=await chromium.launch({channel:process.env.MINICAN_BROWSER||'msedge',headless:true});t.after(()=>browser.close());
 const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),errors=[];page.on('pageerror',error=>errors.push(error.message));
 const origin=`http://127.0.0.1:${server.address().port}`;await page.goto(origin+'/seed.html');
 const cleaned=await page.evaluate(async({base,dbName,record})=>{
  const model=await import(base+'/src/model.js'),{migrateRecord}=await import(base+'/app/designs.js'),store=await import(base+'/app/store.js');
  model.configure({aspect:4/3});const first=model.cleanDesign(record.slides[0]),second=model.cleanDesign(first),migrated=migrateRecord({...record,slides:[second]});
  store.setStorageName(dbName);await store.putDesign(migrated);{const tour=await import(base+'/app/tour.js');tour.markTourSeen('editor');tour.markTourSeen(tour.NEWS_KEY);}
  return {first,second,migrated,stored:await store.getDesign(record.id)};
 },{base,dbName,record});
 assert.deepEqual(cleaned.first,cleaned.second,'repeated sanitizer is stable');assert.deepEqual(cleaned.stored,cleaned.migrated);
 const fields=['id','source','text','x','y','w','h','size','lh','valign','nowrap','typeface','align','shape','line'];
 const layout=items=>items.map(item=>Object.fromEntries(fields.filter(key=>Object.hasOwn(item,key)).map(key=>[key,item[key]])));
 assert.deepEqual(layout(cleaned.stored.slides[0].items),layout(record.slides[0].items),'small imported dimensions and typography remain exact through cleaning and storage');
 const url=origin+(hosted?'/minican-app.html':'/app/index.html');await page.goto(url);
 await page.getByRole('button',{name:record.name+' 열기',exact:true}).click();await page.locator('.cv-name').waitFor();
 await page.evaluate(async base=>(await import(base+'/app/tour.js')).stopTour(),base);await page.evaluate(()=>document.fonts.ready);

 const measure=()=>page.locator('.cv-canvas .fe-card').first().evaluate(card=>{
  const bounds=node=>{const r=node.getBoundingClientRect();return {left:r.left,top:r.top,width:r.width,height:r.height};};
  return {card:bounds(card),width:parseFloat(getComputedStyle(card).width),items:[...card.querySelectorAll(':scope > .fi')].map(node=>{
   const style=getComputedStyle(node),range=document.createRange();range.selectNodeContents(node);
   const lines=[...range.getClientRects()].filter(rect=>rect.width>.5&&rect.height>.5).map(rect=>({left:rect.left,top:rect.top,width:rect.width,height:rect.height}));
   return {bounds:bounds(node),fontSize:parseFloat(style.fontSize),lineHeight:parseFloat(style.lineHeight),fontFamily:style.fontFamily,fontWeight:style.fontWeight,textAlign:style.textAlign,whiteSpace:style.whiteSpace,justifyContent:style.justifyContent,lines,scrollWidth:node.scrollWidth};
  })};
 });
 function checkGeometry(actual){
  close(actual.card.width/actual.card.height,4/3,.001,'original 4:3 canvas');assert.equal(actual.items.length,record.slides[0].items.length);
  for(const [index,item]of record.slides[0].items.entries()){
   const shown=actual.items[index],box=shown.bounds;
   close(box.width/actual.card.width*100,item.w,.06,`${item.id} width`);close(box.height/actual.card.height*100,item.h,.06,`${item.id} fixed height`);
   close((box.left+box.width/2-actual.card.left)/actual.card.width*100,item.x,.04,`${item.id} center x`);
   close((box.top+box.height/2-actual.card.top)/actual.card.height*100,item.y,.04,`${item.id} center y`);
   if(item.t==='text'){
    close(shown.fontSize,actual.width*item.size/100,.05,`${item.id} font size`);close(shown.lineHeight,shown.fontSize*item.lh,.05,`${item.id} line height`);
    assert.match(shown.fontFamily,/^Arial(?:,|$)/);assert.equal(shown.fontWeight,'400','non-bold PPT text does not inherit the editor medium weight');
    assert.equal(shown.textAlign,item.align==='c'?'center':'left');assert.equal(shown.justifyContent,item.valign==='middle'?'center':'flex-start');
    assert.equal(shown.whiteSpace,item.nowrap?'pre':'pre-wrap');
   }
  }
  const centered=actual.items[1];assert.equal(centered.lines.length,2,'authored newline produces exactly two lines');
  for(const line of centered.lines)close(line.left+line.width/2,centered.bounds.left+centered.bounds.width/2,1,'each text line is horizontally centered');
  close(centered.lines[1].top-centered.lines[0].top,centered.lineHeight,1,'actual line baseline spacing follows lh');
  const textTop=Math.min(...centered.lines.map(line=>line.top)),textBottom=Math.max(...centered.lines.map(line=>line.top+line.height));
  close((textTop+textBottom)/2,centered.bounds.top+centered.bounds.height/2,2,'two-line text block is vertically centered inside the fixed PPT box');
  const nowrap=actual.items[3];assert.equal(nowrap.lines.length,1,'narrow no-wrap box never creates an implicit second line');assert.ok(nowrap.lines[0].width>nowrap.bounds.width,'the test phrase exceeds its authored width');
 }
 const before=await measure();checkGeometry(before);
 // Force an immediate real editor save, without relying on the autosave debounce.
 await page.locator('.cv-name').fill('PPT 작은 요소 저장 뒤 재열기');
 const saved=await page.evaluate(async({base,id})=>(await import(base+'/app/app.js')).flushSavedDesign(id),{base,id:record.id});
 assert.equal(saved.name,'PPT 작은 요소 저장 뒤 재열기');assert.deepEqual(layout(saved.slides[0].items),layout(record.slides[0].items));
 assert.deepEqual(saved.originalSize,record.originalSize);assert.deepEqual(saved.source,record.source);assert.equal(saved.slides[0].id,record.slides[0].id);
 await reloadToList(page);await page.getByRole('button',{name:saved.name+' 열기',exact:true}).click();await page.locator('.cv-name').waitFor();
 await page.evaluate(async base=>(await import(base+'/app/tour.js')).stopTour(),base);await page.evaluate(()=>document.fonts.ready);
 const reopened=await page.evaluate(async({base,id})=>(await import(base+'/app/store.js')).getDesign(id),{base,id:record.id});
 assert.deepEqual(layout(reopened.slides[0].items),layout(record.slides[0].items));assert.equal(reopened.id,record.id);assert.equal(reopened.revision,saved.revision);
 const after=await measure();checkGeometry(after);
 for(let index=0;index<before.items.length;index++)for(const key of ['width','height'])close(after.items[index].bounds[key],before.items[index].bounds[key],.1,`reopened ${index} ${key}`);
 if(process.env.MINICAN_SCREENSHOT)await page.screenshot({path:process.env.MINICAN_SCREENSHOT,fullPage:true});
 assert.deepEqual(errors,[]);
});
