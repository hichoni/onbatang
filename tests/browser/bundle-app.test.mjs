// 공용 온바탕 묶음(tools/bundle-app.mjs)을 실제 브라우저로: 원래 파일로 연 온바탕과 Firebase 배포본처럼 묶어 연 온바탕이 같은 화면을 그리고,
// 모듈이 제 자리를 기준으로 부르는 것(MathJax · 글꼴 · 편집기 CSS · 그림 내보내기)도 같다. 묶음은 받는 스크립트가 훨씬 적다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve,extname,sep} from 'node:path';
import {unzipSync} from 'fflate';
import {bundleApp} from '../../tools/bundle-app.mjs';

const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const options={skip:!process.env.MINICAN_PLAYWRIGHT_PATH,timeout:300000};
const types={'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.html':'text/html; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.wasm':'application/wasm','.txt':'text/plain; charset=utf-8'};

function serve(overlay=new Map()){
 const server=createServer(async(req,res)=>{
  try{let path=decodeURIComponent(new URL(req.url,'http://x').pathname);if(path.endsWith('/'))path+='index.html';
   const file=resolve(root,'.'+path);if(!file.startsWith(root+sep)){res.writeHead(403);return res.end();}
   const body=overlay.get(path.slice(1))??await readFile(file);
   res.writeHead(200,{'content-type':types[extname(path)]||'application/octet-stream','cache-control':'no-store'});res.end(body);}
  catch{res.writeHead(404);res.end();}
 });
 return new Promise(ok=>server.listen(0,'127.0.0.1',()=>ok({origin:'http://127.0.0.1:'+server.address().port,close:()=>server.close()})));
}

async function visit(browser,origin){
 const context=await browser.newContext({viewport:{width:1366,height:860},acceptDownloads:true}),errors=[],scripts=new Set(),missing=[],seen={};
 await context.addInitScript(()=>{try{for(const k of ['editor','home','news-0.45'])localStorage.setItem('onbatang-tour-seen-v1:'+k,'1');}catch{}});
 await context.route('**/*',route=>new URL(route.request().url()).origin===origin||/^(about|data|blob):/.test(route.request().url())?route.continue():route.abort());
 const page=await context.newPage();page.setDefaultTimeout(30000);
 page.on('pageerror',e=>errors.push(e.message));
 page.on('request',r=>{const u=new URL(r.url());if(u.origin===origin&&/\.m?js$/.test(u.pathname))scripts.add(u.pathname);});
 page.on('response',r=>{if(r.status()>=400)missing.push(new URL(r.url()).pathname);});
 await page.goto(origin+'/app/');await page.locator('.cv-hero .cv-new-btn').waitFor();
 seen.firstScripts=scripts.size;
 seen.home=(await page.locator('.cv-hero').innerText()).trim();
 await page.locator('.cv-hero .cv-new-btn').click();
 await page.getByRole('tab',{name:'꾸미기',exact:true}).click();
 await page.locator('[data-add-chart="bar"]').click();
 const chart=page.locator('.fe-chart-dlg');await chart.waitFor();await chart.locator('[data-chart-apply]').click();await chart.waitFor({state:'detached'});
 await page.getByRole('tab',{name:'글',exact:true}).click();
 await page.locator('[data-add-math]').click();
 const math=page.locator('.fe-math-dlg');await math.waitFor();
 await math.getByText('수식을 적으면 여기에 보여요.').waitFor();
 await math.locator('[data-math-example="피타고라스 정리"]').click();
 await math.locator('[data-math-apply]:not([disabled])').click();await math.waitFor({state:'detached'});
 await page.locator('.cv-status.ok').waitFor({state:'attached'});
 seen.card=await page.locator('.fe-card').first().evaluate(card=>[...card.querySelectorAll('.fi')].map(n=>n.className+':'+(n.getAttribute('aria-label')||n.textContent.trim().slice(0,40))));
 // 그림(PNG) 내려받기: 편집기 CSS 를 제 자리(src/export.js 옆)에서 받아 그린다
 await page.locator('.cv-down-btn').click();await page.locator('.cv-down-ask').waitFor();
 await page.locator('[data-type=png]').click();
 const pending=page.waitForEvent('download');await page.locator('[data-download-save]').click();
 const png=await readFile(await (await pending).path());
 seen.png=[...png.subarray(0,4)].join(',')==='137,80,78,71'&&png.length>5000;
 // 발표
 await page.locator('.cv-show-btn').click();seen.show=(await page.locator('.cv-show-count').innerText()).trim();await page.keyboard.press('Escape');
 seen.errors=errors;seen.missing=missing;seen.scripts=[...scripts];
 await context.close();
 return seen;
}

test('the bundled public 온바탕 page draws and works like the plain one, with far fewer script files',options,async t=>{
 const files=unzipSync(execFileSync('git',['archive','--format=zip','HEAD','app','src'],{cwd:root,maxBuffer:64*1024*1024}));
 const r=await bundleApp(files,{version:'test'});
 const overlay=new Map([['app/index.html',r.page],...Object.entries(r.outputs)]);
 const plain=await serve(),bundled=await serve(overlay);t.after(()=>{plain.close();bundled.close();});
 const {chromium}=await import(pathToFileURL(process.env.MINICAN_PLAYWRIGHT_PATH).href),browser=await chromium.launch({channel:process.env.MINICAN_BROWSER||'msedge',headless:true});t.after(()=>browser.close());
 const a=await visit(browser,plain.origin),b=await visit(browser,bundled.origin);
 assert.deepEqual(a.errors,[]);assert.deepEqual(b.errors,[]);
 assert.deepEqual(b.missing,[],'every address a module builds from its own place still exists');
 assert.ok(b.scripts.includes('/app/index.bundle.js'),'the bundle is what runs');
 assert.ok(b.scripts.includes('/src/mathjax/tex-svg-full.js'),'MathJax still comes from beside math-dialog.js');
 assert.ok(a.firstScripts>80,'plain: '+a.firstScripts);
 assert.ok(b.firstScripts<=30,'bundled: '+b.firstScripts);
 for(const key of ['home','card','png','show'])assert.deepEqual(b[key],a[key],key);
 assert.equal(b.png,true);assert.equal(b.card.length,2);
});
