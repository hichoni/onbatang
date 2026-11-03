import {openTool} from './open-tool.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdtemp,rm,rmdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {extname,resolve,sep,join} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';

async function openExport(page,file) {
  if(process.env.MINICAN_BROWSER==='webkit' && process.platform==='win32'){
    // WebKit's offline emulation rejects even a local file: navigation on Windows.
    // Block HTTP(S) at the request boundary and actually open the downloaded file.
    await page.context().route(/^https?:/,route=>route.abort('internetdisconnected'));
    await page.context().setOffline(false);
  }
  await page.goto(pathToFileURL(file).href);
}

async function openBrowser(t, {phone=false} = {}) {
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
  const {chromium,webkit,devices} = await import(pathToFileURL(process.env.MINICAN_PLAYWRIGHT_PATH).href);
  const browser = process.env.MINICAN_BROWSER==='webkit'?await webkit.launch():await chromium.launch({channel:process.env.MINICAN_BROWSER || 'msedge',headless:true});
  t.after(() => browser.close());
  const page = await browser.newPage(phone?devices['iPhone 13']:{viewport:{width:1280,height:800}});
  page.setDefaultTimeout(12000);
  const errors = [];
  page.on('pageerror',e => errors.push(e.message));
  await page.goto(origin+'/seed');
  return {hosted,base,origin,browser,page,errors};
}

test('home starts either a blank design or a selected PPT, then text openings survive an offline download', {
  skip:!process.env.MINICAN_PLAYWRIGHT_PATH,timeout:150000
},async t=>{
  const {page,browser,hosted,base,origin:localOrigin,errors}=await openBrowser(t);
  const origin=process.env.MINICAN_START_LIVE_ORIGIN || localOrigin;
  if(origin!==localOrigin)await page.goto(origin+base+'/app/effects.html');
  const existing=await page.evaluate(async base=>{
    const {newRecord}=await import(base+'/app/designs.js'),store=await import(base+'/app/store.js');
    store.setStorageName(base?'gailab-minican':'minican');
    const r=newRecord('16:9');r.name='오프닝 검수 사본';r.slides[0].items=[
      {id:'eintrobeat001',t:'text',text:'관찰을 열고\n작은 점을 이어\n그림을 만들어요',x:35,y:56,w:40,size:4,color:'#16352f'},
      {id:'eintrospot001',t:'text',text:'별빛 아래 교실',x:72,y:65,w:28,size:4,color:'#86482a'},
      {id:'eintronum001',t:'text',text:'발아율 80.5%',x:50,y:86,w:50,size:4,color:'#17372c'},
      {id:'eintroview001',t:'text',text:'아침을 여는 작은 발견',x:28,y:17,w:38,size:4,color:'#16352f'},
      {id:'eintroroute01',t:'text',text:'흙 관찰\n씨앗 심기\n기록하기',x:75,y:20,w:37,size:3,color:'#86482a'}];
    const saved=await store.putDesign(r),tour=await import(base+'/app/tour.js');
    for(const id of ['home','editor',tour.NEWS_KEY])tour.markTourSeen(id);
    return saved;
  },base);
  const entry=origin+(hosted?'/minican-app.html':'/app/index.html');
  await page.goto(origin+base+'/app/effects.html#spotlighttitle');
  const gallery=page.locator('.effect-card').filter({has:page.locator('#spotlighttitle')});
  await gallery.locator('.card-custom>summary').click();
  await gallery.getByLabel('효과 문구',{exact:true}).fill('갤러리만의 제목');
  await gallery.getByLabel('빛이 움직이는 방향').selectOption('left');
  await gallery.getByLabel('장면 색감').selectOption('iris');
  await gallery.getByLabel('장면 재생 속도').selectOption('slow');
  await gallery.getByLabel('강조색 코드').fill('#ab526d');
  await gallery.getByText('이전 단일 스타일',{exact:true}).click();
  await gallery.getByRole('button',{name:'내 스타일 저장'}).click();
  assert.match(await gallery.locator('.art').textContent(),/갤러리/);
  await gallery.getByRole('button',{name:'꾸미기 초기화'}).click();
  assert.equal(await gallery.getByLabel('빛이 움직이는 방향').inputValue(),'right');
  assert.doesNotMatch(await gallery.locator('.art').textContent(),/갤러리/);
  await page.goto(entry);
  const create=page.getByRole('button',{name:'새 자료 만들기',exact:true});
  const importPpt=page.getByRole('button',{name:'PPT 가져오기',exact:true});
  await create.click();await page.locator('.cv-canvas .fe-stage').waitFor();
  assert.deepEqual(await page.locator('.fe-tool-groups .fe-tab>span:not(.fe-ic)').allTextContents(),['추가','자료','디자인']);
  await page.locator('.cv-back').click();
  let pending=page.waitForEvent('filechooser');await importPpt.click();await(await pending).setFiles([]);
  assert.ok(await create.isVisible(),'cancelling selection stays home');
  pending=page.waitForEvent('filechooser');await importPpt.click();
  const fixture=fileURLToPath(new URL('../../tools/fixtures/pptx/self-authored-4x3.pptx',import.meta.url));
  await(await pending).setFiles(fixture);await page.locator('[data-page-number="2"]').waitFor();
  await page.locator('[data-import-save]').click();
  await page.locator('.cv-canvas .fe-stage').waitFor({timeout:35000});
  const stage=await page.locator('.cv-canvas .fe-stage').boundingBox();
  assert.ok(Math.abs(stage.width/stage.height-4/3)<.02);
  assert.equal(await page.locator('.cv-slide:not(.add)').count(),2);
  await page.locator('.cv-back').click();await page.getByRole('button',{name:'오프닝 검수 사본 열기',exact:true}).click();
  const readSaved=()=>page.evaluate(async({base,id})=>{
    const store=await import(base+'/app/store.js');store.setStorageName(base?'gailab-minican':'minican');return store.getDesign(id);
  },{base,id:existing.id});
  assert.deepEqual((await readSaved()).slides,existing.slides);
  const movieScenes=['beatintro','spotlighttitle','rollingnumber','paperhorizon','fieldroute'];
  for(const [i,id] of movieScenes.entries()){
    await page.locator('.cv-canvas .fi-text').nth(i).click();
    await page.getByRole('button',{name:'시네마 효과',exact:true}).click();
    const picker=page.locator('.fe-fx-picker');
    if(await picker.getAttribute('open')===null)await picker.locator('summary').click();
    await picker.locator('[data-effect-asset='+id+']').click();
    if(i===0)await picker.getByLabel('분당 박자',{exact:true}).fill('120');
    if(id==='spotlighttitle'){
      await picker.getByText('이전 단일 스타일',{exact:true}).click();
      await picker.getByRole('button',{name:'내 스타일 불러오기'}).click();
      assert.equal(await picker.getByLabel('효과 문구',{exact:true}).inputValue(),'별빛 아래 교실');
      assert.equal(await picker.getByLabel('강조색 코드').inputValue(),'#ab526d');
      assert.equal(await picker.getByLabel('장면 색감').inputValue(),'iris');
      assert.equal(await picker.getByLabel('장면 재생 속도').inputValue(),'slow');
    }else if(id==='rollingnumber'){
      await picker.getByLabel('효과 문구',{exact:true}).fill('숫자 없음');
      assert.ok(await picker.getByRole('button',{name:'고른 조각에 적용'}).isDisabled());
      await picker.getByLabel('효과 문구',{exact:true}).fill('전년 대비 -90.5%');
      await picker.getByLabel('첫 자릿수가 굴러가는 칸').fill('8');
    }else if(id==='paperhorizon')await picker.getByLabel('능선 이동 폭').fill('140');
    else if(id==='fieldroute'){
      await picker.getByLabel('효과 문구',{exact:true}).fill('어제 관찰\n오늘 측정\n내일 비교');
      await picker.getByLabel('구간마다 이동하는 시간').fill('1.05');
    }
    await picker.getByRole('button',{name:'고른 조각에 적용'}).click();
    if(await page.getByRole('button',{name:'도구 칸 닫기'}).isVisible())await page.getByRole('button',{name:'도구 칸 닫기'}).click();
  }
  await page.locator('.cv-back').click();await page.getByRole('button',{name:'오프닝 검수 사본 열기',exact:true}).click();
  assert.equal((await readSaved()).slides[0].items[0].effect.bpm,120);
  const stored=(await readSaved()).slides[0].items;
  assert.deepEqual(stored.map(it=>it.text),existing.slides[0].items.map(it=>it.text));
  assert.equal(stored[1].effect.direction,'left');assert.equal(stored[1].effect.sceneText,undefined);
  assert.equal(stored[1].effect.palette,'iris');assert.equal(stored[1].effect.pace,'slow');
  assert.equal(stored[3].effect.depth,140);
  await page.locator('.cv-canvas .fi-text').nth(4).click();
  await page.getByRole('button',{name:'효과 수정',exact:true}).click();
  assert.equal(await page.locator('.fe-cinema-fields textarea').inputValue(),'어제 관찰\n오늘 측정\n내일 비교');
  await page.getByRole('button',{name:'도구 칸 닫기'}).click();
  async function checkEffects(view){
    for(const id of movieScenes){
      await view.locator('[data-effect-trigger='+id+']').click();
      const scene=view.locator('[data-effect-playing='+id+']');
      await scene.waitFor();
      if(id==='beatintro'){
        assert.match(await scene.textContent(),/120 BPM/);assert.match(await scene.textContent(),/작은 점을 이어/);
        const delays=await scene.evaluate(n=>n.getAnimations({subtree:true}).map(a=>a.effect.getTiming().delay));
        assert.ok(delays.includes(500)&&delays.includes(1000),'text is paced by the chosen BPM');
      }else if(id==='spotlighttitle'){
        assert.match(await scene.textContent(),/별빛/);assert.equal(await scene.locator('clipPath > rect').count(),1);
        assert.ok(await scene.locator('text[fill="#ab526d"]').count()>0);
        assert.match(await scene.locator('clipPath > rect').evaluate(n=>n.getAnimations()[0].effect.getKeyframes()[0].transform),/translateX\(720px\)/);
      }else if(id==='rollingnumber'){
        assert.match(await scene.textContent(),/전년 대비 -90\.5%/);
        assert.equal(await scene.locator('g[clip-path]').first().locator('text').count(),9);
        assert.equal(await scene.locator('clipPath rect').count(),3);
        assert.ok(await scene.locator('g[clip-path]').nth(1).locator('text').count()>1,'the zero digit has its own moving reel');
      }else if(id==='paperhorizon'){
        assert.match(await scene.textContent(),/아침을/);
        assert.equal(await scene.evaluate(n=>n.getAnimations({subtree:true}).filter(a=>a.effect.getTiming().duration===2170).length),4);
      }else{
        assert.match(await scene.textContent(),/어제.*오늘.*내일/s);
        assert.ok(await scene.evaluate(n=>n.getAnimations({subtree:true}).some(a=>a.effect.getTiming().duration===1050)));
        assert.equal(await scene.locator('path[pathLength="1"]').count(),3);
      }
      await scene.getByRole('button',{name:'강조 화면 닫기'}).click();
    }
  }
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.locator('.cv-show-btn').click();await checkEffects(page);await page.keyboard.press('Escape');
  await page.locator('.cv-down-btn').click();await page.locator('[data-type=html]').click();
  const downloading=page.waitForEvent('download');await page.locator('[data-download-save]').click();
  const dir=await mkdtemp(join(tmpdir(),'onbatang-intro-')),file=join(dir,'intro.html');
  t.after(async()=>{await rm(file,{force:true});await rmdir(dir);});await(await downloading).saveAs(file);
  const context=await browser.newContext({offline:true,reducedMotion:'no-preference'});t.after(()=>context.close());
  const offline=await context.newPage();offline.on('pageerror',e=>errors.push(e.message));
  await openExport(offline,file);await checkEffects(offline);assert.deepEqual(errors,[]);
});

test('direct scene editing and cue timing survive cancel, slide reopen and offline playback', {
  skip:!process.env.MINICAN_PLAYWRIGHT_PATH,timeout:150000,
},async t=>{
  const {page,browser,hosted,base,origin:localOrigin,errors}=await openBrowser(t);
  const origin=process.env.MINICAN_START_LIVE_ORIGIN||localOrigin;
  await page.goto(origin+base+'/app/effects.html#beatintro');
  const card=page.locator('.effect-card').filter({has:page.locator('#beatintro')});
  await card.locator('.card-custom>summary').click();
  await card.getByRole('button',{name:'화면 · 타임라인 편집'}).click();
  const studio=page.getByRole('dialog'),track=key=>studio.locator('.ce-hit[data-track='+key+']');
  await track('phrase2').dblclick();
  await studio.getByLabel('화면에서 문구 수정').fill('미리보기만 바꾸기');
  await studio.getByRole('button',{name:'취소',exact:true}).click();
  assert.doesNotMatch(await card.locator('.art').textContent(),/미리보기만/);

  const existing=await page.evaluate(async base=>{
    const {newRecord}=await import(base+'/app/designs.js'),store=await import(base+'/app/store.js');
    const {EFFECT_ASSETS}=await import(base+'/src/effect-assets.js');
    store.setStorageName(base?'gailab-minican':'minican');
    const r=newRecord('16:9');r.name='장면 타임라인 검수 사본';
    r.slides[0].items=EFFECT_ASSETS.filter(a=>a.cinematic).map((a,i)=>({
      id:'ecinemaedit0'+i,t:'text',text:a.example.text,x:50,y:12+i*17,w:85,size:3,color:'#16352f',effect:{id:a.id,when:'press'}}));
    const saved=await store.putDesign(r),tour=await import(base+'/app/tour.js');
    for(const id of ['home','editor',tour.NEWS_KEY])tour.markTourSeen(id);
    return saved;
  },base);
  await page.goto(origin+(hosted?'/minican-app.html':'/app/index.html'));
  await page.getByRole('button',{name:'장면 타임라인 검수 사본 열기',exact:true}).click();
  const ids=['beatintro','spotlighttitle','rollingnumber','paperhorizon','fieldroute'];
  const keys=['phrase2','title','number','title','step2'];
  const savedEffects=[];
  for(const [i,id] of ids.entries()){
    await page.locator('.cv-canvas .fe-stage').click({position:{x:3,y:3}});
    await page.locator('.cv-canvas .fi-text').nth(i).click();
    await page.getByRole('button',{name:'효과 수정',exact:true}).click();
    await page.locator('.fe-fx-picker').getByRole('button',{name:'화면 · 타임라인 편집'}).click();
    await track(keys[i]).dblclick();
    const title=id==='rollingnumber'?'-42.5%':'직접 고친 수업 '+(i+1);
    await studio.getByLabel('화면에서 문구 수정').fill(title);
    assert.ok(await studio.getByRole('button',{name:'실행 취소',exact:true}).isEnabled());
    await studio.getByRole('button',{name:'실행 취소',exact:true}).click();
    await studio.getByRole('button',{name:'다시 실행',exact:true}).click();
    assert.equal(await studio.getByLabel('선택한 문구').inputValue(),title);
    await studio.getByRole('button',{name:'배치 편집',exact:true}).click();
    const set=async(label,value)=>{const input=studio.getByLabel(label,{exact:true});await input.fill(String(value));await input.press('Tab');};
    await set('가로 위치 (%)',51);await set('세로 위치 (%)',45);await set('크기 (%)',115);
    await set('등장 (초)',2.4);await set('움직임 (초)',1.2);
    if(i===0){
      await studio.getByRole('button',{name:'구절 2 먼저',exact:true}).click();
      const before=Number(await studio.getByLabel('가로 위치 (%)').inputValue());
      const box=await track(keys[i]).boundingBox();
      await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
      await page.mouse.move(box.x+box.width/2+25,box.y+box.height/2+10,{steps:4});await page.mouse.up();
      assert.ok(Number(await studio.getByLabel('가로 위치 (%)').inputValue())>before+1,'drag updates the same position field');
      await studio.getByRole('button',{name:'실행 취소',exact:true}).click();
      assert.ok(Math.abs(Number(await studio.getByLabel('가로 위치 (%)').inputValue())-before)<.1);
      await studio.getByRole('button',{name:'다시 실행',exact:true}).click();
      const sizeHandle=await track(keys[i]).locator('[data-size]').boundingBox();
      await page.mouse.move(sizeHandle.x+sizeHandle.width/2,sizeHandle.y+sizeHandle.height/2);await page.mouse.down();
      await page.mouse.move(sizeHandle.x+sizeHandle.width/2+25,sizeHandle.y+sizeHandle.height/2+10,{steps:4});await page.mouse.up();
      assert.ok(Number(await studio.getByLabel('크기 (%)').inputValue())>115);
      const startBefore=Number(await studio.getByLabel('등장 (초)').inputValue());
      const bar=await studio.locator('[data-bar=phrase2]').boundingBox();
      await page.mouse.move(bar.x+Math.min(20,bar.width/2),bar.y+bar.height/2);await page.mouse.down();
      await page.mouse.move(bar.x+Math.min(20,bar.width/2)+35,bar.y+bar.height/2,{steps:4});await page.mouse.up();
      assert.ok(Number(await studio.getByLabel('등장 (초)').inputValue())>startBefore);
      const lengthBefore=Number(await studio.getByLabel('움직임 (초)').inputValue());
      const end=await studio.locator('[data-bar=phrase2] [data-end]').boundingBox();
      await page.mouse.move(end.x+end.width/2,end.y+end.height/2);await page.mouse.down();
      await page.mouse.move(end.x+end.width/2+25,end.y+end.height/2,{steps:4});await page.mouse.up();
      assert.ok(Number(await studio.getByLabel('움직임 (초)').inputValue())>lengthBefore);
    }
    const slider=studio.getByLabel('장면 재생 위치');await slider.fill('0');
    const initial=await studio.locator('.ce-picture').screenshot();await slider.fill('1000');
    assert.notDeepEqual(await studio.locator('.ce-picture').screenshot(),initial,'the scrubber samples the authored timings');
    await studio.getByRole('button',{name:'▶ 재생',exact:true}).click();
    await page.waitForFunction(()=>Number(document.querySelector('.ce-transport input').value)>30);
    await studio.getByRole('button',{name:'Ⅱ 멈춤',exact:true}).click();
    const paused=await slider.inputValue();await page.waitForTimeout(110);assert.equal(await slider.inputValue(),paused);
    await studio.getByRole('button',{name:'슬라이드에 적용',exact:true}).click();
    assert.equal(await page.getByRole('dialog').count(),0);
    if(await page.getByRole('button',{name:'도구 칸 닫기'}).isVisible())await page.getByRole('button',{name:'도구 칸 닫기'}).click();
  }
  await page.locator('.cv-back').click();
  await page.getByRole('button',{name:'장면 타임라인 검수 사본 열기',exact:true}).waitFor();
  await page.reload();
  await page.getByRole('button',{name:'장면 타임라인 검수 사본 열기',exact:true}).click();
  const stored=await page.evaluate(async({base,id})=>{
    const store=await import(base+'/app/store.js');store.setStorageName(base?'gailab-minican':'minican');return store.getDesign(id);
  },{base,id:existing.id});
  assert.deepEqual(stored.slides[0].items.map(it=>it.text),existing.slides[0].items.map(it=>it.text));
  for(const [i,item] of stored.slides[0].items.entries()){
    const cue=item.effect.sceneTracks.find(t=>t.key===keys[i]);savedEffects.push(item.effect);
    assert.equal(cue.text,i===2?'-42.5%':'직접 고친 수업 '+(i+1));assert.ok(cue.scale>=1.15);
  }
  await page.locator('.cv-canvas .fi-text').first().click();await page.getByRole('button',{name:'효과 수정',exact:true}).click();
  await page.getByRole('button',{name:'화면 · 타임라인 편집'}).click();
  await track('phrase2').click();assert.equal(await studio.getByLabel('선택한 문구').inputValue(),'직접 고친 수업 1');
  await studio.getByRole('button',{name:'취소',exact:true}).click();await page.getByRole('button',{name:'도구 칸 닫기'}).click();
  async function check(view){
    for(const [i,id] of ids.entries()){
      await view.locator('[data-effect-trigger='+id+']').click();
      const node=view.locator('[data-effect-playing='+id+'] [data-cinema-track='+keys[i]+']');await node.waitFor();
      const values=await node.evaluate(n=>({text:n.dataset.trackText,start:+n.dataset.trackStart,duration:+n.dataset.trackDuration,transform:n.getAttribute('transform')}));
      const cue=savedEffects[i].sceneTracks.find(t=>t.key===keys[i]);
      assert.equal(values.text,cue.text);assert.ok(Math.abs(values.start-cue.start)<.01);assert.ok(Math.abs(values.duration-cue.duration)<.01);
      assert.match(values.transform,new RegExp('scale\\('+cue.scale+'\\)'));
      await view.getByRole('button',{name:'강조 화면 닫기'}).click();
    }
  }
  await page.emulateMedia({reducedMotion:'no-preference'});await page.locator('.cv-show-btn').click();await check(page);await page.keyboard.press('Escape');
  await page.locator('.cv-down-btn').click();await page.locator('[data-type=html]').click();
  const downloading=page.waitForEvent('download');await page.locator('[data-download-save]').click();
  const dir=await mkdtemp(join(tmpdir(),'onbatang-studio-')),file=join(dir,'edited.html');
  t.after(async()=>{await rm(file,{force:true});await rmdir(dir);});await(await downloading).saveAs(file);
  const context=await browser.newContext({offline:true,reducedMotion:'no-preference'});t.after(()=>context.close());
  const offline=await context.newPage();offline.on('pageerror',e=>errors.push(e.message));await openExport(offline,file);await check(offline);
  assert.deepEqual(errors,[]);
});

test('scene studio keeps touch editing and timeline reachable in portrait and landscape',{
  skip:!process.env.MINICAN_PLAYWRIGHT_PATH,timeout:60000,
},async t=>{
  const {page,origin,base,errors}=await openBrowser(t,{phone:true});
  await page.goto(origin+base+'/app/effects.html#paperhorizon');
  const card=page.locator('.effect-card').filter({has:page.locator('#paperhorizon')});
  await card.locator('.card-custom>summary').tap();await card.getByRole('button',{name:'화면 · 타임라인 편집'}).tap();
  const studio=page.getByRole('dialog');
  for(const size of [{width:390,height:844},{width:844,height:390},{width:320,height:740}]){
    await page.setViewportSize(size);
    assert.ok(await studio.evaluate(n=>n.scrollWidth<=n.clientWidth+1));
    await studio.getByRole('button',{name:'글 · 배치',exact:true}).tap();
    await studio.locator('.ce-hit[data-track=title]').tap();
    await studio.getByLabel('선택한 문구').fill('함께 관찰하는 아침');
    assert.match(await studio.locator('.ce-picture').textContent(),/함께/);
    await studio.getByRole('button',{name:'타임라인',exact:true}).tap();
    const before=await studio.locator('.ce-track').evaluateAll(nodes=>nodes.findIndex(n=>n.dataset.track==='title'));
    if(before>0){
      await studio.getByRole('button',{name:'제목 먼저',exact:true}).tap();
      assert.equal(await studio.locator('.ce-track').evaluateAll(nodes=>nodes.findIndex(n=>n.dataset.track==='title')),before-1);
    }
    await studio.getByRole('slider',{name:'장면 재생 위치'}).fill('0');
    await studio.getByRole('button',{name:'▶ 재생',exact:true}).tap();
    await page.waitForFunction(()=>Number(document.querySelector('.ce-transport input').value)>15);
    await studio.getByRole('button',{name:'Ⅱ 멈춤',exact:true}).tap();
    const stage=await studio.locator('.ce-stage').boundingBox();assert.ok(stage.width>150&&stage.height>75,'preview remains visible beside the controls');
    assert.ok(await studio.evaluate(n=>n.scrollWidth<=n.clientWidth+1));
  }
  await studio.getByRole('button',{name:'꾸미기에 반영',exact:true}).tap();
  assert.match(await card.locator('.art').textContent(),/함께/);
  await card.getByRole('button',{name:'화면 · 타임라인 편집'}).tap();
  await studio.getByRole('button',{name:'타임라인',exact:true}).tap();
  assert.equal(await studio.locator('.ce-track').first().getAttribute('data-track'),'title');
  await studio.getByRole('button',{name:'취소',exact:true}).tap();assert.deepEqual(errors,[]);
});

test('mobile gallery paints motion on tap, including a scoped opt-in under reduced motion', {
  skip:!process.env.MINICAN_PLAYWRIGHT_PATH, timeout:60000,
}, async t=>{
  const {page,origin,base,errors}=await openBrowser(t,{phone:true});
  // Gallery playback must work even if Safari cannot animate any SVG group.
  await page.addInitScript(()=>{const original=SVGElement.prototype.animate;SVGElement.prototype.animate=function(...args){
    if(this.closest('[data-asset]'))throw Error('SVG animation unavailable');
    return original.apply(this,args);
  };});
  await page.goto(origin+base+'/app/effects.html');
  const toggle=page.locator('#motion-switch'), tile=page.locator('[data-asset=prism]'), label=tile.locator('em');
  const moving=()=>tile.evaluate(b=>b.hasAttribute('data-playing'));
  async function expectFrames(control=label){
    await control.scrollIntoViewIfNeeded();
    await control.tap();
    assert.ok(await moving());
    assert.match(await label.innerText(),/재생 중/);
    const art=tile.locator('.art');
    const early=await art.screenshot({animations:'allow'});
    await page.waitForTimeout(130);
    assert.notDeepEqual(await art.screenshot({animations:'allow'}),early);
  }
  await page.emulateMedia({reducedMotion:'no-preference'});
  assert.ok(await toggle.isHidden());
  const study=page.locator('#study-stage');
  const scrubbing=study.getByRole('slider');
  await page.locator('#study-choice').selectOption('pixelweave');
  await study.getByRole('button',{name:'완성된 하트'}).tap();
  assert.equal(await scrubbing.inputValue(),'100');
  const complete=await study.locator('.obs-art').screenshot();
  await study.getByRole('button',{name:'흩어진 칸'}).tap();
  assert.notDeepEqual(await study.locator('.obs-art').screenshot(),complete);
  await study.getByRole('button',{name:/이어 재생/}).tap();
  await page.waitForFunction(()=>Number(document.querySelector('#study-stage input').value)>15);
  await study.getByRole('button',{name:/멈춤/}).tap();
  const paused=await scrubbing.inputValue();
  await page.waitForTimeout(150);assert.equal(await scrubbing.inputValue(),paused);
  await scrubbing.press('End');assert.equal(await scrubbing.inputValue(),'100');
  assert.deepEqual(await study.locator('.obs-art').screenshot(),complete);
  await page.getByRole('link',{name:'프리즘 리본 관찰대에서 보기'}).tap();
  assert.equal(await page.locator('#study-choice').inputValue(),'prism');
  assert.ok(page.url().endsWith('#motion-study'));
  await page.locator('#route-stages').fill('살펴보기\n실험하기\n기록하기');
  await page.getByRole('link',{name:'탐사 항로 관찰대에서 보기'}).tap();
  assert.equal(await page.locator('#study-choice').inputValue(),'fieldroute');
  await study.getByRole('button',{name:'가운데',exact:true}).tap();
  const route=study.locator('.obs-art');
  assert.match(await route.textContent(),/살펴보기.*실험하기.*기록하기/s);
  const midway=await route.screenshot();
  await scrubbing.press('End');
  assert.ok(!midway.equals(await route.screenshot()),'the course draws through the later checkpoints');
  await expectFrames();
  await page.waitForFunction(()=>document.querySelector('#prism-demo em').textContent==='↻ 다시 재생');
  await page.locator('#palette').selectOption('sunset');
  await page.locator('#pace').selectOption('slow');
  await label.tap();await label.tap();
  assert.equal(await tile.locator('polygon').first().getAttribute('fill'),'#ffd678');
  assert.equal(await tile.locator('svg').count(),1);
  await expectFrames(page.locator('#try-motion'));
  await page.emulateMedia({reducedMotion:'reduce'});
  await toggle.waitFor({state:'visible'});
  assert.equal(await moving(),false);
  assert.match(await tile.textContent(),/움직임 한 번 재생/);
  await expectFrames();
  assert.equal(await toggle.getAttribute('aria-pressed'),'false');
  await toggle.tap();assert.equal(await toggle.getAttribute('aria-pressed'),'true');
  await expectFrames();
  let startImport;
  const holdImport=new Promise(resolve=>{startImport=resolve});
  await page.route('**/collection-preview.js',async route=>{await holdImport;await route.continue()});
  await page.locator('#motion-stories summary').tap();
  assert.ok(await page.locator('#story-next').isDisabled());
  assert.match(await page.locator('#story-count').innerText(),/불러오는 중/);
  startImport();
  await page.locator('#story-next').tap();
  assert.match(await page.locator('#story-count').innerText(),/^2 \/ 5/);
  assert.ok(await page.locator('#story-stage').evaluate(n=>n.getAnimations({subtree:true}).some(a=>a.playState==='running')));
  await page.reload();await toggle.waitFor();
  assert.equal(await toggle.getAttribute('aria-pressed'),'false');
  assert.equal(await moving(),false);
  assert.deepEqual(errors,[]);
});

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
  await page.locator('.cv-back').waitFor();
  await page.waitForFunction(()=>!document.documentElement.dataset.cvMove);
  await page.locator('.cv-back').click();
  await page.getByRole('button',{name:'그림자 관측소 열기',exact:true}).waitFor();
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
    // Safari can reserve Escape to leave native fullscreen. Its on-screen close
    // control is also the path available to iPhone users.
    if(process.env.MINICAN_BROWSER==='webkit')await d.getByRole('button',{name:'비교 닫기'}).click();
    else await p.keyboard.press('Escape');
    await d.waitFor({state:'detached'});
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
  await openExport(p,file);await p.getByRole('button',{name:/발표 모드/}).click();
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
        labels:['파랑','노랑','초록'],series:[{name:'1차',values:[-3,0,7]},{name:'2차',values:[2,4,9]}]},
      {id:'estudy0001',t:'text',x:22,y:75,w:26,size:5,text:'빛 관찰',color:'#ffffff'});
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
  await openTool(page,'motion');
  await page.getByLabel('움직임 종류').selectOption('그래픽 효과');
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
  await openTool(page,'motion');
  await page.getByRole('button',{name:'이 장 미리 보기',exact:true}).click();
  await interact(page.locator('.cv-canvas .fe-stage'));
  // Stop preview by reopening the motion tab, then author both content scenes.
  await openTool(page,'motion');
  async function applyScene(item,asset,observe=false) {
    const close=page.getByRole('button',{name:'도구 칸 닫기',exact:true});
    if(await close.isVisible())await close.click();
    await item.click();
    await openTool(page,'motion');
    await page.getByLabel('움직임 종류').selectOption('그래픽 효과');
    const picker=page.locator('.fe-fx-picker');
    if (await picker.getAttribute('open')===null) await picker.locator('summary').click();
    await picker.locator('[data-effect-asset='+asset+']').click();
    if(observe){
      await picker.getByLabel('발표에서 멈춰 보며 설명하기').check();
      const author=picker.locator('.ob-study');
      await author.locator('summary').click();
      await author.getByRole('slider').press('Home');
      await author.getByRole('button',{name:/지금 순간 담기/}).click();
      await author.getByLabel('4번 관찰 이름').fill('출발점 다시 보기');
      await author.getByRole('button',{name:'4번 관찰 앞으로'}).click();
      await author.getByRole('button',{name:'3번 관찰 앞으로'}).click();
      await author.getByRole('button',{name:'3번 관찰 삭제'}).click();
      assert.deepEqual(await author.locator('.obs-points button').allTextContents(),['입사광','출발점 다시 보기','퍼진 빛']);
    }
    await picker.locator('[data-apply-effect]').click();
  }
  await applyScene(page.locator('.cv-canvas .fe-stage .fi-text').nth(1),'kinetic');
  await applyScene(page.locator('.cv-canvas .fe-stage .fi-chart').first(),'bars');
  await applyScene(page.locator('.cv-canvas .fe-stage .fi-text').filter({hasText:'빛 관찰'}),'spectrum',true);
  await page.waitForFunction(async ({base,id}) => (await (await import(base+'/app/store.js')).getDesign(id))?.slides[0].items[2].effect?.id==='bars',{base,id});
  await page.locator('.cv-slide[data-slide="1"]').click();
  await applyScene(page.locator('.cv-canvas .fe-stage .fi-text').filter({hasText:'인공지능'}),'initials');
  await openTool(page,'motion');
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
  const savedCues=await page.evaluate(async ({id,base}) => (await (await import(base+'/app/store.js')).getDesign(id)).slides[0].items[3].effect.stops,{base,id});
  assert.deepEqual(savedCues,[[18,'입사광'],[0,'출발점 다시 보기'],[95,'퍼진 빛']]);
  await page.locator('.cv-show-btn').click();
  async function interact(surface) {
    const hit = surface.locator('[data-effect-trigger=signal]');
    await hit.click();
    assert.equal(await surface.locator('[data-effect-note]').textContent(),'전기가 흐르는 길');
    const signal=surface.locator('[data-effect-playing=signal] svg');
    assert.equal(await signal.locator('path').first().getAttribute('stroke'),'#ffd678');
    const timing=await signal.evaluate(svg=>svg.getAnimations({subtree:true})[0]?.effect.getTiming().duration ?? null);
    const still=await signal.evaluate(n=>matchMedia('(prefers-reduced-motion: reduce)').matches && !n.closest('[data-ob-allow-motion]'));
    assert.equal(timing,still?null:1080*1.55);
    assert.equal(await hit.getAttribute('aria-expanded'),'true');
    await hit.press('Enter');
    assert.equal(await hit.getAttribute('aria-expanded'),'false');
    assert.equal(await surface.locator('[data-effect-note]').count(),0);
  }
  async function checkScenes(surface) {
    const trigger=surface.locator('[data-effect-trigger=spectrum]');
    await trigger.click();
    const study=surface.getByRole('group',{name:'프리즘 분광 모션 관찰대'});
    assert.deepEqual(await study.locator('.obs-points button').allTextContents(),['입사광','출발점 다시 보기','퍼진 빛']);
    assert.equal(await study.getByRole('slider').inputValue(),'18');
    await study.getByRole('button',{name:'다음 관찰 →'}).click();
    assert.equal(await study.getByRole('slider').inputValue(),'0');
    await study.getByRole('slider').press('PageDown');
    assert.equal(await study.getByRole('slider').inputValue(),'95');
    await study.getByRole('button',{name:'퍼진 빛'}).click();
    const range=study.getByRole('slider');assert.equal(await range.inputValue(),'95');
    await range.press('Home');await range.press('ArrowRight');assert.equal(await range.inputValue(),'1');
    await study.getByRole('button',{name:'슬라이드로 돌아가기'}).click();
    assert.equal(await trigger.getAttribute('aria-expanded'),'false');
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
  await page.emulateMedia({reducedMotion:'reduce'});
  const motionSwitch=page.getByRole('button',{name:/^움직임 켜기 ·/});
  await motionSwitch.waitFor();
  await interact(page.locator('.cv-show-stage'));
  await motionSwitch.click();
  await interact(page.locator('.cv-show-stage'));
  await page.getByRole('button',{name:/^움직임 끄기 ·/}).click();
  await page.emulateMedia({reducedMotion:'no-preference'});
  await checkScenes(page.locator('.cv-show-stage'));
  await page.locator('.cv-show-stage [data-effect-trigger=spectrum]').click();
  const observation=page.locator('.cv-show-stage [data-effect-observation]');
  for(const expected of ['0','95']){
    await page.locator('.cv-show-bar').getByRole('button',{name:'다음 장',exact:true}).click();
    assert.equal(await observation.getByRole('slider').inputValue(),expected);
  }
  await page.locator('.cv-show-bar').getByRole('button',{name:'다음 장',exact:true}).click();
  assert.equal(await observation.count(),0);
  assert.ok(await page.locator('.cv-show-stage [data-effect-trigger=spectrum]').isVisible());
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
  await openExport(opened,file);
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
  await openExport(opened,file);
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
  if(!await page.locator('[data-make-clue-card]').isVisible())await openTool(page,'text');
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
  await openExport(opened,file);
  const nav=opened.locator('.lesson-navigation'),next=nav.getByRole('button',{name:'다음',exact:true});
  await check(opened.locator('.lesson-effects-frame'),()=>next.click(),()=>nav.getByRole('button',{name:'이전',exact:true}).click());
  assert.ok(await nav.getByRole('button',{name:'이전',exact:true}).isDisabled());await next.click();
  assert.match(await nav.textContent(),/2 \/ 5/);
  assert.deepEqual(errors,[]);
});

test('named motion presets preview, manage, transfer and survive reuse in other slides and documents',{
  skip:!process.env.MINICAN_PLAYWRIGHT_PATH,timeout:150000,
},async t=>{
  const {page,browser,hosted,base,origin:localOrigin,errors}=await openBrowser(t);
  const origin=process.env.MINICAN_START_LIVE_ORIGIN||localOrigin;
  const gallery=origin+base+'/app/effects.html#beatintro',entry=origin+(hosted?'/minican-app.html':'/app/index.html');
  await page.goto(gallery);
  const card=id=>page.locator('.effect-card').filter({has:page.locator('#'+id)});
  const lib=page.getByRole('dialog',{name:'내 움직임 보관함',exact:true});
  const saveDialog=page.getByRole('dialog',{name:'움직임 이름 붙여 저장',exact:true});
  const beat=card('beatintro');await beat.locator('.card-custom>summary').click();
  await beat.getByLabel('효과 문구',{exact:true}).fill('나의 시작\n내가 찾은 발견\n함께 나누어요');
  await beat.getByRole('button',{name:'화면 · 타임라인 편집'}).click();
  const studio=page.locator('.fe-cinema-studio');
  await studio.locator('[data-track=phrase2].ce-hit').click();
  await studio.getByLabel('선택한 문구').fill('저장한 두 번째 구절');
  for(const [label,value] of [['가로 위치 (%)','56'],['크기 (%)','125'],['등장 (초)','1.8'],['움직임 (초)','1.3']]){
    const field=studio.getByLabel(label,{exact:true});await field.fill(value);await field.press('Tab');
  }
  await studio.getByRole('button',{name:'움직임 저장',exact:true}).click();
  await saveDialog.getByLabel('프리셋 이름',{exact:true}).fill('우리 반 오프닝');
  await saveDialog.getByRole('button',{name:'새 프리셋 저장'}).click();
  await studio.getByRole('button',{name:'취소',exact:true}).click();
  assert.doesNotMatch(await beat.locator('.art').textContent(),/저장한 두 번째/,'saving a library entry does not commit the gallery draft');
  const paper=card('paperhorizon');await paper.locator('.card-custom>summary').click();
  await paper.getByRole('button',{name:'움직임 이름 붙여 저장'}).click();
  await saveDialog.getByLabel('프리셋 이름',{exact:true}).fill('아침 풍경');await saveDialog.getByRole('button',{name:'새 프리셋 저장'}).click();
  await page.reload();await beat.locator('.card-custom>summary').click();await beat.getByRole('button',{name:'내 움직임 보관함',exact:true}).click();
  assert.equal(await lib.locator('.mp-preset').count(),1,'effect-specific picker filters without losing other effects');
  assert.match(await lib.locator('.mp-count').textContent(),/2 \/ 60/);
  await lib.getByLabel('프리셋 문구 적용').selectOption('saved');
  assert.match(await lib.locator('.mp-preview').textContent(),/저장한 두 번째 구절/);
  await lib.getByLabel('프리셋 재생 위치').fill('0');const initial=await lib.locator('.mp-preview').screenshot();
  await lib.getByLabel('프리셋 재생 위치').fill('1000');assert.notDeepEqual(initial,await lib.locator('.mp-preview').screenshot());
  await lib.getByRole('button',{name:'▶ 미리보기',exact:true}).click();
  await page.waitForFunction(()=>+document.querySelector('.mp-transport input').value>20);
  await lib.getByRole('button',{name:'Ⅱ 멈춤',exact:true}).click();
  const paused=await lib.getByLabel('프리셋 재생 위치').inputValue();await page.waitForTimeout(100);
  assert.equal(await lib.getByLabel('프리셋 재생 위치').inputValue(),paused);
  if(process.env.MINICAN_PRESET_SHOTS)await page.screenshot({path:resolve(process.env.MINICAN_PRESET_SHOTS+'-desktop.png')});
  await lib.locator('.mp-manage>summary').click();
  await lib.getByRole('button',{name:'복제',exact:true}).click();
  await lib.getByLabel('선택한 프리셋 이름').fill('발표용 사본');await lib.getByRole('button',{name:'이름 변경',exact:true}).click();
  await lib.getByRole('button',{name:'삭제',exact:true}).click();await lib.getByRole('button',{name:'취소',exact:true}).click();
  assert.equal(await lib.locator('.mp-preset').count(),2);
  await lib.getByRole('button',{name:'삭제',exact:true}).click();await lib.getByRole('button',{name:'삭제 확인',exact:true}).click();
  assert.equal(await lib.locator('.mp-preset').count(),1);
  const downloading=page.waitForEvent('download');await lib.getByRole('button',{name:'보관함 파일 내려받기'}).click();
  const fileDownload=await downloading;const file=await fileDownload.path();const portable=await readFile(file);
  assert.equal(JSON.parse(portable).presets.length,2);
  await lib.getByRole('button',{name:'닫기',exact:true}).click();

  // A fresh browser context has no library; the exported file carries only scene data.
  const fresh=await browser.newContext();t.after(()=>fresh.close());const other=await fresh.newPage();
  other.on('pageerror',e=>errors.push(e.message));await other.goto(gallery);
  const otherCard=other.locator('.effect-card').filter({has:other.locator('#beatintro')});
  await otherCard.locator('.card-custom>summary').click();await otherCard.getByRole('button',{name:'내 움직임 보관함',exact:true}).click();
  const otherLib=other.getByRole('dialog',{name:'내 움직임 보관함'});assert.equal(await otherLib.locator('.mp-preset').count(),0);
  await otherLib.getByLabel('움직임 보관함 파일').setInputFiles({name:'motion.json',mimeType:'application/json',buffer:portable});
  await otherLib.getByRole('button',{name:/우리 반 오프닝/}).waitFor();
  assert.match(await otherLib.locator('.mp-count').textContent(),/2 \/ 60/);
  for(const size of [{width:390,height:844},{width:844,height:390},{width:320,height:740}]){
    await other.setViewportSize(size);
    assert.ok(await otherLib.evaluate(n=>n.scrollWidth<=n.clientWidth+1));
    await otherLib.getByLabel('프리셋 문구 적용').selectOption('saved');
    await otherLib.getByLabel('프리셋 재생 위치').fill('500');
    if(process.env.MINICAN_PRESET_SHOTS&&size.width===390)await other.screenshot({path:resolve(process.env.MINICAN_PRESET_SHOTS+'-phone.png')});
  }
  await otherLib.getByLabel('움직임 보관함 파일').setInputFiles({name:'again.json',mimeType:'application/json',buffer:portable});
  await other.waitForFunction(()=>document.querySelector('.mp-status').textContent.includes('0개 추가'));
  await other.close();

  const originals=await page.evaluate(async base=>{
    const {newRecord}=await import(base+'/app/designs.js'),store=await import(base+'/app/store.js');
    store.setStorageName(base?'gailab-minican':'minican');const rows=[];
    for(let i=0;i<2;i++){
      const r=newRecord('16:9');r.name='프리셋 검수 자료 '+i;
      r.slides[0].items=[{id:'emypreset'+i+'001',t:'text',text:'다른 자료의 제목\n이 자료의 둘째 글\n다음 수업으로',x:50,y:50,w:80,size:6,color:'#173f30'}];
      r.slides.push({...structuredClone(r.slides[0]),id:'spreset'+i+'002',items:[{...structuredClone(r.slides[0].items[0]),id:'emypreset'+i+'002'}]});
      rows.push(await store.putDesign(r));
    }
    const tour=await import(base+'/app/tour.js');for(const id of ['home','editor',tour.NEWS_KEY])tour.markTourSeen(id);return rows;
  },base);
  await page.goto(entry);
  for(let i=0;i<2;i++){
    await page.getByRole('button',{name:'프리셋 검수 자료 '+i+' 열기',exact:true}).click();
    if(i)await page.locator('.cv-slide:not(.add)').nth(1).click();
    await page.locator('.cv-canvas .fi-text').first().click();await page.getByRole('button',{name:'시네마 효과',exact:true}).click();
    const picker=page.locator('.fe-fx-picker');await picker.getByRole('button',{name:'모든 내 움직임 보기'}).click();
    assert.equal(await lib.locator('.mp-preset').count(),2);
    await lib.getByRole('button',{name:/아침 풍경/}).click();
    await lib.getByRole('button',{name:'이 움직임 불러오기'}).click();
    assert.match(await picker.locator('.fe-cinema-fields legend').textContent(),/종이 지평선/);
    await picker.getByRole('button',{name:'모든 내 움직임 보기'}).click();
    await lib.getByRole('button',{name:/우리 반 오프닝/}).click();
    if(i)await lib.getByLabel('프리셋 문구 적용').selectOption('saved');
    assert.match(await lib.locator('.mp-preview').textContent(),i?/저장한 두 번째 구절/:/이 자료의 둘째 글/);
    await lib.getByRole('button',{name:'이 움직임 불러오기'}).click();await picker.locator('[data-apply-effect]').click();
    if(await page.getByRole('button',{name:'도구 칸 닫기'}).isVisible())await page.getByRole('button',{name:'도구 칸 닫기'}).click();
    await page.locator('.cv-back').click();await page.getByRole('button',{name:'프리셋 검수 자료 '+i+' 열기',exact:true}).waitFor();
  }
  await page.reload();
  const saved=await page.evaluate(async({base,ids})=>{
    const store=await import(base+'/app/store.js');store.setStorageName(base?'gailab-minican':'minican');return Promise.all(ids.map(id=>store.getDesign(id)));
  },{base,ids:originals.map(r=>r.id)});
  for(let i=0;i<2;i++){
    assert.deepEqual(saved[i].slides.map(s=>s.items.map(it=>it.text)),originals[i].slides.map(s=>s.items.map(it=>it.text)));
    const effect=saved[i].slides[i].items[0].effect,track=effect.sceneTracks.find(t=>t.key==='phrase2');
    assert.equal(track.scale,1.25);assert.equal(track.start,1800);assert.equal(track.duration,1300);
    assert.equal(track.text,i?'저장한 두 번째 구절':undefined);
    assert.equal(saved[i].slides[1-i].items[0].effect,undefined,'other slide remains unchanged');
  }
  await page.getByRole('button',{name:'프리셋 검수 자료 1 열기',exact:true}).click();await page.locator('.cv-slide:not(.add)').nth(1).click();
  await page.locator('.cv-canvas .fi-text').first().click();await page.getByRole('button',{name:'효과 수정',exact:true}).click();
  await page.getByRole('button',{name:'모든 내 움직임 보기'}).click();await lib.getByRole('button',{name:/우리 반 오프닝/}).click();
  await lib.locator('.mp-manage>summary').click();await lib.getByRole('button',{name:'삭제',exact:true}).click();await lib.getByRole('button',{name:'삭제 확인',exact:true}).click();
  await lib.getByRole('button',{name:'닫기',exact:true}).click();await page.getByRole('button',{name:'도구 칸 닫기'}).click();
  await page.locator('.cv-show-btn').click();await page.locator('[data-effect-trigger=beatintro]').click();
  assert.match(await page.locator('[data-effect-playing=beatintro]').textContent(),/저장한 두 번째 구절/);
  await page.getByRole('button',{name:'강조 화면 닫기'}).click();await page.keyboard.press('Escape');
  await page.locator('.cv-down-btn').click();await page.locator('[data-type=html]').click();
  const htmlDownload=page.waitForEvent('download');await page.locator('[data-download-save]').click();
  const dir=await mkdtemp(join(tmpdir(),'onbatang-preset-')),html=join(dir,'lesson.html');
  t.after(async()=>{await rm(html,{force:true});await rmdir(dir);});await(await htmlDownload).saveAs(html);
  const offlineContext=await browser.newContext({offline:true});t.after(()=>offlineContext.close());const offline=await offlineContext.newPage();
  offline.on('pageerror',e=>errors.push(e.message));await openExport(offline,html);
  // Export includes both slides; use the existing lesson navigation before opening the scene.
  await offline.locator('.lesson-navigation').getByRole('button',{name:'다음',exact:true}).click();
  await offline.locator('[data-effect-trigger=beatintro]').click();
  const cue=offline.locator('[data-effect-playing=beatintro] [data-cinema-track=phrase2]');await cue.waitFor();
  assert.equal(await cue.getAttribute('data-track-text'),'저장한 두 번째 구절');assert.equal(await cue.getAttribute('data-track-start'),'1800');
  assert.deepEqual(errors,[]);
});

test('stepped cinema follows saved preset timing through remote commands, reopen and offline HTML',{
  skip:!process.env.MINICAN_PLAYWRIGHT_PATH,timeout:150000,
},async t=>{
  const {page,browser,hosted,base,origin:localOrigin,errors}=await openBrowser(t);
  const origin=process.env.MINICAN_START_LIVE_ORIGIN||localOrigin,entry=origin+(hosted?'/minican-app.html':'/app/index.html');
  await page.goto(origin+base+'/app/effects.html');
  const original=await page.evaluate(async base=>{
    const {newRecord}=await import(base+'/app/designs.js'),store=await import(base+'/app/store.js');
    const {EFFECT_ASSETS}=await import(base+'/src/effect-assets.js');store.setStorageName(base?'gailab-minican':'minican');
    const record=newRecord('16:9');record.name='구절 공개 검수 사본';const first=record.slides[0];
    record.slides=EFFECT_ASSETS.filter(a=>a.cinematic).map((a,i)=>({...structuredClone(first),id:'scuecheck00'+i,items:[{
      id:'ecuecheck00'+i,t:'text',text:a.example.text,x:50,y:50,w:80,size:5,color:'#163c31',effect:{id:a.id,when:'press',
        ...(i===0?{sceneTracks:[{key:'phrase1',start:2800,duration:800},{key:'phrase2',start:1000,duration:1000},{key:'phrase3',start:1000,duration:600}]}:{}),
        ...(a.id==='fieldroute'?{pace:'slow',sceneTracks:[{key:'step3',start:0,duration:600},{key:'step1',start:1000,duration:800},{key:'step2',start:1000,duration:700}]}:{})}}]}));
    record.slides.push({...structuredClone(first),id:'scuefinal00',items:[]});
    const saved=await store.putDesign(record),tour=await import(base+'/app/tour.js');for(const id of ['home','editor',tour.NEWS_KEY])tour.markTourSeen(id);return saved;
  },base);
  await page.goto(entry);await page.getByRole('button',{name:'구절 공개 검수 사본 열기',exact:true}).click();
  for(let i=0;i<5;i++){
    await page.locator('.cv-slide:not(.add)').nth(i).click();await page.locator('.cv-canvas .fi-text').first().click();
    await page.getByRole('button',{name:'효과 수정',exact:true}).click();const picker=page.locator('.fe-fx-picker');
    await picker.getByLabel('발표 방식',{exact:true}).selectOption('step');
    if(i===0){
      await picker.getByRole('button',{name:'움직임 이름 붙여 저장'}).click();
      const dialog=page.getByRole('dialog',{name:'움직임 이름 붙여 저장'});await dialog.getByLabel('프리셋 이름').fill('구절마다 수업 시작');await dialog.getByRole('button',{name:'새 프리셋 저장'}).click();
      await picker.getByLabel('발표 방식',{exact:true}).selectOption('continuous');
      await picker.getByRole('button',{name:'모든 내 움직임 보기'}).click();
      await page.getByRole('dialog',{name:'내 움직임 보관함'}).getByRole('button',{name:'이 움직임 불러오기'}).click();
      assert.equal(await picker.getByLabel('발표 방식',{exact:true}).inputValue(),'step');
    }
    await picker.locator('[data-apply-effect]').click();
    if(await page.getByRole('button',{name:'도구 칸 닫기'}).isVisible())await page.getByRole('button',{name:'도구 칸 닫기'}).click();
  }
  await page.locator('.cv-back').click();await page.getByRole('button',{name:'구절 공개 검수 사본 열기',exact:true}).waitFor();await page.reload();
  const stored=await page.evaluate(async({base,id})=>{const s=await import(base+'/app/store.js');s.setStorageName(base?'gailab-minican':'minican');return s.getDesign(id);},{base,id:original.id});
  for(let i=0;i<5;i++){assert.equal(stored.slides[i].items[0].effect.reveal,'step');assert.equal(stored.slides[i].items[0].text,original.slides[i].items[0].text);}
  assert.deepEqual(stored.slides[0].items[0].effect.sceneTracks,original.slides[0].items[0].effect.sceneTracks);

  // Use the public host-remote adapter contract, with no account/relay/network writes.
  await page.goto(origin+base+'/app/effects.html');
  await page.evaluate(async({base,id})=>{
    document.querySelectorAll('head style').forEach(n=>n.remove());
    for(const css of ['app/app.css','app/brand.css']){const link=document.createElement('link');link.rel='stylesheet';link.href=base+'/'+css;document.head.append(link);}
    document.body.className='mc-app';const root=document.createElement('main');root.id='app';document.body.replaceChildren(root);
    const app=await import(base+'/app/app.js');
    await app.startMinican({storage:base?'gailab-minican':'minican',showRemote:{open:async({command})=>{window.cueRemote=command;return {update(){},close(){}};}}});
    await app.openSavedDesign(id);
  },{base,id:original.id});
  await page.locator('.cv-slide:not(.add)').first().click();await page.locator('.cv-show-btn').click();
  await page.locator('[data-show-remote]').click();await page.waitForFunction(()=>typeof window.cueRemote==='function');
  await page.clock.install();await page.emulateMedia({reducedMotion:'reduce'});
  const remote=action=>page.evaluate(action=>window.cueRemote({action}),action);
  const panel=page.locator('[data-cinema-steps]');
  const visible=key=>panel.locator('[data-cinema-track='+key+']').evaluate(n=>n.style.visibility==='visible');
  await remote('next');await panel.waitFor();assert.equal(await panel.getAttribute('data-step'),'1');
  await page.clock.runFor(900);assert.equal(await visible('phrase2'),false,'authored initial delay is preserved');
  await page.clock.runFor(400);assert.equal(await visible('phrase2'),true);assert.equal(await visible('phrase3'),false);assert.equal(await visible('phrase1'),false);
  assert.equal(await panel.getAttribute('data-busy'),'true');
  await page.clock.runFor(900);assert.equal(await panel.getAttribute('data-busy'),'false');
  assert.equal(await panel.getAttribute('data-step'),'1','overlapping next phrase waits for input');
  if(process.env.MINICAN_CUE_SHOTS)await page.screenshot({path:resolve(process.env.MINICAN_CUE_SHOTS+'-desktop.png')});
  for(const size of [{width:390,height:844},{width:844,height:390},{width:320,height:740}]){
    await page.setViewportSize(size);assert.ok(await panel.evaluate(n=>n.scrollWidth<=n.clientWidth+1));
    assert.ok(await panel.evaluate(n=>{const p=n.getBoundingClientRect(),a=n.querySelector('.cs-art').getBoundingClientRect(),c=n.querySelector('.cs-controls').getBoundingClientRect();return a.bottom<=c.top+1&&c.bottom<=p.bottom+1;}),'art and controls stay separate and inside the slide');
    if(process.env.MINICAN_CUE_SHOTS&&size.width===390)await page.screenshot({path:resolve(process.env.MINICAN_CUE_SHOTS+'-phone.png')});
  }
  await page.setViewportSize({width:1280,height:800});
  await panel.locator('.cs-art').click();await page.clock.runFor(150);assert.equal(await panel.getAttribute('data-step'),'2');
  await remote('next');assert.equal(await panel.getAttribute('data-step'),'2','rapid next finishes only the active cue');assert.equal(await panel.getAttribute('data-busy'),'false');
  await remote('next');await page.clock.runFor(500);assert.equal(await visible('phrase1'),false,'positive gap before final cue is preserved');
  await page.clock.runFor(600);assert.equal(await visible('phrase1'),true);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
  assert.equal(await panel.getAttribute('data-paused'),'true');await page.clock.runFor(4000);assert.equal(await panel.getAttribute('data-busy'),'true');
  await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});await remote('next');await page.clock.runFor(700);
  assert.equal(await panel.getAttribute('data-busy'),'false');await remote('prev');assert.equal(await panel.getAttribute('data-step'),'2');assert.equal(await visible('phrase1'),false);
  await page.keyboard.press('PageDown');await page.clock.runFor(1800);assert.equal(await panel.getAttribute('data-step'),'3');
  await panel.locator('.cs-reset').click();assert.equal(await panel.getAttribute('data-step'),'0');
  const auto=page.locator('.cv-show').getByRole('button',{name:/자동 넘기기/});await auto.click();await page.clock.runFor(20000);
  assert.equal(await panel.getAttribute('data-step'),'0');assert.match(await page.locator('.cv-show-count').textContent(),/^1 \/ 6/);await auto.click();
  await panel.locator('.cs-close').click();await remote('next');assert.match(await page.locator('.cv-show-count').textContent(),/^2 \/ 6/);
  for(let i=1;i<5;i++){
    await remote('next');await panel.waitFor();const keys=await panel.locator('[data-cinema-track][data-track-editable=true]').evaluateAll(ns=>ns.map(n=>({key:n.dataset.cinemaTrack,start:+n.dataset.trackStart})).sort((a,b)=>a.start-b.start).map(n=>n.key));
    for(let n=0;n<keys.length;n++){
      assert.equal(await panel.getAttribute('data-step'),String(n+1));
      await remote('next');assert.equal(await panel.getAttribute('data-busy'),'false');
      for(let k=0;k<keys.length;k++)assert.equal(await visible(keys[k]),k<=n);
      if(i===4){const visibility=await panel.locator('[data-cinema-cue=step2]').evaluateAll(ns=>ns.map(n=>n.style.visibility));assert.ok(visibility.every(v=>v===(n===2?'visible':'hidden')),'route and pins follow their phrase');}
      await remote('next');
    }
    assert.equal(await panel.count(),0);await remote('next');
  }
  assert.match(await page.locator('.cv-show-count').textContent(),/^6 \/ 6/);await page.keyboard.press('Escape');
  await page.clock.resume();
  await page.locator('.cv-slide:not(.add)').first().click();await page.locator('.cv-down-btn').click();await page.locator('[data-type=html]').click();
  const downloading=page.waitForEvent('download');await page.locator('[data-download-save]').click();
  const dir=await mkdtemp(join(tmpdir(),'onbatang-cues-')),file=join(dir,'lesson.html');t.after(async()=>{await rm(file,{force:true});await rmdir(dir);});await(await downloading).saveAs(file);
  const context=await browser.newContext({offline:true,reducedMotion:'reduce'});t.after(()=>context.close());const offline=await context.newPage();offline.on('pageerror',e=>errors.push(e.message));
  await openExport(offline,file);await offline.clock.install();const nav=offline.locator('.lesson-navigation');
  await nav.getByRole('button',{name:'다음',exact:true}).click();const out=offline.locator('[data-cinema-steps]');await out.waitFor();
  await offline.clock.runFor(1300);assert.equal(await out.locator('[data-cinema-track=phrase2]').evaluate(n=>n.style.visibility),'visible');
  assert.equal(await out.locator('[data-cinema-track=phrase3]').evaluate(n=>n.style.visibility),'hidden');
  await offline.clock.runFor(1000);await offline.keyboard.press('PageDown');await offline.clock.runFor(700);assert.equal(await out.getAttribute('data-step'),'2');
  await offline.keyboard.press('PageUp');assert.equal(await out.getAttribute('data-step'),'1');
  await out.locator('.cs-close').click();await offline.clock.resume();await offline.reload();
  await offline.locator('[data-effect-trigger=beatintro]').click();await offline.locator('[data-cinema-steps]').waitFor();assert.equal(await offline.locator('[data-cinema-steps]').getAttribute('data-step'),'1');
  assert.deepEqual(errors,[]);
});

test('cinema step opening waits for the teacher and stops queued scenes, disposal restores bindings',{
  skip:!process.env.MINICAN_PLAYWRIGHT_PATH,timeout:60000,
},async t=>{
  const {page,base,origin,errors}=await openBrowser(t);await page.goto(origin+base+'/app/effects.html');await page.clock.install();
  await page.evaluate(async base=>{
    const {mountEffectPlayer,stepOpenQuestion}=await import(base+'/src/effect-player.js');
    const host=document.createElement('div');host.style.cssText='position:fixed;inset:0;width:720px;height:360px;background:white;z-index:9999';document.body.append(host);
    const nodes=[0,1].map(i=>{const n=document.createElement('button');n.textContent='수업 구절 '+i;n.style.cssText='position:absolute;left:50%;top:50%;width:50%;height:20%';host.append(n);return n;});
    window.cueFixture={host,nodes,step:stepOpenQuestion,dispose:mountEffectPlayer(host,nodes.map((node,i)=>({node,content:{t:'text',text:'먼저 살펴요\n함께 해요\n나누어요'},effect:{id:i?'spotlighttitle':'beatintro',when:'open',...(i?{}:{reveal:'step'})}})),{delay:30})};
  },base);
  await page.clock.runFor(15000);const panel=page.locator('[data-cinema-steps]');assert.equal(await panel.getAttribute('data-step'),'0');assert.equal(await page.locator('[data-effect-playing]').count(),1);
  await panel.locator('.cs-next').click();await page.clock.runFor(200);assert.equal(await panel.getAttribute('data-busy'),'true');
  await page.evaluate(()=>window.cueFixture.dispose(true));assert.equal(await panel.getAttribute('inert'),'');
  assert.equal(await page.evaluate(()=>window.cueFixture.step(window.cueFixture.host,1)),false);
  await page.clock.runFor(3000);assert.equal(await panel.getAttribute('data-paused'),'true');
  await page.evaluate(()=>window.cueFixture.dispose());assert.equal(await panel.count(),0);
  assert.deepEqual(await page.evaluate(()=>window.cueFixture.nodes.map(n=>[n.getAttribute('role'),n.getAttribute('data-cinema-step-trigger'),n.getAttribute('data-cinema-visited'),n.inert])),[[null,null,null,false],[null,null,null,false]]);
  assert.deepEqual(errors,[]);
});
