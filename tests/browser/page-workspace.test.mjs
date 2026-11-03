// Real app checks: V2 changes placement, never the saved drawing contract.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const repo=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const root=resolve(process.env.MINICAN_HOST_ROOT||repo),base=process.env.MINICAN_HOST_ROOT?'/minican':'';
const options={skip:!process.env.MINICAN_PLAYWRIGHT_PATH,timeout:120000};
const html=`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="${base}/src/editor.css"><link rel="stylesheet" href="${base}/app/app.css"><link rel="stylesheet" href="${base}/app/brand.css">
<body class="mc-app"><main id="app"></main><script type="module">
import{startMinican}from'${base}/app/app.js';import{newRecord}from'${base}/app/designs.js';import*as store from'${base}/app/store.js';import{markTourSeen,NEWS_KEY}from'${base}/app/tour.js';
store.setStorageName('page-workspace-v2');for(const k of ['home','editor',NEWS_KEY])markTourSeen(k);
if(!(await store.listDesigns()).length){const r=newRecord('16:9');r.name='빛의 여행';
const c=document.createElement('canvas');c.width=200;c.height=120;const x=c.getContext('2d');x.fillStyle='#a6c5ad';x.fillRect(0,0,200,120);x.fillStyle='#f9d36d';x.fillRect(30,20,80,80);
r.slides=Array.from({length:12},(_,i)=>({id:'pworkspace'+String(i).padStart(3,'0'),bg:'#f6f2e9',items:[
{id:'eworktitle'+String(i).padStart(3,'0'),t:'text',text:i?'빛의 여행 '+(i+1):'빛은 어떤 길로 움직일까?',x:50,y:22,w:84,size:6,color:'#244c43'},
{id:'eworkshape'+String(i).padStart(3,'0'),t:'shape',shape:'circle',color:'#d8e8dc',x:25,y:62,w:22,h:40},
{id:'eworkphoto'+String(i).padStart(3,'0'),t:'image',url:c.toDataURL(),x:72,y:62,w:28,h:30},
{id:'eworklocked'+String(i).padStart(3,'0'),t:'text',text:'잠긴 안내',x:50,y:90,w:40,size:3,lock:true}]}));await store.putDesign(r);}
window.readSaved=async()=>(await store.listDesigns())[0];await startMinican({storage:'page-workspace-v2'});window.ready=true;
</script></html>`;

async function setup(t,viewport={width:1440,height:1000}){
  const server=createServer(async(req,res)=>{try{
    const p=new URL(req.url,'http://localhost').pathname;
    if(p==='/fixture.html'){res.setHeader('Content-Type','text/html;charset=utf-8');return res.end(html);}
    const f=resolve(root,'.'+decodeURIComponent(p));if(!f.startsWith(root+sep))throw Error('path');
    res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2'})[extname(f)]||'application/octet-stream');res.end(await readFile(f));
  }catch{res.writeHead(404);res.end();}});
  await new Promise(done=>server.listen(0,'127.0.0.1',done));
  const pw=await import(pathToFileURL(process.env.MINICAN_PLAYWRIGHT_PATH).href);
  const browser=process.env.MINICAN_BROWSER==='webkit'?await pw.webkit.launch():await pw.chromium.launch({channel:process.env.MINICAN_BROWSER||'msedge'});
  const page=await browser.newPage({viewport,reducedMotion:'reduce'}),errors=[];
  page.setDefaultTimeout(12000);page.on('pageerror',error=>errors.push(error.message));
  const origin=`http://127.0.0.1:${server.address().port}`;
  await page.route('**/*',r=>r.request().url().startsWith(origin+'/')||/^(data:|blob:|about:)/.test(r.request().url())?r.continue():r.abort());
  const out=resolve(repo,'work/page-workspace-qa');await mkdir(out,{recursive:true});
  const shot=name=>page.screenshot({path:resolve(out,`${process.env.MINICAN_BROWSER||'edge'}-${base?'host':'common'}-${name}.png`)});
  t.after(async()=>{await shot(t.name.startsWith('1024')?'responsive-last':'desktop-last').catch(()=>{});await browser.close();server.closeAllConnections();await new Promise(done=>server.close(done));});
  await page.goto(origin+'/fixture.html');await page.waitForFunction(()=>window.ready);
  await page.getByRole('button',{name:'빛의 여행 열기',exact:true}).click();
  await page.locator('.cv-page-workspace .fe-stage').waitFor();
  return{page,errors,shot};
}

const title=page=>page.locator('.cv-canvas .fi-text').first();

test('the horizontal tool menu overlays a new widescreen document without moving or resizing it',options,async t=>{
  const {page,errors,shot}=await setup(t);
  await page.locator('.cv-back').click();
  await page.evaluate(()=>localStorage.setItem('minican.ratio','1:1'));
  await page.locator('.cv-new-btn').click();
  const stage=page.locator('.cv-canvas .fe-stage');
  await stage.waitFor();
  const box=await stage.boundingBox();
  assert.ok(Math.abs(box.width/box.height-16/9)<0.02);
  const bounds=()=>page.evaluate(()=>['.cv-canvas','.cv-canvas .fe-stage','.cv-slide.on'].map(selector=>{
    const {x,y,width,height}=document.querySelector(selector).getBoundingClientRect();
    return [x,y,width,height];
  }));
  for(const [width,height] of [[1440,900],[932,449],[390,844],[320,568]]){
    await page.setViewportSize({width,height});
    await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
    const before=await bounds();
    for(const tool of ['text','layout','element','upload','bg','layer','motion']){
      await page.locator(`[data-tab="${tool}"]`).click();
      await page.locator(`.fe-tabbody[data-panel="${tool}"]`).waitFor();
      assert.deepEqual(await bounds(),before,`${tool} keeps the page still at ${width}px`);
    }
    const metrics=await page.locator('.fe-tabbody').evaluate(panel=>({
      width:panel.clientWidth,height:panel.clientHeight,scroll:panel.scrollHeight,
      top:panel.getBoundingClientRect().top,work:document.querySelector('.cv-work').getBoundingClientRect().top,
      onTop:panel.contains(document.elementFromPoint(innerWidth/2,panel.getBoundingClientRect().top+5)),
      pageWidth:document.documentElement.scrollWidth,
    }));
    assert.ok(metrics.width>=width-4 && metrics.scroll<=metrics.height+2 && Math.abs(metrics.top-metrics.work)<1 && metrics.onTop,
      'motion fits its shelf at '+width+'px: '+JSON.stringify(metrics));
    assert.ok(metrics.pageWidth<=width+1);
    await shot('motion-shelf-'+width);
    await page.getByRole('button',{name:'사용 안내',exact:true}).click();
    assert.deepEqual(await bounds(),before,'expanded help keeps the canvas still');
    await page.getByRole('button',{name:'도구 칸 닫기'}).click();
    assert.deepEqual(await bounds(),before,'closing the overlay keeps the canvas still');
  }
  await page.locator('[data-tab=motion]').click();
  await page.getByLabel('움직임 종류').selectOption('조합 효과');
  await page.locator('[data-group=combo] [data-motion=impact]').click();
  assert.equal(await page.getByLabel('움직임 종류').inputValue(),'조합 효과');
  assert.ok(await page.locator('[data-group=combo] [data-motion=impact].on').count());
  await page.getByRole('button',{name:'도구 칸 닫기'}).click();
  await page.locator('[data-tab=element]').click();
  await page.getByLabel('꾸미기 종류').selectOption('차트');
  assert.ok(await page.locator('[data-add-chart]').first().isVisible());
  assert.deepEqual(errors,[]);
});

const saved=page=>page.evaluate(()=>window.readSaved());
async function persisted(page,predicate){
  for(let i=0;i<80;i++){const value=await saved(page);if(predicate(value))return value;await page.waitForTimeout(100);}
  assert.fail('Expected edit was not persisted');
}
async function geometry(page){
  return page.evaluate(()=>{
    const box=s=>{const n=document.querySelector(s),r=n.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom};};
    return{pages:box('.cv-strip'),canvas:box('.cv-canvas'),props:box('.cv-properties'),stage:box('.cv-canvas .fe-stage'),overflow:document.documentElement.scrollWidth>innerWidth+1};
  });
}

test('page workspace edits text/photos, orders pages, undoes, presents, exports and reopens saved work',options,async t=>{
  const {page,errors,shot}=await setup(t);
  let g=await geometry(page);assert.ok(g.pages.right<=g.canvas.x+1&&g.canvas.right<=g.props.x+1);assert.ok(g.stage.w>700&&!g.overflow);
  const tiles=page.locator('.cv-slide:not(.add)');assert.equal(await tiles.count(),12);
  const a=await tiles.nth(0).boundingBox(),b=await tiles.nth(1).boundingBox();assert.ok(b.y>a.y+a.height);
  await title(page).click();assert.equal(await page.locator('.fe-inspector-title').textContent(),'글');
  await page.getByRole('button',{name:'굵게',exact:true}).click();
  await persisted(page,r=>r.slides[0].items[0].bold===true);
  await page.getByRole('button',{name:'실행 취소',exact:true}).click();await persisted(page,r=>!r.slides[0].items[0].bold);
  await page.getByRole('button',{name:'다시 실행',exact:true}).click();await persisted(page,r=>r.slides[0].items[0].bold===true);
  await title(page).dblclick();await page.locator('.cv-canvas .fi-text.editing').fill('빛이 지나가는 길');await page.keyboard.press('Escape');
  await page.locator('.cv-canvas .fi-shape').click({modifiers:['Shift']});assert.equal(await page.locator('.fe-inspector-title').textContent(),'2개 조각');
  await page.getByRole('button',{name:'그룹으로 묶기',exact:true}).click();await persisted(page,r=>!!r.slides[0].items[0].g);
  await page.getByRole('button',{name:'실행 취소',exact:true}).click();
  await page.locator('.cv-canvas .fi-image').click();assert.equal(await page.locator('.fe-inspector-title').textContent(),'사진');
  await page.getByRole('button',{name:'이미지 자르기',exact:true}).click();await page.locator('[data-image-crop]').waitFor();
  await page.getByRole('button',{name:'자르기 취소',exact:true}).click();
  await title(page).click();await shot('text-properties');
  await page.locator('.cv-canvas .fi-text').last().click();assert.match(await page.locator('.fe-inspector-note').textContent(),/잠긴/);
  await page.getByRole('button',{name:'잠금 해제',exact:true}).click();await persisted(page,r=>!r.slides[0].items[3].lock);
  await page.locator('.fe-tab[data-tab=text]').click();await page.locator('.fe-textadd').first().click();
  await page.locator('.cv-canvas .fi-text.editing').fill('관찰한 내용을 적어요');await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'도구 칸 닫기',exact:true}).click();await persisted(page,r=>r.slides[0].items.length===5);
  // Vertical keyboard sorting preserves page identity and the selected page.
  await tiles.nth(0).focus();await page.keyboard.press('Alt+ArrowDown');
  await persisted(page,r=>r.slides[1].id==='pworkspace000');assert.equal(await page.locator('.cv-slide.on').getAttribute('data-slide'),'1');
  assert.equal(await page.evaluate(()=>document.activeElement?.dataset.slide),'1','keyboard focus follows the reordered page');
  // Native HTML drag uses Y coordinates and persists the same move.
  await tiles.nth(1).dragTo(tiles.nth(3),{targetPosition:{x:50,y:70}});
  await persisted(page,r=>r.slides.findIndex(s=>s.id==='pworkspace000')>=2);
  await tiles.last().click();assert.ok((await page.locator('.cv-slide-list').evaluate(n=>n.scrollTop))>0);
  await page.getByRole('button',{name:'새 장 더하기',exact:true}).click();await persisted(page,r=>r.slides.length===13);
  await page.getByRole('button',{name:'장 목록 접기',exact:true}).click();assert.ok((await geometry(page)).canvas.w>g.canvas.w);
  await page.getByRole('button',{name:'장 목록 펼치기',exact:true}).click();
  await page.getByRole('separator',{name:'장 목록 너비 조절'}).focus();await page.keyboard.press('ArrowRight');assert.ok((await geometry(page)).pages.w>g.pages.w);
  await page.locator('.cv-name').fill('빛의 여행 V2');
  await page.locator('.fe-notes summary').click();await page.getByRole('textbox',{name:'발표자 노트',exact:true}).fill('마지막 질문을 함께 이야기해요.');
  await persisted(page,r=>r.name==='빛의 여행 V2'&&r.slides.at(-1).notes==='마지막 질문을 함께 이야기해요.');
  await page.getByLabel('문서 메뉴',{exact:true}).click();assert.ok(await page.getByRole('button',{name:'정사각형',exact:true}).isVisible());assert.ok(await page.locator('.cv-history-btn').isVisible());await page.keyboard.press('Escape');
  await page.locator('.cv-show-btn').click();await page.locator('.cv-show').waitFor();await page.keyboard.press('Escape');await page.locator('.cv-show').waitFor({state:'detached'});
  await page.locator('.cv-down-btn').click();assert.equal(await page.locator('.cv-down-formats button').count(),9);await page.keyboard.press('Escape');
  const before=await saved(page);await page.reload();await page.getByRole('button',{name:'빛의 여행 V2 열기',exact:true}).click();
  assert.deepEqual((await saved(page)).slides,before.slides);assert.equal(await tiles.count(),13);assert.deepEqual(errors,[]);
  await shot('desktop');
});

test('1024px and small screens keep canvas visible, with usable page, tool and property drawers',options,async t=>{
  const {page,errors,shot}=await setup(t,{width:1024,height:768});
  await title(page).click();await page.getByRole('button',{name:'글자 색',exact:true}).click();
  assert.ok(await page.locator('.cv-properties .fe-pop').isVisible());let g=await geometry(page);assert.ok(g.stage.w>400&&!g.overflow);await shot('tablet');
  for(const width of [768,390,320]){
    await page.setViewportSize({width,height:844});
    g=await geometry(page);assert.ok(!g.overflow&&g.stage.w>=width-60,`${width}px canvas remains available`);
    assert.equal(await page.locator('.cv-properties').isVisible(),false);
    await page.getByRole('button',{name:'장 목록',exact:true}).click();await page.locator('.cv-slide[data-slide="2"]').click();
    assert.equal(await page.locator('.cv-strip').isVisible(),false);assert.match(await title(page).innerText(),/빛의 여행 3/);
    await page.locator('.cv-canvas').click({position:{x:4,y:4}});await title(page).click();await page.getByRole('button',{name:'속성',exact:true}).click();
    assert.equal(await page.locator('.fe-inspector-title').textContent(),'글');assert.ok(await page.getByRole('button',{name:'굵게',exact:true}).isVisible());
    await shot(`phone-${width}-properties`);await page.getByRole('button',{name:'속성 닫기',exact:true}).click();
    assert.equal(await page.locator('.cv-properties').isVisible(),false);
    await page.locator('[data-tab=text]').click();await page.locator('.fe-textadd').first().click();
    assert.equal(await page.locator('.fe-tabbody').isVisible(),false,'inserting on a small screen returns to the canvas');
    await page.locator('.cv-canvas .fi-text.editing').fill(`좁은 화면 ${width}`);await page.keyboard.press('Escape');
    await persisted(page,r=>r.slides[2].items.some(i=>i.text===`좁은 화면 ${width}`));
    await page.getByLabel('문서 메뉴',{exact:true}).click();assert.ok(await page.getByRole('button',{name:'가로',exact:true}).isVisible());await page.keyboard.press('Escape');
    assert.equal((await geometry(page)).overflow,false);await shot(`phone-${width}`);
  }
  assert.deepEqual(errors,[]);
});
