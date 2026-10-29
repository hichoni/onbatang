// Real local app flows for occasion templates, outside-paper selection and
// connected motion stories. Fresh browser storage only; no accounts/network.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve,extname,sep} from 'node:path';

const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const options={skip:!process.env.MINICAN_PLAYWRIGHT_PATH,timeout:120000};
const fixture=`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/src/editor.css"><link rel="stylesheet" href="/app/app.css"><body class="mc-app"><main id="app"></main><script type="module">
import{startMinican}from'/app/app.js';import{newRecord}from'/app/designs.js';import{putDesign,listDesigns,getDesign,setStorageName}from'/app/store.js';
setStorageName('creative-workspace-20261029');try{localStorage.setItem('onbatang-tour-seen-v1:editor','1');localStorage.setItem('onbatang-tour-seen-v1:news-0.45','1');}catch{}
if(!(await listDesigns()).length){const old=newRecord('16:9');old.name='기존 자료 보존';old.slides=[{bg:'paper',items:[{id:'eoriginal0001',t:'text',text:'원본은 그대로',x:50,y:50,w:60,size:6}]}];await putDesign(old);}
window.readRecords=listDesigns;window.readSaved=getDesign;await startMinican({storage:'creative-workspace-20261029'});window.ready=true;
</script>`;

async function setup(t,profile){
  const server=createServer(async(req,res)=>{try{const path=new URL(req.url,'http://localhost').pathname;if(path==='/fixture.html'){res.setHeader('Content-Type','text/html');return res.end(fixture);}const file=resolve(root,'.'+decodeURIComponent(path));if(!file.startsWith(root+sep))throw Error('path');res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2','.png':'image/png'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404);res.end();}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const {chromium}=await import(pathToFileURL(process.env.MINICAN_PLAYWRIGHT_PATH));
  const browser=await chromium.launch({channel:process.env.MINICAN_BROWSER||'msedge',headless:true});
  t.after(async()=>{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));});
  const context=await browser.newContext({...profile,reducedMotion:'reduce'});
  const origin='http://127.0.0.1:'+server.address().port;
  await context.route('**/*',r=>r.request().url().startsWith(origin+'/')||/^(data:|blob:|about:)/.test(r.request().url())?r.continue():r.abort());
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
  const dir=resolve(root,'work/qa-creative-workspace-2026-10-29');await mkdir(dir,{recursive:true});
  const screenshot=name=>page.screenshot({path:resolve(dir,`${profile.isMobile?'mobile':'desktop'}-${name}.png`),fullPage:true});
  t.after(async()=>{if(!page.isClosed()&&t.signal.aborted)try{await screenshot('interrupted');}catch{}});
  await page.goto(origin+'/fixture.html');await page.waitForFunction(()=>window.ready);
  return{page,origin,errors,screenshot};
}

const visibleLayouts=page=>page.locator('.fe-layout:visible').count();
async function savedRecord(page,name){
  return page.evaluate(async value=>(await window.readRecords()).find(r=>r.name===value),name);
}
async function awaitSaved(page,name,check){
  for(let i=0;i<60;i++){
    const record=await savedRecord(page,name);if(record&&check(record))return record;
    await page.waitForTimeout(100);
  }
  assert.fail(`saved record did not match: ${name}; records=${JSON.stringify((await page.evaluate(()=>window.readRecords())).map(r=>({name:r.name,pages:r.slides.length})))}; ui=${(await page.locator('.cv-save').allTextContents()).join(' ')}`);
}

for(const [label,profile] of [['desktop',{viewport:{width:1440,height:1000}}],['mobile',{viewport:{width:390,height:844},isMobile:true,hasTouch:true}]]){
  test(`${label}: occasion templates → search/category → edit → save/reopen; motion story stays separate`,options,async t=>{
    const{page,origin,errors,screenshot}=await setup(t,profile);
    await page.locator('[data-starts="occasion"]').click();
    assert.equal(await page.locator('.cv-start').count(),30);
    await screenshot('occasion-home');
    const cover=page.locator('.cv-start[data-layout="occasion-event-opening"]');
    await cover.click();
    await page.locator('.cv-canvas .fe-stage').waitFor();
    const name=`연수 편집 검수 ${label}`;
    await page.locator('input.cv-name').fill(name);await page.locator('input.cv-name').press('Tab');
    await page.locator('.fe-tab[data-tab="layout"]').click();
    assert.equal(await page.locator('.fe-layout').count(),54);
    await page.getByRole('searchbox',{name:'틀 찾기',exact:true}).fill('식순');
    assert.equal(await visibleLayouts(page),1);
    await page.getByRole('searchbox',{name:'틀 찾기',exact:true}).fill('');
    await page.getByRole('combobox',{name:'틀 분류',exact:true}).selectOption('연수 · 워크숍');
    assert.equal(await visibleLayouts(page),6);
    await page.getByRole('searchbox',{name:'틀 찾기',exact:true}).fill('실습');
    assert.equal(await visibleLayouts(page),1);
    await screenshot('template-search');
    const layout=page.locator('.fe-layout[data-layout="occasion-training-practice"]');
    await layout.click();await layout.click();
    const stage=page.locator('.cv-canvas .fe-stage');
    await stage.locator('.fi-text').filter({hasText:'나만의 수업 도구 만들기'}).waitFor();
    if(profile.isMobile){
      const fold=page.locator('.cv-fold');if(await fold.isVisible())await fold.click();
    }
    const title=stage.locator('.fi-text').filter({hasText:'나만의 수업 도구 만들기'});
    if(profile.isMobile){await title.tap();await title.tap();}else await title.dblclick();
    await stage.locator('.fi-text.editing').fill('교실에서 바로 쓰는 실습');await page.keyboard.press('Escape');
    const record=await awaitSaved(page,name,r=>r.slides[0].items.some(it=>it.text==='교실에서 바로 쓰는 실습'));
    assert.ok(record.slides[0].items.some(it=>it.text==='만들 것'));
    assert.equal((await savedRecord(page,'기존 자료 보존')).slides[0].items[0].text,'원본은 그대로');
    await screenshot('edited-template');
    // Reload the ordinary app home and reopen by its visible saved card.
    await page.goto(origin+'/fixture.html');await page.waitForFunction(()=>window.ready);
    await page.locator('.cv-item').filter({hasText:name}).locator('.cv-item-open').click();
    await page.locator('.cv-canvas .fe-stage .fi-text').filter({hasText:'교실에서 바로 쓰는 실습'}).waitFor();
    await screenshot('reopened-template');
    if(!profile.isMobile){
      // A real mouse starts on the .cv-canvas desk, enters the paper and
      // selects multiple existing objects without moving or rewriting them.
      const canvas=await page.locator('.cv-canvas').boundingBox(),paper=await stage.boundingBox();
      assert.ok(paper.x>canvas.x+8,'desk visible on left');
      const from={x:Math.max(canvas.x+3,paper.x-14),y:paper.y+paper.height*.15};
      const to={x:paper.x+paper.width*.94,y:paper.y+paper.height*.88};
      assert.equal(await page.evaluate(p=>document.elementFromPoint(p.x,p.y)?.classList.contains('cv-canvas'),from),true);
      await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(to.x,to.y,{steps:14});await page.mouse.up();
      assert.ok(await stage.locator('.fe-one').count()>=2,'outside drag selects several pieces');
      assert.equal(await stage.locator('.fe-groupbox').isVisible(),true);
      assert.deepEqual((await savedRecord(page,name)).slides[0].items,record.slides[0].items,'selection leaves the saved content intact');
      await screenshot('outside-paper-selection');
    }
    // Use the actual editor entry, not a direct panel/sequence API.
    const unfold=page.locator('.cv-fold');if(await unfold.isVisible()&&await unfold.getAttribute('title')==='옆 칸 펴기')await unfold.click();
    await page.locator('.fe-tab[data-tab="motion"]').click();
    await page.locator('[data-motion-sets]').click();
    const motion=page.getByRole('dialog',{name:'움직임 묶음',exact:true});await motion.waitFor();
    await screenshot('motion-story-dialog');
    await motion.getByRole('button',{name:'이야기 지도',exact:true}).click();
    await motion.locator('.ms-apply').click();await motion.waitFor({state:'hidden'});
    const applied=await awaitSaved(page,name,r=>r.slides[0].tr==='move');
    const visibleContent=r=>r.slides[0].items.map(({id,t,text,shape,x,y,w,h,size,color})=>({id,t,text,shape,x,y,w,h,size,color}));
    assert.deepEqual(visibleContent(applied),visibleContent(record),'applying a motion set leaves original text and geometry intact');
    await page.locator('[data-motion-sets]').click();await motion.waitFor();
    await motion.getByRole('button',{name:'5장 예제로 새 그림',exact:true}).click();
    await motion.waitFor({state:'hidden'});
    await page.locator('input.cv-name').waitFor();
    await screenshot('created-motion-before-save-check');
    const motionRecord=await awaitSaved(page,'이야기 지도',r=>r.slides.length===5);
    assert.ok(motionRecord.slides.slice(1).every(s=>s.tr==='move'));
    assert.deepEqual((await savedRecord(page,name)).slides[0].items,applied.slides[0].items,'new sequence preserves the edited source');
    await screenshot('five-slide-story');
    await page.goto(origin+'/fixture.html');await page.waitForFunction(()=>window.ready);
    await page.locator('.cv-item').filter({hasText:'이야기 지도'}).locator('.cv-item-open').click();
    await page.locator('.cv-slide[data-slide="4"]').waitFor();
    assert.equal(await page.locator('.cv-slide[data-slide]').count(),5);
    await screenshot('reopened-story');
    assert.deepEqual(errors,[]);
  });
}
