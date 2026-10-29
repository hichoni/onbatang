// Local editable template rendering. No account, external service or paid QA.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile, mkdir} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve,extname,sep} from 'node:path';

const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const html=`<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/src/editor.css"><style>
body{margin:0;padding:20px;background:#eceee8;font-family:Arial,sans-serif}main{display:grid;gap:18px;grid-template-columns:repeat(3,400px)}article{width:400px}h2{font-size:15px;margin:0 0 7px}.fe-card{width:400px;border-radius:0!important;box-shadow:0 2px 5px #0002}
</style><main></main><script type="module">
import {OCCASION_LAYOUTS} from '/app/occasion-layouts.js';import{configure,layoutItems}from'/src/model.js';import{designView}from'/src/render.js';
import{ONBATANG_FONTS,ONBATANG_TITLE_FONT}from'/app/fonts.js';import{setTitleFont}from'/app/templates.js';import{registerFonts}from'/src/fonts.js';configure({fonts:ONBATANG_FONTS});setTitleFont(ONBATANG_TITLE_FONT);registerFonts(ONBATANG_FONTS);
window.draw=aspect=>{configure({layouts:OCCASION_LAYOUTS,aspect,maxItems:40});const out=[];for(const l of OCCASION_LAYOUTS){const article=document.createElement('article'),heading=document.createElement('h2');heading.textContent=l.group+' · '+l.name;article.append(heading);const card=designView({bg:l.bg,items:layoutItems(l.id)});card.dataset.layout=l.id;card.style.setProperty('--fe-ratio',aspect);article.append(card);out.push(article);}document.querySelector('main').replaceChildren(...out);};draw(16/9);window.ready=true;
</script>`;

test('all occasion templates render readable text within the page in wide and portrait ratios',{
  skip:!process.env.MINICAN_PLAYWRIGHT_PATH,timeout:90000,
},async t=>{
  const server=createServer(async(req,res)=>{try{const path=new URL(req.url,'http://localhost').pathname;if(path==='/fixture.html'){res.setHeader('Content-Type','text/html');return res.end(html);}const file=resolve(root,'.'+decodeURIComponent(path));if(!file.startsWith(root+sep))throw Error('path');res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404);res.end();}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
  const {chromium}=await import(pathToFileURL(process.env.MINICAN_PLAYWRIGHT_PATH));
  const browser=await chromium.launch({channel:'msedge',headless:true});t.after(()=>browser.close());
  const page=await browser.newPage({viewport:{width:1280,height:800}});const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  const origin='http://127.0.0.1:'+server.address().port;
  await page.route('**/*',r=>r.request().url().startsWith(origin+'/')?r.continue():r.abort());
  await page.goto(origin+'/fixture.html');await page.waitForFunction(()=>window.ready);
  const dir=resolve(root,'work/qa-occasion-layouts-2026-10-29');await mkdir(dir,{recursive:true});
  for(const [name,aspect] of [['wide',16/9],['portrait',9/16]]){
    await page.evaluate(a=>window.draw(a),aspect);await page.evaluate(()=>document.fonts.ready);
    const outside=await page.locator('.fe-card').evaluateAll(cards=>cards.flatMap(card=>{const bounds=card.getBoundingClientRect();return [...card.querySelectorAll('.fi-text')].flatMap(n=>{const b=n.getBoundingClientRect();return b.left<bounds.left-2||b.right>bounds.right+2||b.top<bounds.top-2||b.bottom>bounds.bottom+2?[{layout:card.dataset.layout,text:n.textContent}]:[];});}));
    assert.deepEqual(outside,[],name);
    assert.equal(await page.locator('.fe-card').count(),30);
    await page.screenshot({path:resolve(dir,`occasion-${name}.png`),fullPage:true});
    for(const id of ['event-award','event-break','training-cover','training-practice','school-entrance','school-graduation','school-thanks','meeting-roadmap','guide-notice','guide-direction']){
      await page.locator('[data-layout="occasion-'+id+'"]').screenshot({path:resolve(dir,name+'-'+id+'.png')});
    }
  }
  assert.deepEqual(errors,[]);
});
