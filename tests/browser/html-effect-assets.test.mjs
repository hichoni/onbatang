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
    record.slides[0].items.push(
      {id:'ekinetic01',t:'text',x:40,y:17,w:60,size:4,text:'작은 픽셀이 모인다',color:'#ffffff'},
      {id:'ebarstory01',t:'chart',x:77,y:72,w:35,h:37,kind:'hbar',title:'모둠별 픽셀 변화',unit:'칸',
        labels:['파랑','노랑','초록'],series:[{name:'1차',values:[-3,0,7]},{name:'2차',values:[2,4,9]}]});
    await store.putDesign(record);
    const tour=await import(base+'/app/tour.js'); tour.markTourSeen('editor'); tour.markTourSeen(tour.NEWS_KEY);
    return record.id;
  },base);
  await page.goto(origin+(hosted?'/minican-app.html':'/app/index.html'));
  await page.getByRole('button',{name:'모션 에셋 수업 열기',exact:true}).click();
  await page.locator('.cv-canvas .fe-stage .fi-text').first().click();
  await page.locator('.fe-tab[data-tab=motion]').click();
  await page.locator('.fe-fx-picker summary').click();
  assert.ok(await page.locator('[data-effect-asset=bars]').isDisabled());
  for (const id of ['prism','orbit','confetti','underline','constellation','signal']) {
    await page.locator('[data-effect-asset='+id+']').click();
    assert.ok(await page.locator('.fe-fx-sample svg g').count() >= 2);
  }
  await page.getByLabel('효과 설명').fill('전기가 흐르는 길');
  await page.getByLabel('재생 속도',{exact:true}).selectOption('slow');
  await page.getByLabel('효과 색감',{exact:true}).selectOption('sunset');
  await page.locator('[data-apply-effect]').click();
  await page.waitForFunction(async ({base,id}) => {
    const d=await (await import(base+'/app/store.js')).getDesign(id);
    return d?.slides[0].items[0]?.effect?.note === '전기가 흐르는 길';
  },{base,id});
  await page.getByRole('button',{name:'이 장 미리 보기',exact:true}).click();
  await interact(page.locator('.cv-canvas .fe-stage'));
  // Stop preview by reopening the motion tab, then author both content scenes.
  await page.locator('.fe-tab[data-tab=motion]').click();
  async function applyScene(item,asset) {
    await item.click();
    const tab=page.locator('.fe-tab[data-tab=motion]');
    if (await tab.getAttribute('aria-selected')!=='true' || await page.locator('.cv-app.folded').count()) await tab.click();
    const picker=page.locator('.fe-fx-picker');
    if (await picker.getAttribute('open')===null) await picker.locator('summary').click();
    await picker.locator('[data-effect-asset='+asset+']').click();
    await picker.locator('[data-apply-effect]').click();
  }
  await applyScene(page.locator('.cv-canvas .fe-stage .fi-text').nth(1),'kinetic');
  await applyScene(page.locator('.cv-canvas .fe-stage .fi-chart').first(),'bars');
  await page.waitForFunction(async ({base,id}) => (await (await import(base+'/app/store.js')).getDesign(id))?.slides[0].items[2].effect?.id==='bars',{base,id});
  await page.reload();
  const reopen = page.getByRole('button',{name:'모션 에셋 수업 열기',exact:true});
  await reopen.or(page.locator('.cv-show-btn')).first().waitFor();
  if (await reopen.isVisible()) await reopen.click();
  await page.locator('.cv-canvas .fe-stage .fi-text').first().waitFor();
  const saved = await page.evaluate(async ({id,base}) => (await (await import(base+'/app/store.js')).getDesign(id)).slides[0].items[0].effect,{base,id});
  assert.deepEqual(saved,{id:'signal',when:'press',note:'전기가 흐르는 길',pace:'slow',palette:'sunset'});
  await page.locator('.cv-show-btn').click();
  async function interact(surface) {
    const hit = surface.locator('[data-effect-trigger=signal]');
    await hit.click();
    assert.equal(await surface.locator('[data-effect-note]').textContent(),'전기가 흐르는 길');
    const signal=surface.locator('[data-effect-playing=signal] svg');
    assert.equal(await signal.locator('path').first().getAttribute('stroke'),'#ffd678');
    const timing=await signal.evaluate(svg=>svg.getAnimations({subtree:true})[0]?.effect.getTiming().duration ?? null);
    assert.equal(timing,await signal.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches)?null:1080*1.55);
    assert.equal(await hit.getAttribute('aria-expanded'),'true');
    await hit.press('Enter');
    assert.equal(await hit.getAttribute('aria-expanded'),'false');
    assert.equal(await surface.locator('[data-effect-note]').count(),0);
  }
  async function checkScenes(surface) {
    await surface.locator('[data-effect-trigger=kinetic]').click();
    const title=surface.locator('[data-effect-playing=kinetic]');
    assert.deepEqual(await title.locator('text[font-weight="800"]').allTextContents(),['작은','픽셀이','모인다']);
    await title.getByRole('button',{name:'강조 화면 닫기'}).click();
    await surface.locator('[data-effect-trigger=bars]').click();
    const chart=surface.locator('[data-effect-playing=bars]');
    const labels=await chart.locator('svg text').allTextContents();
    for (const text of ['모둠별 픽셀 변화','단위 · 칸','파랑','노랑','초록','1차','2차','-3','7','9']) assert.ok(labels.includes(text),text);
    const bars=await chart.locator('rect').evaluateAll(nodes=>nodes.slice(1).map(n=>[Number(n.getAttribute('x')),Number(n.getAttribute('width'))]));
    assert.equal(bars.length,6);
    assert.equal(bars[2][1],0,'zero stays zero');
    assert.ok(Math.abs(bars[0][0]+bars[0][1]-bars[1][0])<.001,'negative and positive bars meet at zero');
    await chart.getByRole('button',{name:'강조 화면 닫기'}).click();
  }
  await interact(page.locator('.cv-show-stage'));
  await checkScenes(page.locator('.cv-show-stage'));
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
  await checkScenes(frame);
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
