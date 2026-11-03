// Real presenter + real phone UI/relay, with local nonpersistent transport only.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const common=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const hostRoot=resolve(process.env.MINICAN_REMOTE_ROOT||common+'/../g-ai-lab-inline/dist');
const hosted=!!process.env.MINICAN_HOST_ROOT,base=hosted?'/minican':'';
const source=hosted?resolve(process.env.MINICAN_HOST_ROOT,'minican'):common;
const transport=`export {remoteCode,newRemoteCode,remoteUrl} from './onbatang-remote-api.js?original';
export async function openRemoteChannel(code){const bus=new BroadcastChannel('cue-test:'+code),handlers=new Map();
bus.onmessage=e=>{for(const fn of handlers.get(e.data.event)||[])fn(e.data.payload);};
return {send:async(event,payload)=>bus.postMessage({event,payload}),on(event,fn){if(!handlers.has(event))handlers.set(event,new Set());handlers.get(event).add(fn);},close(){handlers.clear();bus.close();}};}`;
const fixture=`<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="${base}/src/editor.css"><link rel="stylesheet" href="${base}/app/app.css"><body class="mc-app"><main id="app"></main><script type="module">
import {startMinican,openSavedDesign} from '${base}/app/app.js';
import {newRecord} from '${base}/app/designs.js';
import {putDesign,listDesigns,setStorageName} from '${base}/app/store.js';
import {markTourSeen,NEWS_KEY} from '${base}/app/tour.js';
import {createShowRemote} from '/remote/onbatang-remote.js';
setStorageName('cue-remote-test');for(const id of ['home','editor',NEWS_KEY])markTourSeen(id);
let record=(await listDesigns())[0];
if(!record){record=newRecord('16:9');record.name='픽셀 수업 · 구절 메모';record.slides[0].notes='슬라이드 전체 메모';
record.slides[0].items=[{id:'enoteremote01',t:'text',text:'점 관찰\\n픽셀 연결\\n그림 완성',x:50,y:50,w:80,size:5,color:'#24634e',
effect:{id:'beatintro',reveal:'step',when:'press',sceneTracks:[
{key:'phrase1',start:400,duration:200,teacherNote:'메모 A: 먼저 작은 점을 찾아요.'},
{key:'phrase2',start:0,duration:200,teacherNote:'메모 B: 학생 답을 듣고 연결해요.'},
{key:'phrase3',start:800,duration:200,teacherNote:'메모 C: 완성한 그림을 함께 설명해요.'}]}}];
record.slides.push({...structuredClone(record.slides[0]),id:'snoteremote02',notes:'다음 슬라이드 메모',items:[]});await putDesign(record);}
await startMinican({storage:'cue-remote-test',${hosted?"showRemote:createShowRemote({base:location.origin+'/remote/'})":"phoneRemote:{url:location.origin+'/remote/onbatang-remote-relay.html'}"}});
await openSavedDesign(record.id);window.ready=true;</script>`;

test('phrase notes reach the phone through public relay and host adapter, survive reconnect and keep controls usable',{
  skip:!process.env.MINICAN_PLAYWRIGHT_PATH,timeout:120000
},async t=>{
  const server=createServer(async(req,res)=>{
    try{
      const u=new URL(req.url,'http://local'),p=u.pathname;
      const type={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2'};
      res.setHeader('Content-Type',type[extname(p)]||'application/octet-stream');
      if(p==='/fixture.html')return res.end(fixture);
      if(p==='/remote/onbatang-remote-api.js'&&!u.search)return res.end(transport);
      if(p==='/remote/community-config.js')return res.end('export default {provider:"local"};');
      const remote=p.startsWith('/remote/'),root=remote?hostRoot:source;
      const name=remote?p.slice('/remote'.length):hosted?p.slice(base.length):p;
      const f=resolve(root,'.'+decodeURIComponent(name));if(!f.startsWith(root+sep))throw Error();
      res.end(await readFile(f));
    }catch{res.writeHead(404);res.end();}
  });
  await new Promise(done=>server.listen(0,'127.0.0.1',done));t.after(()=>server.close());
  const origin='http://127.0.0.1:'+server.address().port;
  const {chromium,webkit}=await import(pathToFileURL(process.env.MINICAN_PLAYWRIGHT_PATH).href);
  const browser=process.env.MINICAN_BROWSER==='webkit'?await webkit.launch():await chromium.launch({channel:'msedge',headless:true});t.after(()=>browser.close());
  const context=await browser.newContext({viewport:{width:1280,height:800},reducedMotion:'reduce'});
  const errors=[];context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
  await context.route('**/*',route=>{const url=new URL(route.request().url());return url.origin===origin||['data:','blob:'].includes(url.protocol)?route.continue():route.abort();});
  const teacher=await context.newPage();await teacher.goto(origin+'/fixture.html');await teacher.waitForFunction(()=>window.ready);
  await teacher.reload();await teacher.waitForFunction(()=>window.ready);
  await teacher.locator('.cv-show-btn').click();await teacher.locator('[data-show-remote]').click();
  let remote=teacher;
  if(!hosted){await teacher.locator('iframe.cv-phone-remote').waitFor();remote=await teacher.locator('iframe.cv-phone-remote').contentFrame();}
  await remote.locator('.obr-link').waitFor();const url=await remote.locator('.obr-link').textContent();
  const phone=await context.newPage();await phone.setViewportSize({width:390,height:844});await phone.goto(url);
  await phone.locator('.orv-cues').waitFor();
  assert.equal(await phone.locator('.orv-cue-count').textContent(),'0 / 3 구절');
  assert.equal(await phone.locator('.orv-cue-next').textContent(),'픽셀 연결');
  assert.match(await phone.locator('.orv-cue-next-note').textContent(),/메모 B/);
  await phone.locator('[data-remote=next]').click();
  await phone.waitForFunction(()=>document.querySelector('.orv-cue-count').textContent==='1 / 3 구절'&&document.querySelector('.orv-cue-phase').textContent==='다음 입력 대기');
  assert.equal(await phone.locator('.orv-cue-current').textContent(),'픽셀 연결');
  assert.match(await phone.locator('.orv-cue-current-note').textContent(),/메모 B/);
  assert.match(await phone.locator('.orv-cue-next-note').textContent(),/메모 A/);
  assert.equal(await teacher.locator('.cv-show-stage').textContent().then(t=>t.includes('메모 B')),false);
  // A reconnect obtains the live cue without replaying a navigation command.
  await phone.reload();await phone.locator('.orv-cues').waitFor();
  assert.equal(await phone.locator('.orv-cue-count').textContent(),'1 / 3 구절');
  await phone.evaluate(()=>window.dispatchEvent(new Event('offline')));
  assert.equal(await phone.locator('[data-remote=next]').isDisabled(),true);
  await phone.evaluate(()=>window.dispatchEvent(new Event('online')));
  await phone.waitForFunction(()=>!document.querySelector('[data-remote=next]').disabled);
  assert.equal(await phone.locator('.orv-cue-count').textContent(),'1 / 3 구절');
  const folder=resolve(common,'work/cue-notes-'+(hosted?'host':'public')+'-'+(process.env.MINICAN_BROWSER||'edge'));await mkdir(folder,{recursive:true});
  for(const size of [{width:390,height:844},{width:844,height:390},{width:320,height:568}]){
    await phone.setViewportSize(size);await phone.locator('button[data-mode=prompter]').click();
    await phone.locator('.orv-font-range').fill('48');
    assert.equal(await phone.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    const room=await phone.locator('.orv-cues').boundingBox(),dock=await phone.locator('.orv-dock').boundingBox();
    assert.ok(room.height>=55&&room.y+room.height<=dock.y+1,'cue scroll area stays above controls');
    const text=await phone.locator('.orv-cue-current').evaluate(n=>({top:n.getBoundingClientRect().top,line:parseFloat(getComputedStyle(n).lineHeight)}));
    await phone.screenshot({path:resolve(folder,'phone-'+size.width+'.png')});
    assert.ok(room.y+room.height-text.top>=text.line,'one full line at largest font: '+JSON.stringify({size,room,text}));
    const key=await phone.locator('[data-remote=next]').boundingBox();assert.ok(key.y+key.height<=size.height+1);
    await phone.screenshot({path:resolve(folder,'phone-'+size.width+'.png')});
  }
  await phone.setViewportSize({width:390,height:844});await phone.locator('.orv-font-range').fill('24');
  await phone.screenshot({path:resolve(folder,'phone-390-default.png')});
  assert.equal(await phone.evaluate(()=>Object.values(sessionStorage).join('').includes('메모 B')),false);
  await phone.locator('[data-remote=next]').click();await phone.waitForFunction(()=>document.querySelector('.orv-cue-count').textContent==='2 / 3 구절');
  assert.match(await phone.locator('.orv-cue-current-note').textContent(),/메모 A/);
  await phone.locator('[data-remote=prev]').click();await phone.waitForFunction(()=>document.querySelector('.orv-cue-count').textContent==='1 / 3 구절');
  assert.match(await phone.locator('.orv-cue-current-note').textContent(),/메모 B/);
  await teacher.locator('.cs-reset').click();await phone.waitForFunction(()=>document.querySelector('.orv-cue-count').textContent==='0 / 3 구절');
  await teacher.locator('.cs-close').click();await phone.locator('.orv-cues').waitFor({state:'hidden'});
  assert.equal(await phone.locator('.orv-notes').textContent(),'슬라이드 전체 메모');
  await phone.locator('[data-remote=next]').click();await phone.waitForFunction(()=>document.querySelector('.orv-count').textContent==='2 / 2');
  assert.equal(await phone.locator('.orv-notes').textContent(),'다음 슬라이드 메모');
  assert.equal(await phone.locator('.orv-cues').isVisible(),false);
  assert.deepEqual(errors,[]);
});
