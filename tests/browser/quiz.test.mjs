// 퀴즈 장 한 바퀴(브라우저, 휴대폰 없이): "···" 의 "퀴즈 넣기"로 문제 · 보기 · 정답 · 시간을 적어 넣는다 →
// 표지에 문제와 보기가 보인다 → 발표에서 → 로 시작 · 정답 공개 · 다음 장 → 시간이 다 되면 저절로 정답이 열린다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve,extname,sep} from 'node:path';

const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const options={skip:!process.env.MINICAN_PLAYWRIGHT_PATH,timeout:120000};
const types={'.js':'text/javascript','.css':'text/css','.html':'text/html; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2'};

test('quiz slide: make it in the editor, then start, reveal and move on in the show; time running out reveals by itself',options,async t=>{
 const server=createServer(async(req,res)=>{
  try{let path=new URL(req.url,'http://localhost').pathname;if(path.endsWith('/'))path+='index.html';const file=resolve(root,'.'+decodeURIComponent(path));if(!file.startsWith(root+sep)){res.writeHead(403);return res.end();}
   res.setHeader('Content-Type',types[extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404);res.end();}
 });
 await new Promise(done=>server.listen(0,'127.0.0.1',done));t.after(()=>new Promise(done=>server.close(done)));
 const {chromium}=await import(pathToFileURL(process.env.MINICAN_PLAYWRIGHT_PATH).href),browser=await chromium.launch({channel:process.env.MINICAN_BROWSER||'msedge',headless:true});t.after(()=>browser.close());
 const origin=`http://127.0.0.1:${server.address().port}`,context=await browser.newContext({viewport:{width:1366,height:860}}),errors=[];
 await context.addInitScript(()=>{try{for(const k of ['editor','home','news-0.45'])localStorage.setItem('onbatang-tour-seen-v1:'+k,'1');}catch{}});
 await context.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():route.abort());
 const page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/app/');
 await page.locator('[data-layout]').first().click();
 await page.locator('.cv-tray-menu summary').click();
 await page.locator('[data-add-quiz]').click();
 const form=page.locator('.quiz-setup');await form.waitFor();
 // 빈 문제 · 정답 없음은 넣지 않고 까닭을 알린다
 await page.locator('[data-quiz-apply]').click();
 await form.getByText('문제를 적어 주세요.').waitFor();
 await page.fill('[data-quiz-question]','식물이 자라는 데 꼭 필요한 것은?');
 const inputs=form.locator('.quiz-setup-choice input[type=text]');
 await inputs.nth(0).fill('장난감');await inputs.nth(1).fill('물과 햇빛');await inputs.nth(2).fill('소금물');
 await page.locator('[data-quiz-apply]').click();
 await form.getByText('정답인 보기를 하나 골라 주세요.').waitFor();
 await form.locator('.quiz-setup-choice input[type=radio]').nth(1).check();
 await page.selectOption('[data-quiz-seconds]','10');
 await page.fill('[data-quiz-explain]','식물은 물과 햇빛으로 양분을 만들어요.');
 await page.locator('[data-quiz-apply]').click();
 await form.waitFor({state:'detached'});
 assert.equal(await page.locator('.cv-slide-count').innerText(),'2 / 2장');
 const canvas=await page.locator('.cv-canvas').innerText();
 for(const text of ['퀴즈 · 10초','식물이 자라는 데 꼭 필요한 것은?','장난감','물과 햇빛','소금물'])assert.ok(canvas.includes(text),text);
 // 발표: 이 장부터 → 시작 → 정답 공개 → 다음 장(끝이면 그대로)
 await page.locator('.cv-slide').nth(1).click({button:'right'});
 await page.getByRole('menuitem',{name:'이 장부터 발표'}).click();
 const quiz=page.locator('.quiz-app');await quiz.waitFor();
 assert.equal(await quiz.getAttribute('data-phase'),'ready');
 await page.keyboard.press('ArrowRight');
 assert.equal(await quiz.getAttribute('data-phase'),'open');
 await page.waitForFunction(()=>Number(document.querySelector('.quiz-clock').textContent)<=9);
 await page.keyboard.press('ArrowRight');
 assert.equal(await quiz.getAttribute('data-phase'),'shown');
 assert.equal(await quiz.locator('.quiz-right .quiz-text').innerText(),'물과 햇빛');
 assert.equal(await quiz.locator('.quiz-dim').count(),2);
 assert.match(await quiz.locator('.quiz-explain').innerText(),/양분/);
 // "다시 풀기" 뒤 시간이 다 되면 저절로 정답이 열린다(시계를 앞당긴다)
 await quiz.getByRole('button',{name:'다시 풀기'}).click();
 await quiz.getByRole('button',{name:/^시작/}).click();
 await page.evaluate(()=>new Promise(done=>{const real=Date.now;Date.now=()=>real()+11000;setTimeout(()=>{Date.now=real;done();},600);}));
 await page.waitForFunction(()=>document.querySelector('.quiz-app').dataset.phase==='shown');
 assert.deepEqual(errors,[]);
});
