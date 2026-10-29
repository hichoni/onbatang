// Inspect the actual composited intermediate frames, not only whether an
// Animation exists. A late idle used to replace the morph's transform.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const html=`<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/src/editor.css"><link rel="stylesheet" href="/app/player.css"><style>body{margin:30px;background:#ddd}#stage{width:960px}</style><div id="stage"></div><script type="module">
import{mountPlayer}from'/app/player.js';import{cleanDesign}from'/src/model.js';
const shape={id:'econtinuous01',t:'shape',shape:'circle',x:25,y:55,w:18,h:32,color:'#db6037',lp:'breathe',an:'none'};
const heading={id:'econtinuous02',t:'text',text:'ONE CONTINUOUS SPACE',x:50,y:15,w:80,size:3,color:'#1b2b24',an:'none',lp:'none'};
window.player=mountPlayer(document.querySelector('#stage'),{slides:[cleanDesign({id:'pcontinuous01',bg:'#f3efe5',items:[heading,shape]}),cleanDesign({id:'pcontinuous02',bg:'#f3efe5',tr:'move',items:[{...heading,id:'econtinuous03',origin:{elementId:heading.id}},{...shape,id:'econtinuous04',origin:{elementId:shape.id},x:68,w:28,h:49.7778}]})],aspect:16/9});window.ready=true;</script>`;
test('idle and morph have one continuous rendered pose at take-off, mid-flight and landing',
 {skip:!process.env.MINICAN_PLAYWRIGHT_PATH,timeout:60000},async t=>{
 const server=createServer(async(req,res)=>{try{const p=new URL(req.url,'http://localhost').pathname;if(p==='/fixture.html'){res.setHeader('Content-Type','text/html;charset=utf-8');return res.end(html);}const f=resolve(root,'.'+decodeURIComponent(p));if(!f.startsWith(root+sep))throw Error();res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css'})[extname(f)]||'application/octet-stream');res.end(await readFile(f));}catch{res.writeHead(404);res.end();}});
 await new Promise(done=>server.listen(0,'127.0.0.1',done));t.after(()=>new Promise(done=>server.close(done)));
 const{chromium}=await import(pathToFileURL(process.env.MINICAN_PLAYWRIGHT_PATH).href),browser=await chromium.launch({channel:process.env.MINICAN_BROWSER||'msedge',headless:true});t.after(()=>browser.close());
 const page=await browser.newPage({viewport:{width:1040,height:660},reducedMotion:'no-preference'});await page.goto(`http://127.0.0.1:${server.address().port}/fixture.html`);await page.waitForFunction(()=>window.ready);
 const before=await page.evaluate(()=>{const n=document.querySelector('.fi-shape'),loop=n.getAnimations().find(a=>a.effect.getTiming().iterations===Infinity);loop.pause();loop.currentTime=loop.effect.getTiming().delay+1500;const r=n.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height};});
 const initial=await page.evaluate(()=>{window.player.next();const n=document.querySelector('#stage>.fe-card:last-child .fi-shape');window.tracks=document.querySelector('#stage').getAnimations({subtree:true});for(const a of window.tracks){a.pause();a.currentTime=0;}const r=n.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height,idleDelay:n.getAnimations().find(a=>a.effect.getTiming().iterations===Infinity).effect.getTiming().delay};});
 for(const key of['x','y','w','h'])assert.ok(Math.abs(initial[key]-before[key])<1.1,`no take-off snap ${key}: ${before[key]} → ${initial[key]}`);
 assert.equal(initial.idleDelay,1000,'the idle cannot run over the camera transition');
 const frames=[];const dir=resolve(root,'work/qa-creative-direction-2026-10-30');await mkdir(dir,{recursive:true});
 for(const ms of[0,250,500,750,990]){
  const sample=await page.evaluate(ms=>{for(const a of window.tracks)a.currentTime=ms;const r=document.querySelector('#stage>.fe-card:last-child .fi-shape').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height};},ms);frames.push(sample);
  await page.locator('#stage').screenshot({path:resolve(dir,`morph-${ms}.png`)});
 }
 for(let i=1;i<frames.length;i++){assert.ok(frames[i].x>frames[i-1].x,'camera position progresses through intermediate frames');assert.ok(frames[i].w>frames[i-1].w,'shared artwork grows continuously');}
 const landed=await page.evaluate(async()=>{for(const a of window.tracks){if(a.effect.getTiming().iterations!==Infinity)a.finish();else a.currentTime=1000;}await new Promise(requestAnimationFrame);const r=document.querySelector('#stage>.fe-card:last-child .fi-shape').getBoundingClientRect();return{x:r.x+r.width/2,w:r.width,cards:document.querySelectorAll('#stage>.fe-card').length};});
 assert.equal(landed.cards,1);assert.ok(Math.abs(landed.w-960*.28)<1.1);assert.ok(Math.abs(landed.x-frames.at(-1).x)<2,'no landing position jump');assert.ok(Math.abs(landed.w-frames.at(-1).w)<2,'no landing scale jump');
});

