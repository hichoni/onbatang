import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const repo=resolve(fileURLToPath(new URL('../../',import.meta.url)));
test('teacher connects elements, edits camera and timing, previews and saves without changing artwork',{
 skip:!process.env.MINICAN_PLAYWRIGHT_PATH,timeout:90000,
},async t=>{
 const hosted=!!process.env.MINICAN_HOST_ROOT,base=hosted?'/minican':'',root=resolve(process.env.MINICAN_HOST_ROOT||repo);
 const server=createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');if(url.pathname==='/seed'){res.setHeader('Content-Type','text/html');return res.end('<!doctype html><title>Seed</title>');}const p=resolve(root,'.'+decodeURIComponent(url.pathname));if(!p.startsWith(root+sep))throw Error();res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html;charset=utf-8','.css':'text/css','.woff2':'font/woff2','.json':'application/json','.svg':'image/svg+xml'})[extname(p)]||'application/octet-stream');res.end(await readFile(p));}catch{res.writeHead(404);res.end();}});
 await new Promise(done=>server.listen(0,'127.0.0.1',done));t.after(()=>new Promise(done=>server.close(done)));
 const origin=`http://127.0.0.1:${server.address().port}`,pw=await import(pathToFileURL(process.env.MINICAN_PLAYWRIGHT_PATH));
 const browser=await(process.env.MINICAN_BROWSER==='webkit'?pw.webkit.launch():pw.chromium.launch({channel:'msedge'}));t.after(()=>browser.close());
 const page=await browser.newPage({viewport:{width:1280,height:950},reducedMotion:'no-preference'}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);await page.goto(origin+'/seed');
 const id=await page.evaluate(async base=>{
  const {newRecord}=await import(base+'/app/designs.js'),store=await import(base+'/app/store.js');store.setStorageName(base?'gailab-minican':'minican');
  const record=newRecord('16:9');record.name='이어지는 별 관측';record.slides=[0,1,2].map(i=>({id:'pflowbrowser0'+i,bg:'#f4efe2',items:[
   {id:'eflowheading0'+i,t:'text',text:['밤하늘의 지도','가까이 보는 별','다시 전체로'][i],x:50,y:15,w:80,size:5,color:'#173c36'},
   {id:'eflowcircle0'+i,t:'shape',shape:'circle',color:'#d9734d',x:25,y:60,w:18,h:32},
   {id:'eflowrect0'+i,t:'shape',shape:'rect',color:'#337265',x:72,y:55,w:26,h:35}]}));await store.putDesign(record);
  const tour=await import(base+'/app/tour.js');for(const id of['home','editor',tour.NEWS_KEY])tour.markTourSeen(id);return record.id;
 },base);
 await page.goto(origin+(hosted?'/minican-app.html':'/app/index.html'));await page.getByRole('button',{name:'이어지는 별 관측 열기',exact:true}).click();
 await page.locator('[data-tab=motion]').click();await page.locator('[data-slide-flow]').click();
 const panel=page.locator('.flow-panel');await panel.waitFor();
 assert.ok(await panel.locator('.sf-stage').evaluate(n=>n.clientHeight>150),'transition preview has a visible canvas');
 await panel.locator('[data-flow-source] .fi-shape').first().click();await panel.locator('[data-flow-target] .fi-shape').last().click();
 await panel.getByRole('button',{name:'선택한 두 요소 연결',exact:true}).click();
 await panel.getByRole('button',{name:'카메라 구도',exact:true}).click();
 await panel.getByLabel('카메라 확대',{exact:true}).evaluate(el=>{el.value='2';el.dispatchEvent(new Event('input',{bubbles:true}));});
 await panel.getByLabel('카메라 가로 중심').fill('70');await panel.getByLabel('카메라 세로 중심').fill('55');
 await panel.getByLabel('모핑 이동 시간').selectOption('2400');await panel.getByLabel('모핑 이동 리듬').selectOption('direct');
 const slider=panel.getByLabel('모핑 전환 위치');const frames=[];
 for(const p of[0,50,100]){await slider.evaluate((el,value)=>{el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));},String(p));frames.push(await panel.locator('.sf-stage>.fe-card:last-child .fi-shape').last().evaluate(n=>{const r=n.getBoundingClientRect();return{x:r.x+r.width/2,w:r.width};}));}
 assert.ok(frames[1].w>frames[0].w && frames[2].w>frames[1].w,'intermediate frames grow progressively');
 await panel.getByRole('button',{name:/전환 재생/}).click();await page.waitForTimeout(2600);await slider.press('Home');assert.equal(await slider.inputValue(),'0');
 await mkdir(resolve(repo,'work/flow-review'),{recursive:true});await panel.screenshot({path:resolve(repo,`work/flow-review/${hosted?'gai':'public'}-desktop.png`),scale:'css'});
 await page.setViewportSize({width:390,height:844});assert.ok(await panel.evaluate(n=>n.scrollWidth<=n.clientWidth+1),'mobile has no horizontal overflow');
 await panel.getByRole('button',{name:'자료에 적용·저장',exact:true}).click();await panel.waitFor({state:'detached'});
 await page.reload();await page.locator('[data-tab=motion]').click();await page.locator('[data-slide-flow]').click();await panel.waitFor();
 await panel.getByRole('button',{name:'카메라 구도',exact:true}).click();assert.equal(await panel.getByLabel('카메라 확대',{exact:true}).inputValue(),'2');assert.equal(await panel.getByLabel('모핑 이동 시간').inputValue(),'2400');
 await panel.screenshot({path:resolve(repo,`work/flow-review/${hosted?'gai':'public'}-phone.png`),scale:'css'});
 await panel.getByRole('button',{name:'앞 장 카메라 편집',exact:true}).click();
 await panel.getByLabel('카메라 확대',{exact:true}).evaluate(el=>{el.value='3';el.dispatchEvent(new Event('input',{bubbles:true}));});
 await panel.getByRole('button',{name:'전체 화면으로',exact:true}).click();assert.equal(await panel.getByLabel('카메라 확대',{exact:true}).inputValue(),'1');
 await panel.getByRole('button',{name:'도착 장 카메라 편집',exact:true}).click();assert.equal(await panel.getByLabel('카메라 확대',{exact:true}).inputValue(),'2','resetting the first camera leaves the destination camera intact');
 const saved=await page.evaluate(async({base,id})=>(await(await import(base+'/app/store.js')).getDesign(id)),{base,id});
 assert.deepEqual(saved.slides[1].camera,{x:70,y:55,z:2});assert.equal(saved.slides[1].travel.ms,2400);assert.equal(saved.slides[1].items[2].x,72);assert.equal(saved.slides[1].items[2].w,26);
 assert.equal(saved.slides[0].items[1].morphKey,saved.slides[1].items[2].morphKey);assert.equal(saved.slides[2].camera,undefined);
 await panel.getByRole('button',{name:'전체 화면으로',exact:true}).click();await panel.getByRole('button',{name:'취소',exact:true}).click();
 const again=await page.evaluate(async({base,id})=>(await(await import(base+'/app/store.js')).getDesign(id)),{base,id});assert.deepEqual(again,saved,'cancel does not alter stored lesson');
 const transaction=await page.evaluate(async({base,saved})=>{
  const store=await import(base+'/app/store.js');
  const a=await store.putDesign({...saved,id:'dflowpart001'}),b=await store.putDesign({...saved,id:'dflowpart002'});
  await store.putDesign({...b,name:'다른 창에서 고친 파트',revision:b.revision+1});
  let error;try{await store.replaceDesignsIfUnchanged([{expected:a,record:{...a,name:'새 모션 A'}},{expected:b,record:{...b,name:'새 모션 B'}}]);}catch(e){error=e.message;}
  const unchanged=JSON.stringify(await store.getDesign(a.id))===JSON.stringify(a),latestB=await store.getDesign(b.id);
  const committed=await store.replaceDesignsIfUnchanged([{expected:a,record:{...a,name:'새 모션 A'}},{expected:latestB,record:{...latestB,name:'새 모션 B'}}]);
  return {error,unchanged,names:committed.map(r=>r.name)};
 },{base,saved});assert.equal(transaction.error,'DRAFT_CHANGED');assert.ok(transaction.unchanged,'a conflicting second part rolls back the first');assert.deepEqual(transaction.names,['새 모션 A','새 모션 B']);
 await page.setViewportSize({width:1280,height:950});
 const rendered=await page.evaluate(async({base,saved})=>{
  const {mountPlayer}=await import(base+'/app/player.js'),stage=document.createElement('div');Object.assign(stage.style,{position:'fixed',inset:'50px auto auto 20px',width:'800px',zIndex:99999});document.body.append(stage);
  const player=mountPlayer(stage,{slides:saved.slides,aspect:16/9});player.go(1);
  const tracks=stage.getAnimations({subtree:true});tracks.forEach(a=>a.pause());
  const widths=[0,1200,2399].map(ms=>{tracks.forEach(a=>a.currentTime=ms);return stage.querySelector('.fe-card:last-child .fi-shape:last-child').getBoundingClientRect().width;});
  tracks.forEach(a=>{if(Number.isFinite(a.effect.getTiming().iterations))a.finish();});await new Promise(requestAnimationFrame);
  const landed=stage.querySelector('.fe-card:last-child .fi-shape:last-child').getBoundingClientRect().width;
  player.prev();const reverse=stage.getAnimations({subtree:true}).some(a=>a.effect.getTiming().duration===2400);
  player.destroy();stage.remove();return{widths,landed,reverse};
 },{base,saved});assert.ok(rendered.widths[0]<rendered.widths[1]&&rendered.widths[1]<rendered.widths[2]);assert.ok(Math.abs(rendered.landed-416)<1,'camera framing survives into presentation');assert.ok(rendered.reverse,'reverse navigation uses the same custom duration');
 assert.deepEqual(errors,[]);
});
