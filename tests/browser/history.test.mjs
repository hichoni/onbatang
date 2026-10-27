// 버전 기록 한 바퀴(브라우저): 그림을 다시 열 때의 판, 고치는 동안 10분마다의 판이 남는다(10분 안에는 더 남지 않는다) →
// "기록"에서 예전 판의 장들을 보고 되돌린다(되돌리기 전 판도 남는다) → 되돌린 것을 다시 되돌린다 → 새 그림으로 꺼낸다 → 새로 고쳐도 기록이 남아 있다.
// 시계는 page.clock.setFixedTime 으로 옮긴다(타이머는 그대로 돈다).
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve,extname,sep} from 'node:path';

const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const options={skip:!process.env.MINICAN_PLAYWRIGHT_PATH,timeout:150000};
const types={'.js':'text/javascript','.css':'text/css','.html':'text/html; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2'};

test('version history: open and 10-minute versions, preview, restore (keeping the version before), restore back, copy out, survive a reload',options,async t=>{
 const server=createServer(async(req,res)=>{
  try{let path=new URL(req.url,'http://localhost').pathname;if(path.endsWith('/'))path+='index.html';const file=resolve(root,'.'+decodeURIComponent(path));if(!file.startsWith(root+sep)){res.writeHead(403);return res.end();}
   res.setHeader('Content-Type',types[extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404);res.end();}
 });
 await new Promise(done=>server.listen(0,'127.0.0.1',done));t.after(()=>new Promise(done=>server.close(done)));
 const {chromium}=await import(pathToFileURL(process.env.MINICAN_PLAYWRIGHT_PATH).href),browser=await chromium.launch({channel:process.env.MINICAN_BROWSER||'msedge',headless:true});t.after(()=>browser.close());
 const origin=`http://127.0.0.1:${server.address().port}`,context=await browser.newContext({viewport:{width:1366,height:860}}),errors=[];
 await context.addInitScript(()=>{try{for(const k of ['editor','home','news-0.45','news'])localStorage.setItem('onbatang-tour-seen-v1:'+k,'1');}catch{}});
 await context.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():route.abort());
 const page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
 const T0=new Date(2026,9,27,9,0).getTime(),minute=60e3;
 await page.clock.setFixedTime(T0);
 await page.goto(origin+'/app/');
 const count=()=>page.locator('.cv-slide-count').innerText();
 const saved=()=>page.locator('.cv-status.ok').waitFor();
 const addSlide=async n=>{await page.locator('.cv-strip .cv-slide.add').click();await page.waitForFunction(n=>document.querySelector('.cv-slide-count')?.textContent.endsWith(`/ ${n}장`),n);await saved();};
 await page.locator('[data-layout]').first().click();
 await addSlide(2);
 // 새 그림은 처음 저장할 때 판이 남는다(2장). 내 그림으로 나갔다가 다시 열면 열 때의 판은 내용이 같아 더 남지 않는다
 await page.locator('.cv-back').click();
 await page.locator('.cv-item-open').first().click();
 await page.locator('[data-history]').waitFor();
 // 11분 뒤 고치면 자동 판(3장), 1분 뒤 또 고쳐도 10분이 안 돼 남지 않는다
 await page.clock.setFixedTime(T0+11*minute);await addSlide(3);
 await page.clock.setFixedTime(T0+12*minute);await addSlide(4);
 const rows=async()=>(await page.locator('.cv-history-row').allInnerTexts()).map(s=>s.replace(/\s+/g,' ').trim());
 const openHistory=async()=>{await page.locator('[data-history]').click();await page.locator('.cv-history').waitFor();await page.locator('.cv-history-row[aria-pressed=true]').waitFor();};
 await page.waitForTimeout(300);
 await openHistory();
 assert.deepEqual(await rows(),['지금 판 꾸미고 있는 그대로','오늘 오전 9:11 고치는 중 자동 기록 · 3장','오늘 오전 9:00 고치는 중 자동 기록 · 2장']);
 assert.equal(await page.locator('.cv-history-page').count(),4,'"now" shows the current slides');
 assert.equal(await page.locator('[data-history-restore]').isDisabled(),true);
 // 처음 판(2장)을 보고 되돌린다
 await page.locator('.cv-history-row').nth(2).click();
 await page.locator('[data-history-restore]:not([disabled])').waitFor();
 assert.equal(await page.locator('.cv-history-page').count(),2);
 assert.match(await page.locator('.cv-history-note').innerText(),/오늘 오전 9:00 판 · 2장이에요/);
 if(process.env.HISTORY_SHOT)await page.screenshot({path:process.env.HISTORY_SHOT+'-wide.png'});
 await page.clock.setFixedTime(T0+13*minute);
 await page.locator('[data-history-restore]').click();
 await page.locator('.cv-history').waitFor({state:'detached'});
 await page.waitForFunction(()=>document.querySelector('.cv-slide-count')?.textContent.endsWith('/ 2장'));
 await page.getByText('오늘 오전 9:00 판으로 되돌렸어요.',{exact:false}).waitFor();
 await page.waitForTimeout(300);
 await openHistory();
 assert.deepEqual(await rows(),['지금 판 꾸미고 있는 그대로','오늘 오전 9:13 되돌린 판 · 2장','오늘 오전 9:13 되돌리기 전 · 4장','오늘 오전 9:11 고치는 중 자동 기록 · 3장','오늘 오전 9:00 고치는 중 자동 기록 · 2장']);
 // 되돌리기 전 판(4장)으로 다시 되돌린다
 await page.locator('.cv-history-row').nth(2).click();
 await page.locator('[data-history-restore]:not([disabled])').waitFor();
 await page.locator('[data-history-restore]').click();
 await page.waitForFunction(()=>document.querySelector('.cv-slide-count')?.textContent.endsWith('/ 4장'));
 // 자동 판(3장)을 새 그림으로 꺼낸다: 지금 그림은 그대로
 await openHistory();
 await page.locator('.cv-history-row',{hasText:'자동 기록 · 3장'}).click();
 await page.locator('[data-history-copy]:not([disabled])').waitFor();
 await page.locator('[data-history-copy]').click();
 await page.locator('.cv-history-note',{hasText:'꺼냈어요'}).waitFor();
 await page.keyboard.press('Escape');
 assert.match(await count(),/\/ 4/);
 await page.locator('.cv-back').click();
 await page.locator('.cv-item').nth(1).waitFor();
 assert.equal(await page.locator('.cv-item').count(),2);
 // 새로 고쳐도 기록이 남는다(다시 열 때의 판은 내용이 같아 더 남지 않는다)
 await page.reload();
 await page.locator('.cv-item').first().waitFor();
 const original=page.locator('.cv-item',{has:page.locator('.cv-pages',{hasText:'4장'})});
 await original.locator('.cv-item-open').click();
 await page.locator('[data-history]').waitFor();
 await page.waitForTimeout(300);
 await openHistory();
 // 두 번째 되돌리기 전 판은 바로 앞 판(되돌린 판 · 2장)과 같아 남지 않았다
 assert.deepEqual(await rows(),['지금 판 꾸미고 있는 그대로','오늘 오전 9:13 되돌린 판 · 4장','오늘 오전 9:13 되돌린 판 · 2장','오늘 오전 9:13 되돌리기 전 · 4장','오늘 오전 9:11 고치는 중 자동 기록 · 3장','오늘 오전 9:00 고치는 중 자동 기록 · 2장']);
 if(process.env.HISTORY_SHOT){await page.setViewportSize({width:390,height:800});await page.screenshot({path:process.env.HISTORY_SHOT+'-phone.png'});}
 assert.deepEqual(errors,[]);
});
