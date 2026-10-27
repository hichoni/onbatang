// 차트 한 바퀴(브라우저): 꾸미기 칸 "차트 · 막대" → 표 고치기 창(보기 표) → 엑셀처럼 붙여넣기(계열 둘) · 제목 · 단위 → 적용 →
// 카드의 차트(막대 8개 · 값 글 · 범례 둘) → 두 번 눌러 다시 열어 원으로 바꾸기(첫 계열만, 비율 글) → 숫자가 아닌 칸은 적용하지 않는다 →
// 저장된 그림의 차트 표 · 그림(PNG)으로 내려받아도 그대로.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve,extname,sep} from 'node:path';

const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const options={skip:!process.env.MINICAN_PLAYWRIGHT_PATH,timeout:150000};
const types={'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.html':'text/html; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2'};

test('chart: add from the decorate tab, paste a table, apply, reopen by double click, switch to pie, reject non-numbers, keep it saved',options,async t=>{
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
 await page.locator('.cv-hero .cv-new-btn').click();
 await page.getByRole('tab',{name:'꾸미기',exact:true}).click();
 await page.locator('[data-add-chart="bar"]').click();
 const dlg=page.locator('.fe-chart-dlg');await dlg.waitFor();
 // 보기 표가 들어 있다
 assert.equal(await dlg.locator('[data-chart-label="0"]').inputValue(),'사과');
 assert.equal(await page.locator('.fe-card .fi-chart').count(),1,'the chart is placed right away');
 // 엑셀에서 복사한 표를 첫 칸에 붙여 넣는다(탭 · 줄 바꿈) → 표 전체가 바뀐다
 const tsv='과목\t1반\t2반\n국어\t85\t78\n수학\t72\t88\n과학\t90\t81\n사회\t68\t74';
 await dlg.locator('[data-chart-label="0"]').evaluate((input,text)=>{const data=new DataTransfer();data.setData('text/plain',text);input.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));},tsv);
 await dlg.getByText('표를 붙여 넣었어요: 항목 4개 · 계열 2개',{exact:false}).waitFor();
 assert.equal(await dlg.locator('[data-chart-series="1"]').inputValue(),'2반');
 assert.equal(await dlg.locator('[data-chart-value="1:1"]').inputValue(),'88');
 await dlg.locator('[data-chart-title]').fill('1학기 과목별 평균');
 await dlg.locator('[data-chart-unit]').fill('점');
 assert.equal(await dlg.locator('.fe-chart-preview .fc-title').innerText(),'1학기 과목별 평균');
 await dlg.locator('[data-chart-apply]').click();
 await dlg.waitFor({state:'detached'});
 const chart=page.locator('.fe-card .fi-chart').first();
 assert.equal(await chart.locator('.fc-bar').count(),8);
 assert.deepEqual(await chart.locator('.fc-names span').allInnerTexts(),['국어','수학','과학','사회']);
 assert.equal(await chart.locator('.fc-legend .fc-key').count(),2);
 assert.ok((await chart.locator('.fc-val').allInnerTexts()).includes('88점'));
 assert.match(await chart.getAttribute('aria-label'),/^막대 차트 '1학기 과목별 평균': 1반: 국어 85점/);
 // 두 번 눌러 다시 연다 → 원으로 바꾸면 첫 계열만(나머지 칸은 흐리게) · 비율 글
 await page.locator('.cv-status.ok').waitFor();
 const box=await chart.boundingBox();
 await page.mouse.dblclick(box.x+box.width/2,box.y+box.height/2);
 await dlg.waitFor();
 await dlg.locator('[data-chart-kind="pie"]').click();
 await dlg.getByText('원 · 도넛은 첫 계열만 그려요.').waitFor();
 // 숫자가 아닌 칸은 알리고 적용하지 않는다
 await dlg.locator('[data-chart-value="0:0"]').fill('팔십');
 await dlg.locator('[data-chart-apply]').click();
 await dlg.getByText('숫자가 아닌 칸이 있어요.',{exact:false}).waitFor();
 await dlg.locator('[data-chart-value="0:0"]').fill('80');
 await dlg.locator('[data-chart-apply]').click();
 await dlg.waitFor({state:'detached'});
 assert.equal(await chart.locator('.fc-pie path').count(),4);
 assert.equal(await chart.locator('.fc-pie-val').count(),4);
 assert.deepEqual(await chart.locator('.fc-side .fc-key span').allInnerTexts(),['국어','수학','과학','사회']);
 // 저장된 차트
 await page.locator('.cv-status.ok').waitFor();
 const saved=await page.evaluate(()=>new Promise(done=>{const q=indexedDB.open('minican');q.onsuccess=()=>{const g=q.result.transaction('designs').objectStore('designs').getAll();g.onsuccess=()=>done(g.result.flatMap(r=>r.slides.flatMap(s=>s.items)).filter(i=>i.t==='chart'));};}));
 assert.equal(saved.length,1);
 assert.deepEqual([saved[0].kind,saved[0].title,saved[0].unit,saved[0].labels,saved[0].series.map(s=>s.name),saved[0].series[0].values],['pie','1학기 과목별 평균','점',['국어','수학','과학','사회'],['1반','2반'],[80,72,90,68]]);
 if(process.env.CHART_SHOT)await page.screenshot({path:process.env.CHART_SHOT+'-editor.png'});
 // 그림(PNG)으로 내보내도 차트가 그대로 그려진다(막대 색 · 글자)
 const png=await page.evaluate(async()=>{
  const {designToCanvas}=await import('/src/export.js'),m=await import('/src/model.js');
  const {canvas}=await designToCanvas({bg:'#ffffff',items:[m.newChart('bar')]},{width:960,aspect:16/9});
  const data=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let bar=0,ink=0;
  for(let i=0;i<data.length;i+=4){if(Math.abs(data[i]-0x3e)<16&&Math.abs(data[i+1]-0x63)<16&&Math.abs(data[i+2]-0xdd)<16)bar++;if(data[i]<90&&data[i+1]<110&&data[i+2]<100)ink++;}
  return {bar,ink,url:canvas.toDataURL('image/png')};
 });
 assert.ok(png.bar>8000,`bars are painted (${png.bar})`);assert.ok(png.ink>300,`labels are painted (${png.ink})`);
 if(process.env.CHART_SHOT)await (await import('node:fs/promises')).writeFile(process.env.CHART_SHOT+'-export.png',Buffer.from(png.url.split(',')[1],'base64'));
 assert.deepEqual(errors,[]);
});
