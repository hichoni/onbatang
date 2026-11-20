import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve,sep,extname} from 'node:path';
const root=fileURLToPath(new URL('../../',import.meta.url));
test('HTML first-screen poster captures rendered text, canvas and SVG in isolation and survives saving', {skip:!process.env.MINICAN_PLAYWRIGHT_PATH,timeout:60000},async t=>{
  const server=createServer(async(req,res)=>{try{
    let p=new URL(req.url,'http://localhost').pathname;
    if(p==='/fixture.html'){res.setHeader('Content-Type','text/html');return res.end('<!doctype html><body>Preview test</body>');}
    const file=resolve(root,'.'+decodeURIComponent(p));if(!file.startsWith(resolve(root)+sep))throw Error();
    res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));
  }catch{res.writeHead(404);res.end();}});
  await new Promise(done=>server.listen(0,'127.0.0.1',done));t.after(()=>{server.closeAllConnections();server.close();});
  const {chromium}=await import(pathToFileURL(process.env.MINICAN_PLAYWRIGHT_PATH).href),browser=await chromium.launch({channel:'msedge',headless:true});t.after(()=>browser.close());
  const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/fixture.html`);
  const result=await page.evaluate(async()=>{
    const {htmlFirstScreen}=await import('/app/html-preview.js'),{readHtmlFile}=await import('/app/html-import.js'),{cleanDesign}=await import('/src/model.js'),{linkCard}=await import('/app/link-card.js');
    const html='<!doctype html><style>html,body{margin:0;width:100%;height:100%;background:#123456}h1{color:white;font:80px sans-serif}.second{display:none}</style><h1>HTML FIRST PAGE</h1><canvas width="200" height="200"></canvas><svg width="200" height="200"><rect width="200" height="200" fill="#00ff00"/></svg><section class="second">SECOND PAGE</section><script>document.querySelector("canvas").getContext("2d").fillStyle="#ff0000";document.querySelector("canvas").getContext("2d").fillRect(0,0,200,200);try{parent.document.body.dataset.compromised="true"}catch{}</script>';
    const poster=await htmlFirstScreen(html);window.poster=poster;
    const image=new Image();image.src=poster;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
    const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;let red=0,green=0,white=0;
    for(let i=0;i<pixels.length;i+=4){if(pixels[i]>220&&pixels[i+1]<30)red++;if(pixels[i]<30&&pixels[i+1]>220)green++;if(pixels[i]>220&&pixels[i+1]>220&&pixels[i+2]>220)white++;}
    const record=await readHtmlFile(new File([html],'deck.html'));record.slides[0].web.poster=poster;
    const clean=cleanDesign(record.slides[0]);const card=await linkCard([record]);
    return {poster:poster.slice(0,30),length:poster.length,red,green,white,preserved:clean.web.poster===poster,card:card?.slice(0,4),unsafe:document.body.dataset.compromised,frames:document.querySelectorAll('iframe').length};
  });
  assert.match(result.poster,/^data:image\/jpeg;base64,/);assert.ok(result.red>10000,JSON.stringify(result));assert.ok(result.green>10000,JSON.stringify(result));assert.ok(result.white>1000,JSON.stringify(result));
  assert.ok(result.preserved);assert.equal(result.card,'/9j/');assert.equal(result.unsafe,undefined);assert.equal(result.frames,0);
  await mkdir(resolve(root,'work'),{recursive:true});const data=await page.evaluate(()=>window.poster);await writeFile(resolve(root,'work/html-first-screen.jpg'),Buffer.from(data.split(',')[1],'base64'));
});
// GSAP·three.js 발표처럼 첫 화면을 requestAnimationFrame 으로 띄우는 HTML: 브라우저가 썸네일 틀을 "안 보이는 틀"로 보고 화면 갱신을 멈추면 바탕색만 찍힌다.
test('HTML first-screen poster waits for scenes revealed by requestAnimationFrame',{skip:!process.env.MINICAN_PLAYWRIGHT_PATH,timeout:60000},async t=>{
  const server=createServer(async(req,res)=>{try{
    let p=new URL(req.url,'http://localhost').pathname;
    if(p==='/fixture.html'){res.setHeader('Content-Type','text/html');return res.end('<!doctype html><body style="background:#fff">Preview test</body>');}
    const file=resolve(root,'.'+decodeURIComponent(p));if(!file.startsWith(resolve(root)+sep))throw Error();
    res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));
  }catch{res.writeHead(404);res.end();}});
  await new Promise(done=>server.listen(0,'127.0.0.1',done));t.after(()=>{server.closeAllConnections();server.close();});
  const {chromium}=await import(pathToFileURL(process.env.MINICAN_PLAYWRIGHT_PATH).href),browser=await chromium.launch({channel:'msedge',headless:true});t.after(()=>browser.close());
  const page=await browser.newPage({viewport:{width:390,height:844}});await page.goto(`http://127.0.0.1:${server.address().port}/fixture.html`);
  const result=await page.evaluate(async()=>{
    const {htmlFirstScreen}=await import('/app/html-preview.js');
    // 장면이 투명하게 시작해 화면 갱신 24번에 걸쳐 나타나고(GSAP 처럼 style 을 매번 고친다), 다 나타나면 표시를 남긴다.
    const html='<!doctype html><style>html,body{margin:0;width:100%;height:100%;background:#07181e}#scene{position:absolute;inset:0;opacity:0;background:#ff0000}</style><div id="scene"></div><script>let n=0;const scene=document.getElementById("scene");const step=()=>{n++;scene.style.opacity=String(Math.min(1,n/24));if(n<24)requestAnimationFrame(step);else document.body.dataset.settled="1"};requestAnimationFrame(step);</script>';
    const poster=await htmlFirstScreen(html);
    const image=new Image();image.src=poster;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
    const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;let red=0;
    for(let i=0;i<pixels.length;i+=4)if(pixels[i]>220&&pixels[i+1]<40&&pixels[i+2]<40)red++;
    const frame=[...document.querySelectorAll('iframe')];
    return {length:poster.length,red,total:pixels.length/4,frames:frame.length};
  });
  assert.ok(result.red>result.total*.9,JSON.stringify(result));assert.equal(result.frames,0);
  // 썸네일 틀은 화면에 보이지 않고, 누르거나 초점을 옮길 수 없어야 한다.
  const placement=await page.evaluate(async()=>{
    const {htmlFirstScreen}=await import('/app/html-preview.js');
    const job=htmlFirstScreen('<!doctype html><body style="background:#ff0000"><button autofocus>focus</button>');
    await new Promise(r=>setTimeout(r,50));const frame=document.querySelector('iframe');const style=getComputedStyle(frame);
    const info={opacity:+style.opacity,pointer:style.pointerEvents,inert:frame.inert,hidden:frame.getAttribute('aria-hidden'),hit:document.elementFromPoint(10,10)===frame};
    await job;return info;
  });
  assert.ok(placement.opacity>0&&placement.opacity<=.001,JSON.stringify(placement));
  assert.equal(placement.pointer,'none');assert.equal(placement.inert,true);assert.equal(placement.hidden,'true');assert.equal(placement.hit,false);
});
// 고치기 전(0.156.0)에 바탕색만 찍혀 저장된 썸네일: 자료를 열면 첫 장면이 담긴 썸네일로 바꿔 저장하고, 공유 카드도 새로 그린다.
test('a saved flat poster is recognised and replaced with the real first screen when the HTML is opened',{skip:!process.env.MINICAN_PLAYWRIGHT_PATH,timeout:90000},async t=>{
  const fixture='<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/src/editor.css"><link rel="stylesheet" href="/app/app.css"><body class="mc-app"><main id="app"></main><script type="module">import {startMinican} from \'/app/app.js\';import {listDesigns,putDesign} from \'/app/store.js\';import {markTourSeen,NEWS_KEY} from \'/app/tour.js\';for(const name of [\'home\',\'editor\',NEWS_KEY])markTourSeen(name);window.listDesigns=listDesigns;window.putDesign=putDesign;await startMinican({storage:\'html-poster-refresh\'});window.ready=true;</script>';
  const server=createServer(async(req,res)=>{try{
    let p=new URL(req.url,'http://localhost').pathname;
    if(p==='/fixture.html'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(fixture);}
    const file=resolve(root,'.'+decodeURIComponent(p));if(!file.startsWith(resolve(root)+sep))throw Error();
    res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));
  }catch{res.writeHead(404);res.end();}});
  await new Promise(done=>server.listen(0,'127.0.0.1',done));t.after(()=>{server.closeAllConnections();server.close();});
  const {chromium}=await import(pathToFileURL(process.env.MINICAN_PLAYWRIGHT_PATH).href),browser=await chromium.launch({channel:'msedge',headless:true});t.after(()=>browser.close());
  const page=await browser.newPage({viewport:{width:1280,height:820}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/fixture.html`);await page.waitForFunction(()=>window.ready);
  const html='<!doctype html><style>html,body{margin:0;width:100%;height:100%;background:#07181e}#scene{position:absolute;inset:0;opacity:0;background:#ff0000}</style><div id="scene"></div><script>let n=0;const scene=document.getElementById("scene");const step=()=>{n++;scene.style.opacity=String(Math.min(1,n/24));if(n<24)requestAnimationFrame(step)};requestAnimationFrame(step);</script>';
  const checks=await page.evaluate(async html=>{
    const {blankPoster}=await import('/app/html-preview.js'),{readHtmlFile}=await import('/app/html-import.js'),{linkCard}=await import('/app/link-card.js');
    const jpeg=paint=>{const c=document.createElement('canvas');c.width=960;c.height=540;const g=c.getContext('2d');paint(g);return c.toDataURL('image/jpeg',.8);};
    const flat=jpeg(g=>{g.fillStyle='#07181e';g.fillRect(0,0,960,540);});
    const titled=jpeg(g=>{g.fillStyle='#07181e';g.fillRect(0,0,960,540);g.fillStyle='#fff';g.font='bold 18px sans-serif';g.fillText('K-EDU 27',40,40);});
    const record=await readHtmlFile(new File([html],'deck.html'));record.slides[0].web.poster=flat;await window.putDesign(record);
    // 공유 카드도 저장된 단색 썸네일 대신 첫 장면으로 그린다.
    const card=await linkCard([record]);const image=new Image();image.src='data:image/jpeg;base64,'+card;await image.decode();
    const c=document.createElement('canvas');c.width=1200;c.height=630;const g=c.getContext('2d');g.drawImage(image,0,0);const center=[...g.getImageData(600,315,1,1).data];
    return {flat:await blankPoster(flat),titled:await blankPoster(titled),broken:await blankPoster('data:image/jpeg;base64,/9j/2Q=='),center};
  },html);
  assert.equal(checks.flat,true);assert.equal(checks.titled,false);assert.equal(checks.broken,true);
  assert.ok(checks.center[0]>220&&checks.center[1]<60,JSON.stringify(checks));
  await page.reload();await page.waitForFunction(()=>window.ready);
  await page.locator('.cv-item .cv-thumb').first().click();
  // 저장소에 새 썸네일이 적힐 때까지 기다린다(waitForFunction 은 비동기 결과를 기다리지 않으므로 직접 되묻는다).
  const savedCenter=()=>page.evaluate(async()=>{const [r]=await window.listDesigns();const p=r?.slides?.[0]?.web?.poster;if(!p)return null;const image=new Image();image.src=p;await image.decode();const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const g=c.getContext('2d');g.drawImage(image,0,0);return [...g.getImageData(c.width>>1,c.height>>1,1,1).data];});
  let saved=await savedCenter();for(const until=Date.now()+20000;!(saved?.[0]>220)&&Date.now()<until;saved=await savedCenter())await page.waitForTimeout(500);
  await mkdir(resolve(root,'work'),{recursive:true});const posterData=await page.evaluate(async()=>(await window.listDesigns())[0].slides[0].web.poster);await writeFile(resolve(root,'work/html-poster-refresh.jpg'),Buffer.from(posterData.split(',')[1],'base64'));
  assert.ok(saved[0]>220&&saved[1]<60,JSON.stringify(saved));assert.deepEqual(errors,[]);
});
