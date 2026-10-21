import test from 'node:test';
import assert from 'node:assert/strict';
import {boxOfItem, linkGeometry, layoutLinks, linkEnds, relink, linkSvg, LINK_LINE} from '../src/links.js';
import {cleanDesign, configure, styleOf, itemLabel} from '../src/model.js';
import {planMotion} from '../src/motion.js';
import {copySlide} from '../app/designs.js';
import {createPptx} from '../app/pptx.js';
import {unzipSync} from 'fflate';

const box = (id, x, y, patch = {}) => ({id, t: 'shape', shape: 'rect', x, y, w: 20, h: 20, color: '#3d4bc0', ...patch});
const link = (patch = {}) => ({id: 'elink00001', t: 'link', from: 'eboxaaaaa1', to: 'eboxaaaaa2', ...patch});

test('a connector runs between the facing edges of two pieces, clipped to circles, with room for its head', () => {
  const g = linkGeometry(box('a', 20, 50), box('b', 80, 50), {aspect: 1});
  const [[x1, y1], [x2, y2]] = linkEnds({...g, line: .5}, 1);
  assert.ok(x1 > 30 && x1 < 32 && x2 < 70 && x2 > 68, `${x1} ${x2}`);
  assert.ok(Math.abs(y1 - 50) < 1e-6 && Math.abs(y2 - 50) < 1e-6);
  assert.ok(g.h > 0 && g.vh > 0, 'a flat line still has a box');
  // Diagonal towards a circle: the end sits on the ellipse, not at the bounding-box corner.
  const round = linkGeometry(box('a', 20, 20), box('b', 80, 80, {shape: 'circle'}), {aspect: 1});
  const [, [cx, cy]] = linkEnds({...round}, 1);
  const dist = Math.hypot(cx - 80, cy - 80);
  assert.ok(dist > 10 && dist < 12.5, `circle edge distance ${dist}`);
  // On a 16:9 card the units still line up (y is % of height).
  const wide = linkGeometry(box('a', 20, 50), box('b', 80, 50), {aspect: 16 / 9});
  assert.ok(Math.abs(linkEnds(wide, 16 / 9)[0][1] - 50) < 1e-6);
  // Overlapping pieces: centre to centre.
  const near = linkGeometry(box('a', 50, 50), box('b', 55, 50), {aspect: 1});
  assert.deepEqual(linkEnds(near, 1).map(p => p.map(v => Math.round(v))), [[50, 50], [55, 50]]);
  // Text height is estimated from its lines.
  assert.ok(boxOfItem({t: 'text', text: '한 줄\n두 줄', x: 50, y: 50, w: 50, size: 5}, 1).hh > boxOfItem({t: 'text', text: '한 줄', x: 50, y: 50, w: 50, size: 5}, 1).hh);
});

test('cleaning keeps only connectors whose two pieces exist and recomputes where they sit', () => {
  configure({aspect: 1});
  const items = [box('eboxaaaaa1', 20, 50), box('eboxaaaaa2', 80, 50), link({line: 9, head: 'sideways', x: 1, y: 1, w: 1, h: 1}), link({id: 'elink00002', to: 'emissing01'}), {id: 'elink00004', t: 'link', from: 'elink00001', to: 'eboxaaaaa1'}];
  const design = cleanDesign({id: 'ppage00001', bg: '#fff', items});
  // A connector joining a piece to itself is malformed: a stored document with one is refused, a loose design just drops it.
  assert.throws(() => cleanDesign({id: 'ppage00001', bg: '#fff', items: [...items, link({id: 'elink00003', to: 'eboxaaaaa1'})]}), /UNSUPPORTED_ELEMENT/);
  assert.equal(cleanDesign({bg: '#fff', items: [...items, link({id: 'elink00003', to: 'eboxaaaaa1'})]}).items.filter(it => it.t === 'link').length, 1);
  const links = design.items.filter(it => it.t === 'link');
  assert.equal(links.length, 1);
  assert.equal(links[0].line, LINK_LINE.max);
  assert.equal(links[0].head, 'end');
  assert.ok(Math.abs(links[0].x - 50) < 1 && links[0].w > 30, JSON.stringify(links[0]));
  assert.deepEqual(styleOf(links[0]).values, {color: '#1d2433', line: 3, head: 'end', op: 100});
  assert.equal(itemLabel(links[0]), '연결선 (화살표)');
  // Unrelated items stay the same objects; no connectors → same list.
  const plain = [box('a', 1, 1)];
  assert.equal(layoutLinks(plain, 1), plain);
  // Combo motion draws connectors in with a wipe.
  assert.equal(planMotion({pa: 'pop', items: design.items}).auto.find(a => design.items[a.i].t === 'link').enter, 'wipe');
});

test('duplicating a slide or a set of pieces re-points connectors at the copies', () => {
  const slide = {id: 'ppage00001', bg: '#fff', items: [box('eboxaaaaa1', 20, 50), box('eboxaaaaa2', 80, 50), link()]};
  const [slides] = copySlide([slide], 0);
  const copy = slides[1].items, ids = new Set(copy.map(it => it.id));
  const l = copy.find(it => it.t === 'link');
  assert.ok(ids.has(l.from) && ids.has(l.to) && l.from !== 'eboxaaaaa1');
  const moved = relink([link(), link({id: 'elink00002', to: 'eother0001'})], new Map([['eboxaaaaa1', 'enew000001'], ['eboxaaaaa2', 'enew000002']]));
  assert.deepEqual([moved[0].from, moved[0].to], ['enew000001', 'enew000002']);
  assert.equal(moved[1].to, 'eother0001');
});

test('the SVG has the line, heads by choice and a wide hit line; PPTX gets a native connector', async () => {
  configure({aspect: 16 / 9});
  const design = cleanDesign({id: 'ppage00001', bg: '#ffffff', items: [box('eboxaaaaa1', 20, 30), box('eboxaaaaa2', 80, 70), link({head: 'both', dash: true, color: '#e03131', line: 1})]});
  const l = design.items.find(it => it.t === 'link');
  const svg = linkSvg(l);
  assert.equal((svg.match(/<polygon/g) || []).length, 2);
  assert.match(svg, /class="fi-link-hit"[^>]*stroke-width="3"/);
  assert.match(svg, /stroke-dasharray="3 2"/);
  assert.equal((linkSvg({...l, head: 'none'}).match(/<polygon/g) || []).length, 0);
  const {bytes} = await createPptx({slides: [design], size: {width: 12192000, height: 6858000, unit: 'emu'}});
  const xml = new TextDecoder().decode(unzipSync(bytes)['ppt/slides/slide1.xml']);
  assert.match(xml, /<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="\d+" name="elink00001"\/>/);
  assert.match(xml, /<a:prstGeom prst="straightConnector1">/);
  assert.match(xml, /<a:ln w="121920" cap="flat"><a:solidFill><a:srgbClr val="E03131"/i);
  assert.match(xml, /<a:prstDash val="dash"\/><a:headEnd type="triangle"\/><a:tailEnd type="triangle"\/>/);
  // The connector's box runs from the first box's edge down-right to the second.
  const [, x, y, cx, cy] = xml.match(/<p:cxnSp>.*?<a:off x="(\d+)" y="(\d+)"\/><a:ext cx="(\d+)" cy="(\d+)"\/>/).map(Number);
  assert.ok(x > 12192000 * .3 && x + cx < 12192000 * .7 && y > 6858000 * .3 && y + cy < 6858000 * .7, `${x} ${y} ${cx} ${cy}`);
  assert.doesNotMatch(xml.match(/<p:cxnSp>.*?<\/p:cxnSp>/)[0], /flip/);
  configure({aspect: 1});
});
