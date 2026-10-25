import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Worker as NodeWorker} from 'node:worker_threads';
import {zipSync,unzipSync} from 'fflate';
import {inspectPptx,convertPptx,PPTX_MIME,PPTX_LIMITS} from '../app/pptx-import/converter.js';
import {createPptxClient} from '../app/pptx-import/client.js';
import {getImportFontRegistry,createImportFontServices,createFontPlan,applyFontPlan,loadImportFontAssets} from '../app/pptx-import/fonts.js';
import {importConvertedDocument} from '../app/import-document.js';
import {migrateRecord} from '../app/designs.js';
import {cleanDesign} from '../src/model.js';
import {buildPptxImport} from '../tools/build-pptx-import.mjs';
import {bulletChar,autoNumber} from '../app/pptx-import/bullets.js';

const enc=new TextEncoder(),dec=new TextDecoder();
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const fixture=name=>new URL('../tools/fixtures/pptx/'+name,import.meta.url);
const fileOf=bytes=>new File([bytes],'self-authored.pptx',{type:PPTX_MIME});
const baseBytes=()=>readFile(fixture('self-authored-4x3.pptx'));
const repack=parts=>fileOf(zipSync(parts));
const texts=document=>document.slides.map(page=>page.items.filter(item=>item.t==='text').map(item=>item.text));
const identity=document=>document.slides.map(page=>({id:page.id,source:page.source,assetRefs:page.assetRefs,items:page.items.map(item=>({id:item.id,source:item.source,assetRefs:item.assetRefs}))}));

test('self-authored PPTX bytes convert to stable editable identities, text, dimensions and provenance through clean/save/reopen',async()=>{
 const bytes=await baseBytes(),before=Buffer.from(bytes),inspection=await inspectPptx(fileOf(bytes));
 const first=await convertPptx(fileOf(bytes)),again=await convertPptx(fileOf(bytes));
 const expected=JSON.parse(await readFile(fixture('self-authored-4x3.expected.json'),'utf8'));
 assert.equal(inspection.pageCount,2);assert.ok(inspection.pages.every(page=>page.canImport));
 assert.deepEqual(texts(first.document),texts(expected.document));assert.deepEqual(identity(first.document),identity(again.document));
 assert.deepEqual(first.document.originalSize,{width:9144000,height:6858000,unit:'emu'});
 assert.equal(first.document.size.width/first.document.size.height,4/3);
 assert.equal(first.document.source.sha256,digest(bytes));assert.equal(first.document.assets[0].sha256,digest(bytes));
 assert.deepEqual(importConvertedDocument(first).record,first.document);
 let reopened=first.document;
 for(let count=0;count<3;count++)reopened=migrateRecord(JSON.parse(JSON.stringify({...reopened,slides:reopened.slides.map(cleanDesign)})));
 assert.deepEqual(texts(reopened),texts(first.document));assert.deepEqual(identity(reopened),identity(first.document));
 assert.deepEqual(reopened.originalSize,first.document.originalSize);assert.deepEqual(reopened.assets,first.document.assets);
 const reversed=await convertPptx(fileOf(bytes),{selectedPages:[2,1]});
 assert.deepEqual(reversed.document.slides.map(page=>page.id),[first.document.slides[1].id,first.document.slides[0].id]);
 assert.deepEqual(texts(reversed.document),texts(first.document).toReversed());assert.deepEqual(bytes,before);
});

test('inspection preserves long authored text and all 21 original pages without silently truncating editable document limits',async()=>{
 const longBytes=await readFile(fixture('self-authored-long-text.pptx')),long=await convertPptx(fileOf(longBytes));
 const expected=JSON.parse(await readFile(fixture('self-authored-long-text.expected.json'),'utf8'));
 assert.deepEqual(texts(long.document),texts(expected.document));assert.ok(texts(long.document)[0][0].length>120);
 const many=fileOf(await readFile(fixture('self-authored-21-pages.pptx'))),inspection=await inspectPptx(many);
 assert.equal(inspection.pageCount,21);assert.equal(inspection.pages.length,21);
 await assert.rejects(convertPptx(many),{code:'PAGE_LIMIT'});
 const tail=await convertPptx(many,{selectedPages:[21]});assert.deepEqual(tail.report.selectedPages,[21]);assert.equal(tail.document.slides[0].source.pageNumber,21);
});

test('ZIP traversal, active content, encrypted package markers and external XML entities are rejected before a document can be stored',async()=>{
 const original=await baseBytes(),make=()=>unzipSync(original);
 for(const [path,code]of [['../outside.xml','UNSAFE_ZIP_PATH'],['ppt/vbaProject.bin','UNSUPPORTED_ACTIVE_CONTENT'],['EncryptedPackage','UNSUPPORTED_ACTIVE_CONTENT']]){
  const parts=make();parts[path]=enc.encode('self-authored rejection fixture');await assert.rejects(inspectPptx(repack(parts)),{code});
 }
 const parts=make();parts['ppt/presentation.xml']=enc.encode(dec.decode(parts['ppt/presentation.xml']).replace(/(<\?xml[^?]*\?>)/,'$1<!DOCTYPE p:presentation [<!ENTITY external SYSTEM "https://example.invalid/private">]>'));
 await assert.rejects(inspectPptx(repack(parts)),{code:'UNSAFE_XML'});assert.equal(digest(original),digest(await baseBytes()));
});

test('external image relationships block their affected page while safe pages remain selectable and external hyperlinks are omitted',async()=>{
 const original=await baseBytes(),parts=unzipSync(original),name='ppt/slides/_rels/slide1.xml.rels';
 const external=(type,id)=>`<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="https://example.invalid/resource" TargetMode="External"/>`;
 parts[name]=enc.encode(dec.decode(parts[name]).replace('</Relationships>',external('image','externalImage')+'</Relationships>'));
 const inspection=await inspectPptx(repack(parts));assert.equal(inspection.pages[0].canImport,false);assert.equal(inspection.pages[1].canImport,true);
 assert.ok(inspection.pages[0].warnings.some(warning=>warning.code==='EXTERNAL_RESOURCE'));
 await assert.rejects(convertPptx(repack(parts),{selectedPages:[1]}),{code:'UNSUPPORTED_SLIDES'});
 assert.deepEqual((await convertPptx(repack(parts),{selectedPages:[2]})).report.selectedPages,[2]);
 const links=unzipSync(original);links[name]=enc.encode(dec.decode(links[name]).replace('</Relationships>',external('hyperlink','externalLink')+'</Relationships>'));
 const linked=await inspectPptx(repack(links));assert.equal(linked.pages[0].canImport,true);assert.ok(linked.pages[0].warnings.some(warning=>warning.code==='EXTERNAL_LINK_OMITTED'));
});

test('Canva-style packages with Microsoft relationship kinds, repeated Ids and missing extras still import',async()=>{
 const original=await baseBytes(),parts=unzipSync(original),slideRels='ppt/slides/_rels/slide1.xml.rels',rootRels='_rels/.rels';
 const ms=(kind,id,target)=>`<Relationship Id="${id}" Type="http://schemas.microsoft.com/office/2007/relationships/${kind}" Target="${target}"/>`;
 const rels=dec.decode(parts[slideRels]),firstId=rels.match(/Id="([^"]+)"/)[1];
 parts[slideRels]=enc.encode(rels.replace('</Relationships>',ms('hdphoto','canvaPhoto','../media/missing.wdp')+`<Relationship Id="${firstId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.invalid/" TargetMode="External"/>`+'</Relationships>'));
 parts[rootRels]=enc.encode(dec.decode(parts[rootRels]).replace('</Relationships>','<Relationship Id="canvaThumb" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/thumbnail" Target="docProps/missing.jpeg"/>'+ms('../2011/relationships/webextensiontaskpanes','canvaExt','word/missing.xml').replace('2007/relationships/../2011/','2011/')+'</Relationships>'));
 const inspection=await inspectPptx(repack(parts));assert.equal(inspection.pageCount,2);assert.ok(inspection.pages.every(page=>page.canImport));
 assert.deepEqual(texts((await convertPptx(repack(parts))).document),texts((await convertPptx(fileOf(original))).document));
 const media=unzipSync(original);media[slideRels]=enc.encode(dec.decode(media[slideRels]).replace('</Relationships>',ms('media','canvaVideo','../media/clip.mp4')+'</Relationships>'));media['ppt/media/clip.mp4']=new Uint8Array(8);
 const withMedia=await inspectPptx(repack(media));assert.equal(withMedia.pages[0].canImport,true,'a media file that no picture uses does not block the page');assert.equal(withMedia.pages[1].canImport,true);
 const broken=unzipSync(original);broken[slideRels]=enc.encode(dec.decode(broken[slideRels]).replace('</Relationships>','<Relationship Id="bad" Type="not a uri" Target="x.xml"/></Relationships>'));
 await assert.rejects(inspectPptx(repack(broken)),{code:'INVALID_RELATIONSHIP'});
});

test('default OFL font plans apply to the whole PPT or original page numbers and undo from the intact baseline',async()=>{
 const converted=await convertPptx(fileOf(await baseBytes())),baseline=converted.document,before=structuredClone(baseline);
 const sources=Object.fromEntries(converted.report.fontUsage.map(usage=>[usage.elementId,usage.originalName]));
 const names=[...new Set(Object.values(sources))],all=Object.fromEntries(names.map(name=>[name,'gowun-dodum']));
 const plan=createFontPlan({mappings:all,rules:[{scopePages:[2],mappings:Object.fromEntries(names.map(name=>[name,'do-hyeon']))}],sourceNamesByElementId:sources});
 const changed=applyFontPlan(baseline,plan);
 assert.deepEqual(changed.slides.map(page=>page.items.find(item=>item.t==='text').font),['gowun-dodum','do-hyeon']);
 assert.deepEqual(texts(changed),texts(baseline));assert.deepEqual(identity(changed),identity(baseline));assert.deepEqual(changed.assets,baseline.assets);assert.deepEqual(changed.originalSize,baseline.originalSize);
 assert.deepEqual(applyFontPlan(baseline,{}),baseline);assert.deepEqual(baseline,before);
 const registry=getImportFontRegistry();assert.equal(registry.length,15);assert.ok(registry.every(font=>!font.id.startsWith('gai-')));
 const loaded=await loadImportFontAssets(plan,{fetchImpl:async url=>new Response(await readFile(new URL(url)))});
 assert.deepEqual(loaded.fonts.map(font=>font.id).sort(),['do-hyeon','gowun-dodum']);assert.ok(loaded.licenseNotices.every(notice=>/SIL OPEN FONT LICENSE/i.test(notice.text)));
});

test('host registry injection is isolated, preserves host IDs and refuses unknown targets, unsafe CSS families and off-origin font loads',async()=>{
 const entry={...getImportFontRegistry()[0],id:'host-title',family:'mc-host-title',aliases:['Host Title']};
 const host=createImportFontServices({registry:[entry]}),plan=host.createFontPlan({mappings:{Original:'host-title'}});
 assert.equal(host.resolveImportFontReplacement('Original',plan,1).id,'host-title');
 assert.throws(()=>createFontPlan(plan),{code:'UNKNOWN_FONT_TARGET'});
 entry.aliases.push('mutable caller alias');assert.ok(!host.getImportFontRegistry()[0].aliases.includes('mutable caller alias'));
 assert.throws(()=>createImportFontServices({registry:[{...entry,family:'unsafe";font-size:99px'}]}),{code:'INVALID_FONT_REGISTRY'});
 const remote=createImportFontServices({registry:[{...entry,fontUrl:'https://example.invalid/font.woff2'}]});
 let requests=0;await assert.rejects(remote.loadImportFontAssets(plan,{fetchImpl:()=>{requests++;throw Error('must not fetch');}}),{code:'FONT_ASSET_ORIGIN'});assert.equal(requests,0);
 const large=createImportFontServices({registry:Array.from({length:26},(_,index)=>({...entry,id:'host-'+index,family:'mc-host-'+index}))});
 const many=large.createFontPlan({mappings:Object.fromEntries(Array.from({length:26},(_,index)=>['source-'+index,'host-'+index]))});
 await assert.rejects(large.loadImportFontAssets(many,{fetchImpl:()=>{requests++;throw Error('must not fetch');}}),{code:'FONT_ASSET_SIZE'});assert.equal(requests,0);
});

test('checked-in worker converts real PPTX bytes in an isolated worker with no bare imports and terminates after the request',async()=>{
 const url=new URL('../app/pptx-import/vendor/pptx-worker.js',import.meta.url).href;
 const worker=new NodeWorker(`const {parentPort}=require('node:worker_threads');globalThis.self={addEventListener:(name,handler)=>parentPort.on(name,data=>handler({data})),postMessage:data=>parentPort.postMessage(data)};import(${JSON.stringify(url)});`,{eval:true});
 try{
  const result=await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error('worker-timeout')),5000);
   worker.on('error',error=>{clearTimeout(timer);reject(error);});
   worker.on('message',data=>{if(data.type==='error'){clearTimeout(timer);reject(Object.assign(Error('worker-conversion'),{code:data.error.code}));}if(data.type==='result'){clearTimeout(timer);resolve(data.result);}});
   baseBytes().then(bytes=>worker.postMessage({id:'self-authored-worker',method:'convert',file:fileOf(bytes),options:{selectedPages:[2,1]}}),reject);
  });
  assert.deepEqual(result.document.slides.map(page=>page.source.pageNumber),[2,1]);assert.equal(result.document.source.sha256,digest(await baseBytes()));
 }finally{await worker.terminate();}
});

test('worker client cancellation ends its own CPU job and leaves another conversion independent',async()=>{
 const workers=[];
 const client=createPptxClient({workerFactory:()=>{const events={};const worker={events,terminated:false,addEventListener:(name,fn)=>events[name]=fn,postMessage:message=>worker.message=message,terminate:()=>worker.terminated=true};workers.push(worker);return worker;}});
 const abort=new AbortController(),first=client.inspectPptx(new Blob(['self']),{signal:abort.signal}),second=client.inspectPptx(new Blob(['other']));
 abort.abort();await assert.rejects(first,{code:'CANCELLED'});assert.equal(workers[0].terminated,true);assert.equal(workers[1].terminated,false);
 workers[1].events.message({data:{id:workers[1].message.id,type:'result',result:{pageCount:2}}});assert.deepEqual(await second,{pageCount:2});assert.equal(workers[1].terminated,true);
});

test('static bundles rebuild byte-for-byte with package/source hashes, intact CSP and all distribution licenses',async()=>{
 const result=await buildPptxImport({check:true});assert.equal(result.rendererVersion,'1.3.0');assert.ok(result.workerBytes<500000);assert.ok(result.previewBytes<2*1024*1024);
 const root=new URL('../app/pptx-import/vendor/',import.meta.url),manifest=JSON.parse(await readFile(new URL('BUILD.json',root),'utf8'));
 assert.equal(manifest.packages.fflate,'0.8.3');assert.equal(manifest.packages['@xmldom/xmldom'],'0.8.15');assert.equal(manifest.renderer.version,'1.3.0');
 for(const [name,entry]of Object.entries(manifest.files)){const bytes=await readFile(new URL(name,root));assert.equal(bytes.length,entry.bytes);assert.equal(digest(bytes),entry.sha256);}
 const html=await readFile(new URL('preview-frame.html',root),'utf8');
 for(const directive of ["default-src 'none'","connect-src 'none'","frame-src 'none'","media-src 'none'","object-src 'none'","base-uri 'none'","form-action 'none'"])assert.ok(html.includes(directive));
 const script=html.match(/<script>([\s\S]*)<\/script>/)?.[1];assert.ok(script);assert.ok(html.includes("script-src 'sha256-"+createHash('sha256').update(script).digest('base64')+"'"));
 assert.equal(PPTX_LIMITS.zipBytes,50*1024*1024);assert.equal(PPTX_LIMITS.xmlDepth,64);assert.equal(PPTX_LIMITS.documentBytes,524288);
});

test('a font missing on this device never fails a slide image, and browser errors never reach the teacher raw',async()=>{
 // Regression: on a device without the 학교안심 fonts installed, document.fonts.load rejected with
 // "NetworkError: A network error occurred." and every image-mode slide failed to save.
 const source=await readFile(new URL('../app/pptx-import/preview-frame.js',import.meta.url),'utf8');
 assert.match(source,/await Promise\.allSettled\(\['학교안심 이어달리기 L','학교안심 바른돋움 B'\]\.map\(name=>document\.fonts\.load\(/);
 assert.match(source,/const fontFallback=\(await Promise\.allSettled\(loads\.values\(\)\)\)\.some\(load=>load\.status==='rejected'\)/);
 assert.doesNotMatch(source,/await Promise\.all\(\[?'학교안심|await Promise\.all\(loads\.values\(\)\)/);
 assert.match(source,/const own=typeof error\?\.code==='string';respond\('error',\{error:\{code:own\?error\.code:'PREVIEW_FAILED',message:own\?error\.message:'PPT의 일부 표현을 미리보기 도구에서 그리지 못했어요\.'\}\}\);/);
});

test('list markers stay visible: symbol-font bullets become their Unicode characters and numbers are counted',async()=>{
 // Regression: a teacher's PPT used Wingdings "l" (●) and "-" bullets; the editable import dropped them
 // and the PPT preview drew a literal "l" on devices without Wingdings.
 assert.equal(bulletChar('l','Wingdings'),'●');assert.equal(bulletChar('\uf06c',''),'●');assert.equal(bulletChar('\u00b7','Symbol'),'•');
 assert.equal(bulletChar('Ø','Wingdings'),'➢');assert.equal(bulletChar('ü','Wingdings'),'✓');assert.equal(bulletChar('k','Wingdings'),'•','unknown symbols fall back to a bullet');
 assert.equal(bulletChar('-',''),'-');assert.equal(bulletChar('l','Arial'),'l','a letter in a text font stays a letter');
 assert.deepEqual([autoNumber('arabicPeriod',3),autoNumber('alphaLcParenR',2),autoNumber('romanUcPeriod',4),autoNumber('arabicParenBoth',1),autoNumber('circleNumDbPlain',2)],['3.','b)','IV.','(1)','②']);
 const parts=unzipSync(await baseBytes()),name='ppt/slides/slide1.xml';
 const para=(pPr,text)=>`<a:p>${pPr}<a:r><a:rPr lang="ko-KR" sz="2400"/><a:t>${text}</a:t></a:r></a:p>`;
 const body=[
  para('<a:pPr marL="685800" indent="-685800"><a:buFont typeface="Wingdings" pitchFamily="2" charset="2"/><a:buChar char="l"/></a:pPr>','1997년 연구회 구성'),
  para('<a:pPr marL="457200" indent="-457200"><a:buFontTx/><a:buChar char="-"/></a:pPr>','초등교사 모임'),
  '<a:p><a:pPr><a:buFontTx/><a:buChar char="-"/></a:pPr><a:endParaRPr lang="ko-KR"/></a:p>',
  para('<a:pPr><a:buAutoNum type="arabicPeriod"/></a:pPr>','첫째'),para('<a:pPr><a:buAutoNum type="arabicPeriod"/></a:pPr>','둘째'),
  para('<a:pPr><a:buNone/></a:pPr>','기호 없음'),para('','그냥 문단')
 ].join('');
 parts[name]=enc.encode(dec.decode(parts[name]).replace(/<a:p>.*<\/a:p>/s,body));
 const converted=await convertPptx(repack(parts),{selectedPages:[1]});
 assert.equal(texts(converted.document)[0][0],'● 1997년 연구회 구성\n- 초등교사 모임\n\n1. 첫째\n2. 둘째\n기호 없음\n그냥 문단');
 assert.ok(converted.report.warnings.some(warning=>warning.code==='BULLETS_AS_TEXT'));
 assert.ok(!converted.report.warnings.some(warning=>warning.code==='BULLETS_OMITTED'));
});

test('the PPT preview frame swaps symbol-font bullets before drawing',async()=>{
 const source=await readFile(new URL('../app/pptx-import/preview-frame.js',import.meta.url),'utf8');
 assert.match(source,/import \{bulletChar\} from '\.\/bullets\.js';/);
 assert.match(source,/if\(node\.localName==='buChar'\)\{[^\n]*shown=bulletChar\(char,face\);/);
});

test('video slides: a slide-filling video becomes that slide\'s background video (poster dropped later), a small one stays as its poster, sound keeps only its icon',async()=>{
 // Regression: page 5 of a teacher's camp PPT was a full-slide video on black; it could only come in as a black slide image.
 const parts=unzipSync(await baseBytes()),name='ppt/slides/slide1.xml',rels='ppt/slides/_rels/slide1.xml.rels';
 const poster=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAIAAAA7ljmRAAAAEElEQVR4nGNocFCAIwacHADRZwqBZaYHGAAAAABJRU5ErkJggg==','base64'));
 parts['ppt/media/poster.png']=poster;parts['ppt/media/clip.mp4']=new Uint8Array([0,0,0,24,102,116,121,112,109,112,52,50]);parts['ppt/media/sound.mp3']=new Uint8Array(16);
 const rel=(id,type,target)=>`<Relationship Id="${id}" Type="${type}" Target="${target}"/>`,R='http://schemas.openxmlformats.org/officeDocument/2006/relationships/',M='http://schemas.microsoft.com/office/2007/relationships/media';
 parts[rels]=enc.encode(dec.decode(parts[rels]).replace('</Relationships>',rel('rP',R+'image','../media/poster.png')+rel('rV',R+'video','../media/clip.mp4')+rel('rM',M,'../media/clip.mp4')+rel('rA',R+'audio','../media/sound.mp3')+'</Relationships>'));
 const pic=(id,{x,y,cx,cy},nv)=>`<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="영상 ${id}"/><p:cNvPicPr/><p:nvPr>${nv}</p:nvPr></p:nvPicPr><p:blipFill><a:blip r:embed="rP"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
 const video='<a:videoFile r:link="rV"/><p:extLst><p:ext uri="{DAA4B4D4-6D71-4841-9C94-3DE7FCFB9230}"><p14:media xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main" r:embed="rM"/></p:ext></p:extLst>';
 const full=pic(801,{x:0,y:0,cx:9144000,cy:6858000},video),small=pic(802,{x:914400,y:914400,cx:1828800,cy:1371600},video),sound=pic(803,{x:0,y:0,cx:457200,cy:342900},'<a:audioFile r:link="rA"/>');
 const slide=dec.decode(parts[name]),slide2='ppt/slides/slide2.xml';
 parts[name]=enc.encode(slide.replace('</p:spTree>',full+sound+'</p:spTree>'));
 const rels2='ppt/slides/_rels/slide2.xml.rels';parts[rels2]=enc.encode(dec.decode(parts[rels2]).replace('</Relationships>',rel('rP',R+'image','../media/poster.png')+rel('rV',R+'video','../media/clip.mp4')+rel('rM',M,'../media/clip.mp4')+'</Relationships>'));
 parts[slide2]=enc.encode(dec.decode(parts[slide2]).replace('</p:spTree>',small+'</p:spTree>'));
 const inspection=await inspectPptx(repack(parts));
 assert.deepEqual(inspection.pages.map(p=>p.canImport),[true,true]);
 assert.equal(inspection.pages[0].videos,1);assert.equal(Object.hasOwn(inspection.pages[0],'media'),false,'inspection carries no video bytes');
 const converted=await convertPptx(repack(parts));
 assert.equal(converted.media.length,1);
 const [clip]=converted.media,first=converted.document.slides[0];
 assert.deepEqual([clip.pageNumber,clip.mime,clip.bytes.length],[1,'video/mp4',12]);
 assert.ok(first.items.some(i=>i.id===clip.posterId&&i.t==='image'),'the poster is kept until the video is stored');
 assert.equal(first.items.filter(i=>i.source?.objectId==='803').length,1,'the sound icon stays as a picture');
 const codes=n=>converted.report.warnings.filter(w=>w.pageNumber===n).map(w=>w.code);
 assert.ok(codes(1).includes('VIDEO_AS_SCENE')&&codes(1).includes('AUDIO_OMITTED'));
 assert.ok(codes(2).includes('VIDEO_AS_POSTER'));
 assert.equal(converted.document.slides[1].items.filter(i=>i.source?.objectId==='802').length,1);
 assert.equal(clip.auto,undefined,'without PowerPoint timing the video waits for a click');
 // PowerPoint "자동으로": the playFrom command sits in a group that starts with the slide (evt="onBegin").
 const timing=`<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst><p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst><p:par><p:cTn id="3" fill="hold"><p:stCondLst><p:cond delay="indefinite"/><p:cond evt="onBegin" delay="0"><p:tn val="2"/></p:cond></p:stCondLst><p:childTnLst><p:par><p:cTn id="4" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst><p:par><p:cTn id="5" presetID="1" presetClass="mediacall" nodeType="afterEffect"><p:childTnLst><p:cmd type="call" cmd="playFrom(0.0)"><p:cBhvr><p:cTn id="6" dur="1" fill="hold"/><p:tgtEl><p:spTgt spid="801"/></p:tgtEl></p:cBhvr></p:cmd></p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:seq></p:childTnLst></p:cTn></p:par></p:tnLst></p:timing>`;
 parts[name]=enc.encode(dec.decode(parts[name]).replace('</p:cSld>','</p:cSld>'+timing));
 assert.equal((await convertPptx(repack(parts),{selectedPages:[1]})).media[0].auto,true);
 parts[name]=enc.encode(dec.decode(parts[name]).replace('<p:cond evt="onBegin" delay="0"><p:tn val="2"/></p:cond>',''));
 assert.equal((await convertPptx(repack(parts),{selectedPages:[1]})).media[0].auto,undefined,'"클릭할 때" stays a click');
});

test('tables become editable cells: one box per cell with its fill and border, its text in place, merged cells as one, covered cells skipped',async()=>{
 // Regression: a teacher's camp PPT had 9 schedule/roster tables; every table slide fell back to a slide image and the import stopped.
 const parts=unzipSync(await baseBytes()),name='ppt/slides/slide1.xml';
 const line='<a:solidFill><a:srgbClr val="DDDCE5"/></a:solidFill>';
 const cell=(text,fill,extra='',attrs='')=>`<a:tc${attrs}><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:pPr algn="ctr"/><a:r><a:rPr lang="ko-KR" sz="1800" b="1"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:rPr><a:t>${text}</a:t></a:r></a:p></a:txBody><a:tcPr anchor="ctr"><a:lnL w="9525">${line}</a:lnL><a:lnB w="9525">${line}</a:lnB>${fill?`<a:solidFill><a:srgbClr val="${fill}"/></a:solidFill>`:''}${extra}</a:tcPr></a:tc>`;
 const table=`<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="900" name="표"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="914400" y="914400"/><a:ext cx="3657600" cy="1828800"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr/><a:tblGrid><a:gridCol w="1219200"/><a:gridCol w="2438400"/></a:tblGrid>`
  +`<a:tr h="914400">${cell('시간','767491')}${cell('프로그램','767491')}</a:tr>`
  +`<a:tr h="914400">${cell('개회식 · 점심','F4F2F7','',' gridSpan="2"')}<a:tc hMerge="1"><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="ko-KR"/></a:p></a:txBody><a:tcPr/></a:tc></a:tr></a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
 parts[name]=enc.encode(dec.decode(parts[name]).replace('</p:spTree>',table+'</p:spTree>'));
 const converted=await convertPptx(repack(parts),{selectedPages:[1]}),items=converted.document.slides[0].items;
 const mine=items.filter(item=>item.source?.objectId==='900'),boxes=mine.filter(i=>i.t==='shape'),words=mine.filter(i=>i.t==='text');
 assert.equal(boxes.length,3,'two header cells and one merged cell; the covered cell is skipped');
 assert.deepEqual(words.map(w=>w.text),['시간','프로그램','개회식 · 점심']);
 assert.deepEqual(boxes.map(b=>b.color),['#767491','#767491','#f4f2f7']);
 assert.ok(boxes.every(b=>b.lc==='#dddce5'&&b.line>0),'cell borders keep their colour');
 const [first,second,merged]=boxes;
 assert.ok(Math.abs(merged.w-(first.w+second.w))<0.01,'the merged cell spans both columns');
 assert.ok(Math.abs(second.w-first.w*2)<0.01,'column widths follow the grid');
 assert.ok(Math.abs(merged.y-first.y-first.h)<0.01,'rows stack');
 assert.deepEqual(words.map(w=>[w.align,w.valign,w.bold,w.color]),[['c','middle',true,'#ffffff'],['c','middle',true,'#ffffff'],['c','middle',true,'#ffffff']]);
 assert.ok(!converted.report.warnings.some(w=>w.code==='UNSUPPORTED_ELEMENT'));
 assert.ok(converted.report.warnings.some(w=>w.code==='TABLE_AS_SHAPES'));
 // Survives cleaning (the editor's limits for imported slides)
 assert.equal(cleanDesign(converted.document.slides[0],{keepSpaces:true}).items.filter(i=>i.source?.objectId==='900').length,6);
 // A chart frame is still refused (only the page, not the whole file).
 const chart=unzipSync(await baseBytes());chart[name]=enc.encode(dec.decode(chart[name]).replace('</p:spTree>','<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="901" name="차트"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="0" y="0"/><a:ext cx="100" cy="100"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"/></a:graphic></p:graphicFrame></p:spTree>'));
 const inspection=await inspectPptx(repack(chart));
 assert.equal(inspection.pages[0].canImport,false);assert.ok(inspection.pages[0].warnings.some(w=>w.code==='UNSUPPORTED_ELEMENT'));
});

test('rich text: a word in another weight, slant, underline or colour comes in as a styled range of the same text box',async()=>{
 // Regression: "[선택]" in a camp schedule cell was red and bold, but the whole cell came in with the first letter's style only.
 const parts=unzipSync(await baseBytes()),name='ppt/slides/slide1.xml';
 const r=(rPr,text)=>`<a:r><a:rPr lang="ko-KR" sz="2400"${rPr}</a:r>`.replace('</a:r>',`<a:t>${text}</a:t></a:r>`);
 const red='><a:solidFill><a:srgbClr val="E03131"/></a:solidFill></a:rPr>';
 const body=`<a:p><a:pPr><a:buFontTx/><a:buChar char="-"/></a:pPr>${r(' b="1"'+red,'[선택]')}${r('/>',' 도전! ')}${r(' i="1"/>','우리')}<a:br><a:rPr lang="ko-KR"/></a:br>${r(' u="sng"/>','아침')}</a:p><a:p>${r('/>','휴식')}</a:p>`;
 parts[name]=enc.encode(dec.decode(parts[name]).replace(/<a:p>.*<\/a:p>/s,body));
 const converted=await convertPptx(repack(parts),{selectedPages:[1]});
 const item=converted.document.slides[0].items.find(i=>i.t==='text');
 assert.equal(item.text,'- [선택] 도전! 우리\n아침\n휴식');
 assert.equal(item.bold,true,'the box takes the first piece');
 const slice=x=>x.runs.map(run=>[x.text.slice(run.s,run.e),run]);
 const runs=Object.fromEntries(slice(cleanDesign({items:[item]},{keepSpaces:true}).items[0]).map(([text,run])=>[text,Object.fromEntries(Object.entries(run).filter(([k])=>!['s','e'].includes(k)))]));
 assert.deepEqual(runs,{' 도전! ':{b:false,c:'#222222'},'우리':{b:false,i:true,c:'#222222'},'아침':{b:false,u:true,c:'#222222'},'휴식':{b:false,c:'#222222'}},'"[선택]" keeps the box style (bold, red); the rest are plain and in the default colour');
 assert.equal(cleanDesign({items:[item]},{keepSpaces:true}).items[0].color,'#e03131');
 assert.ok(!converted.report.warnings.some(w=>w.code==='RICH_TEXT_FLATTENED'),'only weight/slant/underline/colour differ, nothing was flattened');
});

test('rich text keeps theme colours: a single-style box with a mapped theme colour gets no range',async()=>{
 // Regression (GBE-AI Lab colour test): the range reader read colours without the theme and turned theme text into a #222222 range.
 const parts=unzipSync(await baseBytes()),name='ppt/slides/slide1.xml';
 const body='<a:p><a:r><a:rPr lang="ko-KR" sz="2400"><a:solidFill><a:schemeClr val="tx1"><a:lumMod val="50000"/><a:lumOff val="50000"/></a:schemeClr></a:solidFill></a:rPr><a:t>테마 색 제목</a:t></a:r></a:p>';
 parts[name]=enc.encode(dec.decode(parts[name]).replace(/<a:p>.*<\/a:p>/s,body));
 const item=(await convertPptx(repack(parts),{selectedPages:[1]})).document.slides[0].items.find(i=>i.t==='text');
 assert.notEqual(item.color,'#222222');
 assert.equal(item.runs,undefined);
});
