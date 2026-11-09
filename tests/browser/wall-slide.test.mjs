// 담벼락 장(브라우저): 호스트가 wallAction 을 주면 "···"의 "담벼락 넣기"로 만들어 넣고(표지에 주소 · 코드), 발표에서는 호스트의 mount 가
// 그 자리에 판을 그린다(판 단추를 눌러도 ← · → 는 장 넘기기, 장을 떠나면 destroy). 호스트가 없으면 넣기 단추가 없고 발표는 표지만 보인다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve,extname,sep} from 'node:path';

const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const options={skip:!process.env.MINICAN_PLAYWRIGHT_PATH,timeout:120000};
const WALL={id:'0f8b5a3e-9c1d-4e2f-8a7b-6c5d4e3f2a1b',title:'지난주 담벼락',code:'415468'};
const html=`<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/src/editor.css"><link rel="stylesheet" href="/app/app.css"><body class="mc-app"><main id="app"></main><script type="module">
import {startMinican,openSavedDesign} from '/app/app.js';import {newRecord} from '/app/designs.js';import {putDesign,setStorageName} from '/app/store.js';
import {newWallActivity,wallCover} from '/src/wall.js';
try{for(const k of ['editor','home','news-0.45'])localStorage.setItem('onbatang-tour-seen-v1:'+k,'1');}catch{}
const host=new URLSearchParams(location.search).get('host')==='1';
setStorageName('wall-fixture-'+(host?'host':'plain'));
const record=newRecord('16:9');record.name='삼척 연수';
const old=newWallActivity(${JSON.stringify(WALL)});
record.slides=[{id:'pwall00001',bg:'#ffffff',items:[{id:'ewall00001',t:'text',text:'첫 장',x:50,y:30,w:60,size:8}]},{...wallCover(old,16/9),id:'pwall00002',activity:old}];
await putDesign(record);
window.calls={create:[],list:0,mount:[],destroyed:0};
const wallAction={
 create:async o=>{window.calls.create.push(o);return {id:'1a2b3c4d-1111-4222-8333-444455556666',title:o.title,code:'902731'};},
 list:async()=>{window.calls.list++;return [{...${JSON.stringify(WALL)},open:true,posts:3,pending:1}];},
 mount:async(root,wall)=>{window.calls.mount.push({...wall,inside:!!root.closest('.cv-show-activity[data-wall]')});
  const b=document.createElement('button');b.type='button';b.className='fake-board';b.textContent='판 단추 '+wall.code;root.replaceChildren(b);
  return {destroy(){window.calls.destroyed++;}};},
};
await startMinican({storage:'wall-fixture-'+(host?'host':'plain'),...(host?{activityAuthoring:true,wallAction}:{})});
await openSavedDesign(record.id);window.ready=true;
</script>`;

async function open(t,host){
 const server=createServer(async(req,res)=>{
  try{const path=new URL(req.url,'http://x').pathname;
   if(path==='/fixture.html'){res.setHeader('Content-Type','text/html');return res.end(html);}
   const f=resolve(root,'.'+decodeURIComponent(path));if(!f.startsWith(root+sep))throw Error('path');
   res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2'})[extname(f)]||'application/octet-stream');
   res.end(await readFile(f));}catch{res.writeHead(404);res.end();}
 });
 await new Promise(done=>server.listen(0,'127.0.0.1',done));t.after(()=>new Promise(done=>server.close(done)));
 const {chromium}=await import(pathToFileURL(process.env.MINICAN_PLAYWRIGHT_PATH).href),browser=await chromium.launch({channel:process.env.MINICAN_BROWSER||'msedge',headless:true});t.after(()=>browser.close());
 const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
 const origin=`http://127.0.0.1:${server.address().port}`;
 await page.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():route.abort());
 await page.goto(`${origin}/fixture.html?host=${host?1:0}`);
 await page.waitForFunction(()=>window.ready);
 return {page,errors};
}

test('with a host: insert a wall from the tray, its cover shows the code, the show mounts the host board and arrows still turn slides',options,async t=>{
 const {page,errors}=await open(t,true);
 await page.locator('.cv-tray-menu summary').click();
 await page.locator('[data-add-wall]').click();
 const setup=page.locator('.wall-setup');await setup.waitFor();
 await setup.locator('[data-wall-pick]').waitFor();
 assert.match(await setup.locator('[data-wall-pick]').innerText(),/지난주 담벼락[\s\S]*코드 415 468[\s\S]*확인 대기 1/);
 await setup.getByLabel('담벼락 제목').fill('  오늘 만든 것 나누기 ');
 await setup.locator('[data-wall-approval]').uncheck();
 await setup.locator('[data-wall-create]').click();
 await setup.waitFor({state:'detached'});
 assert.deepEqual(await page.evaluate(()=>window.calls.create),[{title:'오늘 만든 것 나누기',approval:false}]);
 const canvas=page.locator('.cv-canvas');
 await canvas.getByText('902 731').first().waitFor();
 await canvas.getByText(/gbe\.ai\.kr\/w/).first().waitFor();
 // 발표: 새로 넣은 장(2장)에서 시작 → 호스트 판 → 판 단추를 눌러도 ← 는 앞 장
 await page.locator('.cv-show-btn').click();
 const count=page.locator('.cv-show-count');await count.waitFor();
 await page.locator('.fake-board').waitFor();
 assert.equal(await count.textContent(),'2 / 3');
 assert.deepEqual(await page.evaluate(()=>window.calls.mount.at(-1)),{id:'1a2b3c4d-1111-4222-8333-444455556666',title:'오늘 만든 것 나누기',code:'902731',inside:true});
 await page.locator('.fake-board').click();
 await page.keyboard.press('ArrowRight');
 await page.waitForFunction(()=>document.querySelector('.cv-show-count')?.textContent==='3 / 3');
 assert.equal(await page.evaluate(()=>window.calls.destroyed),1,'leaving the slide destroys the board');
 await page.keyboard.press('ArrowRight');   // 지난주 담벼락(3장)
 await page.waitForFunction(()=>window.calls.mount.length===2);
 assert.equal(await page.evaluate(()=>window.calls.mount[1].code),'415468');
 await page.keyboard.press('Escape');
 await page.locator('.cv-show').waitFor({state:'detached'});
 assert.equal(await page.evaluate(()=>window.calls.destroyed),2,'ending the show destroys the board');
 assert.deepEqual(errors,[]);
});

test('without a host: no insert button, and the wall slide is presented as its cover',options,async t=>{
 const {page,errors}=await open(t,false);
 await page.locator('.cv-tray-menu summary').click();
 assert.equal(await page.locator('[data-add-wall]').count(),0);
 await page.keyboard.press('Escape');
 await page.locator('.cv-show-btn').click();
 const count=page.locator('.cv-show-count');await count.waitFor();
 await page.keyboard.press('ArrowRight');
 await page.waitForFunction(()=>document.querySelector('.cv-show-count')?.textContent==='2 / 2');
 await page.locator('.cv-show').getByText('415 468').waitFor();
 assert.equal(await page.locator('.cv-show-activity').count(),0);
 assert.deepEqual(errors,[]);
});
