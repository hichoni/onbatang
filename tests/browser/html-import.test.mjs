import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {resolve, extname, sep} from 'node:path';
import {createHtmlLesson} from '../../app/html-lesson.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const options = {skip: !process.env.MINICAN_PLAYWRIGHT_PATH, timeout: 120000};
const html = `<!doctype html><meta charset="utf-8"><style>body{background:#e6f4ef;font:24px sans-serif}button{font:inherit;padding:20px}</style><h1>HTML 수업</h1><button id="count">눌러요</button><p id="status"></p><p id="duplicate-a">같은 글</p><p id="duplicate-b">같은 글</p><p id="mixed">앞 <strong>강조</strong> 뒤</p><script>
count.onclick=()=>count.textContent='완료';
try{parent.document.body.dataset.compromised='yes';status.textContent='unsafe';}catch{document.getElementById('status').textContent='isolated';}
try{localStorage.setItem('html-import-secret','stolen');}catch{}
</script>`;
const fixture = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/src/editor.css"><link rel="stylesheet" href="/app/app.css"><body class="mc-app"><main id="app"></main><script type="module">
import {startMinican} from '/app/app.js';import {listDesigns,putDesign} from '/app/store.js';import {markTourSeen,NEWS_KEY} from '/app/tour.js';
for(const name of ['home','editor',NEWS_KEY])markTourSeen(name);window.listDesigns=listDesigns;window.putDesign=putDesign;
await startMinican({storage:'html-import-test'});window.ready=true;</script>`;
test('HTML runs on open, supports text edits and undo, preserves isolation and exports edited offline HTML', options, async t => {
  const server = createServer(async (req, res) => {
    try {
      const p = new URL(req.url, 'http://x').pathname;
      if (p === '/fixture.html') {res.setHeader('Content-Type', 'text/html; charset=utf-8'); return res.end(fixture);}
      const f = resolve(root, '.' + decodeURIComponent(p)); if (!f.startsWith(resolve(root) + sep)) throw Error('path');
      res.setHeader('Content-Type', ({'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2'})[extname(f)] || 'application/octet-stream');
      res.end(await readFile(f));
    } catch {res.writeHead(404); res.end();}
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done)); t.after(() => new Promise(done => server.close(done)));
  const {chromium} = await import(pathToFileURL(process.env.MINICAN_PLAYWRIGHT_PATH).href);
  const browser = await chromium.launch({channel: process.env.MINICAN_BROWSER || 'msedge', headless: true}); t.after(() => browser.close());
  const page = await browser.newPage({viewport: {width: 1280, height: 820}, hasTouch:true}), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/fixture.html`); await page.waitForFunction(() => window.ready);
  const draftChecks = await page.evaluate(async () => {
    const {htmlTextDraft} = await import('/app/html-workspace.js');
    const source = '<!doctype html><!--keep--><style>.a{color:red}</style><h1>A &amp; B</h1><p hidden>hidden</p><textarea>input</textarea><script>window.draftExecuted=true;</script>';
    const draft = htmlTextDraft(source);
    const first = draft.apply(new Map([['0','<img onerror="alert(1)">']]));
    const second = draft.apply(new Map([['0','두 번째']]));
    return {fields:draft.fields.map(f=>f.text), untouched:htmlTextDraft(source).apply(new Map())===source,
      escaped:first.includes('&lt;img onerror="alert(1)"&gt;'), script:first.includes('<script>window.draftExecuted=true;</script>'),
      comment:first.includes('<!--keep-->'), second:second.includes('<h1>두 번째</h1>'), executed:!!window.draftExecuted};
  });
  assert.deepEqual(draftChecks,{fields:['A & B'],untouched:true,escaped:true,script:true,comment:true,second:true,executed:false});
  const styleChecks = await page.evaluate(async () => {
    const {htmlTextDraft} = await import('/app/html-workspace.js');
    const source = '<!doctype html><p>A <strong>B</strong> C</p><style>p{color:red}</style><script>window.never=true;</script>';
    const draft = htmlTextDraft(source), styles = new Map([['0',{fontSize:32,color:'#123456'}]]);
    const first = draft.apply(new Map(),styles), parsed = new DOMParser().parseFromString(first,'text/html');
    const second = draft.apply(new Map(),new Map([['0',{color:'#abcdef'}]]));
    const repeated = htmlTextDraft(first).apply(new Map(),styles);
    const invalid = [{fontSize:0},{fontSize:301},{color:'red;position:fixed'},{background:'url(https://bad.test)'}].every(style=>{try{draft.apply(new Map(),new Map([['0',style]]));return false;}catch{return true;}});
    return {size:parsed.querySelector('p span').style.fontSize,color:parsed.querySelector('p span').style.color,
      sibling:parsed.querySelector('strong').outerHTML,last:parsed.querySelector('p').lastChild.data,
      repeatSpans:new DOMParser().parseFromString(repeated,'text/html').querySelectorAll('span').length,
      fresh:!second.includes('font-size'),invalid,sourceCode:first.includes('<script>window.never=true;</script>')};
  });
  assert.deepEqual(styleChecks,{size:'32px',color:'rgb(18, 52, 86)',sibling:'<strong>B</strong>',last:' C',repeatSpans:1,fresh:true,invalid:true,sourceCode:true});
  await page.locator('[data-home-menu=import] > summary').click();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('[data-html-open]').click()]);
  await chooser.setFiles({name: '수업.HTML', mimeType: 'text/html', buffer: Buffer.from(html)});
  const workspace = page.frameLocator('[data-html-workspace] iframe:not([hidden])');
  await workspace.locator('#status').filter({hasText: 'isolated'}).waitFor();
  assert.equal(await page.locator('.cv-show').count(), 0, 'HTML runs without starting a presentation');
  await workspace.locator('#count').click();
  assert.equal(await workspace.locator('#count').textContent(), '완료');
  await page.getByRole('textbox', {name: '그림 이름', exact:true}).fill('HTML 바로 쓰기');
  assert.equal(await workspace.locator('#count').textContent(), '완료', 'metadata edits do not restart HTML');
  assert.equal(await page.evaluate(() => document.body.dataset.compromised), undefined);
  assert.ok(!(await page.locator('[data-html-workspace] iframe').getAttribute('sandbox')).includes('allow-same-origin'));
  assert.equal(await page.locator('.cv-strip iframe').count(), 0, 'thumbnail covers remain inert');
  await page.locator('.cv-back').click(); await page.reload(); await page.waitForFunction(() => window.ready);
  assert.equal(await page.locator('iframe[srcdoc]').count(), 0, 'closing the document disposes the running HTML');
  assert.equal((await page.evaluate(() => window.listDesigns()))[0].slides[0].web.html, html);
  await page.locator('.cv-item .cv-thumb').first().click();
  await workspace.locator('h1').filter({hasText:'HTML 수업'}).waitFor();
  await page.getByRole('button',{name:'글 수정',exact:true}).click();
  const edit = page.getByRole('dialog',{name:'HTML 글 수정',exact:true});
  const editFrame = page.frameLocator('[data-html-text-frame]');
  await edit.getByRole('status').filter({hasText:'화면의 글을 눌러'}).waitFor();
  assert.equal(await edit.getByRole('listbox').count(),0,'text editing uses the page, not a list');
  assert.equal(await editFrame.locator('#status').textContent(),'','original scripts do not run while editing');
  assert.equal(await page.locator('[data-html-text-frame]').getAttribute('sandbox'),'allow-scripts');
  await page.evaluate(() => {
    const channel=document.querySelector('[data-html-text-frame]').srcdoc.match(/script-src 'nonce-([^']+)/)[1];
    window.postMessage({channel,type:'change',id:'0',text:'forged'},'*');
  });
  assert.equal(await edit.getByRole('button',{name:'저장',exact:true}).isDisabled(),true,'other windows cannot supply edits');
  assert.equal(await edit.getByRole('spinbutton',{name:'글자 크기 (px)',exact:true}).isDisabled(),true);
  await mkdir(resolve(root,'work'),{recursive:true});
  await editFrame.locator('h1').click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText('바뀐 <제목> & 수업');
  await editFrame.locator('#duplicate-b').click();
  await editFrame.getByRole('textbox',{name:'화면의 글 수정',exact:true}).fill('두 번째 글');
  await editFrame.locator('#count').click();
  await editFrame.getByRole('textbox',{name:'화면의 글 수정',exact:true}).fill('시작하기');
  await editFrame.locator('#mixed strong').click();
  await editFrame.getByRole('textbox',{name:'화면의 글 수정',exact:true}).fill('바뀐 강조');
  const sizeControl = edit.getByRole('spinbutton',{name:'글자 크기 (px)',exact:true});
  await sizeControl.fill('40');
  await edit.getByLabel('글자 색깔',{exact:true}).evaluate(input=>{input.value='#c2185b';input.dispatchEvent(new Event('input',{bubbles:true}));});
  await editFrame.getByRole('textbox',{name:'화면의 글 수정',exact:true}).evaluate(element=>new Promise(resolve=>{
    const check=()=>{const s=getComputedStyle(element);if(s.fontSize==='40px'&&s.color==='rgb(194, 24, 91)')resolve();else requestAnimationFrame(check);};check();
  }));
  await editFrame.locator('#duplicate-a').click();
  assert.equal(await sizeControl.inputValue(),'24','choosing another text loads its own size');
  await sizeControl.fill('30');
  await edit.getByLabel('글자 색깔',{exact:true}).evaluate(input=>{input.value='#0066cc';input.dispatchEvent(new Event('input',{bubbles:true}));});
  const previewShape = await editFrame.locator('#duplicate-a').evaluate(e=>new Promise(resolve=>{
    const check=()=>{const s=getComputedStyle(e);if(s.fontSize==='30px')resolve({size:s.fontSize,margin:s.marginTop});else requestAnimationFrame(check);};check();
  }));
  await page.screenshot({path:resolve(root,'work/html-text-editor.png')});
  await edit.getByRole('button',{name:'저장',exact:true}).click();
  await workspace.locator('h1').filter({hasText:'바뀐 <제목> & 수업'}).waitFor();
  assert.equal(await workspace.locator('h1 > *').count(),0,'text editing never injects markup');
  assert.equal(await workspace.locator('#duplicate-a').textContent(),'같은 글','matching text elsewhere is unchanged');
  assert.equal(await workspace.locator('#duplicate-b').textContent(),'두 번째 글');
  assert.equal(await workspace.locator('#mixed').textContent(),'앞 바뀐 강조 뒤');
  assert.equal(await workspace.locator('#mixed strong').textContent(),'바뀐 강조','nested formatting survives');
  assert.deepEqual(await workspace.locator('#mixed strong').evaluate(e=>({size:getComputedStyle(e).fontSize,color:getComputedStyle(e).color,weight:getComputedStyle(e).fontWeight})),{size:'40px',color:'rgb(194, 24, 91)',weight:'700'});
  assert.equal(await workspace.locator('#mixed').evaluate(e=>getComputedStyle(e).fontSize),'24px','neighboring text keeps its size');
  assert.equal(await workspace.locator('#duplicate-a').evaluate(e=>getComputedStyle(e).fontSize),'30px','format-only edits save');
  assert.deepEqual(await workspace.locator('#duplicate-a').evaluate(e=>({size:getComputedStyle(e).fontSize,margin:getComputedStyle(e).marginTop})),previewShape,'em spacing is identical before and after saving');
  assert.equal(await workspace.locator('#duplicate-b').evaluate(e=>getComputedStyle(e).fontSize),'24px','duplicate wording is styled independently');
  assert.equal(await workspace.locator('#count').textContent(),'시작하기','button labels can be edited without activating buttons');
  await workspace.locator('#count').click();
  assert.equal(await workspace.locator('#count').textContent(),'완료','scripts still work after editing text');
  await page.locator('.fe-history-tools .undo').click();
  await workspace.locator('h1').filter({hasText:'HTML 수업'}).waitFor();
  assert.equal(await workspace.locator('#mixed strong').evaluate(e=>getComputedStyle(e).fontSize),'24px','undo restores formatting');
  await page.locator('.fe-history-tools .redo').click();
  await workspace.locator('h1').filter({hasText:'바뀐 <제목> & 수업'}).waitFor();
  assert.equal(await workspace.locator('#mixed strong').evaluate(e=>getComputedStyle(e).color),'rgb(194, 24, 91)','redo restores formatting');
  await page.getByRole('button',{name:'글 수정',exact:true}).click();
  await edit.getByRole('status').filter({hasText:'화면의 글을 눌러'}).waitFor();
  await editFrame.locator('#mixed strong').click();
  assert.equal(await sizeControl.inputValue(),'40','reopened toolbar shows saved size');
  assert.equal(await edit.getByLabel('글자 색깔',{exact:true}).inputValue(),'#c2185b');
  await editFrame.locator('h1').click();
  await editFrame.getByRole('textbox',{name:'화면의 글 수정',exact:true}).fill('취소한 글');
  await sizeControl.fill('72');
  await edit.getByRole('button',{name:'취소',exact:true}).click();
  assert.equal(await workspace.locator('h1').textContent(),'바뀐 <제목> & 수업');
  assert.equal(await workspace.locator('h1').evaluate(e=>getComputedStyle(e).fontSize),'48px','cancel discards formatting too');
  await page.getByRole('button',{name:'글 수정',exact:true}).click();
  await edit.getByRole('status').filter({hasText:'화면의 글을 눌러'}).waitFor();
  await editFrame.locator('#duplicate-a').click();
  await sizeControl.fill('31');
  await edit.getByRole('button',{name:'저장',exact:true}).click();
  await workspace.locator('#duplicate-a').evaluate(e=>new Promise(resolve=>{
    const check=()=>{if(getComputedStyle(e).fontSize==='31px')resolve();else requestAnimationFrame(check);};check();
  }));
  await page.locator('.fe-history-tools .undo').click();
  assert.equal(await workspace.locator('#duplicate-a').evaluate(e=>getComputedStyle(e).fontSize),'30px','a formatting-only save has its own undo step');
  await mkdir(resolve(root, 'work'), {recursive: true});
  await page.screenshot({path:resolve(root,'work/html-import-workspace.png')});
  await page.locator('.cv-back').click();
  const edited = (await page.evaluate(() => window.listDesigns()))[0].slides[0].web.html;
  assert.equal(edited.match(/<script>([\s\S]*?)<\/script>/)[1],html.match(/<script>([\s\S]*?)<\/script>/)[1]);
  assert.equal(edited.match(/<style>([\s\S]*?)<\/style>/)[1],html.match(/<style>([\s\S]*?)<\/style>/)[1]);
  assert.ok(edited.includes('바뀐 &lt;제목&gt; &amp; 수업'));
  assert.doesNotMatch(edited,/onba-text-|contenteditable|data-onba-editing|script-src 'nonce-/,'editing helpers never enter the saved source');
  await page.evaluate(async () => {
    const [record] = await window.listDesigns();
    record.slides[0].web.keep = true;
    record.slides.push({id: 'pnext001', items: []});
    await window.putDesign(record);
  });
  await page.reload(); await page.waitForFunction(() => window.ready);
  await page.locator('.cv-item .cv-thumb').first().click();
  await workspace.locator('h1').filter({hasText:'바뀐 <제목> & 수업'}).waitFor();
  assert.equal(await workspace.locator('#mixed strong').evaluate(e=>getComputedStyle(e).fontSize),'40px','formatting survives reopen');
  await workspace.locator('#count').click();
  await page.locator('.cv-slide[data-slide="1"]').click();
  await page.locator('.cv-canvas').waitFor();
  await page.locator('.cv-slide[data-slide="0"]').click();
  assert.equal(await workspace.locator('#count').textContent(),'완료','kept workspace HTML retains its state across slides');
  await page.locator('.cv-show-btn').click();
  const frame = page.frameLocator('[data-show-web] iframe');
  assert.equal(await page.locator('[data-html-workspace] iframe').count(),0,'presentation stops duplicate background execution');
  await frame.locator('#status').filter({hasText: 'isolated'}).waitFor();
  assert.ok(!(await page.locator('[data-show-web] iframe').getAttribute('sandbox')).includes('allow-same-origin'));
  assert.equal(await page.getByRole('switch', {name: 'HTML 조작', exact: true}).getAttribute('aria-checked'), 'true');
  await frame.locator('#count').click();
  assert.equal(await frame.locator('#count').textContent(), '완료');
  // Even after intentionally switching to slide navigation, returning to kept HTML restores direct use.
  await page.getByRole('switch', {name: 'HTML 조작', exact: true}).click();
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => document.querySelector('.cv-show-count')?.textContent.startsWith('2 /'));
  await page.keyboard.press('ArrowLeft');
  await page.waitForFunction(() => document.querySelector('.cv-show-count')?.textContent.startsWith('1 /'));
  assert.equal(await page.getByRole('switch', {name: 'HTML 조작', exact: true}).getAttribute('aria-checked'), 'true');
  assert.equal(await frame.locator('#count').textContent(), '완료', 'kept HTML retains its state');
  await frame.locator('#count').click();
  assert.equal(await page.evaluate(() => localStorage.getItem('html-import-secret')), null);
  await mkdir(resolve(root, 'work'), {recursive: true});
  await page.screenshot({path: resolve(root, 'work/html-import-presentation.png')});
  await page.getByRole('switch',{name:'HTML 조작',exact:true}).click();
  await page.keyboard.press('Escape');
  await workspace.locator('h1').filter({hasText:'바뀐 <제목> & 수업'}).waitFor();
  await page.reload(); await page.waitForFunction(() => window.ready);
  await page.setViewportSize({width:390, height:844});
  await page.evaluate(source => {
    const dt = new DataTransfer(); dt.items.add(new File([source], '둘째.htm', {type: 'text/html'}));
    document.querySelector('#app').dispatchEvent(new DragEvent('drop', {bubbles:true,cancelable:true,dataTransfer:dt}));
  }, html);
  await workspace.locator('#status').filter({hasText:'isolated'}).waitFor();
  await workspace.locator('#count').click();
  assert.equal(await workspace.locator('#count').textContent(),'완료');
  await page.getByRole('button',{name:'글 수정',exact:true}).tap();
  await edit.getByRole('status').filter({hasText:'화면의 글을 눌러'}).waitFor();
  await editFrame.locator('h1').tap();
  await editFrame.getByRole('textbox',{name:'화면의 글 수정',exact:true}).fill('휴대폰에서 수정');
  await sizeControl.fill('28');
  await edit.getByLabel('글자 색깔',{exact:true}).evaluate(input=>{input.value='#7040c0';input.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.screenshot({path:resolve(root,'work/html-inline-mobile.png'),fullPage:true});
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await edit.getByRole('button',{name:'저장',exact:true}).tap();
  await workspace.locator('h1').filter({hasText:'휴대폰에서 수정'}).waitFor();
  assert.deepEqual(await workspace.locator('h1').evaluate(e=>({size:getComputedStyle(e).fontSize,color:getComputedStyle(e).color})),{size:'28px',color:'rgb(112, 64, 192)'});
  assert.equal(await page.locator('[data-html-workspace] iframe').getAttribute('data-scaled'),null,'HTML uses the real mobile viewport');
  await page.screenshot({path:resolve(root,'work/html-workspace-mobile.png'),fullPage:true});
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  assert.equal((await page.evaluate(() => window.listDesigns())).length, 2);
  await page.locator('.cv-back').click();
  await page.locator('[data-home-menu=import] > summary').click();
  await page.screenshot({path: resolve(root, 'work/html-import-mobile.png'), fullPage:true});
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.locator('[data-html-input]').setInputFiles({name:'empty.html',mimeType:'text/html',buffer:Buffer.alloc(0)});
  await page.locator('#toast').filter({hasText:'빈 HTML'}).waitFor();
  assert.equal((await page.evaluate(() => window.listDesigns())).length, 2);
  // Exported lessons retain the uploaded document as executable data, including script escaping.
  const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF1sAAAAASUVORK5CYII=';
  const exported = await createHtmlLesson({title:'HTML 수업', pages:[{id:'phtml001',image,aspect:16/9,web:{html:edited,filename:'수업.html'}}]}).text();
  const file = resolve(root,'work/html-import-lesson.html'); await writeFile(file, exported);
  await page.context().setOffline(true); await page.goto(pathToFileURL(file).href);
  await page.getByRole('button',{name:'HTML 열기',exact:true}).click();
  const offline = page.frameLocator('.lesson-activity iframe');
  await offline.locator('#status').filter({hasText:'isolated'}).waitFor();
  assert.equal(await offline.locator('h1').textContent(),'바뀐 <제목> & 수업','edited text survives offline export');
  assert.equal(await offline.locator('#mixed strong').evaluate(e=>getComputedStyle(e).fontSize),'40px','formatting survives offline export');
  await offline.locator('#count').click(); assert.equal(await offline.locator('#count').textContent(),'완료');
  assert.deepEqual(errors, []);
});
