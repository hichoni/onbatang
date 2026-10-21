import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanNotes, slideNotes, NOTES_LIMIT} from '../src/document.js';
import {cleanDesign} from '../src/model.js';
import {migrateRecord, copyRecord, slideExtra} from '../app/designs.js';
import {createPptx, PPTX_MIME} from '../app/pptx.js';
import {convertPptx, inspectPptx} from '../app/pptx-import/converter.js';
import {unzipSync} from 'fflate';

const text = (id, value) => ({id, t: 'text', layout: 'slide', text: value, x: 50, y: 40, w: 80, h: 20, size: 4, color: '#123456', align: 'c'});
const record = slides => ({id: 'd1700000000000aa', name: '노트 시험', ratio: '16:9', slides, updatedAt: 1});

test('speaker notes are bounded plain text: control characters removed, line breaks kept, empty notes not stored', () => {
  assert.equal(cleanNotes('첫 줄\r\n둘째\t줄\u0000\u0007'), '첫 줄\n둘째\t줄');
  assert.equal(cleanNotes('   \n\t '), '');
  assert.equal(cleanNotes(42), '');
  assert.equal(cleanNotes('가'.repeat(NOTES_LIMIT + 50)).length, NOTES_LIMIT);
  assert.deepEqual(slideNotes({notes: ' '}), {});
  assert.deepEqual(slideNotes({notes: '말할 것'}), {notes: '말할 것'});
});

test('notes survive clean/save/reopen/copy and never become a drawn element', () => {
  const page = {id: 'ppage00001', bg: '#ffffff', notes: '이 장에서 질문 던지기\n- 왜 그럴까?', items: [text('etext00001', '제목')]};
  const design = cleanDesign(page);
  assert.equal(design.notes, page.notes);
  assert.equal(design.items.length, 1);
  assert.equal(cleanDesign({...page, notes: ''}).notes, undefined);
  let reopened = migrateRecord(record([page, {id: 'ppage00002', bg: '#ffffff', items: []}]));
  for (let i = 0; i < 3; i++) reopened = migrateRecord(JSON.parse(JSON.stringify({...reopened, slides: reopened.slides.map(p => cleanDesign(p))})));
  assert.equal(reopened.slides[0].notes, page.notes);
  assert.equal(Object.hasOwn(reopened.slides[1], 'notes'), false);
  assert.equal(slideExtra(reopened.slides[0]).notes, page.notes);
  const copied = copyRecord(reopened);
  assert.notEqual(copied.slides[0].id, reopened.slides[0].id);
  assert.equal(copied.slides[0].notes, page.notes);
});

test('editable PPTX carries notes in PowerPoint notes slides and reads them back on import', async () => {
  const notes = '도입: 그림을 보고 무엇이 보이는지 묻기\n\n정리 & <확인> 질문';
  const slides = [
    {id: 'ppage00001', bg: '#ffffff', notes, items: [text('etext00001', '첫 쪽')]},
    {id: 'ppage00002', bg: '#ffffff', items: [text('etext00002', '둘째 쪽')]},
  ];
  const result = await createPptx({slides, size: {width: 12192000, height: 6858000, unit: 'emu'}, title: '노트'});
  const files = unzipSync(result.bytes), xml = name => new TextDecoder().decode(files[name]);
  assert.ok(files['ppt/notesSlides/notesSlide1.xml']);
  assert.equal(files['ppt/notesSlides/notesSlide2.xml'], undefined);
  assert.match(xml('ppt/notesSlides/notesSlide1.xml'), /정리 &amp; &lt;확인&gt; 질문/);
  assert.match(xml('ppt/slides/_rels/slide1.xml.rels'), /notesSlides\/notesSlide1\.xml/);
  assert.doesNotMatch(xml('ppt/slides/_rels/slide2.xml.rels'), /notesSlide/);
  assert.match(xml('ppt/presentation.xml'), /<p:sldMasterIdLst>.*<\/p:sldMasterIdLst><p:notesMasterIdLst><p:notesMasterId r:id="rId4"\/><\/p:notesMasterIdLst><p:sldIdLst>/);
  assert.match(xml('ppt/_rels/presentation.xml.rels'), /Id="rId4" Type="[^"]+\/notesMaster" Target="notesMasters\/notesMaster1\.xml"/);
  for (const part of ['/ppt/notesSlides/notesSlide1.xml', '/ppt/notesMasters/notesMaster1.xml', '/ppt/theme/theme2.xml']) assert.match(xml('[Content_Types].xml'), new RegExp(`PartName="${part}"`));
  const file = new File([result.bytes], 'notes.pptx', {type: PPTX_MIME});
  const inspection = await inspectPptx(file);
  assert.ok(inspection.pages.every(page => !page.warnings.some(w => w.code === 'NOTES_NOT_IMPORTED')));
  const imported = await convertPptx(file);
  assert.equal(imported.document.slides[0].notes, notes);
  assert.equal(Object.hasOwn(imported.document.slides[1], 'notes'), false);
  assert.equal(migrateRecord(imported.document).slides[0].notes, imported.document.slides[0].notes);
});

test('a deck without notes keeps the previous package layout exactly', async () => {
  const result = await createPptx({slides: [{id: 'ppage00001', bg: '#ffffff', items: [text('etext00001', '노트 없음')]}]});
  const files = unzipSync(result.bytes);
  assert.equal(Object.keys(files).some(name => /notes/i.test(name) || name.endsWith('theme2.xml')), false);
  assert.doesNotMatch(new TextDecoder().decode(files['ppt/presentation.xml']), /notesMasterIdLst/);
});
