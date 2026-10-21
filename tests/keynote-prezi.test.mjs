import test from 'node:test';
import assert from 'node:assert/strict';
import {matchItems, morphs, transitionPose, TRANSITION_IDS, planMotion} from '../src/motion.js';
import {cleanTopic, slideTopic, topicGroups, shownTopics, TOPIC_LIMIT} from '../src/document.js';
import {cleanDesign} from '../src/model.js';
import {migrateRecord, copySlide, slideExtra} from '../app/designs.js';
import {createPptx, PPTX_MIME, sectionList} from '../app/pptx.js';
import {convertPptx} from '../app/pptx-import/converter.js';
import {cleanHtmlLesson} from '../app/html-lesson-runtime.js';
import {showAction, SHOW_KEYS} from '../app/show-keys.js';
import {unzipSync} from 'fflate';

const text = (id, value, patch = {}) => ({id, t: 'text', text: value, x: 50, y: 40, w: 60, size: 5, color: '#123456', align: 'c', ...patch});
const shape = (id, patch = {}) => ({id, t: 'shape', shape: 'circle', x: 30, y: 30, w: 20, h: 20, color: '#3d4bc0', ...patch});

test('이어 움직이기 pairs the same element by id, by duplicated origin and by unique same content', () => {
  const before = [text('etitle0001', '제목'), shape('ecircle001'), text('eother0001', '사라질 글'), {id: 'eemoji0001', t: 'emoji', ch: '🍎', x: 10, y: 10, w: 8}];
  // A duplicated slide (copySlide) gives new ids but remembers the original as origin.elementId.
  const [slides] = copySlide([{id: 'ppage00001', bg: '#fff', items: before}], 0);
  const after = slides[1].items.map(it => ({...it, x: it.x + 20}));
  assert.notEqual(after[0].id, before[0].id);
  assert.deepEqual(matchItems(before, after), [[0, 0], [1, 1], [2, 2], [3, 3]]);
  // Two copies of the same original pair with each other too.
  const [twice] = copySlide(slides, 0);
  assert.deepEqual(matchItems(twice[1].items, slides[1].items).length, 4);
  // Unrelated slides: same text appears once on each side → pair; repeated content or a different type → no pair.
  const a = [text('eaaaaaaa01', '사과'), text('eaaaaaaa02', '배'), text('eaaaaaaa03', '배'), shape('eaaaaaaa04', {color: '#ff0000'})];
  const b = [text('ebbbbbbb01', '배'), shape('ebbbbbbb02', {color: '#ff0000'}), text('ebbbbbbb03', '사과'), {id: 'ebbbbbbb04', t: 'emoji', ch: '사과', x: 1, y: 1, w: 5}];
  assert.deepEqual(matchItems(a, b), [[3, 1], [0, 2]]);
  // Same id but a different kind is not the same element.
  assert.deepEqual(matchItems([text('esameid001', 'x')], [shape('esameid001')]), []);
  assert.deepEqual(matchItems(null, undefined), []);
});

test('이어 움직이기 is a stored transition that crossfades where only one slide is known (video, preview)', () => {
  assert.ok(TRANSITION_IDS.includes('move'));
  assert.equal(morphs('move'), true);
  assert.equal(morphs('fade'), false);
  assert.equal(cleanDesign({id: 'ppage00001', bg: '#fff', tr: 'move', items: []}).tr, 'move');
  const half = transitionPose('move', 1, 500);
  assert.ok(half.next.o > 0 && half.next.o < 1 && half.old.o > 0 && half.old.o < 1);
  assert.equal(transitionPose('move', 1, 1000).done, true);
  assert.equal(transitionPose('move', 1, 900).done, false);
  // Element entrances still plan normally; the player skips the ones it moved.
  assert.equal(planMotion({tr: 'move', pa: 'fade', items: [text('etext00001', 'a')]}).auto.length, 1);
});

test('topics are bounded one-line names that start a group and survive clean/save/copy', () => {
  assert.equal(cleanTopic('  1. 생각\n열기 \u0007'), '1. 생각 열기');
  assert.equal(cleanTopic(3), '');
  assert.equal(Array.from(cleanTopic('가'.repeat(TOPIC_LIMIT + 5))).length, TOPIC_LIMIT);
  assert.deepEqual(slideTopic({topic: '  '}), {});
  assert.deepEqual(topicGroups(['', '', '도입', '', '활동', '']), [{name: '', start: 0, end: 1}, {name: '도입', start: 2, end: 3}, {name: '활동', start: 4, end: 5}]);
  assert.deepEqual(topicGroups(['도입']), [{name: '도입', start: 0, end: 0}]);
  assert.deepEqual(topicGroups([]), []);
  const page = {id: 'ppage00001', bg: '#fff', topic: '도입', items: []};
  assert.equal(cleanDesign(page).topic, '도입');
  assert.equal(slideExtra(page).topic, '도입');
  const record = migrateRecord(JSON.parse(JSON.stringify({id: 'd1700000000000aa', name: '주제', ratio: '16:9', updatedAt: 1, slides: [page, {id: 'ppage00002', bg: '#fff', items: []}]})));
  assert.equal(record.slides[0].topic, '도입');
  assert.equal(Object.hasOwn(record.slides[1], 'topic'), false);
});

test('a topic that starts on a hidden slide moves to the next shown slide', () => {
  const pages = [{id: 'p1', topic: '처음'}, {id: 'p2', hidden: true, topic: '정답'}, {id: 'p3'}, {id: 'p4', hidden: true}, {id: 'p5', topic: '정리'}];
  assert.deepEqual([...shownTopics(pages)], [['p1', '처음'], ['p3', '정답'], ['p5', '정리']]);
  assert.deepEqual([...shownTopics([{id: 'a', hidden: true, topic: '버림'}])], []);
});

test('topics are PowerPoint sections in editable PPTX and come back on import', async () => {
  assert.equal(sectionList(['', '']), '');
  const xml = sectionList(['', '도입 & <1>', '', '활동']);
  assert.match(xml, /<p14:section name="처음" id="\{[0-9A-F-]+\}"><p14:sldIdLst><p14:sldId id="256"\/><\/p14:sldIdLst><\/p14:section>/i);
  assert.match(xml, /name="도입 &amp; &lt;1&gt;"[^>]*><p14:sldIdLst><p14:sldId id="257"\/><p14:sldId id="258"\/>/);
  assert.match(xml, /name="활동"[^>]*><p14:sldIdLst><p14:sldId id="259"\/><\/p14:sldIdLst>/);
  const slides = [
    {id: 'ppage00001', bg: '#ffffff', items: [text('etext00001', '표지')]},
    {id: 'ppage00002', bg: '#ffffff', topic: '도입', items: [text('etext00002', '질문')]},
    {id: 'ppage00003', bg: '#ffffff', items: [text('etext00003', '생각')]},
    {id: 'ppage00004', bg: '#ffffff', topic: '활동', items: [text('etext00004', '해 보기')]},
  ];
  const result = await createPptx({slides, size: {width: 12192000, height: 6858000, unit: 'emu'}});
  const presentation = new TextDecoder().decode(unzipSync(result.bytes)['ppt/presentation.xml']);
  assert.match(presentation, /<p:defaultTextStyle\/><p:extLst><p:ext uri="\{521415D9-36F7-43E2-AB2F-B90AF26B5E84\}"><p14:sectionLst xmlns:p14="http:\/\/schemas\.microsoft\.com\/office\/powerpoint\/2010\/main">/);
  assert.match(presentation, /<\/p:extLst><\/p:presentation>$/);
  const imported = await convertPptx(new File([result.bytes], 'topics.pptx', {type: PPTX_MIME}));
  // The leading 「처음」 section names the first slide too (PowerPoint shows it as a section).
  assert.deepEqual(imported.document.slides.map(s => s.topic || ''), ['처음', '도입', '', '활동']);
  const plain = await createPptx({slides: slides.map(({topic, ...s}) => s), size: {width: 12192000, height: 6858000, unit: 'emu'}});
  assert.doesNotMatch(new TextDecoder().decode(unzipSync(plain.bytes)['ppt/presentation.xml']), /sectionLst/);
});

test('HTML lessons keep page topics; C toggles the presenter camera bubble', () => {
  const image = 'data:image/png;base64,iVBORw0KGgo=';
  const lesson = cleanHtmlLesson({version: 1, id: 'lsn0000001', title: '수업', pages: [{id: 'ppage00001', image, aspect: 1.5, topic: ' 도입 '}, {id: 'ppage00002', image, aspect: 1.5, topic: 7}]});
  assert.equal(lesson.pages[0].topic, '도입');
  assert.equal(Object.hasOwn(lesson.pages[1], 'topic'), false);
  assert.deepEqual(showAction({key: 'c', code: 'KeyC'}), {type: 'camera'});
  assert.deepEqual(showAction({key: 'ㅊ', code: 'KeyC'}), {type: 'camera'});
  assert.equal(showAction({key: 'c', code: 'KeyC', ctrlKey: true}), null);
  assert.ok(SHOW_KEYS.some(([k, v]) => k === 'C' && /카메라/.test(v)));
});
