// Local-only browser contract for connector lines (연결선): join two selected pieces, follow them, style, delete, duplicate, export.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {resolve, extname, sep} from 'node:path';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const options = {skip: !process.env.MINICAN_PLAYWRIGHT_PATH, timeout: 120000};
const html = `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/src/editor.css"><link rel="stylesheet" href="/app/app.css"><body class="mc-app"><main id="app"></main><script type="module">
import {startMinican} from '/app/app.js';import {newRecord} from '/app/designs.js';import {putDesign,getDesign,setStorageName} from '/app/store.js';
setStorageName('links-fixture');try{localStorage.setItem('onbatang-tour-seen-v1:editor','1');localStorage.setItem('onbatang-tour-seen-v1:news-0.45','1');}catch{}
const seed=newRecord('16:9');seed.name='연결선 검수';
seed.slides=[{id:'plink00001',bg:'#ffffff',items:[
 {id:'ebox000001',t:'shape',shape:'round',x:25,y:40,w:18,h:22,color:'#3d4bc0'},
 {id:'ebox000002',t:'shape',shape:'circle',x:72,y:62,w:14,h:24,color:'#ffc93c'},
 {id:'etext00001',t:'text',text:'설명',x:50,y:12,w:30,size:4}]}];
await putDesign(seed);window.readSaved=()=>getDesign(seed.id);
await startMinican({storage:'links-fixture'});window.ready=true;
</script>`;

async function setup(t) {
  const server = createServer(async (req, res) => {
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      if (path === '/fixture.html') { res.setHeader('Content-Type', 'text/html'); return res.end(html); }
      const f = resolve(root, '.' + decodeURIComponent(path));
      if (!f.startsWith(root + sep)) throw Error('path');
      res.setHeader('Content-Type', ({'.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png'})[extname(f)] || 'application/octet-stream');
      res.end(await readFile(f));
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  t.after(() => new Promise(done => server.close(done)));
  const {chromium} = await import(pathToFileURL(process.env.MINICAN_PLAYWRIGHT_PATH).href);
  const browser = await chromium.launch({channel: process.env.MINICAN_BROWSER || 'msedge', headless: true});
  t.after(() => browser.close());
  const origin = `http://127.0.0.1:${server.address().port}`, external = [];
  const context = await browser.newContext({reducedMotion: 'reduce', viewport: {width: 1280, height: 800}});
  await context.route('**/*', route => /^https?:/.test(route.request().url()) && !route.request().url().startsWith(origin + '/') ? (external.push(route.request().url()), route.abort()) : route.continue());
  const page = await context.newPage();
  await page.goto(origin + '/fixture.html');
  await page.waitForFunction(() => window.ready);
  await page.locator('.cv-item .cv-thumb').first().click();
  await page.locator('.cv-canvas .fe-stage').waitFor();
  return {page, external};
}
async function saved(page, check) {
  for (let end = Date.now() + 15000; Date.now() < end; await new Promise(r => setTimeout(r, 200))) if (check(await page.evaluate(() => window.readSaved()))) return;
  assert.fail('saved record never matched');
}
const center = async locator => { const b = await locator.boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
// The drawn line's two ends on screen (px).
const ends = page => page.evaluate(() => {
  const line = document.querySelector('.cv-canvas .fe-card .fi-link .fi-link-line');
  if (!line) return null;
  const m = line.getScreenCTM(), p = (x, y) => { const q = new DOMPoint(x, y).matrixTransform(m); return [q.x, q.y]; };
  return [p(+line.getAttribute('x1'), +line.getAttribute('y1')), p(+line.getAttribute('x2'), +line.getAttribute('y2'))];
});
const rectOf = (page, n) => page.locator('.cv-canvas .fe-card .fi-shape').nth(n).boundingBox();

test('two selected pieces join with a connector that follows them, takes styles, and goes away with them', options, async t => {
  const {page, external} = await setup(t);
  const shapes = page.locator('.cv-canvas .fe-card .fi-shape');
  await shapes.nth(0).click();
  await shapes.nth(1).click({modifiers: ['Shift']});
  await page.locator('.fe-bar button').filter({hasText: '연결선'}).click();
  await page.locator('.cv-canvas .fe-card .fi-link').waitFor();
  await saved(page, r => r.slides[0].items.some(it => it.t === 'link' && it.from === 'ebox000001' && it.to === 'ebox000002' && it.head === 'end'));
  // The line runs from the edge of the first box to the edge of the second (not into them).
  const [a, b] = [await rectOf(page, 0), await rectOf(page, 1)];
  let [p1, p2] = await ends(page);
  assert.ok(p1[0] > a.x + a.width - 2 && p1[0] < a.x + a.width + 25, `start ${p1} box ${JSON.stringify(a)}`);
  assert.ok(p2[0] < b.x + 2 && p2[0] > b.x - 30, `end ${p2} box ${JSON.stringify(b)}`);
  // The link sits under both pieces and has no resize handles; clicking the line selects it.
  assert.deepEqual(await page.evaluate(() => [...document.querySelector('.cv-canvas .fe-card').querySelectorAll('.fi')].map(n => n.classList.contains('fi-link') ? 'link' : n.classList.contains('fi-shape') ? 'shape' : 'text')), ['link', 'shape', 'shape', 'text']);
  await page.mouse.click((p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2);
  await page.waitForFunction(() => document.querySelector('.cv-canvas .fe-card .fi-link.sel'));
  assert.equal(await page.locator('.fe-sel').isHidden(), true);
  // Style: thicker, dashed, both heads, reversed.
  await page.locator('.fe-bar button').filter({hasText: '화살표'}).click();
  await page.locator('[data-head="both"]').click();
  await page.locator('[data-dash="on"]').click();
  await page.locator('[data-flip-link="1"]').click();
  await saved(page, r => { const l = r.slides[0].items.find(it => it.t === 'link'); return l.head === 'both' && l.dash === true && l.from === 'ebox000002' && l.to === 'ebox000001'; });
  assert.equal(await page.locator('.cv-canvas .fe-card .fi-link .fi-link-head').count(), 2);
  assert.ok(await page.locator('.cv-canvas .fe-card .fi-link .fi-link-line').getAttribute('stroke-dasharray'));
  // Dragging a piece moves the line with it, live.
  await page.keyboard.press('Escape');
  const before = await ends(page);
  const [cx, cy] = await center(shapes.nth(1));
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx - 60, cy - 120, {steps: 6});
  const during = await ends(page);
  await page.mouse.up();
  assert.ok(Math.abs(during[0][1] - before[0][1]) > 60, `line follows while dragging ${JSON.stringify([before, during])}`);
  await saved(page, r => { const box = r.slides[0].items.find(it => it.id === 'ebox000002'), l = r.slides[0].items.find(it => it.t === 'link'); return box.y < 55 && Math.abs(l.y - (box.y + 40) / 2) < 15; });
  // Deleting a piece removes its lines; undo brings both back.
  const list = () => page.evaluate(async () => (await window.readSaved()).slides[0].items.map(it => [it.t, it.id, it.from || '', it.to || '']));
  await page.mouse.click(...await center(shapes.nth(1)));
  await page.keyboard.press('Delete');
  await saved(page, r => !r.slides[0].items.some(it => it.t === 'link') && r.slides[0].items.length === 2);
  await page.keyboard.press('Control+z');
  await saved(page, r => r.slides[0].items.some(it => it.t === 'link') && r.slides[0].items.length === 4);
  assert.equal((await list()).filter(([t]) => t === 'link').length, 1);
  assert.deepEqual(external, []);
});

test('duplicating the slide and the joined pieces keeps the copies joined; PNG and PPTX carry the line', options, async t => {
  const {page, external} = await setup(t);
  const shapes = page.locator('.cv-canvas .fe-card .fi-shape');
  await shapes.nth(0).click();
  await shapes.nth(1).click({modifiers: ['Shift']});
  await page.locator('.fe-bar button').filter({hasText: '연결선'}).click();
  await page.locator('.cv-canvas .fe-card .fi-link').waitFor();
  // Ctrl+A then Ctrl+D duplicates everything; the duplicated link joins the duplicated boxes.
  await page.mouse.click(5, 5);
  await page.locator('.cv-canvas .fe-stage').focus();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+d');
  await saved(page, r => r.slides[0].items.filter(it => it.t === 'link').length === 2);
  const items = (await page.evaluate(() => window.readSaved())).slides[0].items;
  const [one, two] = items.filter(it => it.t === 'link');
  assert.notDeepEqual([one.from, one.to], [two.from, two.to]);
  const ids = new Set(items.map(it => it.id));
  assert.ok([two.from, two.to].every(id => ids.has(id) && !['ebox000001', 'ebox000002'].includes(id)));
  // Duplicate the slide: its line joins the copied slide's own pieces.
  await page.locator('.cv-slide-list .cv-slide:not(.add)').first().click({button: 'right'});
  await page.locator('.fe-menu .fe-mi').filter({hasText: '이 장 복제'}).click();
  await saved(page, r => r.slides.length === 2);
  const copy = (await page.evaluate(() => window.readSaved())).slides[1];
  const copyIds = new Set(copy.items.map(it => it.id));
  assert.ok(copy.items.filter(it => it.t === 'link').every(l => copyIds.has(l.from) && copyIds.has(l.to)));
  // PNG of the slide shows the dark line between the boxes; editable PPTX has a native connector with an arrow.
  const out = await page.evaluate(async () => {
    const {designToCanvas, cleanDesign} = await import('/src/index.js');
    const {createPptx} = await import('/app/pptx.js');
    const slide = cleanDesign((await window.readSaved()).slides[0], {keepSpaces: true});
    const made = await designToCanvas(slide, {width: 800, aspect: 16 / 9});
    const link = slide.items.find(it => it.t === 'link');
    const {linkEnds} = await import('/src/links.js');
    const [[x1, y1], [x2, y2]] = linkEnds(link, 16 / 9);
    const mx = (x1 + x2) / 2 * 8, my = (y1 + y2) / 2 * 450 / 100;
    const px = [...made.canvas.getContext('2d').getImageData(Math.round(mx), Math.round(my), 1, 1).data].slice(0, 3);
    const {bytes} = await createPptx({slides: [slide], aspect: 16 / 9});
    const text = new TextDecoder().decode(bytes);
    return {px, connectors: (text.match(/<p:cxnSp>/g) || []).length, arrow: /straightConnector1.*?<a:tailEnd type="triangle"\/>/.test(text)};
  });
  assert.ok(out.px.every(v => v < 90), `line pixel ${out.px}`);
  assert.equal(out.connectors, 2);
  assert.equal(out.arrow, true);
  assert.deepEqual(external, []);
});

test('a connector turns into a curve from its toolbar, flips its bend, and the PNG draws the curve', options, async t => {
  const {page, external} = await setup(t);
  const shapes = page.locator('.cv-canvas .fe-card .fi-shape');
  await shapes.nth(0).click();
  await shapes.nth(1).click({modifiers: ['Shift']});
  await page.locator('.fe-bar button').filter({hasText: '연결선'}).click();
  await page.locator('.cv-canvas .fe-card .fi-link').waitFor();
  const [p1, p2] = await ends(page);
  await page.mouse.click((p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2);
  await page.locator('.fe-bar button').filter({hasText: '화살표'}).click();
  await page.locator('[data-curve="on"]').click();
  await saved(page, r => r.slides[0].items.find(it => it.t === 'link')?.curve === 1);
  assert.equal(await page.locator('.cv-canvas .fe-card .fi-link path.fi-link-line').count(), 1);
  await page.locator('[data-bend-link="1"]').click();
  await saved(page, r => r.slides[0].items.find(it => it.t === 'link')?.curve === -1);
  // The curve's midpoint (t = .5) is inked in the exported picture; the straight midpoint is not.
  const out = await page.evaluate(async () => {
    const {designToCanvas, cleanDesign} = await import('/src/index.js');
    const {linkEnds, linkControl} = await import('/src/links.js');
    const slide = cleanDesign((await window.readSaved()).slides[0], {keepSpaces: true});
    const link = slide.items.find(it => it.t === 'link');
    const [[x1, y1], [x2, y2]] = linkEnds(link, 16 / 9), [cx, cy] = linkControl(link, 16 / 9);
    const mid = [(.25 * x1 + .5 * cx + .25 * x2) * 8, (.25 * y1 + .5 * cy + .25 * y2) * 4.5], flat = [(x1 + x2) / 2 * 8, (y1 + y2) / 2 * 4.5];
    const made = await designToCanvas(slide, {width: 800, aspect: 16 / 9}), ctx = made.canvas.getContext('2d');
    const dark = ([x, y]) => { let best = 255; for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) { const [r, g, b] = ctx.getImageData(Math.round(x) + dx, Math.round(y) + dy, 1, 1).data; best = Math.min(best, Math.max(r, g, b)); } return best; };
    return {curve: dark(mid), straight: dark(flat)};
  });
  assert.ok(out.curve < 90, `curve midpoint ${out.curve}`);
  assert.ok(out.straight > 200, `straight midpoint ${out.straight}`);
  assert.deepEqual(external, []);
});

test('a connector can bend at right angles from its toolbar, switch which way it turns first, and the PNG draws the corner', options, async t => {
  const {page, external} = await setup(t);
  const shapes = page.locator('.cv-canvas .fe-card .fi-shape');
  await shapes.nth(0).click();
  await shapes.nth(1).click({modifiers: ['Shift']});
  await page.locator('.fe-bar button').filter({hasText: '연결선'}).click();
  await page.locator('.cv-canvas .fe-card .fi-link').waitFor();
  const [p1, p2] = await ends(page);
  await page.mouse.click((p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2);
  await page.locator('.fe-bar button').filter({hasText: '화살표'}).click();
  await page.locator('[data-elbow="on"]').click();
  // The boxes are farther apart sideways than up-down: across first.
  await saved(page, r => r.slides[0].items.find(it => it.t === 'link')?.elbow === 1);
  assert.equal(await page.locator('[data-turn-link="1"]').textContent(), '세로 먼저 꺾기');
  await page.locator('[data-turn-link="1"]').click();
  await saved(page, r => r.slides[0].items.find(it => it.t === 'link')?.elbow === -1);
  await page.locator('[data-curve="on"]').click();
  await saved(page, r => { const l = r.slides[0].items.find(it => it.t === 'link'); return l?.curve === 1 && !l.elbow; });
  await page.locator('[data-elbow="on"]').click();
  await saved(page, r => { const l = r.slides[0].items.find(it => it.t === 'link'); return l?.elbow && !l.curve; });
  // The corner points are inked in the exported picture; the straight midpoint is not.
  const out = await page.evaluate(async () => {
    const {designToCanvas, cleanDesign} = await import('/src/index.js');
    const {linkEnds, linkCorners} = await import('/src/links.js');
    const slide = cleanDesign((await window.readSaved()).slides[0], {keepSpaces: true});
    const link = slide.items.find(it => it.t === 'link');
    const [[x1, y1], [x2, y2]] = linkEnds(link, 16 / 9), [m1, m2] = linkCorners(link, 16 / 9);
    const made = await designToCanvas(slide, {width: 800, aspect: 16 / 9}), ctx = made.canvas.getContext('2d');
    const dark = ([x, y]) => { let best = 255; for (let dx = -3; dx <= 3; dx++) for (let dy = -3; dy <= 3; dy++) { const [r, g, b] = ctx.getImageData(Math.round(x * 8) + dx, Math.round(y * 4.5) + dy, 1, 1).data; best = Math.min(best, Math.max(r, g, b)); } return best; };
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const quarter = [x1 + (x2 - x1) * .25, y1 + (y2 - y1) * .25];          // on the straight line but off every elbow leg
    return {legs: [dark(mid([x1, y1], m1)), dark(mid(m1, m2)), dark(mid(m2, [x2, y2]))], straight: dark(quarter), right: Math.abs(m1[0] - x1) < 1e-6 || Math.abs(m1[1] - y1) < 1e-6};
  });
  assert.ok(out.legs.every(v => v < 120), `legs ${out.legs}`);
  assert.ok(out.straight > 200, `straight quarter point ${out.straight}`);
  assert.equal(out.right, true);
  assert.deepEqual(external, []);
});

test('each end of a connector can stick to a chosen side of its piece, stays there when the piece moves, and flips with the direction', options, async t => {
  const {page, external} = await setup(t);
  const shapes = page.locator('.cv-canvas .fe-card .fi-shape');
  await shapes.nth(0).click();
  await shapes.nth(1).click({modifiers: ['Shift']});
  await page.locator('.fe-bar button').filter({hasText: '연결선'}).click();
  await page.locator('.cv-canvas .fe-card .fi-link').waitFor();
  const [p1, p2] = await ends(page);
  await page.mouse.click((p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2);
  await page.locator('.fe-bar button').filter({hasText: '화살표'}).click();
  assert.equal(await page.locator('[data-from-side="auto"]').getAttribute('aria-pressed'), 'true');
  await page.locator('[data-from-side="bottom"]').click();
  await page.locator('[data-to-side="top"]').click();
  await saved(page, r => { const l = r.slides[0].items.find(it => it.t === 'link'); return l?.fromSide === 'bottom' && l.toSide === 'top'; });
  // The ends sit at the middle of the chosen sides (in card units: x % of width, y % of height).
  const sides = () => page.evaluate(async () => {
    const {cleanDesign} = await import('/src/index.js');
    const {linkEnds} = await import('/src/links.js');
    const slide = cleanDesign((await window.readSaved()).slides[0], {keepSpaces: true});
    const [a, b] = slide.items.filter(it => it.t === 'shape'), link = slide.items.find(it => it.t === 'link');
    return {a, b, ends: linkEnds(link, 16 / 9)};
  });
  let s = await sides();
  assert.ok(Math.abs(s.ends[0][0] - s.a.x) < .01 && s.ends[0][1] > s.a.y + s.a.h / 2, `start under A ${JSON.stringify(s.ends[0])}`);
  assert.ok(Math.abs(s.ends[1][0] - s.b.x) < .01 && s.ends[1][1] < s.b.y - s.b.h / 2, `end over B ${JSON.stringify(s.ends[1])}`);
  // Moving a piece keeps the chosen side.
  await page.keyboard.press('Escape');
  await shapes.nth(0).click();
  for (let i = 0; i < 5; i++) await page.keyboard.press('Shift+ArrowRight');
  await saved(page, r => r.slides[0].items.find(it => it.t === 'shape').x !== s.a.x);
  s = await sides();
  assert.ok(Math.abs(s.ends[0][0] - s.a.x) < .01 && s.ends[0][1] > s.a.y + s.a.h / 2, 'still under the moved piece');
  // Flipping the direction swaps the pieces and their sides together.
  const [q1, q2] = await ends(page);
  await page.mouse.click((q1[0] + q2[0]) / 2, (q1[1] + q2[1]) / 2);
  await page.locator('.fe-bar button').filter({hasText: '화살표'}).click();
  await page.locator('[data-flip-link="1"]').click();
  await saved(page, r => { const l = r.slides[0].items.find(it => it.t === 'link'); return l?.fromSide === 'top' && l.toSide === 'bottom'; });
  await page.locator('[data-to-side="auto"]').click();
  await saved(page, r => { const l = r.slides[0].items.find(it => it.t === 'link'); return l?.fromSide === 'top' && !('toSide' in l); });
  assert.deepEqual(external, []);
});

test('dragging the middle handle of a curved or elbow connector reshapes it, saves it and can be undone or reset', options, async t => {
  const {page, external} = await setup(t);
  const shapes = page.locator('.cv-canvas .fe-card .fi-shape');
  await shapes.nth(0).click();
  await shapes.nth(1).click({modifiers: ['Shift']});
  await page.locator('.fe-bar button').filter({hasText: '연결선'}).click();
  await page.locator('.cv-canvas .fe-card .fi-link').waitFor();
  const [p1, p2] = await ends(page);
  await page.mouse.click((p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2);
  const knob = page.locator('.cv-canvas .fe-link-knob');
  assert.equal(await knob.isVisible(), false, 'a straight line has no handle');
  await page.locator('.fe-bar button').filter({hasText: '화살표'}).click();
  await page.locator('[data-curve="on"]').click();
  await saved(page, r => r.slides[0].items.find(it => it.t === 'link')?.curve === 1);
  await knob.waitFor();
  assert.equal(await knob.getAttribute('data-kind'), 'bend');
  // Drag the handle well away from the line: the curve deepens and the handle follows.
  const before = await knob.boundingBox(), [bx, by] = [before.x + before.width / 2, before.y + before.height / 2];
  const dir = [p2[1] - p1[1], -(p2[0] - p1[0])], len = Math.hypot(...dir), far = [bx + dir[0] / len * 60, by + dir[1] / len * 60];
  await page.mouse.move(bx, by);
  await page.mouse.down();
  await page.mouse.move((bx + far[0]) / 2, (by + far[1]) / 2, {steps: 4});
  await page.mouse.move(far[0], far[1], {steps: 4});
  await page.mouse.up();
  await saved(page, r => { const l = r.slides[0].items.find(it => it.t === 'link'); return l?.bend > .3; });
  const after = await knob.boundingBox();
  assert.ok(Math.hypot(after.x - before.x, after.y - before.y) > 30, 'the handle moved with the curve');
  // The toolbar offers going back to the first shape; undo also works.
  const arrowPop = async () => { if (!await page.locator('[data-curve="on"]').isVisible()) await page.locator('.fe-bar button').filter({hasText: '화살표'}).click(); };
  await arrowPop();
  await page.locator('[data-reset-link-shape="1"]').click();
  await saved(page, r => { const l = r.slides[0].items.find(it => it.t === 'link'); return l?.curve === 1 && !('bend' in l); });
  await page.keyboard.press('Control+z');
  await saved(page, r => r.slides[0].items.find(it => it.t === 'link')?.bend > .3);
  // Pick the line again by clicking a point on the drawn curve.
  const onLine = await page.evaluate(() => {
    const path = document.querySelector('.cv-canvas .fe-card .fi-link .fi-link-line'), m = path.getScreenCTM(), p = path.getPointAtLength(path.getTotalLength() / 2);
    const q = new DOMPoint(p.x, p.y).matrixTransform(m);
    return [q.x, q.y];
  });
  await page.mouse.click(onLine[0], onLine[1]);
  await knob.waitFor();
  // Elbow: the handle is on the middle run and moves where it turns.
  await arrowPop();
  await page.locator('[data-elbow="on"]').click();
  await saved(page, r => r.slides[0].items.find(it => it.t === 'link')?.elbow === 1);
  await page.waitForFunction(() => document.querySelector('.cv-canvas .fe-link-knob')?.dataset.kind === 'turn');
  const e0 = await knob.boundingBox(), [ex, ey] = [e0.x + e0.width / 2, e0.y + e0.height / 2];
  await page.mouse.move(ex, ey);
  await page.mouse.down();
  await page.mouse.move(ex - 40, ey, {steps: 5});
  await page.mouse.up();
  await saved(page, r => { const l = r.slides[0].items.find(it => it.t === 'link'); return l?.turn > 0 && l.turn < .5; });
  assert.ok((await knob.boundingBox()).x < e0.x - 25, 'the turn moved left');
  assert.deepEqual(external, []);
});

test('the 꾸미기 panel and a single selected piece both start joining: pick the start, then the end; Esc or an empty spot stops', options, async t => {
  const {page, external} = await setup(t);
  const shapes = page.locator('.cv-canvas .fe-card .fi-shape');
  const hint = page.locator('.cv-canvas .fe-link-hint');
  // From the panel: a card with a picture explains it, then two picks make the line (from the first to the second).
  await page.locator('.fe-tab[data-tab="element"]').click();
  const start = page.locator('[data-start-link]');
  assert.match(await start.textContent(), /연결선두 조각을 화살표로 이어요/);
  await start.click();
  assert.match(await hint.textContent(), /① 화살표가 시작할 조각/);
  await page.keyboard.press('Escape');
  assert.equal(await hint.isVisible(), false, 'Esc stops');
  await start.click();
  await shapes.nth(1).click();
  assert.match(await hint.textContent(), /② 화살표가 닿을 조각/);
  await shapes.nth(0).click();
  await saved(page, r => { const [a, b] = r.slides[0].items.filter(it => it.t === 'shape'); const l = r.slides[0].items.find(it => it.t === 'link'); return l?.from === b.id && l.to === a.id; });
  assert.equal(await hint.isVisible(), false);
  assert.ok(await page.locator('.cv-canvas .fe-card .fi-link.sel').count() === 1, 'the new line is selected');
  // From a single selected piece: "선 잇기" in the toolbar, then the piece to reach. An empty spot cancels.
  await page.keyboard.press('Control+z');
  await saved(page, r => !r.slides[0].items.some(it => it.t === 'link'));
  await shapes.nth(0).click();
  await page.locator('.fe-bar button').filter({hasText: '선 잇기'}).click();
  assert.match(await hint.textContent(), /② 화살표가 닿을 조각/);
  const card = await page.locator('.cv-canvas .fe-card').boundingBox();
  await page.mouse.click(card.x + card.width - 6, card.y + card.height - 6);
  assert.equal(await hint.isVisible(), false, 'an empty spot stops');
  await shapes.nth(0).click();
  await page.locator('.fe-bar button').filter({hasText: '선 잇기'}).click();
  await shapes.nth(1).click();
  await saved(page, r => { const [a, b] = r.slides[0].items.filter(it => it.t === 'shape'); const l = r.slides[0].items.find(it => it.t === 'link'); return l?.from === a.id && l.to === b.id; });
  assert.deepEqual(external, []);
});
