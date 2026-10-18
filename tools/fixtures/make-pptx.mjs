// Self-authored test inputs, not a PPTX converter. Run: node tools/fixtures/make-pptx.mjs
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipStore } from '../../app/zip.js';

const OUT = join(dirname(fileURLToPath(import.meta.url)), 'pptx');
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const header = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const ns = `xmlns:a="${A}" xmlns:r="${R}" xmlns:p="${P}"`;
const escape = s => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const rels = list => `${header}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${list.map(([id, type, target]) => `<Relationship Id="${id}" Type="${R}/${type}" Target="${target}"/>`).join('')}</Relationships>`;
const group = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';
const colorMap = 'bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"';
const colors = { dk1: '222222', lt1: 'FFFFFF', dk2: '44546A', lt2: 'E7E6E6', accent1: '4472C4', accent2: 'ED7D31', accent3: 'A5A5A5', accent4: 'FFC000', accent5: '5B9BD5', accent6: '70AD47', hlink: '0563C1', folHlink: '954F72' };
const fill = '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>';
const theme = `${header}<a:theme xmlns:a="${A}" name="Self-authored fixture"><a:themeElements><a:clrScheme name="Fixture">${Object.entries(colors).map(([k,v]) => `<a:${k}><a:srgbClr val="${v}"/></a:${k}>`).join('')}</a:clrScheme><a:fontScheme name="System font"><a:majorFont><a:latin typeface="Arial"/><a:ea typeface="맑은 고딕"/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Arial"/><a:ea typeface="맑은 고딕"/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Plain"><a:fillStyleLst>${fill.repeat(3)}</a:fillStyleLst><a:lnStyleLst>${`<a:ln w="12700">${fill}<a:prstDash val="solid"/></a:ln>`.repeat(3)}</a:lnStyleLst><a:effectStyleLst>${'<a:effectStyle><a:effectLst/></a:effectStyle>'.repeat(3)}</a:effectStyleLst><a:bgFillStyleLst>${fill.repeat(3)}</a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`;
const textShape = value => `<p:sp><p:nvSpPr><p:cNvPr id="2" name="Self-authored text"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="685800" y="685800"/><a:ext cx="7772400" cy="4800600"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr wrap="square"/><a:lstStyle/><a:p><a:r><a:rPr lang="ko-KR" sz="2400"/><a:t>${escape(value)}</a:t></a:r><a:endParaRPr lang="ko-KR" sz="2400"/></a:p></p:txBody></p:sp>`;

function makePptx(texts) {
  const files = [];
  const add = (name, xml) => files.push({ name, bytes: new TextEncoder().encode(xml) });
  const overrides = [['/ppt/presentation.xml', 'presentation.main'], ['/ppt/slideMasters/slideMaster1.xml', 'slideMaster'], ['/ppt/slideLayouts/slideLayout1.xml', 'slideLayout'], ...texts.map((_, i) => [`/ppt/slides/slide${i + 1}.xml`, 'slide'])];
  add('[Content_Types].xml', `${header}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${overrides.map(([part, type]) => `<Override PartName="${part}" ContentType="application/vnd.openxmlformats-officedocument.presentationml.${type}+xml"/>`).join('')}<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/></Types>`);
  add('_rels/.rels', rels([['rId1', 'officeDocument', 'ppt/presentation.xml']]));
  add('ppt/presentation.xml', `${header}<p:presentation ${ns}><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${texts.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${2 + i}"/>`).join('')}</p:sldIdLst><p:sldSz cx="9144000" cy="6858000" type="screen4x3"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`);
  add('ppt/_rels/presentation.xml.rels', rels([['rId1', 'slideMaster', 'slideMasters/slideMaster1.xml'], ...texts.map((_, i) => [`rId${i + 2}`, 'slide', `slides/slide${i + 1}.xml`])]));
  add('ppt/slideMasters/slideMaster1.xml', `${header}<p:sldMaster ${ns}><p:cSld><p:spTree>${group}</p:spTree></p:cSld><p:clrMap ${colorMap}/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>`);
  add('ppt/slideMasters/_rels/slideMaster1.xml.rels', rels([['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml'], ['rId2', 'theme', '../theme/theme1.xml']]));
  add('ppt/slideLayouts/slideLayout1.xml', `${header}<p:sldLayout ${ns} type="blank" preserve="1"><p:cSld name="Blank"><p:spTree>${group}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`);
  add('ppt/slideLayouts/_rels/slideLayout1.xml.rels', rels([['rId1', 'slideMaster', '../slideMasters/slideMaster1.xml']]));
  add('ppt/theme/theme1.xml', theme);
  texts.forEach((value, i) => {
    add(`ppt/slides/slide${i + 1}.xml`, `${header}<p:sld ${ns}><p:cSld><p:spTree>${group}${textShape(value)}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`);
    add(`ppt/slides/_rels/slide${i + 1}.xml.rels`, rels([['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml']]));
  });
  return zipStore(files, new Date(2026, 9, 17, 0, 0, 0));
}

const cases = [
  { name: 'self-authored-4x3', key: '43', texts: ['절차대로 선물 포장하기', '가장 먼저 해야 할 일은 무엇일까요?'], expected: 'ready' },
  { name: 'self-authored-long-text', key: 'long', texts: ['긴 원문은 잘라서 성공으로 표시하지 않습니다. '.repeat(8)], expected: 'ready' },
  { name: 'self-authored-21-pages', key: '21', texts: Array.from({ length: 21 }, (_, i) => `직접 만든 ${i + 1}쪽: 쪽 선택과 원본 순서 검증`), expected: 'PAGE_LIMIT' },
];
mkdirSync(OUT, { recursive: true });
const manifest = [];
for (const fixture of cases) {
  const bytes = makePptx(fixture.texts), sha256 = createHash('sha256').update(bytes).digest('hex');
  const sourceAssetId = `afixture${fixture.key}`, sourceDocumentId = `sfixture${fixture.key}`;
  writeFileSync(join(OUT, `${fixture.name}.pptx`), bytes);
  // Expected editable data is hand-authored from the same strings, not extracted from the PPTX.
  const expectedInput = {
    report: { contractVersion: 1, jobId: `jfixture${fixture.key}`, status: 'ready', sourceDocumentId, sourceAssetId,
      converter: { name: 'self-authored-expected-data', version: '1', fonts: [] },
      selectedPages: fixture.texts.map((_, i) => i + 1), pageCount: fixture.texts.length,
      warnings: [{ code: 'SYNTHETIC_SAMPLE', message: '직접 작성한 예상 데이터. 실제 PPTX 변환 결과가 아닙니다.' }] },
    document: { id: `dfixture${fixture.key}`, schemaVersion: 1, revision: 0, name: fixture.name,
      originalSize: { width: 9144000, height: 6858000, unit: 'emu' }, size: { width: 960, height: 720, unit: 'px' },
      source: { kind: 'pptx', sourceDocumentId, assetId: sourceAssetId, filename: `${fixture.name}.pptx`, sha256 },
      assets: [{ id: sourceAssetId, kind: 'source', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', sha256, byteLength: bytes.length, storageKey: `fixtures/${fixture.name}.pptx` }],
      assetRefs: [sourceAssetId], slides: fixture.texts.map(value => ({ items: [{ t: 'text', text: value, x: 50, y: 45, w: 85, size: 5 }] })) },
  };
  writeFileSync(join(OUT, `${fixture.name}.expected.json`), `${JSON.stringify(expectedInput, null, 2)}\n`);
  manifest.push({ file: `${fixture.name}.pptx`, sha256, byteLength: bytes.length, pageCount: fixture.texts.length,
    originalSize: expectedInput.document.originalSize, expectedAdapterResult: fixture.expected, textLengths: fixture.texts.map(t => t.length) });
}
writeFileSync(join(OUT, 'manifest.json'), `${JSON.stringify({ provenance: 'Self-authored fixtures. No teacher source; no conversion engine has run.', fixtures: manifest }, null, 2)}\n`);
console.log(`Wrote ${cases.length} reproducible PPTX fixtures and hand-authored expected data to ${OUT}`);
