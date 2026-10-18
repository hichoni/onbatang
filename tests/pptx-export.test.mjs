import test from 'node:test';
import assert from 'node:assert/strict';
import {createPptx, PPTX_MIME, PPTX_MAX_BYTES} from '../app/pptx.js';
import {configure} from '../src/model.js';
import {crc32} from '../app/zip.js';

const pngBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8/x8AAwMCAO+jHnQAAAAASUVORK5CYII=', 'base64');
for (let offset=8;offset<pngBytes.length;){const length=pngBytes.readUInt32BE(offset);pngBytes.writeUInt32BE(crc32(pngBytes.subarray(offset+4,offset+8+length)),offset+8+length);offset+=length+12;}
const png = new Blob([pngBytes], {type: 'image/png'});
const text = patch => ({id:'etext001',t:'text',layout:'slide',text:'첫째 줄\n둘째 & <줄>',x:50,y:30,w:80,h:20,size:4,color:'#123456',align:'l',bold:true,italic:true,under:true,typeface:'맑은 고딕',...patch});
const shape = patch => ({id:'eshape001',t:'shape',layout:'slide',shape:'round',x:20,y:60,w:30,h:10,color:'#abcdef',line:.2,lc:'#112233',r:12,...patch});
const page = items => ({id:'ppage001',bg:'#ffffff',items});
const code = expected => error => error.code === expected;
function unzip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), files = new Map(); let offset = 0;
  while (view.getUint32(offset, true) === 0x04034b50) {
    const length = view.getUint32(offset + 18, true), nameLength = view.getUint16(offset + 26, true), extra = view.getUint16(offset + 28, true);
    assert.equal(view.getUint16(offset + 8, true), 0);
    const name = new TextDecoder().decode(bytes.subarray(offset + 30, offset + 30 + nameLength));
    const start = offset + 30 + nameLength + extra, content = bytes.slice(start, start + length);
    assert.equal(crc32(content), view.getUint32(offset + 14, true)); assert.equal(files.has(name), false);
    files.set(name, content); offset = start + length;
  }
  assert.equal(view.getUint32(offset, true), 0x02014b50);
  return {files, xml: name => new TextDecoder().decode(files.get(name))};
}

test('editable PPTX contains complete package parts, native text/shape order and exact physical slide size', async () => {
  const slides = [page([text(), shape()]), page([text({id:'etext002',text:'두 번째 쪽'})])], before = structuredClone(slides), progress = [];
  const result = await createPptx({slides,size:{width:12192000,height:6858000,unit:'emu'},title:'수업 & 검증',onProgress:value=>progress.push(value)});
  assert.deepEqual(slides, before); assert.equal(result.mimeType, PPTX_MIME); assert.equal(result.blob.type, PPTX_MIME);
  assert.equal(result.ext, 'pptx'); assert.equal(result.slideCount, 2); assert.equal(result.blob.size, result.bytes.length);
  assert.deepEqual(progress, [{completed:1,total:2,pageNumber:1},{completed:2,total:2,pageNumber:2}]);
  const zip = unzip(result.bytes), first = zip.xml('ppt/slides/slide1.xml');
  for (const path of ['[Content_Types].xml','_rels/.rels','ppt/presentation.xml','ppt/_rels/presentation.xml.rels','ppt/slideMasters/slideMaster1.xml','ppt/slideMasters/_rels/slideMaster1.xml.rels','ppt/slideLayouts/slideLayout1.xml','ppt/slideLayouts/_rels/slideLayout1.xml.rels','ppt/theme/theme1.xml','docProps/core.xml','docProps/app.xml']) assert.ok(zip.files.has(path), path);
  assert.match(zip.xml('ppt/presentation.xml'), /cx="12192000" cy="6858000"/);
  assert.match(zip.xml('docProps/core.xml'), /수업 &amp; 검증/);
  assert.equal((first.match(/<p:sp>/g)||[]).length, 2); assert.equal((first.match(/<p:pic>/g)||[]).length, 0);
  assert.ok(first.indexOf('etext001') < first.indexOf('eshape001'));
  assert.match(first, /둘째 &amp; &lt;줄&gt;/); assert.match(first, /<a:rPr lang="ko-KR" sz="3840" b="1" i="1" u="sng">/);
  assert.match(first, /<a:ea typeface="맑은 고딕"/); assert.match(first, /<a:gd name="adj" fmla="val 6000"/);
  assert.match(first, /<a:ln w="24384">/); assert.match(first, /<a:bodyPr wrap="square" lIns="0" rIns="0"/);
  assert.match(zip.xml('ppt/slides/_rels/slide1.xml.rels'), /Target="..\/slideLayouts\/slideLayout1.xml"/);
  assert.equal(result.warnings.filter(warning=>warning.code==='FONT_NOT_EMBEDDED').length, 2);
});

test('an imported 4096-character text frame stays editable and uses source dimensions and transforms', async () => {
  const content = '가'.repeat(4096), result = await createPptx({slides:[page([text({text:content,h:35,rot:-12,fx:true,fy:true,nowrap:true,valign:'bottom',lh:1.5,op:50})])],size:{width:720,height:540,unit:'pt'}});
  const slide = unzip(result.bytes).xml('ppt/slides/slide1.xml');
  assert.ok(slide.includes(content)); assert.match(slide,/rot="-720000"/);
  assert.match(slide,/anchor="b"/); assert.match(slide,/wrap="none"/); assert.match(slide,/val="150000"/); assert.match(slide,/a:alpha val="50000"/);
  assert.deepEqual(result.size,{width:9144000,height:6858000,unit:'emu'});
});

test('legacy rounded rectangles match 4cqw CSS at the export aspect without changing explicit corners',async()=>{
  const slides=[page([shape({r:undefined}),shape({id:'ewideround001',r:undefined,w:50,h:50}),shape({id:'eexplicitround001',r:20})])];
  const result=await createPptx({slides,size:{width:960,height:540,unit:'px'}}),slide=unzip(result.bytes).xml('ppt/slides/slide1.xml');
  const adjustments=[...slide.matchAll(/name="adj" fmla="val (\d+)"/g)].map(match=>Number(match[1]));
  assert.deepEqual(adjustments,[50000,14222,10000]);
  const square=await createPptx({slides:[page([shape({r:undefined,w:50,h:50})])],aspect:1});
  assert.match(unzip(square.bytes).xml('ppt/slides/slide1.xml'),/fmla="val 8000"/);
});

test('emoji, library art and custom shapes rasterize individually while text and basic shapes remain editable', async () => {
  const items = [text(),{id:'eemoji001',t:'emoji',ch:'🌻',x:30,y:50,w:10},shape({id:'ecustom001',shape:'star'}),{id:'eart001',t:'art',art:'tb:book',x:60,y:60,w:20,h:20},shape()], captured=[];
  const result = await createPptx({slides:[page(items)],renderItem:async(design,index,options)=>{captured.push({id:design.items[index].id,index,pageNumber:options.pageNumber});return {blob:png};}});
  const zip=unzip(result.bytes), slide=zip.xml('ppt/slides/slide1.xml');
  assert.deepEqual(captured.map(item=>item.id),['eemoji001','ecustom001','eart001']);
  assert.equal((slide.match(/<p:sp>/g)||[]).length,2);assert.equal((slide.match(/<p:pic>/g)||[]).length,3);
  assert.equal(result.warnings.filter(warning=>warning.code==='ELEMENT_RASTERIZED').length,3);
  assert.deepEqual([...zip.files.keys()].filter(name=>name.startsWith('ppt/media/')),['ppt/media/image1.png','ppt/media/image2.png','ppt/media/image3.png']);
});

test('whole-image mode exports every slide as one picture and captures input before asynchronous rendering', async () => {
  const slides=[page([text()]),page([shape()])],captured=[];let release;
  const gate=new Promise(resolve=>{release=resolve;});
  const pending=createPptx({slides,mode:'image',renderSlide:async design=>{await gate;captured.push(structuredClone(design));return png;}});
  slides[0].items[0].text='호출 후 변경';release();const result=await pending,zip=unzip(result.bytes);
  assert.equal(captured[0].items[0].text,'첫째 줄\n둘째 & <줄>');
  for(let i=1;i<=2;i++){const slide=zip.xml(`ppt/slides/slide${i}.xml`);assert.equal((slide.match(/<p:pic>/g)||[]).length,1);assert.doesNotMatch(slide,/<p:sp>/);}
});

test('photos remain native pictures with cover crop, rotation and opacity', async () => {
  const previous=globalThis.Image;
  globalThis.Image=class{naturalWidth=20;naturalHeight=10;set src(value){queueMicrotask(()=>this.onload());}};
  try{
    const url=`data:image/png;base64,${Buffer.from(await png.arrayBuffer()).toString('base64')}`;
    const result=await createPptx({slides:[page([{id:'ephoto001',t:'image',url,x:50,y:50,w:20,h:20,rot:10,op:60,mask:'none'}])],aspect:1});
    const slide=unzip(result.bytes).xml('ppt/slides/slide1.xml');
    assert.match(slide,/<p:pic>/);assert.match(slide,/<a:srcRect l="25000" r="25000"\/>/);assert.match(slide,/rot="600000"/);assert.match(slide,/a:alphaModFix amt="60000"/);
    assert.equal(result.warnings.length,0);
  }finally{if(previous===undefined)delete globalThis.Image;else globalThis.Image=previous;}
});

test('font names use imported family first and never emit internal CSS aliases as PowerPoint fonts',async()=>{
  configure({fonts:[{id:'testfont',name:'테스트 글꼴',family:'mc-testfont'},{id:'exportfont',name:'보이는 이름',family:'mc-exportfont',exportFamily:'Do Hyeon'}]});
  try{
    const result=await createPptx({slides:[page([text({typeface:undefined,font:'testfont'})])]});
    const slide=unzip(result.bytes).xml('ppt/slides/slide1.xml');assert.match(slide,/typeface="테스트 글꼴"/);assert.doesNotMatch(slide,/mc-testfont/);
    assert.ok(result.warnings.some(warning=>warning.font==='테스트 글꼴'));
    const known=await createPptx({slides:[page([text({typeface:undefined,font:'exportfont'})])]});
    assert.match(unzip(known.bytes).xml('ppt/slides/slide1.xml'),/typeface="Do Hyeon"/);
    assert.equal(known.warnings.some(warning=>warning.code==='FONT_NAME_INFERRED'),false);
  }finally{configure({fonts:[]});}
});

test('authored spaces are preserved and actual motion fields produce explicit static warnings',async()=>{
  const original={...page([text({text:'  앞  공백\n\n뒤  ',an:'fade'})]),pa:'wave',tr:'fade'};
  const result=await createPptx({slides:[original]}),slide=unzip(result.bytes).xml('ppt/slides/slide1.xml');
  assert.ok(slide.includes('xml:space="preserve">  앞  공백</a:t>'));assert.ok(slide.includes('xml:space="preserve">뒤  </a:t>'));
  assert.ok(result.warnings.some(warning=>warning.code==='STATIC_EXPORT'));
});

test('200 slides export in original order; empty or 201-slide input is rejected',async()=>{
  const slides=Array.from({length:200},(_,index)=>page([text({text:`쪽 ${index+1}`})]));
  const result=await createPptx({slides}),zip=unzip(result.bytes);
  assert.equal(result.slideCount,200);assert.match(zip.xml('ppt/slides/slide200.xml'),/쪽 200/);
  assert.equal((zip.xml('ppt/presentation.xml').match(/<p:sldId /g)||[]).length,200);
  for(const invalid of [[],Array(201).fill(page([]))])await assert.rejects(createPptx({slides:invalid}),code('SLIDE_LIMIT'));
});

test('legacy ratio sizes fall back to useful physical dimensions; invalid sizes and modes reject',async()=>{
  const result=await createPptx({slides:[page([])],size:{width:16,height:9,unit:'px'}});
  assert.deepEqual(result.size,{width:9144000,height:5143500,unit:'emu'});
  await assert.rejects(createPptx({slides:[page([])],mode:'unknown'}),code('INVALID_MODE'));
  for(const size of [{width:0,height:9,unit:'px'},{width:NaN,height:9,unit:'px'},{width:10,height:1,unit:'pt'},{width:10,height:10,unit:'pt'},{width:914399,height:914400,unit:'emu'},{width:60000000,height:40000000,unit:'emu'}])await assert.rejects(createPptx({slides:[page([])],size}),code('INVALID_SLIDE_SIZE'));
  for(const edge of [914400,51206400])assert.deepEqual((await createPptx({slides:[page([])],size:{width:edge,height:edge,unit:'emu'}})).size,{width:edge,height:edge,unit:'emu'});
});

test('native fonts below 1pt reject without enlarging the input while whole-image export remains available',async()=>{
  const slides=[page([text({size:.1})])],before=structuredClone(slides),size={width:960,height:540,unit:'px'};
  await assert.rejects(createPptx({slides,size}),error=>error.code==='UNSUPPORTED_FONT_SIZE'&&error.details.elementId==='etext001'&&Math.abs(error.details.pointSize-.72)<1e-9);
  assert.deepEqual(slides,before);
  const image=await createPptx({slides,size,mode:'image',renderSlide:async()=>png});
  assert.equal(image.slideCount,1);assert.match(unzip(image.bytes).xml('ppt/slides/slide1.xml'),/<p:pic>/);assert.deepEqual(slides,before);
  await assert.rejects(createPptx({slides,size:{width:10,height:10,unit:'pt'},mode:'image',renderSlide:async()=>png}),code('INVALID_SLIDE_SIZE'));
  const exact=await createPptx({slides:[page([text({size:1})])],size:{width:100,height:100,unit:'pt'}});
  assert.match(unzip(exact.bytes).xml('ppt/slides/slide1.xml'),/sz="100"/);
});

test('cancel before or between rendering never returns a partial presentation',async()=>{
  const before=new AbortController();before.abort();await assert.rejects(createPptx({slides:[page([])],signal:before.signal}),{name:'AbortError'});
  const during=new AbortController();let rendered=0,progress=0;
  await assert.rejects(createPptx({slides:[page([]),page([])],mode:'image',signal:during.signal,renderSlide:async()=>{rendered++;during.abort();return png;},onProgress:()=>progress++}),{name:'AbortError'});
  assert.equal(rendered,1);assert.equal(progress,0);
  const pendingController=new AbortController();let release,started;
  const began=new Promise(resolve=>{started=resolve;});
  const pending=createPptx({slides:[page([])],mode:'image',signal:pendingController.signal,renderSlide:()=>{started();return new Promise(resolve=>{release=resolve;});}});
  await began;pendingController.abort();await assert.rejects(pending,{name:'AbortError'});release(png);
});

test('missing or corrupt raster, renderer errors and oversized output fail without dropping elements',async()=>{
  const slides=[page([{id:'eemoji001',t:'emoji',ch:'🌻',x:50,y:50,w:20}])];
  for(const invalid of [null,new Blob([],{type:'image/png'}),new Blob(['not a PNG'],{type:'image/png'}),new Blob(['html'],{type:'text/html'})])await assert.rejects(createPptx({slides,renderItem:async()=>invalid}),code('INVALID_RASTER'));
  const original=new Error('renderer failed');await assert.rejects(createPptx({slides,renderItem:async()=>{throw original;}}),error=>error===original);
  class Oversized extends Blob{get size(){return PPTX_MAX_BYTES+1;}}
  await assert.rejects(createPptx({slides,renderItem:async()=>new Oversized([],{type:'image/png'})}),code('PPTX_SIZE_LIMIT'));
  await assert.rejects(createPptx({slides:[page([{t:'unknown',id:'eunknown001'}])]}),code('UNSUPPORTED_ELEMENT'));
});
