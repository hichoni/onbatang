import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve,extname,sep} from 'node:path';
import {createHtmlLesson} from '../../app/html-lesson.js';
const repo=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const options={skip:!process.env.MINICAN_PLAYWRIGHT_PATH,timeout:120000};

async function setup(t){
  const hosted=!!process.env.MINICAN_HOST_ROOT,root=resolve(process.env.MINICAN_HOST_ROOT||repo),base=hosted?'/minican':'';
  const server=createServer(async(req,res)=>{try{
    const path=new URL(req.url,'http://localhost').pathname;
    if(path==='/seed'){res.setHeader('Content-Type','text/html');return res.end('<!doctype html><title>Seed</title>');}
    const file=resolve(root,'.'+decodeURIComponent(path));if(!file.startsWith(root+sep))throw Error('path');
    res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html;charset=utf-8','.css':'text/css','.woff2':'font/woff2','.svg':'image/svg+xml'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));
  }catch{res.writeHead(404);res.end();}});
  await new Promise(done=>server.listen(0,'127.0.0.1',done));t.after(()=>new Promise(done=>server.close(done)));
  const pw=await import(pathToFileURL(process.env.MINICAN_PLAYWRIGHT_PATH));
  const browser=await(process.env.MINICAN_BROWSER==='webkit'?pw.webkit.launch():pw.chromium.launch({channel:'msedge'}));t.after(()=>browser.close());
  const page=await browser.newPage({viewport:{width:1280,height:900},acceptDownloads:true,reducedMotion:'no-preference'}),errors=[];
  page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  const origin=`http://127.0.0.1:${server.address().port}`,work=resolve(repo,'work/html-morph-'+(hosted?'host':'common')+'-'+(process.env.MINICAN_BROWSER||'edge'));await mkdir(work,{recursive:true});
  return {browser,page,origin,base,hosted,work,errors};
}

test('downloaded HTML morphs offline, reverses, settles rapid moves, retains results and re-exports',options,async t=>{
  const {browser,page,origin,base,hosted,work,errors}=await setup(t);
  await page.goto(origin+'/seed');
  const original=await page.evaluate(async base=>{
    const {newRecord}=await import(base+'/app/designs.js'),store=await import(base+'/app/store.js');store.setStorageName(base?'gailab-minican':'minican');
    const {newPixelActivity}=await import(base+'/src/pixel-art.js');
    const photo=document.createElement('canvas');photo.width=100;photo.height=80;const c=photo.getContext('2d');c.fillStyle='#edb542';c.fillRect(0,0,50,80);c.fillStyle='#337265';c.fillRect(50,0,50,80);
    const record=newRecord('16:9');record.name='오프라인 모핑 수업';record.slides=[0,1,2].map(i=>({id:'phtmlflow00'+i,bg:'#fffdf5',...(i?{tr:'move',travel:{ms:i===1?2400:1200,ease:'smooth'}}:{}),...(i===1?{camera:{x:65,y:50,z:2}}:{}),items:[
      {id:'ehtmlcircle0'+i,t:'shape',shape:'circle',morphKey:'mhtmlchain',color:i===1?'#d9734d':'#337265',x:60,y:60,w:16,h:28,...(i===1?{effect:{id:'prism',when:'press'}}:{})},
      {id:'ehtmltext000'+i,t:'text',origin:{elementId:'ehtmltextroot'},text:'관찰하는 별!',font:'jua',x:50,y:18,w:70,size:5,rot:12,shadow:true,color:'#173c36'},
      {id:'ehtmlphoto00'+i,t:'image',url:photo.toDataURL(),x:30,y:60,w:22,h:30,fx:true,crop:{x:.1,y:0,w:.8,h:1}},
    ]}));
    record.slides.splice(1,0,{id:'phiddenhtml',hidden:true,bg:'#000000',items:[]});
    record.slides.push({id:'pactivityhtml',bg:'#fffdf5',items:[],activity:newPixelActivity()});
    const saved=await store.putDesign(record),tour=await import(base+'/app/tour.js');for(const key of ['home','editor',tour.NEWS_KEY])tour.markTourSeen(key);return saved;
  },base);
  await page.goto(origin+(hosted?'/minican-app.html':'/app/index.html'));
  await page.getByRole('button',{name:'오프라인 모핑 수업 열기',exact:true}).click();
  await page.locator('.cv-down-btn').click();await page.locator('[data-type=html]').click();
  const pending=page.waitForEvent('download',{timeout:60000});await page.locator('[data-download-save]').click();
  const path=resolve(work,'lesson.html');await(await pending).saveAs(path);
  const html=await readFile(path,'utf8'),seed=JSON.parse(html.match(/id="onbatang-lesson-data">([\s\S]*?)<\/script>/)[1]);
  assert.equal(seed.pages.length,4,'hidden slide excluded');assert.equal(seed.pages.filter(p=>p.flow).length,3);
  assert.equal(seed.pages[1].flow.travel.ms,2400);assert.equal(seed.pages[1].flow.items[0].x,40,'camera projected once');
  assert.ok(html.length<4_000_000,'small teaching fixture stays compact');
  assert.doesNotMatch(html,/<script\b[^>]*src=|<link\b/);
  const stored=await page.evaluate(async({base,id})=>{const s=await import(base+'/app/store.js');s.setStorageName(base?'gailab-minican':'minican');return s.getDesign(id);},{base,id:original.id});
  assert.deepEqual(stored.slides,original.slides,'export does not change artwork or motion');

  const context=await browser.newContext({offline:true,acceptDownloads:true,viewport:{width:1280,height:900},reducedMotion:'no-preference'});t.after(()=>context.close());
  const offline=await context.newPage(),requests=[];offline.on('pageerror',e=>errors.push(e.message));offline.on('request',r=>requests.push(r.url()));
  await offline.goto(pathToFileURL(path).href);
  const next=offline.getByRole('button',{name:'다음',exact:true}),prev=offline.getByRole('button',{name:'이전',exact:true});
  async function seekFrames(duration){
    await offline.locator('[data-flow-playing=playing]').waitFor();
    const frames=[];
    for(const p of [0,.5,.9999]){
      frames.push(await offline.evaluate(({p,duration})=>{
      const root=document.querySelector('.lesson-flow-stage');for(const a of root.getAnimations({subtree:true})){a.pause();a.currentTime=p*duration;}
      const box=root.lastElementChild.querySelector('.fi').getBoundingClientRect();return {x:box.x+box.width/2,w:box.width};
      },{p,duration}));
      if(p===.5)await offline.screenshot({path:resolve(work,'morph-middle.png')});
    }
    assert.ok(Math.abs(frames[0].w-frames[2].w)>20,'elements change size');
    assert.ok(frames[1].w>Math.min(frames[0].w,frames[2].w) && frames[1].w<Math.max(frames[0].w,frames[2].w),'middle frame is between endpoints');
    const endLayer=await offline.locator('.lesson-effects-frame').screenshot();
    await offline.evaluate(()=>{for(const a of document.querySelector('.lesson-flow-stage').getAnimations({subtree:true}))a.finish();});
    await offline.locator('[data-flow-playing]').waitFor({state:'detached'});
    assert.equal(await offline.locator('.lesson-flow-stage').count(),0);
    const endRaster=await offline.locator('.lesson-effects-frame').screenshot();
    const diff=await offline.evaluate(async pair=>{
      const images=await Promise.all(pair.map(async s=>{const image=new Image();image.src='data:image/png;base64,'+s;await image.decode();return image;}));
      const canvas=document.createElement('canvas');canvas.width=images[0].width;canvas.height=images[0].height;const c=canvas.getContext('2d');
      c.drawImage(images[0],0,0);const a=c.getImageData(0,0,canvas.width,canvas.height).data;c.clearRect(0,0,canvas.width,canvas.height);c.drawImage(images[1],0,0);const b=c.getImageData(0,0,canvas.width,canvas.height).data;
      let different=0;for(let i=0;i<a.length;i+=4)if(Math.max(...[0,1,2].map(k=>Math.abs(a[i+k]-b[i+k])))>40)different++;
      return different/(a.length/4);
    },[endLayer.toString('base64'),endRaster.toString('base64')]);
    assert.ok(diff<.025,`morph lands on the original raster without a visual jump (${diff})`);
  }
  await next.click();await seekFrames(2400);
  await offline.locator('[data-effect-trigger=prism]').click();await offline.locator('[data-effect-playing=prism]').waitFor();
  await prev.click();await seekFrames(2400);
  await next.click();await next.click();await prev.click();
  await offline.locator('[data-flow-playing]').waitFor({state:'detached'});
  assert.match(await offline.locator('.lesson-count').textContent(),/^2 \/ 4/);
  await offline.setViewportSize({width:390,height:844});await next.click();
  await offline.locator('[data-flow-playing=playing]').waitFor();await offline.setViewportSize({width:844,height:390});
  await offline.locator('[data-flow-playing]').waitFor({state:'detached'});
  assert.equal(await offline.locator('.lesson-slide').evaluate(n=>getComputedStyle(n).visibility),'visible');
  await offline.emulateMedia({reducedMotion:'reduce'});await prev.click();
  assert.equal(await offline.locator('.lesson-flow-stage').count(),0,'reduced motion skips transition');
  await offline.emulateMedia({reducedMotion:'no-preference'});
  await offline.locator('.lesson-stage').focus();await offline.keyboard.press('End');await offline.getByRole('button',{name:'활동 시작',exact:true}).click();
  await offline.locator('[data-pixel="0"]').click();await offline.getByRole('button',{name:'결과를 다음 슬라이드에 저장',exact:true}).click();
  assert.match(await offline.locator('.lesson-count').textContent(),/^5 \/ 5/);
  const saving=offline.waitForEvent('download');await offline.getByRole('button',{name:'현재 수업 내려받기',exact:true}).click();
  const copy=resolve(work,'lesson-with-results.html');await(await saving).saveAs(copy);
  const fresh=await browser.newContext({offline:true,viewport:{width:390,height:844},reducedMotion:'no-preference'});t.after(()=>fresh.close());
  const again=await fresh.newPage();await again.goto(pathToFileURL(copy).href);
  assert.match(await again.locator('.lesson-count').textContent(),/^1 \/ 5/);
  await again.getByRole('button',{name:'▶ 발표 모드',exact:true}).click();await again.keyboard.press('ArrowRight');
  await again.locator('[data-flow-playing=playing]').waitFor();
  await again.locator('[data-flow-playing]').waitFor({state:'detached'});
  await again.keyboard.press('Escape');await again.reload();assert.match(await again.locator('.lesson-count').textContent(),/^2 \/ 5/);
  assert.ok(requests.every(u=>/^(file:|data:|blob:)/.test(u)),'file playback makes no network requests');assert.deepEqual(errors,[]);
});

test('bad embedded layer and interrupted decode fall back to intact slide images',options,async t=>{
  const {browser,work,errors}=await setup(t),image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF1sAAAAASUVORK5CYII=';
  const flow={version:1,bg:'#ffffff',tr:'move',items:[{id:'ebadimage1',t:'shape',shape:'circle',x:50,y:50,w:20,h:20,rot:0,op:100,image:'data:image/png;base64,iVBORw0KGgo='}]};
  const pages=[0,1,2].map(i=>({id:'pfallback00'+i,image,aspect:16/9,flow}));
  const path=resolve(work,'fallback.html');await writeFile(path,Buffer.from(await createHtmlLesson({title:'복구',pages}).arrayBuffer()));
  const page=await browser.newPage({offline:true,reducedMotion:'no-preference'});page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(path).href);await page.getByRole('button',{name:'다음',exact:true}).click();
  await page.locator('[data-flow-playing]').waitFor({state:'detached'});assert.equal(await page.locator('.lesson-slide').evaluate(n=>getComputedStyle(n).visibility),'visible');
  await page.evaluate(()=>{HTMLImageElement.prototype.decode=()=>new Promise(done=>setTimeout(done,400));});
  await page.getByRole('button',{name:'다음',exact:true}).click();await page.getByRole('button',{name:'이전',exact:true}).click();
  await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(500);
  assert.equal(await page.locator('.lesson-flow-stage').count(),0);assert.match(await page.locator('.lesson-count').textContent(),/^2 \/ 3/);assert.deepEqual(errors,[]);
});
