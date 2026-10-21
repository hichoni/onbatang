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

test('curved connectors bend to the chosen side, fit their bulge in the box and point their heads along the curve', async () => {
  const {linkControl, CURVE_BEND} = await import('../src/links.js');
  const a = box('eboxaaaaa1', 20, 50), b = box('eboxaaaaa2', 80, 50);
  const up = linkGeometry(a, b, {aspect: 1, curve: 1}), down = linkGeometry(a, b, {aspect: 1, curve: -1});
  assert.equal(up.pts.length, 6);
  const [ux, uy] = linkControl(up, 1), [, dy] = linkControl(down, 1);
  // Going left→right, "left of travel" is up on screen.
  assert.ok(Math.abs(ux - 50) < .01 && Math.abs(uy - (50 - 60 * CURVE_BEND)) < .01, `${ux} ${uy}`);
  assert.ok(Math.abs(dy - (50 + 60 * CURVE_BEND)) < .01);
  // The box holds the curve's peak (halfway to the control point), not just the two ends.
  // Ends leave the boxes towards the control point (above the centre line).
  const [[x1, y1], [x2, y2]] = linkEnds(up, 1);
  const top = up.y - up.h / 2, peak = .25 * y1 + .5 * uy + .25 * y2, pad = Math.max(1.5, LINK_LINE.base * 3 + 1);
  assert.ok(Math.abs(top - (peak - pad)) < .05, `top ${top} peak ${peak}`);
  assert.ok(y1 < 50 && y2 < 50 && x1 > 25 && x2 < 75, JSON.stringify([x1, y1, x2, y2]));
  const svg = linkSvg({...up, color: '#1d2433', line: .5, head: 'end'});
  assert.match(svg, /<path class="fi-link-line" d="M[-\d.]+ [-\d.]+Q[-\d.]+ [-\d.]+ [-\d.]+ [-\d.]+"/);
  assert.doesNotMatch(svg, /<line/);
  // The end head points along the tangent (down-right here), so its tip is the right-most, lowest point.
  const pts = svg.match(/points="([^"]+)"/)[1].split(' ').map(p => p.split(',').map(Number));
  assert.ok(pts[0][0] > pts[1][0] && pts[0][0] > pts[2][0]);
  configure({aspect: 1});
  const clean = cleanDesign({id: 'ppage00001', bg: '#fff', items: [a, b, link({curve: -1}), link({id: 'elink00002', from: 'eboxaaaaa2', to: 'eboxaaaaa1', curve: 2})]});
  const [l1, l2] = clean.items.filter(it => it.t === 'link');
  assert.equal(l1.curve, -1);
  assert.equal(l1.pts.length, 6);
  assert.equal(Object.hasOwn(l2, 'curve'), false);
  assert.equal(l2.pts.length, 4);
  assert.deepEqual(Object.keys(styleOf(l1).values).sort(), ['color', 'curve', 'head', 'line', 'op']);
  // PPTX: an open custom path with a quadratic curve and the same line/arrow settings.
  const {bytes} = await createPptx({slides: [clean], size: {width: 9144000, height: 9144000, unit: 'emu'}});
  const xml = new TextDecoder().decode(unzipSync(bytes)['ppt/slides/slide1.xml']);
  assert.match(xml, /<p:sp><p:nvSpPr><p:cNvPr id="\d+" name="elink00001"\/>.*?<a:path w="\d+" h="\d+" fill="none"><a:moveTo><a:pt x="\d+" y="\d+"\/><\/a:moveTo><a:quadBezTo><a:pt x="\d+" y="\d+"\/><a:pt x="\d+" y="\d+"\/><\/a:quadBezTo><\/a:path>.*?<a:noFill\/><a:ln w="\d+" cap="rnd">.*?<a:tailEnd type="triangle"\/><\/a:ln>/);
  assert.equal((xml.match(/<p:cxnSp>/g) || []).length, 1, 'the straight one is still a connector');
});

test('elbow connectors leave from the facing sides, turn at right angles in the middle, and export as three straight runs', async () => {
  const {linkCorners} = await import('../src/links.js');
  const a = box('eboxaaaaa1', 20, 30), b = box('eboxaaaaa2', 80, 70);
  // Across first: out of the right side of A, down the middle, into the left side of B.
  const h = linkGeometry(a, b, {aspect: 1, elbow: 1});
  assert.equal(h.pts.length, 8);
  const [[x1, y1], [x2, y2]] = linkEnds(h, 1), [m1, m2] = linkCorners(h, 1);
  assert.ok(Math.abs(y1 - 30) < .01 && x1 > 30 && x1 < 32, `start ${x1},${y1}`);
  assert.ok(Math.abs(y2 - 70) < .01 && x2 < 70 && x2 > 68, `end ${x2},${y2}`);
  assert.ok(Math.abs(m1[0] - 50) < .01 && Math.abs(m1[1] - 30) < .01 && Math.abs(m2[0] - 50) < .01 && Math.abs(m2[1] - 70) < .01, JSON.stringify([m1, m2]));
  // Down first: out of the bottom of A, across the middle, into the top of B.
  const v = linkGeometry(a, b, {aspect: 1, elbow: -1});
  const [[vx1, vy1], [vx2, vy2]] = linkEnds(v, 1), [n1, n2] = linkCorners(v, 1);
  assert.ok(Math.abs(vx1 - 20) < .01 && vy1 > 40 && Math.abs(vx2 - 80) < .01 && vy2 < 60);
  assert.ok(Math.abs(n1[1] - 50) < .01 && Math.abs(n2[1] - 50) < .01 && Math.abs(n1[0] - 20) < .01 && Math.abs(n2[0] - 80) < .01);
  // Overlapping rows, so no room to turn down the middle: one turn (ㄱ), down to B's middle and into its left side.
  const c = box('eboxaaaaa3', 80, 48), l1 = linkGeometry(a, c, {aspect: 1, elbow: -1});
  const [[lx1, ly1], [lx2, ly2]] = linkEnds(l1, 1), [k1, k2] = linkCorners(l1, 1);
  assert.ok(Math.abs(lx1 - 20) < .01 && ly1 > 40 && Math.abs(ly2 - 48) < .01 && lx2 < 70, `L ends ${lx1},${ly1} ${lx2},${ly2}`);
  assert.ok(Math.abs(k1[0] - 20) < .01 && Math.abs(k1[1] - 48) < .01 && Math.hypot(k1[0] - k2[0], k1[1] - k2[1]) < .01, JSON.stringify([k1, k2]));
  const lsvg = linkSvg({...l1, color: '#1d2433', line: .5, head: 'end'});
  assert.equal((lsvg.match(/class="fi-link-line" d="[^"]*"/)[0].match(/Q/g) || []).length, 1, 'one rounded turn');
  const ltip = lsvg.match(/points="([^"]+)"/)[1].split(' ').map(p => p.split(',').map(Number));
  assert.ok(ltip[0][0] > ltip[1][0] && Math.abs(ltip[1][0] - ltip[2][0]) < .01, 'L head points right');
  // Side by side, so going down first cannot reach B at all: it turns across first instead.
  const side = linkGeometry(a, box('eboxaaaaa4', 80, 34), {aspect: 1, elbow: -1}), [s1, s2] = linkCorners(side, 1);
  assert.ok(Math.abs(s1[0] - 50) < .01 && Math.abs(s2[0] - 50) < .01 && Math.abs(s1[1] - 30) < .01 && Math.abs(s2[1] - 34) < .01, JSON.stringify([s1, s2]));
  // SVG: one rounded-corner path, the end head pointing right (into B from its left side).
  const svg = linkSvg({...h, color: '#1d2433', line: .5, head: 'end'});
  assert.match(svg, /<path class="fi-link-line" d="M[^"]*Q[^"]*Q[^"]*"/);
  const tip = svg.match(/points="([^"]+)"/)[1].split(' ').map(p => p.split(',').map(Number));
  assert.ok(tip[0][0] > tip[1][0] && Math.abs(tip[1][0] - tip[2][0]) < .01, 'head points right');
  // Cleaning keeps elbow over curve and the style copy carries it.
  configure({aspect: 1});
  const clean = cleanDesign({id: 'ppage00001', bg: '#fff', items: [a, b, link({elbow: -1, curve: 1})]});
  const l = clean.items.find(it => it.t === 'link');
  assert.equal(l.elbow, -1);
  assert.equal(Object.hasOwn(l, 'curve'), false);
  assert.equal(l.pts.length, 8);
  assert.equal(styleOf(l).values.elbow, -1);
  const {bytes} = await createPptx({slides: [clean], size: {width: 9144000, height: 9144000, unit: 'emu'}});
  const xml = new TextDecoder().decode(unzipSync(bytes)['ppt/slides/slide1.xml']);
  assert.match(xml, /<a:path w="\d+" h="\d+" fill="none"><a:moveTo><a:pt[^>]*\/><\/a:moveTo><a:lnTo><a:pt[^>]*\/><\/a:lnTo><a:lnTo><a:pt[^>]*\/><\/a:lnTo><a:lnTo><a:pt[^>]*\/><\/a:lnTo><\/a:path>/);
  assert.match(xml, /<\/a:solidFill><a:round\/><a:tailEnd type="triangle"\/>/);
});

test('connector ends can stick to a chosen side: straight, curved and elbow routes, saved apart from style', async () => {
  const {linkCorners} = await import('../src/links.js');
  const a = box('sboxaaaaa1', 20, 30), b = box('sboxaaaaa2', 80, 70);
  // Straight: bottom of A to top of B, each at the middle of that side.
  const [[x1, y1], [x2, y2]] = linkEnds(linkGeometry(a, b, {aspect: 1, fromSide: 'bottom', toSide: 'top'}), 1);
  assert.ok(Math.abs(x1 - 20) < .01 && y1 > 40 && y1 < 42 && Math.abs(x2 - 80) < .01 && y2 < 60 && y2 > 58, JSON.stringify([x1, y1, x2, y2]));
  // Only one end chosen: the other end leaves its piece toward that point.
  const [[ox1, oy1]] = linkEnds(linkGeometry(a, b, {aspect: 1, toSide: 'left'}), 1);
  assert.ok(ox1 > 30 && oy1 > 30, 'A leaves toward the left side of B');
  // Unchosen sides keep the old route exactly.
  assert.deepEqual(linkGeometry(a, b, {aspect: 1, fromSide: 'nowhere'}), linkGeometry(a, b, {aspect: 1}));
  // Elbow, both right: out past both pieces and back (ㄷ).
  const u = linkGeometry(a, b, {aspect: 1, elbow: 1, fromSide: 'right', toSide: 'right'}), [u1, u2] = linkCorners(u, 1), [[ux1], [ux2]] = linkEnds(u, 1);
  assert.ok(Math.abs(u1[0] - u2[0]) < .01 && u1[0] >= Math.max(ux1, ux2) - .01, JSON.stringify([u1, u2]));
  // Elbow, bottom to left: one turn (ㄱ) under A at B's middle height.
  const l = linkGeometry(a, b, {aspect: 1, elbow: 1, fromSide: 'bottom', toSide: 'left'}), [k1, k2] = linkCorners(l, 1);
  assert.ok(Math.abs(k1[0] - 20) < .01 && Math.abs(k1[1] - 70) < .01 && Math.hypot(k1[0] - k2[0], k1[1] - k2[1]) < .01, JSON.stringify([k1, k2]));
  // Elbow, right to left (facing): the usual middle turn.
  const z = linkCorners(linkGeometry(a, b, {aspect: 1, elbow: 1, fromSide: 'right', toSide: 'left'}), 1);
  assert.ok(Math.abs(z[0][0] - 50) < .01 && Math.abs(z[1][0] - 50) < .01);
  // Curve from the top of A starts at that point.
  const [[cx1, cy1]] = linkEnds(linkGeometry(a, b, {aspect: 1, curve: 1, fromSide: 'top'}), 1);
  assert.ok(Math.abs(cx1 - 20) < .01 && cy1 < 20);
  // Saved and laid out through cleaning; bad sides drop; style copy leaves sides alone.
  configure({aspect: 1});
  const clean = cleanDesign({id: 'ppage00001', bg: '#fff', items: [a, b, link({from: 'sboxaaaaa1', to: 'sboxaaaaa2', fromSide: 'bottom', toSide: 'diagonal'})]});
  const saved = clean.items.find(it => it.t === 'link');
  assert.equal(saved.fromSide, 'bottom');
  assert.equal(Object.hasOwn(saved, 'toSide'), false);
  assert.ok(Math.abs(linkEnds(saved, 1)[0][0] - 20) < .01);
  assert.equal(Object.hasOwn(styleOf(saved).values, 'fromSide'), false);
});
