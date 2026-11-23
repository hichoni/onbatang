// Real native editor flow; fake AI transport only. No account or question credit is used.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve,extname,sep} from 'node:path';
import {zipSync,strToU8} from 'fflate';
import {cleanDesign} from '../../src/model.js';
const root=fileURLToPath(new URL('../../',import.meta.url));
async function savedWhen(page,accept){for(let end=Date.now()+15000;Date.now()<end;await new Promise(ok=>setTimeout(ok,100))){const record=(await page.evaluate(()=>window.readSaved()))[0];if(accept(record))return record;}assert.fail('saved photo state never matched');}
const html=`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/src/editor.css"><link rel="stylesheet" href="/app/app.css"><link rel="stylesheet" href="/app/brand.css"><body class="mc-app"><main id="app"></main><script type="module">
import {startMinican} from '/app/app.js';import {listDesigns} from '/app/store.js';import {readStoryFile} from '/app/story-source.js';
window.readSaved=listDesigns;window.readStoryFile=readStoryFile;
const appMaker={connect:async()=>({label:'검수용 연결'}),generate:async(input,{signal}={})=>{
 (window.requests||=[]).push(input);if(window.hold){await new Promise((ok,no)=>signal.addEventListener('abort',()=>no(new DOMException('중단','AbortError'))));}
 const ops=[{op:'scene',title:'사람을 잇는 교육',purpose:'검수용 제작 메모',lines:['학생이 중심입니다','함께 성장합니다'],recipe:'sequential',paragraphs:input.paragraphs.map(p=>p.id)}];
 if(window.bad)ops[0].paragraphs.pop();return {kind:'slides',say:'한 장면에 발화를 연결했어요.',receipt:'검수 응답 · 실제 차감 없음',ops};
}};
await startMinican({storage:'story-browser-check',activityAuthoring:true,appMaker});window.ready=true;
</script></html>`;
async function setup(t,engine){
 const server=createServer(async(req,res)=>{try{
  const path=new URL(req.url,'http://localhost').pathname;
  if(path==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html);}
  const file=resolve(root,'.'+decodeURIComponent(path));if(!file.startsWith(resolve(root)+sep))throw Error();
  res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2','.png':'image/png'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));
 }catch{res.writeHead(404);res.end();}});
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));t.after(()=>new Promise(ok=>server.close(ok)));
 const pw=await import(pathToFileURL(process.env.MINICAN_PLAYWRIGHT_PATH).href),browser=await pw[engine].launch({...(engine==='chromium'?{channel:'msedge'}:{}),headless:true});t.after(()=>browser.close());
 const context=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'}),origin='http://127.0.0.1:'+server.address().port;
 await context.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():route.abort());
 await context.addInitScript(()=>{localStorage.setItem('onbatang-tour-seen-v1:editor','1');localStorage.setItem('onbatang-tour-seen-v1:news-0.45','1');});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);await page.waitForFunction(()=>window.ready);
 return {page,errors};
}
for(const engine of ['chromium','webkit'])test('story authoring → preserved speech → native editor / '+engine,{skip:!process.env.MINICAN_PLAYWRIGHT_PATH,timeout:120000},async t=>{
 const {page,errors}=await setup(t,engine);
 await page.locator('[data-story-start]').click();
 await page.getByLabel('발표 원고',{exact:true}).fill('제작용 제목\n첫 발화를 읽습니다.\n둘째 발화입니다.\n마지막 말씀입니다.');
 await page.locator('[data-story-read]').click();await page.getByText('읽을 문단 선택 · 제목·목차 제외',{exact:true}).click();await page.getByLabel('1문단 발화 포함',{exact:true}).uncheck();
 await page.getByRole('button',{name:'직접 구성 시작 · 차감 없음'}).click();assert.equal(await page.locator('.story-scene').count(),3);
 const png=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=160;canvas.height=100;const ctx=canvas.getContext('2d');ctx.fillStyle='#e8ad42';ctx.fillRect(12,12,136,76);return canvas.toDataURL('image/png').split(',')[1];});
 await page.getByLabel('1장면 사진 파일',{exact:true}).setInputFiles({name:'scene.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});await page.locator('.story-photo-thumb').waitFor();
 assert.equal(await page.locator('.story-photo-thumb').evaluate(async img=>{await img.decode();const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);return ctx.getImageData(0,0,1,1).data[3];}),0,'transparent edges are preserved');
 const photoKey=await page.getByLabel('1장면 사진 선택',{exact:true}).inputValue();await page.getByLabel('2장면 사진 선택',{exact:true}).selectOption(photoKey);
 await page.locator('.modal-close').click();await page.locator('[data-story-start]').click();assert.equal(await page.getByLabel('2장면 사진 선택',{exact:true}).inputValue(),photoKey,'draft photo links survive reopening');
 await page.locator('[data-story-ai]').click();await page.waitForFunction(()=>document.querySelectorAll('.story-scene').length===1);
 assert.equal((await page.evaluate(()=>window.requests))[0].paragraphs.length,3);
 assert.equal(JSON.stringify(await page.evaluate(()=>window.requests)).includes('data:image'),false,'image bytes do not enter the AI request');
 await page.getByLabel('1장면 제목',{exact:true}).fill('직접 고친 장면');
 await page.getByRole('button',{name:'미리보기',exact:true}).click();await page.locator('.story-preview .fe-card').waitFor();
 await page.evaluate(()=>window.bad=true);await page.locator('[data-story-ai]').click();await page.getByText(/누락·중복·순서 변경이 있어요/).waitFor();assert.equal(await page.getByLabel('1장면 제목',{exact:true}).inputValue(),'직접 고친 장면');
 await page.evaluate(()=>{window.bad=false;window.hold=true;});await page.locator('[data-story-ai]').click();await page.getByRole('button',{name:'응답 기다리기 중단'}).click();await page.getByText(/응답 기다리기를 중단했어요/).waitFor();await page.evaluate(()=>window.hold=false);
 await page.getByRole('button',{name:'발화 묶음 나누기'}).click();assert.equal(await page.locator('.story-scene').count(),2);await page.getByRole('button',{name:'다음 장면과 묶기'}).first().click();
 await page.getByRole('button',{name:'이전 구성으로 되돌리기'}).click();assert.equal(await page.locator('.story-scene').count(),3);
 await page.locator('[data-story-ai]').click();await page.waitForFunction(()=>document.querySelectorAll('.story-scene').length===1);
 await mkdir(new URL('../../qa-story/',import.meta.url),{recursive:true});
 await page.screenshot({path:fileURLToPath(new URL('../../qa-story/'+engine+'-desktop.png',import.meta.url))});
 // The authoring dialog must fit independently of the home surface behind it.
 for(const width of [390,320]){await page.setViewportSize({width,height:844});await page.screenshot({path:fileURLToPath(new URL('../../qa-story/'+engine+'-'+width+'.png',import.meta.url))});const box=await page.locator('.modal-panel').evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth,left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right}));assert.ok(box.scroll<=box.width+1&&box.left>=0&&box.right<=width+1,JSON.stringify(box));}
 await page.screenshot({path:fileURLToPath(new URL('../../qa-story/'+engine+'-mobile.png',import.meta.url))});await page.setViewportSize({width:1280,height:900});
 await page.locator('[data-story-create]').click();await page.locator('.cv-canvas .fe-stage').waitFor();await page.screenshot({path:fileURLToPath(new URL('../../qa-story/'+engine+'-editor.png',import.meta.url))});
 const saved=(await page.evaluate(()=>window.readSaved()))[0];assert.deepEqual(saved.slides.map(s=>s.notes),['첫 발화를 읽습니다.','둘째 발화입니다.','마지막 말씀입니다.']);assert.equal(saved.story.scenes[0].purpose,'검수용 제작 메모');
 assert.equal(saved.slides.flatMap(s=>s.items.filter(i=>i.t==='image')).length,3);
 await page.locator('.cv-document-menu>summary').click();await page.locator('[data-story-photos]').click();
 const png2=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=100;canvas.height=160;const ctx=canvas.getContext('2d');ctx.fillStyle='#37a3cb';ctx.fillRect(12,12,76,136);return canvas.toDataURL('image/png').split(',')[1];});
 await page.getByLabel('1번 연결 사진 교체',{exact:true}).setInputFiles({name:'replacement.png',mimeType:'image/png',buffer:Buffer.from(png2,'base64')});await page.getByText('비교한 뒤 적용해 주세요. 아직 발표는 바뀌지 않았어요.',{exact:true}).waitFor();
 await page.getByLabel('사진 교체 미리보기 장',{exact:true}).selectOption('2');assert.equal(await page.locator('.story-photo-pair .fe-card').count(),2);
 await page.screenshot({path:fileURLToPath(new URL('../../qa-story/'+engine+'-photo-comparison.png',import.meta.url))});
 for(const width of [390,320]){await page.setViewportSize({width,height:844});const box=await page.locator('.modal-panel').evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth,left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right}));assert.ok(box.scroll<=box.width+1&&box.left>=0&&box.right<=width+1,JSON.stringify(box));}
 await page.screenshot({path:fileURLToPath(new URL('../../qa-story/'+engine+'-photo-mobile.png',import.meta.url))});await page.setViewportSize({width:1280,height:900});
 assert.deepEqual((await page.evaluate(()=>window.readSaved()))[0].slides.map(s=>s.items.find(i=>i.t==='image').url),saved.slides.map(s=>s.items.find(i=>i.t==='image').url));
 const previousUrl=saved.slides[0].items.find(i=>i.t==='image').url;
 await page.getByRole('button',{name:'3개 장 · 3곳에 적용 · 차감 없음'}).click();assert.match(await page.locator('[aria-label="이야기 사진"] [role="status"]').innerText(),/연결된 사진을 바꿨어요/);
 const replaced=await savedWhen(page,record=>{const rows=record.slides.map(s=>s.items.find(i=>i.t==='image').url);return rows[0]!==previousUrl&&rows.every(url=>url===rows[0]);});
 // The editor materializes default fields on first save (opacity, rotation,
 // flips and zero delays). Compare canonical native designs, not raw defaults.
 const stripUrl=slides=>slides.map(cleanDesign).map(s=>({...s,items:s.items.map(({url,...it})=>it)}));assert.notEqual(replaced.slides[0].items.find(i=>i.t==='image').url,saved.slides[0].items.find(i=>i.t==='image').url);assert.deepEqual(stripUrl(replaced.slides),stripUrl(saved.slides));
 await page.getByRole('button',{name:'사진 교체 되돌리기',exact:true}).click();await page.getByText('사진 교체를 되돌렸어요.',{exact:true}).waitFor();await page.locator('.modal-close').click();
 await savedWhen(page,record=>record.slides.every(s=>s.items.find(i=>i.t==='image').url===previousUrl));
 await page.locator('[data-story-audit]').click();await page.getByText('선택한 원고와 발화·순서가 일치해요.',{exact:true}).waitFor();await page.locator('.modal-close').click();
 await page.locator('[data-assist-toggle]').click();assert.equal(await page.locator('[data-assist-want="notes"]').count(),0);
 await page.locator('.cv-show-btn').click();await page.locator('.cv-show-stage .fe-card').waitFor();
 assert.doesNotMatch(await page.locator('.cv-show-stage').innerText(),/검수용 제작 메모|첫 발화를 읽습니다/);
 await page.keyboard.press('ArrowRight');await page.waitForFunction(()=>document.querySelector('.cv-show-count')?.textContent.includes('2'));
 await page.keyboard.press('ArrowLeft');await page.waitForFunction(()=>document.querySelector('.cv-show-count')?.textContent.startsWith('1'));
 await page.setViewportSize({width:390,height:844});assert.ok(await page.locator('.cv-show-stage').evaluate(el=>el.getBoundingClientRect().width<=innerWidth+1));
 for(const size of [{width:844,height:390},{width:390,height:844}]){await page.setViewportSize(size);for(const key of ['ArrowRight','ArrowRight','ArrowLeft','ArrowLeft'])await page.keyboard.press(key);await page.waitForFunction(()=>document.querySelector('.cv-show-count')?.textContent.startsWith('1'));await page.locator('.cv-show-stage img').first().evaluate(img=>img.decode());assert.ok(await page.locator('.cv-show-stage img').first().evaluate(img=>img.naturalWidth>0&&img.getBoundingClientRect().width>0));}
 await page.screenshot({path:fileURLToPath(new URL('../../qa-story/'+engine+'-presentation.png',import.meta.url))});await page.keyboard.press('Escape');
 await page.reload();await page.waitForFunction(()=>window.ready);assert.deepEqual((await page.evaluate(()=>window.readSaved()))[0].story,saved.story);
 // Browser XML parser and ZIP reader preserve nested table paragraphs without duplication.
 const xml='<hs:sec xmlns:hs="hs" xmlns:hp="hp"><hp:p><hp:run><hp:t>첫 발화</hp:t><hp:tbl><hp:p><hp:run><hp:t>표 안의 발화</hp:t></hp:run></hp:p></hp:tbl></hp:run></hp:p></hs:sec>';
 const bytes=Array.from(zipSync({'Contents/section0.xml':strToU8(xml)}));assert.equal(await page.evaluate(async bytes=>window.readStoryFile(new File([new Uint8Array(bytes)],'test.hwpx')),bytes),'첫 발화\n표 안의 발화');
 if(process.env.STORY_HWPX_PATH){const real=Array.from(await readFile(process.env.STORY_HWPX_PATH));const count=await page.evaluate(async bytes=>(await window.readStoryFile(new File([new Uint8Array(bytes)],'원고.hwpx'))).split('\n').length,real);assert.ok(count>=106);t.diagnostic('Provided HWPX: '+count+' nonempty paragraphs parsed. Spoken selection is an author decision.');}
 assert.deepEqual(errors,[]);
});

for(const engine of ['chromium','webkit'])test('saved story workspace → compare speech → undo / '+engine,{skip:!process.env.MINICAN_PLAYWRIGHT_PATH,timeout:180000},async t=>{
 const {page,errors}=await setup(t,engine);
 await page.locator('[data-story-start]').click();await page.getByLabel('발표 원고',{exact:true}).fill('첫 발화를 읽습니다.\n둘째 발화입니다.\n마지막 말씀입니다.');
 await page.locator('[data-story-read]').click();await page.getByRole('button',{name:'직접 구성 시작 · 차감 없음'}).click();
 // Use a real image so preservation covers the photo path as well as text.
 const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=80;c.height=60;const x=c.getContext('2d');x.fillStyle='#eba94c';x.fillRect(0,0,80,60);return c.toDataURL().split(',')[1];});
 await page.getByLabel('2장면 사진 파일',{exact:true}).setInputFiles({name:'board.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});await page.locator('.story-photo-thumb').waitFor();
 await page.locator('[data-story-create]').click();await page.locator('.cv-canvas .fe-stage').waitFor();
 const saved=(await page.evaluate(()=>window.readSaved()))[0],original=saved.slides[1].notes;
 const choose=async()=>{await page.locator('[data-story-board]').click();await page.locator('[data-story-cue]').nth(1).click();};
 await choose();assert.equal(await page.locator('[data-story-cue]').count(),3);
 assert.equal(await page.getByLabel('선택한 발화 수정',{exact:true}).inputValue(),original);await page.locator('.story-board-preview img').first().evaluate(img=>img.decode());
 await page.locator('.modal-panel').evaluate(el=>el.scrollTop=0);await page.screenshot({path:fileURLToPath(new URL('../../qa-story/'+engine+'-board-overview.png',import.meta.url))});
 await page.getByLabel('선택한 발화 수정',{exact:true}).fill('내가 직접 다듬은 둘째 발화입니다.');
 await page.getByRole('button',{name:'수정 전후 비교',exact:true}).click();assert.equal((await page.evaluate(()=>window.readSaved()))[0].slides[1].notes,original);
 await page.screenshot({path:fileURLToPath(new URL('../../qa-story/'+engine+'-board-desktop.png',import.meta.url))});
 for(const width of [390,320]){await page.setViewportSize({width,height:844});const box=await page.locator('.modal-panel').evaluate(el=>({w:el.clientWidth,s:el.scrollWidth,l:el.getBoundingClientRect().left,r:el.getBoundingClientRect().right}));assert.ok(box.s<=box.w+1&&box.l>=0&&box.r<=width+1,JSON.stringify(box));await page.locator('.modal-panel').evaluate(el=>el.scrollTop=0);await page.screenshot({path:fileURLToPath(new URL('../../qa-story/'+engine+'-board-'+width+'.png',import.meta.url))});}
 await page.setViewportSize({width:1280,height:900});
 // Closing the dialog and changing cue must not lose in-editor drafts.
 await page.locator('.modal-close').click();await choose();assert.equal(await page.getByLabel('선택한 발화 수정',{exact:true}).inputValue(),'내가 직접 다듬은 둘째 발화입니다.');
 await page.getByRole('button',{name:'수정 전후 비교',exact:true}).click();await page.getByRole('button',{name:'이 발화에 적용 · 차감 없음',exact:true}).click();
 let edited=await savedWhen(page,r=>r.slides[1].notes==='내가 직접 다듬은 둘째 발화입니다.');
 const artwork=slides=>slides.map(s=>cleanDesign(s)).map(({notes,...rest})=>rest);assert.deepEqual(artwork(edited.slides),artwork(saved.slides));assert.deepEqual(edited.story,saved.story);
 assert.match(await page.locator('[data-story-board-summary]').innerText(),/수정 1/);
 await page.getByRole('button',{name:'마지막 발화 수정 되돌리기',exact:true}).click();await savedWhen(page,r=>r.slides[1].notes===original);assert.match(await page.locator('[data-story-board-summary]').innerText(),/원고와 발화·순서가 일치/);
 // Empty cues are explicit and can be restored from the unchanged reference.
 await page.getByLabel('선택한 발화 수정',{exact:true}).fill('');await page.getByRole('button',{name:'수정 전후 비교',exact:true}).click();await page.getByText('발화 없이 진행하는 단계로 바뀝니다. 비교한 뒤 적용해 주세요.',{exact:true}).waitFor();await page.getByRole('button',{name:'이 발화에 적용 · 차감 없음',exact:true}).click();await savedWhen(page,r=>!r.slides[1].notes);
 await page.getByRole('button',{name:'기준 원고로 복원 준비',exact:true}).click();assert.equal((await page.evaluate(()=>window.readSaved()))[0].slides[1].notes,undefined);
 await page.getByRole('button',{name:'수정 전후 비교',exact:true}).click();await page.getByRole('button',{name:'이 발화에 적용 · 차감 없음',exact:true}).click();await savedWhen(page,r=>r.slides[1].notes===original);
 // Navigate to the bound native page, then return with that same cue selected.
 await page.getByRole('button',{name:'이 화면의 글·사진·배치 편집',exact:true}).click();assert.equal(await page.getByLabel('발표자 노트',{exact:true}).inputValue(),original);
 await page.locator('[data-story-board]').click();assert.equal(await page.getByLabel('선택한 발화 수정',{exact:true}).inputValue(),original);
 await page.getByLabel('선택한 발화 수정',{exact:true}).fill('다시 열어도 남을 발화');await page.getByRole('button',{name:'수정 전후 비교',exact:true}).click();await page.getByRole('button',{name:'이 발화에 적용 · 차감 없음',exact:true}).click();await savedWhen(page,r=>r.slides[1].notes==='다시 열어도 남을 발화');await page.locator('.modal-close').click();
 await page.reload();await page.waitForFunction(()=>window.ready);const reopened=(await page.evaluate(()=>window.readSaved()))[0];assert.equal(reopened.slides[1].notes,'다시 열어도 남을 발화');assert.deepEqual(reopened.story,saved.story);
 await page.getByRole('button',{name:'나의 이야기 열기',exact:true}).click();await page.locator('[data-story-board]').click();await page.locator('[data-story-cue]').nth(1).click();assert.equal(await page.getByLabel('선택한 발화 수정',{exact:true}).inputValue(),'다시 열어도 남을 발화');
 assert.equal((await page.evaluate(()=>window.requests||[])).length,0,'workspace edits never call AI');assert.deepEqual(errors,[]);
});

test('workspace refuses stale comparisons and out-of-order undo',{skip:!process.env.MINICAN_PLAYWRIGHT_PATH,timeout:90000},async t=>{
 const {page,errors}=await setup(t,'chromium');
 await page.evaluate(async()=>{
  const {storySource,localStoryPlan,makeStory,storySlides}=await import('/src/story.js'),{createStoryBoard}=await import('/app/story-board.js');
  const source=storySource('기준 원고'),story=makeStory(source,localStoryPlan(source));
  const state=window.boardTest={story,slides:storySlides(story),calls:0,block:''};
  const board=createStoryBoard({state:{drafts:new Map()},story:()=>state.story,slides:()=>state.slides,view:()=>document.createElement('div'),blocked:()=>state.block,apply:async next=>{state.calls++;state.slides=next;return {};},canUndo:()=>false,undo:()=>{throw Error('Out-of-order undo must not run');},edit:()=>{}});
  document.body.replaceChildren(board.node);
 });
 await page.getByLabel('선택한 발화 수정',{exact:true}).fill('고칠 말');await page.getByRole('button',{name:'수정 전후 비교',exact:true}).click();
 await page.evaluate(()=>window.boardTest.slides[0].notes='다른 편집의 발화');await page.getByRole('button',{name:'이 발화에 적용 · 차감 없음',exact:true}).click();await page.getByText('비교하는 동안 자료가 바뀌었어요. 다시 비교해 주세요.',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.boardTest.calls),0);
 await page.getByRole('button',{name:'수정 전후 비교',exact:true}).click();await page.getByText('수정 칸을 작성한 뒤 현재 발화가 바뀌었어요. 현재 발화 다시 읽기를 눌러 확인해 주세요.',{exact:true}).waitFor();
 await page.getByRole('button',{name:'현재 발화 다시 읽기',exact:true}).click();assert.equal(await page.getByLabel('선택한 발화 수정',{exact:true}).inputValue(),'다른 편집의 발화');
 await page.getByLabel('선택한 발화 수정',{exact:true}).fill('다시 비교한 말');await page.getByRole('button',{name:'수정 전후 비교',exact:true}).click();await page.evaluate(()=>window.boardTest.block='다른 작업이 진행 중입니다.');await page.getByRole('button',{name:'이 발화에 적용 · 차감 없음',exact:true}).click();await page.getByText('다른 작업이 진행 중입니다.',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.boardTest.calls),0);
 await page.evaluate(()=>window.boardTest.block='');await page.getByRole('button',{name:'수정 전후 비교',exact:true}).click();await page.getByRole('button',{name:'이 발화에 적용 · 차감 없음',exact:true}).click();assert.equal(await page.evaluate(()=>window.boardTest.calls),1);
 await page.getByRole('button',{name:'마지막 발화 수정 되돌리기',exact:true}).click();await page.getByText('그 뒤에 편집한 내용이 있어요. 편집기의 실행 취소로 순서대로 되돌려 주세요.',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.boardTest.slides[0].notes),'다시 비교한 말');assert.deepEqual(errors,[]);
});
