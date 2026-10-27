// PDF 가져오기 한 바퀴(브라우저): 시험 브라우저가 한글 PDF(23쪽, 4쪽만 가로)를 만든다 → 첫 화면 "PDF 가져오기" →
// 쪽 고르기(틀린 범위는 까닭을 알린다) → 모든 쪽 → 쪽마다 잠근 그림 한 장 · 쪽의 글은 발표자 노트 → 20쪽 + 3쪽 두 파트가 내 그림에서 한 칸("PDF")으로.
// 그다음 범위만("2-3") 노트 없이 한 번 더 가져온다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve,extname,sep} from 'node:path';

const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const options={skip:!process.env.MINICAN_PLAYWRIGHT_PATH,timeout:180000};
const types={'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.html':'text/html; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.wasm':'application/wasm','.bcmap':'application/octet-stream'};

test('PDF import: every page becomes a locked page picture with its text in the notes, 23 pages become two grouped parts',options,async t=>{
 const served=[];
 const server=createServer(async(req,res)=>{
  try{let path=new URL(req.url,'http://localhost').pathname;served.push(path);if(path.endsWith('/'))path+='index.html';const file=resolve(root,'.'+decodeURIComponent(path));if(!file.startsWith(root+sep)){res.writeHead(403);return res.end();}
   res.setHeader('Content-Type',types[extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404);res.end();}
 });
 await new Promise(done=>server.listen(0,'127.0.0.1',done));t.after(()=>new Promise(done=>server.close(done)));
 const {chromium}=await import(pathToFileURL(process.env.MINICAN_PLAYWRIGHT_PATH).href),browser=await chromium.launch({channel:process.env.MINICAN_BROWSER||'msedge',headless:true});t.after(()=>browser.close());
 const origin=`http://127.0.0.1:${server.address().port}`,context=await browser.newContext({viewport:{width:1366,height:860}}),errors=[];
 await context.addInitScript(()=>{try{for(const k of ['editor','home','news-0.45'])localStorage.setItem('onbatang-tour-seen-v1:'+k,'1');}catch{}});
 await context.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():route.abort());
 // 한글 PDF 만들기(글꼴은 온바탕의 Noto Sans KR). 4쪽만 가로.
 const maker=await context.newPage();
 const pages=Array.from({length:23},(_,i)=>`<section class="${i===3?'land':''}"><h1>${i+1}쪽 식물의 한살이</h1><p>씨앗이 싹 터요 · 줄기가 자라요</p></section>`).join('');
 await maker.route(origin+'/pdf-source.html',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:`<!doctype html><meta charset="utf-8"><style>@font-face{font-family:K;src:url(/app/brand/noto-sans-kr.woff2)}body{margin:0;font-family:K}section{break-after:page;padding:20mm}h1{font-size:28pt}@page{size:210mm 297mm;margin:0}@page land{size:297mm 210mm}.land{page:land}</style>${pages}`}));
 await maker.goto(origin+'/pdf-source.html');await maker.evaluate(()=>document.fonts.ready);
 const pdf=await maker.pdf({preferCSSPageSize:true,printBackground:true});await maker.close();
 const page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/app/');
 await page.locator('[data-pdf-open]').waitFor();
 await page.setInputFiles('[data-pdf-input]',{name:'과학 안내문.pdf',mimeType:'application/pdf',buffer:pdf});
 const box=page.locator('#cv-pdf-title');await box.waitFor();
 await page.getByText('"과학 안내문.pdf" · 23쪽',{exact:false}).waitFor();
 await page.fill('[data-pdf-pages]','0-3');await page.locator('[data-pdf-import]').click();
 await page.getByText('1부터 23 사이로 적어 주세요.',{exact:false}).waitFor();
 await page.fill('[data-pdf-pages]','');await page.locator('[data-pdf-import]').click();
 await page.waitForFunction(()=>document.querySelector('.cv-slide-count')?.textContent.endsWith('/ 20장'),null,{timeout:120000});
 assert.match(await page.locator('.cv-name').inputValue(),/^과학 안내문 · 1$/);
 // 저장된 그림: 쪽마다 잠근 그림 한 장, 쪽의 글은 노트, 가로 쪽은 세로 장 안에 맞춰 들어간다
 const stored=await page.evaluate(()=>new Promise((done,fail)=>{const q=indexedDB.open('minican');q.onsuccess=()=>{const g=q.result.transaction('designs').objectStore('designs').getAll();g.onsuccess=()=>done(g.result.map(r=>({name:r.name,source:r.source,slides:r.slides.map(s=>({n:s.source?.pageNumber,notes:s.notes,item:{...s.items[0],url:s.items[0].url.slice(0,30),bytes:s.items[0].url.length}}))})));g.onerror=fail;};q.onerror=fail;}));
 stored.sort((a,b)=>a.name.localeCompare(b.name));
 assert.deepEqual(stored.map(r=>[r.name,r.slides.length,r.source.kind]),[['과학 안내문 · 1',20,'pdf'],['과학 안내문 · 2',3,'pdf']]);
 const [first,second]=stored;
 assert.deepEqual(first.slides.map(s=>s.n),Array.from({length:20},(_,i)=>i+1));
 assert.deepEqual(second.slides.map(s=>s.n),[21,22,23]);
 const one=first.slides[0];
 assert.equal(one.item.t,'image');assert.equal(one.item.lock,true);assert.equal(one.item.w,100);assert.equal(one.item.h,100);
 assert.match(one.item.url,/^data:image\/(webp|jpeg);base64,/);
 assert.ok(one.item.bytes<400000,'each page picture stays small');
 assert.match(one.notes,/1쪽 식물의 한살이/);assert.match(one.notes,/씨앗이 싹 터요/);
 const land=first.slides[3].item;assert.equal(land.w,100);assert.ok(land.h<75,'the landscape page fits inside the portrait slide');
 // 내 그림: 두 파트가 한 칸("PDF", 23장)
 await page.locator('.cv-back').click();
 const card=page.locator('.cv-item.cv-deck');await card.waitFor();
 assert.equal(await card.locator('.cv-deck-badge').innerText(),'PDF');
 assert.equal(await card.locator('.cv-pages').innerText(),'23장');
 assert.match(await card.locator('.cv-item-when').innerText(),/파트 2개/);
 // 범위만 · 노트 없이 한 번 더
 await page.setInputFiles('[data-pdf-input]',{name:'과학 안내문.pdf',mimeType:'application/pdf',buffer:pdf});
 await box.waitFor();
 await page.fill('[data-pdf-pages]','2-3');await page.locator('[data-pdf-notes]').uncheck();await page.locator('[data-pdf-import]').click();
 await page.waitForFunction(()=>document.querySelector('.cv-slide-count')?.textContent.endsWith('/ 2장'));
 const notes=await page.evaluate(()=>new Promise(done=>{const q=indexedDB.open('minican');q.onsuccess=()=>{const g=q.result.transaction('designs').objectStore('designs').getAll();g.onsuccess=()=>done(g.result.filter(r=>r.slides.length===2).map(r=>[r.name,r.slides.map(s=>[s.source?.pageNumber,s.notes||''])]));};}));
 assert.deepEqual(notes,[['과학 안내문',[[2,''],[3,'']]]]);
 // pdf.js 는 이 사이트에서 받았다(바깥 주소 없음) · 한글 글꼴 표를 받을 수 있다
 assert.ok(served.some(p=>p.endsWith('/app/pdf/vendor/pdf.worker.min.mjs')));
 if(process.env.PDF_SHOT)await page.screenshot({path:process.env.PDF_SHOT+'-editor.png'});
 assert.deepEqual(errors,[]);
});
