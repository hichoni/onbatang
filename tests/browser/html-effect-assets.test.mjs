import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdtemp,rm,rmdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {extname,resolve,sep,join} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';

async function openBrowser(t) {
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
  return {hosted,base,origin,browser,page,errors};
}

test('slide comparison keeps its pair on the same slide and works in a reopened offline lesson', {
  skip:!process.env.MINICAN_PLAYWRIGHT_PATH, timeout:100000,
}, async t=>{
  const {hosted,base,origin,browser,page,errors}=await openBrowser(t);
  await page.evaluate(async base=>{
    const tour=await import(base+'/app/tour.js');
    for(const id of ['home','editor',tour.NEWS_KEY])tour.markTourSeen(id);
  },base);
  await page.goto(origin+(hosted?'/minican-app.html':'/app/index.html'));
  await page.locator('button[data-starts=collection]').click();
  await page.locator('button[data-layout=collection-sundial-1]').click();
  await page.locator('.cv-back').click();
  await page.reload();await page.getByRole('button',{name:'그림자 관측소 열기',exact:true}).click();
  await page.locator('.cv-show-btn').click();
  async function compare(p,small){
    const launch=p.getByRole('button',{name:'두 장 비교 (D)',exact:true});
    await launch.click();
    const d=p.getByRole('dialog',{name:'두 장 비교',exact:true}),range=d.getByRole('slider');
    const l=d.getByLabel('기준 장'),r=d.getByLabel('비교할 장',{exact:true});
    assert.equal(await l.locator('option').count(),5);await r.selectOption({index:3});
    await l.selectOption({index:1});
    assert.deepEqual(await d.locator('.obc-layer').evaluateAll(nodes=>nodes.map(n=>n.dataset.page)),['2','4']);
    const align=await d.locator('.obc-sheet').evaluateAll(nodes=>nodes.map(n=>[n.clientWidth,n.clientHeight]));
    assert.deepEqual(align[0],align[1]);assert.ok(align[0][0]>200 && align[0][1]>100);
    await range.focus();await p.keyboard.press('Home');await p.keyboard.press('ArrowRight');
    assert.equal(await range.inputValue(),'1');await d.getByRole('button',{name:'이 위치 기억'}).click();
    await range.focus();await p.keyboard.press('End');await d.getByRole('button',{name:'이 위치 기억'}).click();
    const mark=d.getByRole('button',{name:'1번 · 1%'});await mark.click();
    await p.keyboard.press('PageDown');assert.equal(await range.inputValue(),'100');
    await p.keyboard.press('PageUp');assert.equal(await range.inputValue(),'1');
    await d.getByRole('button',{name:'포개기'}).click();
    assert.equal(await d.locator('.obc-layer').nth(1).evaluate(n=>getComputedStyle(n).opacity),'0.01');
    await d.getByRole('button',{name:'나란히'}).click();
    assert.ok(await range.isHidden());
    const boxes=await d.locator('.obc-layer').evaluateAll(nodes=>nodes.map(n=>({x:n.offsetLeft,y:n.offsetTop})));
    assert.ok(small?boxes[1].y>boxes[0].y:boxes[1].x>boxes[0].x);
    await d.getByRole('button',{name:'커튼',exact:true}).click();
    await p.keyboard.press('Escape');await d.waitFor({state:'detached'});
    await launch.click();assert.equal(await range.inputValue(),'1');assert.equal(await mark.count(),1);
    const oldLeft=await l.inputValue();await l.selectOption(await r.inputValue());
    assert.equal(await r.inputValue(),oldLeft);assert.equal(await mark.count(),0);
    await d.getByRole('button',{name:'비교 닫기'}).click();await d.waitFor({state:'detached'});
  }
  await compare(page,false);assert.match(await page.locator('.cv-show-count').innerText(),/1 \/ 5/);
  await page.keyboard.press('Escape');
  await page.locator('.cv-down-btn').click();await page.locator('[data-type=html]').click();
  const dl=page.waitForEvent('download');await page.locator('[data-download-save]').click();
  const dir=await mkdtemp(join(tmpdir(),'two-slides-')),file=join(dir,'lesson.html');
  t.after(async()=>{await rm(file,{force:true});await rmdir(dir);});await (await dl).saveAs(file);
  const offline=await browser.newContext({offline:true,reducedMotion:'reduce',viewport:{width:390,height:844}});
  const p=await offline.newPage();p.on('pageerror',e=>errors.push(e.message));
  await p.goto(pathToFileURL(file).href);await p.getByRole('button',{name:/발표 모드/}).click();
  await compare(p,true);assert.match(await p.locator('.lesson-show-count').innerText(),/1 \/ 5/);
  assert.deepEqual(errors,[]);
});

test('element effects survive editor saves and run in the presenter and the downloaded offline HTML', {
  skip:!process.env.MINICAN_PLAYWRIGHT_PATH, timeout:100000,
}, async t => {
  const {hosted,base,origin,browser,page,errors}=await openBrowser(t);
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
    const img=document.createElement('canvas');img.width=60;img.height=40;
    const ctx=img.getContext('2d');ctx.fillStyle='#c01020';ctx.fillRect(0,0,30,40);ctx.fillStyle='#1070c0';ctx.fillRect(30,0,30,40);
    record.slides[1].items.push(
      {id:'etrend0101',t:'chart',kind:'line',title:'기온',unit:'도',labels:['월','화','수'],series:[{name:'관측',values:[-3,0,7]}],x:20,y:25,w:28,h:42,effect:{id:'forecast',note:'관측 종료'}},
      {id:'elens01001',t:'image',url:img.toDataURL(),x:76,y:30,w:26,h:32,rot:14,crop:{x:.5,y:0,w:.5,h:1},effect:{id:'lens'}},
      {id:'ecode01001',t:'text',text:'인공지능',x:72,y:75,w:30,size:6,color:'#ffffff'});
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
  await page.locator('.cv-slide[data-slide="1"]').click();
  await applyScene(page.locator('.cv-canvas .fe-stage .fi-text').filter({hasText:'인공지능'}),'initials');
  await page.getByRole('button',{name:'이 장 미리 보기',exact:true}).click();
  await page.locator('.cv-canvas [data-effect-trigger=initials]').click();
  await page.locator('.cv-canvas [data-effect-playing=initials]').getByRole('button',{name:'첫 글자 공개'}).click();
  await page.getByRole('button',{name:'미리 보기 끝내기',exact:true}).click();
  assert.equal(await page.locator('.cv-canvas [data-effect-playing]').count(),0);
  await page.locator('.cv-slide[data-slide="0"]').click();
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
  async function checkQuestions(surface,offline) {
    for(const [id,actions] of [['forecast',['다음 값 공개','다음 값 공개']],['lens',['렌즈 넓히기','전체 그림 공개']],['initials',['첫 글자 공개','정답 공개']]]){
      const cover=surface.locator('[data-effect-trigger='+id+']');
      await cover.press('Enter');
      const panel=surface.locator('[data-effect-playing='+id+']');
      assert.equal(await panel.getAttribute('data-step'),'0');
      if(id==='initials')assert.ok((await panel.textContent()).includes('ㅇㄱㅈㄴ'));
      for(const [i,action] of actions.entries()){
        if(id==='forecast')assert.doesNotMatch(await panel.textContent(),/관측 종료|관측 · 7도/);
        if(id==='initials')assert.doesNotMatch(await panel.textContent(),/인공지능/);
        await panel.getByRole('button',{name:action}).press('Space');
        assert.equal(await panel.getAttribute('data-step'),String(i+1));
      }
      if(id==='initials')assert.match(await panel.textContent(),/인공지능/);
      if(id==='forecast')assert.match(await panel.textContent(),/관측 · 7도.*관측 종료/);
      if(id==='lens'){
        const image=panel.locator('image');
        assert.ok((await image.getAttribute('href')).startsWith('data:image/'));
        if(offline)assert.equal(await image.getAttribute('href'),await surface.locator('.lesson-slide').getAttribute('src'));
        // At full reveal the visible cropped part must be blue (the source's left half is red).
        const pixel=await panel.locator('svg').first().evaluate(async svg=>{
          const src=new Image();src.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(new XMLSerializer().serializeToString(svg));
          await src.decode();const canvas=document.createElement('canvas');canvas.width=720;canvas.height=360;
          const ctx=canvas.getContext('2d');ctx.drawImage(src,0,0,720,360);return [...ctx.getImageData(360,183,1,1).data];
        });
        assert.ok(pixel[2]>pixel[0]*2,'cropped blue pixel, got '+pixel);
      }
      await panel.getByRole('button',{name:'처음부터'}).click();
      assert.equal(await panel.getAttribute('data-step'),'0');
      await panel.getByRole('button',{name:'닫기',exact:true}).click();
      assert.equal(await cover.getAttribute('aria-expanded'),'false');
    }
  }
  await checkQuestions(page.locator('.cv-show-stage'),false);
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
  await checkQuestions(frame,true);
  assert.deepEqual(errors,[]);
});

test('a teacher starts a motion set, reopens it, presents its linked art and downloads the five-page HTML', {
  skip:!process.env.MINICAN_PLAYWRIGHT_PATH, timeout:80000,
}, async t => {
  const {hosted,base,origin,browser,page,errors}=await openBrowser(t);
  await page.evaluate(async base=>{
    const tour=await import(base+'/app/tour.js');
    for(const id of ['home','editor',tour.NEWS_KEY])tour.markTourSeen(id);
  },base);
  await page.goto(origin+(hosted?'/minican-app.html':'/app/index.html'));
  await page.locator('button[data-starts=collection]').click();
  const tile=page.locator('button[data-layout=collection-eclipse-1]');
  assert.match(await tile.textContent(),/모션 5장/);
  await tile.click();
  const title=page.getByLabel('그림 이름',{exact:true});
  await title.fill('일식 관측 수업');await title.press('Enter');
  await page.waitForFunction(async base=>(await (await import(base+'/app/store.js')).listDesigns()).some(d=>d.name==='일식 관측 수업'&&d.slides.length===5),base);
  await page.reload();
  const reopen=page.getByRole('button',{name:'일식 관측 수업 열기',exact:true});
  await reopen.or(title).first().waitFor();
  if(await reopen.isVisible())await reopen.click();
  assert.equal(await title.inputValue(),'일식 관측 수업');
  assert.equal(await page.locator('.cv-slide[data-slide]').count(),5);
  await page.locator('.cv-show-btn').click();
  const stage=page.locator('.cv-show-stage');
  await stage.locator('[data-effect-trigger=corona]').click();
  await stage.locator('[data-effect-playing=corona] svg').waitFor();
  await page.keyboard.press('ArrowRight');
  await stage.locator('.fe-morph-back').waitFor({state:'attached'});
  for(let i=0;i<2;i++)await page.keyboard.press('ArrowRight');
  await stage.locator('[data-effect-playing=corona] svg').waitFor();
  await page.keyboard.press('Escape');
  await page.locator('.cv-down-btn').click();await page.locator('[data-type=html]').click();
  const ready=page.waitForEvent('download');
  await page.locator('[data-download-save]').click();
  const dir=await mkdtemp(join(tmpdir(),'onbatang-collection-')),file=join(dir,'lesson.html');
  t.after(async()=>{await rm(file,{force:true});await rmdir(dir);});
  await (await ready).saveAs(file);
  const offline=await browser.newContext({offline:true,reducedMotion:'reduce',viewport:{width:390,height:844}});
  const opened=await offline.newPage();opened.on('pageerror',e=>errors.push(e.message));
  await opened.goto(pathToFileURL(file).href);
  const frame=opened.locator('.lesson-effects-frame');
  await frame.locator('[data-effect-trigger=corona]').click();
  assert.equal(await frame.locator('[data-effect-playing=corona] svg').evaluate(svg=>svg.getAnimations({subtree:true}).length),0);
  const next=opened.locator('.lesson-navigation').getByRole('button',{name:/다음/});
  for(let i=0;i<3;i++)await next.click();
  await frame.locator('[data-effect-playing=corona] svg').waitFor();
  await next.click();
  assert.ok(await next.isDisabled());
  assert.deepEqual(errors,[]);
});

test('a teacher edits a question on a text box, controls each clue, and reopens the downloaded lesson offline', {
  skip:!process.env.MINICAN_PLAYWRIGHT_PATH, timeout:90000,
}, async t=>{
  const {hosted,base,origin,browser,page,errors}=await openBrowser(t);
  await page.evaluate(async base=>{
    const tour=await import(base+'/app/tour.js');
    for(const id of ['home','editor',tour.NEWS_KEY])tour.markTourSeen(id);
  },base);
  await page.goto(origin+(hosted?'/minican-app.html':'/app/index.html'));
  await page.locator('button[data-starts=collection]').click();
  await page.locator('button[data-layout=collection-eclipse-1]').click();
  const answer='픽셀 한 칸',prompt='화면을 확대하면 무엇이 보일까요?',hints=['작은 네모예요.','색 하나를 담아요.'];
  const stage=page.locator('.cv-canvas .fe-stage');
  const text=stage.locator('.fi-text').filter({hasText:'작은 달'});
  await text.click();
  const textTab=page.locator('.fe-tab[data-tab=text]');
  if(await textTab.getAttribute('aria-selected')!=='true')await textTab.click();
  await page.locator('[data-make-clue-card]').click();
  await page.getByLabel('학생에게 보여 줄 질문').fill(prompt);
  await page.getByLabel('힌트 1 (선택)').fill(hints[0]);
  await page.getByLabel('힌트 3 (선택)').fill(hints[1]);
  await page.getByLabel('그래픽 효과 재생 시점').selectOption('open');
  await page.locator('[data-apply-effect]').click();
  await text.dblclick();await stage.locator('.fi-text.editing').fill(answer);await page.keyboard.press('Escape');
  await page.waitForFunction(async ({base,answer})=>{
    const [d]=await (await import(base+'/app/store.js')).listDesigns();
    return d.slides[0].items.some(it=>it.text===answer && it.effect?.hints?.length===2);
  },{base,answer});
  await page.reload();
  const open=page.getByRole('button',{name:'해를 가리는 달 열기',exact:true});
  await open.or(page.locator('.cv-show-btn')).first().waitFor();
  if(await open.isVisible())await open.click();
  await page.locator('.cv-show-btn').click();
  async function check(surface,advance,rewind){
    const panel=surface.locator('[data-effect-playing=cluecard]');
    await panel.waitFor();assert.equal(await panel.getAttribute('data-step'),'0');
    const art=panel.locator('svg');
    assert.match(await art.getAttribute('aria-label'),/화면을 확대하면/);
    assert.doesNotMatch(await panel.textContent(),/작은 네모|색 하나|픽셀/);
    await advance();assert.equal(await panel.getAttribute('data-step'),'1');
    assert.match(await art.textContent(),/작은 네모/);assert.doesNotMatch(await art.textContent(),/색 하나|픽셀/);
    await advance();assert.equal(await panel.getAttribute('data-step'),'2');
    assert.match(await art.textContent(),/색 하나/);assert.doesNotMatch(await art.textContent(),/픽셀/);
    await rewind();assert.equal(await panel.getAttribute('data-step'),'1');
    await advance();await advance();assert.match(await art.textContent(),/픽셀 한 칸/);
    await advance();assert.equal(await panel.count(),0);
    const cover=surface.locator('[data-effect-trigger=cluecard]');
    await cover.click();assert.equal(await panel.getAttribute('data-step'),'0');
    await panel.getByRole('button',{name:'정답 바로 보기'}).click();
    assert.match(await art.textContent(),/화면을 확대하면/);assert.match(await art.textContent(),/픽셀 한 칸/);
    await panel.getByRole('button',{name:'이전 단계'}).click();assert.equal(await panel.getAttribute('data-step'),'2');
    await panel.getByRole('button',{name:'닫기',exact:true}).click();
  }
  const live=page.locator('.cv-show-stage');
  await live.locator('[data-question-panel]').waitFor();
  await page.clock.install();
  const auto=page.locator('.cv-show').getByRole('button',{name:/자동 넘기기/});
  await auto.click();await page.clock.fastForward(120000);
  assert.equal(await live.locator('[data-question-panel]').getAttribute('data-step'),'0');
  await auto.click();
  await check(live,()=>page.getByRole('button',{name:'다음 장',exact:true}).click(),()=>page.keyboard.press('PageUp'));
  await page.getByRole('button',{name:'두 장 비교 (D)'}).click();
  const comparison=page.getByRole('dialog',{name:'두 장 비교',exact:true});
  assert.equal(await comparison.getByLabel('기준 장').locator('option').count(),4);
  assert.doesNotMatch(await comparison.getByLabel('기준 장').innerText(),/1쪽/);
  await comparison.getByRole('button',{name:'비교 닫기'}).click();await comparison.waitFor({state:'detached'});
  await page.keyboard.press('Escape');
  await page.locator('.cv-down-btn').click();await page.locator('[data-type=html]').click();
  const ready=page.waitForEvent('download');await page.locator('[data-download-save]').click();
  const dir=await mkdtemp(join(tmpdir(),'onbatang-clues-')),file=join(dir,'lesson.html');
  t.after(async()=>{await rm(file,{force:true});await rmdir(dir);});await (await ready).saveAs(file);
  const offline=await browser.newContext({offline:true,reducedMotion:'reduce',viewport:{width:390,height:844}});
  const opened=await offline.newPage();opened.on('pageerror',e=>errors.push(e.message));
  await opened.goto(pathToFileURL(file).href);
  const nav=opened.locator('.lesson-navigation'),next=nav.getByRole('button',{name:'다음',exact:true});
  await check(opened.locator('.lesson-effects-frame'),()=>next.click(),()=>nav.getByRole('button',{name:'이전',exact:true}).click());
  assert.ok(await nav.getByRole('button',{name:'이전',exact:true}).isDisabled());await next.click();
  assert.match(await nav.textContent(),/2 \/ 5/);
  assert.deepEqual(errors,[]);
});
