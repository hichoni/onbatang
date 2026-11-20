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
