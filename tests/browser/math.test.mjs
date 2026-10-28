// 수식 한 바퀴(브라우저): 글 칸 "수식 넣기" → 수식 창(MathJax 를 이때 받는다) → 예시(근의 공식) → 적용 → 카드의 수식(저장한 모양) →
// 두 번 눌러 다시 열기 → 넣기 단추(고른 글을 √ 로 감싸기) → 틀린 수식은 쉬운 말로 알리고 적용하지 않는다 → 한글(\text) 수식으로 바꿔 적용 →
// 저장된 수식 · 그림(PNG)으로 내보내도 그려진다 · 남이 만든 나쁜 모양(script · 이벤트 속성)은 그리지 않는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve,extname,sep} from 'node:path';

const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const options={skip:!process.env.MINICAN_PLAYWRIGHT_PATH,timeout:150000};
const types={'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.html':'text/html; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2'};

test('math: add from the text tab, preview with MathJax, apply, edit by double click, wrap with keys, reject broken TeX, keep and export the stored shape',options,async t=>{
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
 const page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/app/');
 assert.ok(!served.some(p=>p.includes('/mathjax/')),'MathJax is not fetched until the math window opens');
 await page.locator('.cv-hero .cv-new-btn').click();
 await page.getByRole('tab',{name:'글',exact:true}).click();
 await page.locator('[data-add-math]').click();
 const dlg=page.locator('.fe-math-dlg');await dlg.waitFor();
 await dlg.getByText('수식을 적으면 여기에 보여요.').waitFor();
 assert.ok(served.some(p=>p.endsWith('/src/mathjax/tex-svg-full.js')));
 await dlg.locator('[data-math-example="근의 공식"]').click();
 await dlg.locator('.fe-math-preview svg path').first().waitFor();
 await dlg.locator('[data-math-apply]:not([disabled])').click();
 await dlg.waitFor({state:'detached'});
 const math=page.locator('.fe-card .fi-math').first();
 assert.ok(await math.locator('svg path').count()>10);
 assert.equal(await math.getAttribute('aria-label'),'수식: x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}');
 const box=await math.boundingBox();assert.ok(box.width>box.height*2,'a long formula lies wide');
 // 두 번 눌러 다시 연다 → 고른 글을 √ 로 감싼다
 await page.locator('.cv-status.ok').waitFor();
 await page.mouse.dblclick(box.x+box.width/2,box.y+box.height/2);
 await dlg.waitFor();
 assert.equal(await dlg.locator('[data-math-tex]').inputValue(),'x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}');
 await dlg.locator('[data-math-tex]').fill('ab');
 await dlg.locator('[data-math-tex]').evaluate(input=>input.setSelectionRange(0,2));
 await dlg.locator('[data-math-key="\\\\sqrt{}"]').click();
 assert.equal(await dlg.locator('[data-math-tex]').inputValue(),'\\sqrt{ab}');
 // 틀린 수식: 쉬운 말로 알리고 적용하지 않는다
 await dlg.locator('[data-math-tex]').fill('\\frac{1}{');
 await dlg.getByText('닫는 } 가 빠졌어요.').waitFor();
 assert.equal(await dlg.locator('[data-math-apply]').isDisabled(),true);
 await dlg.locator('[data-math-tex]').fill('\\fracc{1}{2}');
 await dlg.getByText('모르는 명령이에요: \\fracc',{exact:false}).waitFor();
 // 한글이 든 수식으로 바꿔 적용
 await dlg.locator('[data-math-example="속력"]').click();
 await dlg.locator('[data-math-apply]:not([disabled])').click();
 await dlg.waitFor({state:'detached'});
 assert.ok(await math.locator('svg text').count()>=3,'Korean words are drawn as text');
 await page.locator('.cv-status.ok').waitFor();
 const saved=await page.evaluate(()=>new Promise(done=>{const q=indexedDB.open('minican');q.onsuccess=()=>{const g=q.result.transaction('designs').objectStore('designs').getAll();g.onsuccess=()=>done(g.result.flatMap(r=>r.slides.flatMap(s=>s.items)).filter(i=>i.t==='math'));};}));
 assert.equal(saved.length,1);
 assert.equal(saved[0].tex,'\\text{속력}=\\frac{\\text{거리}}{\\text{시간}}');
 assert.equal(saved[0].m.vb.length,4);assert.ok(JSON.stringify(saved[0].m).includes('"t":"text"'));
 // 그림(PNG)으로 내보내기 · 나쁜 모양은 그리지 않는다
 const check=await page.evaluate(async()=>{
  const {designToCanvas}=await import('/src/export.js'),{designView}=await import('/src/render.js'),m=await import('/src/model.js');
  const good=m.newMath({tex:'a^2+b^2=c^2',m:(await import('/src/math.js')).cleanMath({tex:'x',m:{vb:[0,-800,3000,1000],n:[{t:'rect',a:{x:'0',y:'-700',width:'3000',height:'600',fill:'currentColor'}}]}}).m},{color:'#000000'});
  const {canvas}=await designToCanvas({bg:'#ffffff',items:[good]},{width:800,aspect:16/9});
  const data=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let ink=0;for(let i=0;i<data.length;i+=4)if(data[i]<60&&data[i+1]<60&&data[i+2]<60)ink++;
  window.__hit=0;
  const evil={t:'math',x:50,y:50,w:40,h:20,tex:'x',m:{vb:[0,0,100,100],n:[{t:'script',s:'window.__hit=1'},{t:'g',a:{onload:'window.__hit=2'},c:[{t:'path',a:{d:'M0 0L10 10',fill:'javascript:alert(1)'}},{t:'path',a:{d:'M0 0L50 50',fill:'currentColor'}}]},{t:'foreignObject'},{t:'image',a:{href:'x'}}]}};
  const card=designView({bg:'#fff',items:[evil]});document.body.append(card);
  const html=card.innerHTML;card.remove();
  return {ink,hit:window.__hit,bad:/script|onload|javascript|foreignObject|<image/i.test(html),paths:(html.match(/<path/g)||[]).length};
 });
 assert.ok(check.ink>500,`the stored shape is painted into pictures (${check.ink})`);
 assert.deepEqual([check.hit,check.bad,check.paths],[0,false,1],'only the clean path survives');
 if(process.env.MATH_SHOT)await page.screenshot({path:process.env.MATH_SHOT+'-editor.png'});
 // 고칠 수 있는 PPTX: 수식은 PowerPoint 수식(a14:m · OMML)으로, 수식을 모르는 프로그램을 위해 그림도 함께
 await page.locator('.cv-down-btn').click();const down=page.getByRole('dialog',{name:'내려받기',exact:true});
 await down.locator('[data-type=pptx]').click();if(await down.locator('[data-scope=all]').count())await down.locator('[data-scope=all]').click();await down.locator('[data-pptx=editable]').click();
 const pending=page.waitForEvent('download',{timeout:90000});await down.locator('[data-pptx-save]').click();
 const file=await readFile(await (await pending).path()),{unzipSync}=await import('fflate'),zip=unzipSync(new Uint8Array(file));
 const slide=new TextDecoder().decode(zip['ppt/slides/slide1.xml']);
 assert.match(slide,/<mc:Choice xmlns:a14="http:\/\/schemas\.microsoft\.com\/office\/drawing\/2010\/main" Requires="a14"><p:sp>.*<a14:m><m:oMathPara /s,'an editable PowerPoint equation');
 assert.match(slide,/<m:f><m:fPr>.*<m:num>.*속력|속력.*<m:f><m:fPr>.*<m:num>.*거리.*<m:den>.*시간/s,'the fraction with the Korean words');
 assert.match(slide,/<mc:Fallback><p:pic>/,'a picture for programs without equations');
 assert.equal(Object.keys(zip).filter(k=>k.startsWith('ppt/media/')).length,1);
 assert.ok(served.some(p=>p.endsWith('/src/mathjax/tex-svg-full.js')));
 assert.deepEqual(errors,[]);
});
