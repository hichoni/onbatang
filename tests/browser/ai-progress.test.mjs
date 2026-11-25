// An isolated durable server fixture, not a paid AI call.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve,extname,sep} from 'node:path';
const root=fileURLToPath(new URL('../../',import.meta.url));
const fixture=`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/src/editor.css"><link rel="stylesheet" href="/app/app.css"><link rel="stylesheet" href="/app/brand.css"><body class="mc-app"><main id="app"></main><script type="module">
import {startMinican} from '/app/app.js';
await startMinican({storage:'progress-fixture',resume:true,activityAuthoring:true,brand:{name:'연구소',logo:'/app/brand/app-icon.svg'},onBrandClick:()=>location.href='/playground',appMaker:{connect:async()=>{},generate:async(input,{signal,onProgress,requestId,jobId})=>{
 let payload=jobId?{jobId}:{input,requestId};for(;;){const r=await fetch('/job',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal});const v=await r.json();if(v.kind==='slides')return v;onProgress(v);payload={jobId:v.jobId};await new Promise((ok,no)=>{const timer=setTimeout(ok,50);signal.addEventListener('abort',()=>{clearTimeout(timer);no(signal.reason);},{once:true});});}
}}});window.ready=true;
</script>`;
for(const engine of ['chromium','webkit'])test(engine+' locks editing and resumes compose/edit after leaving, refresh and lost acceptance',{skip:!process.env.MINICAN_PLAYWRIGHT_PATH,timeout:120000},async t=>{
 const jobs=new Map();let completed=false,lost=engine==='chromium',submits=0;
 const server=createServer(async(req,res)=>{try{
  if(req.url==='/job'){
   let raw='';for await(const chunk of req)raw+=chunk;const q=JSON.parse(raw);
   let id=q.jobId||q.requestId;if(!id)throw Error('missing durable id');
   if(q.input){submits++;if(!jobs.has(id))jobs.set(id,q.input);}
   const input=jobs.get(id);if(!input)throw Error('unknown job');
   if(lost){lost=false;res.destroy();return;}
   const answer=input.task==='compose'?{kind:'slides',title:'이어 만드는 발표',say:'3장을 만들었어요.',ops:Array.from({length:3},(_,i)=>({op:'page',title:`${i+1}장`,bg:'#163c35',notes:'함께 질문해 보겠습니다.',items:[{t:'text',text:`${i+1}. 질문에서 시작해요`,x:50,y:50,w:80,size:5,color:'#ffffff'}]}))}:{kind:'slides',say:'제목을 고쳤어요.',ops:[{op:'text',item:input.slides[0].items[0].key,text:'이어받은 제목'}]};
   res.setHeader('Content-Type','application/json');res.end(JSON.stringify(completed?answer:{jobId:id,stage:'building',message:'장별 디자인을 만드는 중이에요.'}));return;
  }
  if(req.url==='/playground'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<h1>놀이터</h1><a href="/fixture.html">온바탕 돌아가기</a>');return;}
  if(req.url==='/fixture.html'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(fixture);return;}
  const file=resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!file.startsWith(root))throw Error('path');res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));
 }catch(e){res.writeHead(500);res.end(e.message);}});
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));t.after(()=>new Promise(ok=>server.close(ok)));
 const pw=await import(pathToFileURL(process.env.MINICAN_PLAYWRIGHT_PATH).href),browser=await pw[engine].launch({headless:true,...(engine==='chromium'?{channel:'msedge'}:{})});t.after(()=>browser.close());
 const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));const origin='http://127.0.0.1:'+server.address().port;
 await context.addInitScript(()=>{localStorage.setItem('onbatang-tour-seen-v1:editor','1');localStorage.setItem('onbatang-tour-seen-v1:news-0.45','1');});
 await page.goto(origin+'/fixture.html');await page.waitForFunction(()=>window.ready);
 await page.getByRole('button',{name:'AI로 발표 만들기',exact:true}).click();await page.getByLabel('만들 발표',{exact:true}).fill('선생님을 위한 질문하는 교실 발표');await page.getByLabel('발표 장 수',{exact:true}).fill('3');await page.locator('[data-compose-ask]').click();
 await page.getByRole('region',{name:'AI-G 제작 진행',exact:true}).waitFor();
 await page.waitForFunction(()=>document.querySelector('.cv-canvas')?.inert);
 assert.equal(await page.locator('.cv-side').evaluate(n=>n.inert),true);assert.equal(await page.locator('.cv-strip').evaluate(n=>n.inert),true);assert.equal(await page.locator('.cv-down-btn').evaluate(n=>n.inert),true);
 await page.keyboard.press('Delete');await page.keyboard.press('Control+z');assert.equal(await page.locator('.cv-slide[data-slide]').count(),1);
 if(process.env.AI_PROGRESS_SHOT)await page.screenshot({path:process.env.AI_PROGRESS_SHOT+'-'+engine+'.png'});
 await page.setViewportSize({width:390,height:844});assert.equal(await page.locator('.cv-canvas').evaluate(n=>n.inert),true);assert.ok(await page.locator('.cv-back').isVisible());
 if(process.env.AI_PROGRESS_SHOT)await page.screenshot({path:process.env.AI_PROGRESS_SHOT+'-'+engine+'-mobile.png'});
 await page.setViewportSize({width:1440,height:1000});
 // Wait for acceptance (or the lost acceptance response), then leave the whole app.
 await page.waitForFunction(()=>document.querySelector('.onba-ai-lock p')?.textContent?.includes('연결 확인')||document.querySelector('.onba-ai-lock p')?.textContent?.includes('디자인'));
 await page.getByRole('button',{name:'연구소 홈으로 나가기',exact:true}).click();await page.getByRole('heading',{name:'놀이터',exact:true}).waitFor();assert.equal(jobs.size,1);
 completed=true;await page.getByRole('link',{name:'온바탕 돌아가기'}).click();await page.getByRole('button',{name:/AI-G 작업 이어보기/}).click();await page.waitForFunction(()=>document.querySelectorAll('.onba-compose-previews article').length===3);
 assert.equal(jobs.size,1,'returning never creates another paid request');assert.equal(submits,engine==='chromium'?2:1,'lost acceptance reuses original id; accepted jobs only poll');
 await page.locator('[data-compose-apply]').click();await page.locator('[data-assist-pane="edit"]').waitFor({state:'visible'});assert.equal(await page.locator('.cv-canvas').evaluate(n=>n.inert),false);
 // A second job changes existing elements and survives a full refresh.
 completed=false;await page.getByRole('button',{name:/^3번째 장/}).click();await page.locator('.cv-assist-wish').fill('세 번째 장의 제목을 이어받은 제목으로 고쳐 줘');await page.locator('[data-assist-ask]').click();await page.getByRole('region',{name:'AI-G 제작 진행'}).waitFor();
 await page.waitForFunction(()=>document.querySelector('.onba-ai-lock p')?.textContent?.includes('디자인'));
 await page.getByRole('button',{name:'내 그림으로 나가기',exact:true}).click();await page.getByRole('button',{name:/AI-G 작업 이어보기/}).waitFor();await page.reload();await page.getByRole('button',{name:/AI-G 작업 이어보기/}).click();await page.getByRole('region',{name:'AI-G 제작 진행'}).waitFor();assert.equal(jobs.size,2);
 completed=true;await page.locator('[data-assist-apply]').waitFor({timeout:8000}).catch(async e=>{e.message+=' '+await page.locator('.onba-ai-task').innerText();throw e;});await page.locator('[data-assist-apply]').click();await page.getByRole('button',{name:/^3번째 장/}).click();await page.locator('.cv-canvas').getByText('이어받은 제목',{exact:true}).waitFor();assert.equal(jobs.size,2);
 await page.locator('.cv-back').click();assert.equal(await page.locator('.onba-ai-home').count(),0);assert.deepEqual(errors,[]);
});
