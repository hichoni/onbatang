// Original collection contact sheets and real text geometry; fresh local UI only.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const html=`<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/src/editor.css"><style>
body{margin:0;padding:18px;background:#e4e6e1;font-family:Arial,sans-serif}main{display:grid;grid-template-columns:repeat(5,320px);gap:16px}article{width:320px}h2{font-size:12px;margin:0 0 7px}.fe-card{width:320px;border-radius:0!important;box-shadow:0 2px 4px #0002}
</style><main></main><script type="module">
import{COLLECTION_LAYOUTS}from'/app/design-collections.js';import{configure,layoutItems}from'/src/model.js';import{designView}from'/src/render.js';
window.draw=aspect=>{configure({layouts:COLLECTION_LAYOUTS,aspect,maxItems:40});document.querySelector('main').replaceChildren(...COLLECTION_LAYOUTS.map(layout=>{const article=document.createElement('article'),h=document.createElement('h2');h.textContent=layout.name;article.append(h);const card=designView({bg:layout.bg,items:layoutItems(layout.id)});card.dataset.layout=layout.id;card.style.setProperty('--fe-ratio',aspect);article.append(card);return article;}));};draw(16/9);window.ready=true;</script>`;

test('four five-page collections render as coordinated wide/portrait documents without text clipping or collisions',{
skip:!process.env.MINICAN_PLAYWRIGHT_PATH,timeout:90000},async t=>{
 const server=createServer(async(req,res)=>{try{const path=new URL(req.url,'http://localhost').pathname;if(path==='/fixture.html'){res.setHeader('Content-Type','text/html;charset=utf-8');return res.end(html);}const f=resolve(root,'.'+decodeURIComponent(path));if(!f.startsWith(root+sep))throw Error();res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2'})[extname(f)]||'application/octet-stream');res.end(await readFile(f));}catch{res.writeHead(404);res.end();}});
 await new Promise(done=>server.listen(0,'127.0.0.1',done));t.after(()=>new Promise(done=>server.close(done)));
 const{chromium}=await import(pathToFileURL(process.env.MINICAN_PLAYWRIGHT_PATH));const browser=await chromium.launch({channel:'msedge',headless:true});t.after(()=>browser.close());
 const page=await browser.newPage({viewport:{width:1700,height:1000}}),origin='http://127.0.0.1:'+server.address().port;await page.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():route.abort());await page.goto(origin+'/fixture.html');await page.waitForFunction(()=>window.ready);
 const dir=resolve(root,'work/qa-design-collections-2026-10-30');await mkdir(dir,{recursive:true});
 for(const[name,aspect]of[['wide',16/9],['portrait',9/16]]){
  await page.evaluate(a=>window.draw(a),aspect);await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:resolve(dir,'collections-'+name+'.png'),fullPage:true});
  const issues=await page.locator('.fe-card').evaluateAll(cards=>cards.flatMap(card=>{const result=[],bounds=card.getBoundingClientRect(),nodes=[...card.querySelectorAll('.fi-text')],rows=nodes.map(node=>({box:node.getBoundingClientRect(),text:node.textContent}));for(const row of rows)if(row.box.left<bounds.left-2||row.box.top<bounds.top-2||row.box.right>bounds.right+2||row.box.bottom>bounds.bottom+2)result.push({id:card.dataset.layout,kind:'outside',text:row.text});for(let i=0;i<rows.length;i++)for(let j=i+1;j<rows.length;j++){const a=rows[i].box,b=rows[j].box,dx=Math.min(a.right,b.right)-Math.max(a.left,b.left),dy=Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top);if(dx>2&&dy>2)result.push({id:card.dataset.layout,kind:'overlap',a:rows[i].text,b:rows[j].text,dy:Math.round(dy)});}return result;}));
  assert.deepEqual(issues,[],name);
 }
});
