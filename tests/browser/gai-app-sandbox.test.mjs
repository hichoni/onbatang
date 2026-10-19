import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {resolve,extname,sep,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {newGaiActivity} from '../../src/gai-app.js';
import {createHtmlLesson} from '../../app/html-lesson.js';
const options={skip:!process.env.MINICAN_PLAYWRIGHT_PATH,timeout:90000};
const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF1sAAAAASUVORK5CYII=';
const source=`<main><button id="step">단계 실행</button><output id="count"></output><canvas width="64" height="64"></canvas><output id="ack"></output></main><script>
const bridge="ONBATANG_APP_BRIDGE_TOKEN",initial={me:{checkpoint:{"onbatangRestoreMarker":"ONBATANG_APP_CHECKPOINT"}}};
let count=initial.me.checkpoint.count||0;window.replies=[];
function draw(){document.getElementById('count').textContent=String(count);const c=document.querySelector('canvas').getContext('2d');c.fillStyle='#ef6461';c.fillRect(0,0,64,64);}
function report(patch,token=bridge){const request=crypto.randomUUID();parent.postMessage({type:'gai-classroom-report',bridge:token,request,patch},'*');return request;}
function capture(){return {checkpoint:{count},state:{count},answer:count+'단계 완료',progress:Math.min(100,count*10),score:count,completed:false};}
window.fixture={report,get bridge(){return bridge;},get count(){return count;},snapshot:null};
addEventListener('message',event=>{const d=event.data;if(event.source!==parent||d?.bridge!==bridge)return;window.replies.push(d);if(d.type==='gai-classroom-state')fixture.snapshot=d.snapshot;if(d.type==='gai-classroom-result')document.getElementById('ack').textContent=d.error||'saved';});
document.getElementById('step').onclick=()=>{count++;draw();report(capture());};document.addEventListener('change',()=>report(capture()));draw();report(capture());
</script>`;
const make=()=>newGaiActivity({title:'실행 앱',instructions:'단계를 실행하고 저장해요.',document:source,project:{template:'freeform',title:'실행 앱'},state:{count:2}});
const frame=page=>page.frameLocator('.gai-app-frame').frameLocator('[data-gai-app-content]');

async function setup(t,{noReady=false}={}){
 const server=createServer(async(req,res)=>{try{const pathname=new URL(req.url,'http://localhost').pathname;if(pathname==='/test.html'){res.setHeader('Content-Type','text/html');return res.end('<!doctype html><html><meta charset="utf-8"><div id="root"></div><script type="module">import {mountGaiApp} from "/app/gai-app.js";window.mountGaiApp=mountGaiApp;</script></html>');}const file=resolve(root,'.'+pathname);if(!file.startsWith(root+sep))throw Error('path');res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css'})[extname(file)]||'text/html');res.end(await readFile(file));}catch{res.writeHead(404);res.end();}});
 await new Promise(yes=>server.listen(0,'127.0.0.1',yes));t.after(()=>new Promise(yes=>server.close(yes)));
 const origin=`http://127.0.0.1:${server.address().port}`,{chromium}=await import(pathToFileURL(process.env.MINICAN_PLAYWRIGHT_PATH).href);
 // This Edge/Playwright combination loses the CDP target for nested opaque
 // srcdoc frames. Keep same-origin/CSP/sandbox rules, but run test frames in one
 // renderer process so their visible UI is reachable by the test driver.
 const browser=await chromium.launch({channel:process.env.MINICAN_BROWSER||'msedge',headless:true,args:['--disable-features=IsolateOrigins,site-per-process','--disable-site-isolation-trials']});t.after(()=>browser.close());
 const context=await browser.newContext({acceptDownloads:true,viewport:{width:1024,height:768}}),external=[];
 await context.route('**/*',route=>{const url=route.request().url();if(/^https?:/.test(url)&&!url.startsWith(origin+'/')){external.push(url);return route.abort();}return route.continue();});
 const page=await context.newPage();page.setDefaultTimeout(10000);if(process.env.MINICAN_GAI_DEBUG){page.on('console',m=>console.log('browser',m.type(),m.text()));page.on('pageerror',e=>console.log('pageerror',e.message));for(const event of ['frameattached','framenavigated','framedetached'])page.on(event,f=>console.log(event,f.url()));}await page.goto(origin+'/test.html');await page.waitForFunction(()=>typeof window.mountGaiApp==='function');
 const activity=make();if(noReady)activity.document=activity.document.replace('draw();report(capture());\n</script>','draw();\n</script>');
 await page.evaluate(activity=>{localStorage.setItem('private-host-token','secret');window.changes=[];window.saved=[];window.failSave=false;window.runtime=window.mountGaiApp(document.getElementById('root'),{activity,onChange:state=>changes.push(state),onSave:result=>{if(window.failSave)throw Error('disk full');saved.push(result);}});},activity);
 await frame(page).locator('#count').waitFor();if(!noReady)await page.waitForFunction(()=>window.changes.length===1);
 return {page,context,browser,external};
}

test('opaque generated app authenticates reports, restores state and only saves after an outer user action',options,async t=>{
 const {page,external}=await setup(t),app=frame(page);
 assert.equal(await app.locator('#count').innerText(),'2');assert.equal(await page.locator('.gai-app-frame').getAttribute('sandbox'),'allow-scripts');
 const isolation=await app.locator('body').evaluate(()=>{let parentBlocked=false,storageBlocked=false;try{parent.document.body.innerHTML;}catch{parentBlocked=true;}try{localStorage.getItem('private-host-token');}catch{storageBlocked=true;}return{parentBlocked,storageBlocked,token:fixture.bridge,snapshot:fixture.snapshot};});
 assert.ok(isolation.parentBlocked&&isolation.storageBlocked);assert.notEqual(isolation.token,'ONBATANG_APP_BRIDGE_TOKEN');assert.doesNotMatch(JSON.stringify(isolation.snapshot),/private-host-token|secret/);
 await app.locator('#step').click();await page.waitForFunction(()=>runtime.getState().count===3);assert.equal(await page.evaluate(()=>saved.length),0);
 await app.locator('body').evaluate(()=>{fixture.report({checkpoint:{count:999}},'wrong-token');fixture.report({checkpoint:{count:999},progress:101});fixture.report({checkpoint:{text:'x'.repeat(18001)}});});
 await app.locator('#ack').filter({hasText:'형식이나 크기'}).waitFor();assert.deepEqual(await page.evaluate(()=>runtime.getState()),{count:3});
 // Knowing the token does not authorize a sibling or top-level window.
 await page.evaluate(token=>window.postMessage({type:'gai-classroom-report',bridge:token,request:crypto.randomUUID(),patch:{checkpoint:{count:999}}},'*'),isolation.token);
 await page.evaluate(()=>new Promise(yes=>requestAnimationFrame(()=>requestAnimationFrame(yes))));assert.deepEqual(await page.evaluate(()=>runtime.getState()),{count:3});
 await page.evaluate(()=>window.failSave=true);await page.getByRole('button',{name:'결과를 다음 슬라이드에 저장'}).click();await page.locator('.gai-app-status').filter({hasText:'disk full'}).waitFor();assert.equal(await app.locator('#count').innerText(),'3');assert.equal(await page.evaluate(()=>saved.length),0);
 await page.evaluate(()=>window.failSave=false);await page.getByRole('button',{name:'결과를 다음 슬라이드에 저장'}).click();await page.waitForFunction(()=>saved.length===1);
 const saved=await page.evaluate(()=>saved[0]);assert.deepEqual(saved.state,{count:3});assert.equal(saved.answer,'3단계 완료');assert.match(saved.image,/^data:image\/png;base64,/);assert.ok(saved.image.length<=40000);assert.deepEqual(external,[]);
 await page.evaluate(activity=>{activity.state=runtime.getState();runtime.destroy();window.runtime=mountGaiApp(document.getElementById('root'),{activity,onChange:state=>changes.push(state),onSave:result=>saved.push(result)});},make());
 assert.equal(await app.locator('#count').innerText(),'3');await page.evaluate(()=>runtime.destroy());assert.equal(await page.locator('.gai-app-frame').count(),0);
});

test('CSP blocks network calls, embedded external frames and app self-navigation before any request',options,async t=>{
 const {page,external}=await setup(t),app=frame(page);
 await app.locator('body').evaluate(()=>{fetch('https://example.com/private-token').catch(()=>{});const image=new Image();image.src='https://example.com/image.png';document.body.append(image);const child=document.createElement('iframe');child.src='https://example.com/frame';document.body.append(child);const form=document.createElement('form');form.action='https://example.com/post';form.method='post';document.body.append(form);form.submit();location.href='https://example.com/escape';});
 await page.evaluate(()=>new Promise(yes=>setTimeout(yes,250)));assert.deepEqual(external,[]);assert.deepEqual(await page.evaluate(()=>runtime.getState()),{count:2});
 await page.getByRole('button',{name:'결과를 다음 슬라이드에 저장'}).click();await page.locator('.gai-app-status').filter({hasText:'응답을 기다리다'}).waitFor();assert.equal(await page.evaluate(()=>saved.length),0,'a failed capture cannot fabricate an empty result');
});

test('saving waits for a complete initial capture and propagates adapter flush failures',options,async t=>{
 const {page}=await setup(t,{noReady:true}),app=frame(page),save=page.getByRole('button',{name:'결과를 다음 슬라이드에 저장'});
 assert.equal(await save.isDisabled(),true);assert.equal(await page.evaluate(()=>saved.length),0);
 await app.locator('#step').click();await page.waitForFunction(()=>runtime.getState().count===3);assert.equal(await save.isEnabled(),true);
 await app.locator('body').evaluate(()=>window.GAIClassroom={flush:async()=>{throw Error('capture failure');}});await save.click();await page.locator('.gai-app-status').filter({hasText:'최신 진행 기록을 읽지 못했어요'}).waitFor();assert.equal(await page.evaluate(()=>saved.length),0);assert.equal(await app.locator('#count').innerText(),'3');
 await app.locator('body').evaluate(()=>window.GAIClassroom.flush=async()=>{document.getElementById('step').click();});await save.click();await page.waitForFunction(()=>saved.length===1);assert.equal(await page.evaluate(()=>saved[0].state.count),4,'flush publishes the last state before result creation');
});

test('offline HTML restores generated app checkpoint and includes app and result in a reopened download',options,async t=>{
 const {page,context,browser,external}=await setup(t),workRoot=join(root,'work');await mkdir(workRoot,{recursive:true});const work=await mkdtemp(join(workRoot,'gai-html-test-')),path=join(work,'lesson.html');
 const activity=make();await writeFile(path,Buffer.from(await createHtmlLesson({title:'앱 수업',pages:[{id:'pfirst123',image,aspect:16/9},{id:'pactivity123',image,aspect:16/9,activity},{id:'plast123',image,aspect:16/9}]}).arrayBuffer()));
 await context.setOffline(true);await page.goto(pathToFileURL(path).href);await page.getByRole('button',{name:'다음',exact:true}).click();await page.getByRole('button',{name:'활동 시작'}).click();await frame(page).locator('#step').click();await frame(page).locator('#ack').filter({hasText:'saved'}).waitFor();
 await page.getByRole('button',{name:'결과를 다음 슬라이드에 저장'}).click();await page.locator('.lesson-count').filter({hasText:'3 / 4쪽 · 결과'}).waitFor();assert.ok(await page.locator('.lesson-slide').evaluate(img=>img.complete&&img.naturalWidth===1280));
 await page.reload();assert.equal(await page.locator('.lesson-count').innerText(),'3 / 4쪽 · 결과');await page.getByRole('button',{name:'이전',exact:true}).click();await page.getByRole('button',{name:'활동 시작'}).click();assert.equal(await frame(page).locator('#count').innerText(),'3');
 const pending=page.waitForEvent('download');await page.getByRole('button',{name:'현재 수업 내려받기'}).click();const copy=join(work,'with-result.html');await(await pending).saveAs(copy);
 const fresh=await browser.newContext({offline:true});t.after(()=>fresh.close());const again=await fresh.newPage();await again.goto(pathToFileURL(copy).href);assert.equal(await again.locator('.lesson-count').innerText(),'1 / 4쪽');await again.getByRole('button',{name:'다음',exact:true}).click();await again.getByRole('button',{name:'활동 시작'}).click();assert.equal(await frame(again).locator('#count').innerText(),'3');assert.deepEqual(external,[]);
});
