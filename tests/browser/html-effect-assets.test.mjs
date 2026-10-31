import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdtemp,rm,rmdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {extname,resolve,sep,join} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';

test('element effects survive editor saves and run in the presenter and the downloaded offline HTML', {
  skip:!process.env.MINICAN_PLAYWRIGHT_PATH, timeout:100000,
}, async t => {
  const hosted = !!process.env.MINICAN_HOST_ROOT, base = hosted ? '/minican' : '';
  const root = resolve(process.env.MINICAN_HOST_ROOT || fileURLToPath(new URL('../../',import.meta.url)));
  const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2','.json':'application/json'};
  const server = createServer(async (req,res) => {
    try {
      const url = new URL(req.url,'http://localhost');
      if (url.pathname === '/seed') { res.setHeader('content-type','text/html'); return res.end('<!doctype html><title>Seed</title>'); }
      const name = resolve(root,'.'+decodeURIComponent(url.pathname));
      if (!name.startsWith(root+sep)) throw Error('path');
      res.setHeader('content-type',types[extname(name)] || 'application/octet-stream');
      res.end(await readFile(name));
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(done => server.listen(0,'127.0.0.1',done));
  t.after(() => server.close());
  const origin = 'http://127.0.0.1:'+server.address().port;
  const {chromium} = await import(pathToFileURL(process.env.MINICAN_PLAYWRIGHT_PATH).href);
  const browser = await chromium.launch({channel:process.env.MINICAN_BROWSER || 'msedge',headless:true});
  t.after(() => browser.close());
  const page = await browser.newPage({viewport:{width:1280,height:800}});
  page.setDefaultTimeout(12000);
  const errors = [];
  page.on('pageerror',e => errors.push(e.message));
  await page.goto(origin+'/seed');
  const id = await page.evaluate(async base => {
    const {newRecord} = await import(base+'/app/designs.js'), store = await import(base+'/app/store.js');
    store.setStorageName(base ? 'gailab-minican' : 'minican');
    const record = newRecord('16:9');
    record.name='모션 에셋 수업';
    record.slides=[0,1].map(i => ({id:'passets00'+i,bg:'#263441',items:[{
      id:'eassets00'+i,t:'text',x:35,y:45,w:38,size:7,color:'#ffffff',text:i?'완성':'회로를 눌러요',
      ...(i ? {effect:{id:'confetti',when:'open',note:'완성했어요'}} : {}),
    }]}));
    await store.putDesign(record);
    const tour=await import(base+'/app/tour.js'); tour.markTourSeen('editor'); tour.markTourSeen(tour.NEWS_KEY);
    return record.id;
  },base);
  await page.goto(origin+(hosted?'/minican-app.html':'/app/index.html'));
  await page.getByRole('button',{name:'모션 에셋 수업 열기',exact:true}).click();
  await page.locator('.cv-canvas .fe-stage .fi-text').first().click();
  await page.locator('.fe-tab[data-tab=motion]').click();
  await page.locator('.fe-fx-picker summary').click();
  for (const id of ['prism','orbit','confetti','signal']) {
    await page.locator('[data-effect-asset='+id+']').click();
    assert.ok(await page.locator('.fe-fx-sample svg g').count() >= 3);
  }
  await page.getByLabel('효과 설명').fill('전기가 흐르는 길');
  await page.locator('[data-apply-effect]').click();
  await page.waitForFunction(async ({base,id}) => {
    const d=await (await import(base+'/app/store.js')).getDesign(id);
    return d?.slides[0].items[0]?.effect?.note === '전기가 흐르는 길';
  },{base,id});
  await page.getByRole('button',{name:'이 장 미리 보기',exact:true}).click();
  await interact(page.locator('.cv-canvas .fe-stage'));
  await page.reload();
  const saved = await page.evaluate(async ({id,base}) => (await (await import(base+'/app/store.js')).getDesign(id)).slides[0].items[0].effect,{base,id});
  assert.deepEqual(saved,{id:'signal',when:'press',note:'전기가 흐르는 길'});
  if (!await page.locator('.cv-show-btn').isVisible()) await page.getByRole('button',{name:'모션 에셋 수업 열기',exact:true}).click();
  await page.locator('.cv-show-btn').click();
  async function interact(surface) {
    const hit = surface.locator('[data-effect-trigger=signal]');
    await hit.click();
    assert.equal(await surface.locator('[data-effect-note]').textContent(),'전기가 흐르는 길');
    assert.equal(await hit.getAttribute('aria-expanded'),'true');
    await hit.press('Enter');
    assert.equal(await hit.getAttribute('aria-expanded'),'false');
    assert.equal(await surface.locator('[data-effect-note]').count(),0);
  }
  await interact(page.locator('.cv-show-stage'));
  await page.keyboard.press('ArrowRight');
  await page.locator('.cv-show-stage [data-effect-note]').filter({hasText:'완성했어요'}).waitFor();
  await page.keyboard.press('Escape');
  await page.locator('.cv-down-btn').click();
  await page.locator('[data-type=html]').click();
  const ready=page.waitForEvent('download');
  await page.locator('[data-download-save]').click();
  const dir=await mkdtemp(join(tmpdir(),'onbatang-effects-'));
  const file=join(dir,'lesson.html');
  t.after(async () => { await rm(file,{force:true}); await rmdir(dir); });
  await (await ready).saveAs(file);
  const offline=await browser.newContext({offline:true,reducedMotion:'reduce',viewport:{width:390,height:844}});
  const opened=await offline.newPage(); opened.setDefaultTimeout(10000);
  opened.on('pageerror',e => errors.push(e.message));
  await opened.goto(pathToFileURL(file).href);
  const frame=opened.locator('.lesson-effects-frame');
  await interact(frame);
  const geometry=await frame.evaluate(f => {
    const slide=f.querySelector('img').getBoundingClientRect(), hit=f.querySelector('[data-effect-trigger]').getBoundingClientRect();
    return [(hit.left+hit.width/2-slide.left)/slide.width,(hit.top+hit.height/2-slide.top)/slide.height];
  });
  assert.ok(Math.abs(geometry[0]-.35)<.01 && Math.abs(geometry[1]-.45)<.01);
  await opened.locator('.lesson-navigation').getByRole('button',{name:/다음/}).click();
  await frame.locator('[data-effect-note]').filter({hasText:'완성했어요'}).waitFor();
  assert.equal(await frame.locator('[data-effect-playing] svg').evaluate(n => n.getAnimations({subtree:true}).length),0);
  assert.deepEqual(errors,[]);
});
