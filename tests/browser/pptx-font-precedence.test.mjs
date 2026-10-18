// Self-authored fixture with configured host fonts; no teacher material or font files.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve,extname,sep} from 'node:path';

const source={kind:'pptx',sourceDocumentId:'sfontfixture20261018',pageNumber:1,objectId:'2'};
const slide={id:'pfontfixture20261018',bg:'paper',source:{...source,objectId:undefined},items:[
 {id:'efontfixture20261018',t:'text',text:'Imported font sample',x:50,y:40,w:80,h:20,size:5,lh:1.2,valign:'middle',typeface:'Arial',font:'host',source},
]};
const options={skip:!process.env.MINICAN_PLAYWRIGHT_PATH,timeout:60000};

async function fixture(t){
 const hosted=!!process.env.MINICAN_HOST_ROOT,root=resolve(process.env.MINICAN_HOST_ROOT||fileURLToPath(new URL('../../',import.meta.url))),base=hosted?'/minican':'';
 const html=`<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="${base}/src/editor.css"><style>body{margin:0;font-family:sans-serif}#editor{height:680px}#preview{width:420px}#references{position:absolute;left:-2000px;font-size:30px}</style><div id="editor"></div><div id="preview"></div><div id="references"><span id="reference-source" style="font-family:Arial">Imported font sample</span><span id="reference-host" style="font-family:'Courier New'">Imported font sample</span><span id="reference-picked" style="font-family:'Times New Roman'">Imported font sample</span></div>`;
 const server=createServer(async(req,res)=>{try{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname==='/fixture.html'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html);}
  const file=resolve(root,'.'+decodeURIComponent(pathname));if(!file.startsWith(root+sep)){res.writeHead(403);return res.end();}
  res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json','.woff2':'font/woff2'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));
 }catch{res.writeHead(404);res.end();}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const {chromium}=await import(pathToFileURL(process.env.MINICAN_PLAYWRIGHT_PATH).href),browser=await chromium.launch({channel:process.env.MINICAN_BROWSER||'msedge',headless:true});t.after(()=>browser.close());
 const page=await browser.newPage({viewport:{width:1280,height:1000},reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));t.after(()=>assert.deepEqual(errors,[]));
 await page.goto(`http://127.0.0.1:${server.address().port}/fixture.html`);
 const mount=async design=>page.evaluate(async({base,design})=>{
  const {configure}=await import(base+'/src/model.js'),{createEditor}=await import(base+'/src/editor.js'),{designView}=await import(base+'/src/render.js');
  configure({aspect:4/3,maxText:120,fonts:[{id:'host',name:'앱 등록 글꼴',family:'Courier New'},{id:'picked',name:'다른 글꼴',family:'Times New Roman'}]});
  window.fixtureEditor?.destroy();window.notices=[];
  window.fixtureEditor=createEditor({design,notify:message=>window.notices.push(message)});window.fixtureEditor.mount(document.getElementById('editor'));
  document.getElementById('preview').replaceChildren(designView(design));await document.fonts.ready;
 },{base,design});
 const cdp=await page.context().newCDPSession(page);await cdp.send('DOM.enable');await cdp.send('CSS.enable');
 const platformFonts=async selector=>{
  const {root}=await cdp.send('DOM.getDocument'),{nodeId}=await cdp.send('DOM.querySelector',{nodeId:root.nodeId,selector});
  assert.ok(nodeId,`font inspection selector exists: ${selector}`);
  const {fonts}=await cdp.send('CSS.getPlatformFontsForNode',{nodeId});
  return [...new Set(fonts.filter(f=>f.glyphCount>0).map(f=>f.familyName))].sort();
 };
 return {page,base,mount,platformFonts,cdp};
}

test('PPT typeface wins over a registered host font; explicit font selection clears it and undo restores it',options,async t=>{
 const {page,base,mount,platformFonts}=await fixture(t);await mount(slide);
 const sourceFonts=await platformFonts('#reference-source'),hostFonts=await platformFonts('#reference-host');
 assert.ok(sourceFonts.length);assert.notDeepEqual(sourceFonts,hostFonts,'fixture must distinguish source and host fonts');
 for(const selector of ['#editor .fe-card > .fi-text','#preview .fe-card > .fi-text']){
  assert.match(await page.locator(selector).evaluate(n=>getComputedStyle(n).fontFamily),/^Arial(?:,|$)/);
  assert.deepEqual(await platformFonts(selector),sourceFonts,'the browser actually draws the source font, beyond CSS declarations');
 }
 await page.locator('#editor .fe-card > .fi-text').click();
 const picker=page.getByLabel('글꼴',{exact:true});assert.equal(await picker.inputValue(),'');
 assert.equal(await picker.locator('option:checked').innerText(),'Arial (원본 글꼴)');
 const original=await page.evaluate(()=>window.fixtureEditor.getDesign());
 await picker.selectOption('picked');
 const picked=await page.evaluate(()=>window.fixtureEditor.getDesign());
 assert.equal(picked.items[0].font,'picked');assert.equal(Object.hasOwn(picked.items[0],'typeface'),false);
 for(const key of ['id','source','x','y','w','h','size','lh','text'])assert.deepEqual(picked.items[0][key],original.items[0][key]);
 assert.deepEqual(await platformFonts('#editor .fe-card > .fi-text'),await platformFonts('#reference-picked'));
 await page.getByRole('button',{name:'실행 취소',exact:true}).click();
 assert.equal(await page.evaluate(()=>window.fixtureEditor.getDesign().items[0].typeface),'Arial');
 assert.deepEqual(await platformFonts('#editor .fe-card > .fi-text'),sourceFonts);
 // Choosing the default must also clear the source font even when it was already the stored fallback.
 await page.locator('#editor .fe-card > .fi-text').click();
 await picker.selectOption('gothic');
 assert.equal(Object.hasOwn(await page.evaluate(()=>window.fixtureEditor.getDesign().items[0]),'typeface'),false);
 await page.getByRole('button',{name:'실행 취소',exact:true}).click();
 const stored=await page.evaluate(async base=>{
  const store=await import(base+'/app/store.js');store.setStorageName('pptx-font-precedence');
  const record={id:'dfontfixture20261018',schemaVersion:1,revision:0,name:'직접 만든 글꼴 검증',size:{width:1000,height:750,unit:'px'},slides:[window.fixtureEditor.getDesign()],uploads:[],assets:[],updatedAt:1792252800000};
  await store.putDesign(record);return store.getDesign(record.id);
 },base);
 await page.reload();await mount(stored.slides[0]);
 const reopened=await page.evaluate(async base=>{const store=await import(base+'/app/store.js');store.setStorageName('pptx-font-precedence');return store.getDesign('dfontfixture20261018');},base);
 assert.deepEqual(reopened,stored);assert.equal(reopened.slides[0].items[0].typeface,'Arial');
 assert.deepEqual(await platformFonts('#editor .fe-card > .fi-text'),sourceFonts);
});

test('editing and pasting long imported slide text uses slide limits while ordinary text keeps 120 characters',options,async t=>{
 const {page,mount}=await fixture(t),text='직접 만든 긴 본문 '.repeat(35);
 await mount({...slide,items:[{...slide.items[0],font:'gothic',text,x:50,y:40,w:90,h:40,size:1.4}]});
 const item=page.locator('#editor .fe-card > .fi-text');await item.dblclick();
 await page.keyboard.press('Control+End');await page.keyboard.insertText(' 끝');await page.keyboard.press('Escape');
 assert.equal(await page.evaluate(()=>window.fixtureEditor.getDesign().items[0].text),text.trimEnd()+' 끝');
 assert.deepEqual(await page.evaluate(()=>window.notices),[],'valid imported text does not show a misleading 120-character warning');
 const pasted='직접 만든 붙여 넣기 본문 '.repeat(35).trim();
 const paste=async value=>{
  await item.click();await page.getByRole('button',{name:'글 고치기',exact:true}).click();
  await page.locator('#editor .fi-text[contenteditable]').evaluate((node,value)=>{const data=new DataTransfer();data.setData('text/plain',value);node.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data}));},value);
  await page.keyboard.press('Escape');
 };
 await paste(pasted);assert.equal(await page.evaluate(()=>window.fixtureEditor.getDesign().items[0].text),pasted);
 assert.deepEqual(await page.evaluate(()=>window.notices),[]);
 const before=await page.evaluate(()=>window.fixtureEditor.getDesign());await mount(before);
 assert.equal(await page.evaluate(()=>window.fixtureEditor.getDesign().items[0].text),pasted,'reopening the edited slide does not truncate it');
 await mount({bg:'paper',items:[{t:'text',text:'일반 글',font:'gothic',x:50,y:40,w:80,size:5}]});
 await paste('가'.repeat(200));assert.equal((await page.evaluate(()=>window.fixtureEditor.getDesign().items[0].text)).length,120);
});

test('installed PPT font aliases render native glyphs without downloads and unavailable local fonts fall back',options,async t=>{
 const {page,mount,platformFonts,cdp}=await fixture(t),requests=[];
 page.on('request',request=>{if(request.resourceType()==='font')requests.push(request.url());});
 const available=await page.evaluate(async()=>{try{await new FontFace('InstalledFontProbe','local("학교안심 이어달리기 L")').load();return true;}catch{return false;}});
 if(!available){t.skip('The optional teacher system font is not installed on this test device');return;}
 const design={...slide,items:[{...slide.items[0],text:'가나다라마바사 AaBbCc 123',typeface:'학교안심 이어달리기 L',bold:true}]};
 await mount(design);
 const native=await platformFonts('#editor .fe-card > .fi-text');
 assert.ok(native.some(name=>/Hakgyoansim Yieodalligi/i.test(name)),'local-only CSS alias resolves the installed source face');
 assert.deepEqual(requests,[],'installed fonts are never fetched or bundled');
 // DevTools disables local() access for this page, simulating a device without the font.
 await cdp.send('CSS.setLocalFontsEnabled',{enabled:false});await page.reload();await mount(design);
 const fallback=await platformFonts('#editor .fe-card > .fi-text');
 assert.ok(fallback.length,'missing source fonts still produce visible glyphs');
 assert.ok(fallback.every(name=>!/Hakgyoansim Yieodalligi/i.test(name)),'unavailable local faces use the configured fallback');
 assert.equal(await page.locator('#editor .fe-card > .fi-text').innerText(),design.items[0].text);
 assert.deepEqual(requests,[],'fallback does not request a remote font file');
});
