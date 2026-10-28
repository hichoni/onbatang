// 공용 온바탕(app/index.html) 스크립트 묶기: Firebase 배포본(tools/build-firebase-hosting.mjs)을 만들 때 app/index.html 의 시작 스크립트와
// 그 아래 모듈 100여 개를 app/index.bundle.js · app/chunk-*.js 몇 개로 묶는다. 묶지 않으면 브라우저가 모듈을 한 단계씩 따라가며 90개 넘게
// 따로 받아서, HTTP/1.1 로만 오가는 망(학교 보안 장비 · 프록시)에서 첫 화면이 몇 초 늦다.
// 묶어도 실행되는 코드는 같게:
//   - import.meta.url 은 그 모듈의 원래 주소로 바꿔 넣는다(new URL('../src/x.js', import.meta.url)). 묶음은 app/ 에 있으니 원래 파일 옆의
//     글꼴 · 그림 · 워커 · MathJax · PDF 주소가 그대로다. 계산된 상대 import(`./art/${이름}`)도 원래 자리에서 부른다.
//   - 배포본(vendor/ · html-lesson-bundle.js)은 묶지 않고 원래 파일을 부른다. 원래 파일은 그대로 두어 다른 화면(embed.html · 내보낸 수업)과 워커가 쓴다.
//   - 묶지 않은 모듈이 묶인 모듈을 따로 부르면(같은 모듈 두 벌) · 글로 꺼내 쓰는 함수(이름.toString())의 이름이 바뀌면 ·
//     이름이 겹쳐 바뀐 함수 · 클래스의 .name 을 읽으면 멈춘다. keepNames 는 쓰지 않는다(글로 꺼내 쓰는 함수 안에 __name(…) 이 들어가 깨진다).
// 파일은 배포본의 { 경로: 바이트 } 에서 읽고 결과도 그렇게 돌려준다(디스크에 쓰지 않는다).
import {build} from 'esbuild';
import {parse} from 'acorn';
import {posix} from 'node:path';

export const PAGE='app/index.html',ENTRY='app/index.bundle.js',CHUNK_PREFIX='app/chunk-';
const OUT='app';
const text=bytes=>typeof bytes==='string'?bytes:new TextDecoder().decode(bytes);
/** 묶지 않고 원래 파일을 부르는 것: 고치지 않고 옮긴 배포본. */
export const keepOwnFile=path=>/(^|\/)vendor\//.test(path)||path==='app/html-lesson-bundle.js';
// 정적 import · 글자 그대로의 동적 import
const importRe=/(?:^|[;\n}])\s*(?:import|export)\s+(?:[^'"`;]*?\sfrom\s*)?['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;

/** 모듈 안의 import.meta.url · 계산된 상대 import 를 원래 주소 기준으로 바꾼다(own: 묶음 자리에서 본 원래 파일의 상대 주소). 바꿀 것이 없으면 null. */
export function pinModuleUrl(source,own,label=own){
 if(!source.includes('import.meta')&&!/\bimport\(\s*`\.\.?\//.test(source))return null;
 const ast=parse(source,{ecmaVersion:'latest',sourceType:'module',allowHashBang:true}),edits=[];
 const url=`new URL(${JSON.stringify(own)},import.meta.url).href`;
 const walk=node=>{
  if(!node||typeof node.type!=='string')return;
  if(node.type==='MemberExpression'&&node.object.type==='MetaProperty'&&node.object.meta.name==='import'&&!node.computed&&node.property.name==='url'){edits.push([node.start,node.end,`(${url})`]);return;}
  if(node.type==='MetaProperty'&&node.meta.name==='import')throw Error(`${label}: import.meta.url 말고 다른 import.meta 는 묶을 수 없어요`);
  if(node.type==='ImportExpression'&&node.source.type==='TemplateLiteral'&&node.source.expressions.length&&/^\.\.?\//.test(node.source.quasis[0].value.cooked)){
   const s=node.source;edits.push([s.start,s.end,`new URL(${source.slice(s.start,s.end)},${url}).href`]);return;
  }
  for(const key of Object.keys(node)){if(key==='type'||key==='start'||key==='end')continue;const v=node[key];if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')walk(v);}
 };
 walk(ast);
 if(!edits.length)return null;
 let out=source;for(const [s,e,piece] of edits.sort((a,b)=>b[0]-a[0]))out=out.slice(0,s)+piece+out.slice(e);
 return out;
}

/** 묶지 않은 파일(과 그 파일이 부르는 파일)이 묶인 모듈을 따로 부르면 같은 모듈이 둘이 된다(상태가 갈린다): 그런 길이 있으면 멈춘다. */
function checkSeparate(read,bundled,roots){
 const seen=new Set(),queue=[...roots];
 while(queue.length){
  const file=queue.shift();if(seen.has(file))continue;seen.add(file);
  const source=read(file);if(source==null||!/\.m?js$/.test(file))continue;
  for(const m of source.matchAll(importRe)){
   const spec=m[1]||m[2];if(!spec?.startsWith('.'))continue;
   const target=posix.normalize(posix.join(posix.dirname(file),spec));
   if(bundled.has(target))throw Error(`${file} 가 묶음 안의 ${target} 를 따로 불러 같은 모듈이 둘이 돼요`);
   queue.push(target);
  }
 }
}
const word=name=>name.replace(/\$/g,'\\$');
/** 글로 꺼내 쓰는 함수(이름.toString())의 이름이 묶음에서 바뀌지 않았는지(esbuild 는 겹치는 이름 끝에 숫자를 붙인다). */
function checkSerialized(sources,outputs){
 const all=sources.join('\n'),out=outputs.join('\n');
 const names=new Set(sources.flatMap(s=>[...s.matchAll(/\b([A-Za-z_$][\w$]*)\.toString\(\)/g)].map(m=>m[1]))),renamed=[];
 for(const name of names)for(const m of new Set(out.match(new RegExp(`(?<![\\w$])${word(name)}\\d+(?![\\w$])`,'g'))||[]))if(!new RegExp(`(?<![\\w$])${word(m)}(?![\\w$])`).test(all))renamed.push(name+' → '+m);
 if(renamed.length)throw Error('글로 꺼내 쓰는 함수의 이름이 묶음에서 바뀌었어요: '+renamed.join(', '));
 return names.size;
}
/** 이름이 겹쳐 바뀐 함수 · 클래스의 원래 이름으로 .name 을 읽는 곳이 있으면 멈춘다. */
function checkRenamed(sources,outputs){
 const all=sources.join('\n'),out=outputs.join('\n'),has=name=>new RegExp(`(?<![\\w$])${word(name)}(?![\\w$])`).test(all),renamed=new Set();
 for(const m of out.matchAll(/(?:\bfunction\*?|\bclass)\s+([A-Za-z_$][\w$]*?)(\d+)\b/g))if(!has(m[1]+m[2])&&has(m[1]))renamed.add(m[1]);
 const reads=[...renamed].filter(name=>new RegExp(`(?<![\\w$.])${word(name)}\\.name\\b`).test(all));
 if(/\bconstructor\.name\b/.test(all))reads.push('constructor.name');
 if(reads.length)throw Error('묶음에서 이름이 바뀌는 함수 · 클래스의 .name 을 읽어요: '+reads.join(', '));
 return renamed.size;
}

/**
 * files: { 배포 경로: 바이트 | 글 } (app/index.html · app/** · src/** …). version: 묶음 주소의 ?v= (캐시 바꾸기).
 * → { page: 새 app/index.html 글, outputs: { 경로: 글 }, preload, modules, externals, pinned, serialized, renamed }
 */
export async function bundleApp(files,{version=''}={}){
 const read=path=>files[path]==null?null:text(files[path]);
 const html=read(PAGE);if(html==null)throw Error(PAGE+' 가 없어요');
 const scripts=[...html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)];
 if(scripts.length!==1)throw Error(PAGE+' 의 시작 스크립트(<script type="module">)가 하나가 아니에요');
 const start=scripts[0][1],pinned=[],sources=[];
 const plugin={name:'onbatang-app',setup(b){
  b.onResolve({filter:/^onbatang:start$/},()=>({path:'/app/index.start.js',namespace:'site'}));
  b.onResolve({filter:/.*/},a=>{
   if(a.namespace!=='site')return null;
   if(!/^\.\.?\//.test(a.path))throw Error(`${a.importer}: 상대 주소가 아닌 import 는 묶을 수 없어요 (${a.path})`);
   const path=posix.normalize(posix.join(posix.dirname(a.importer),a.path)).slice(1);
   if(path.startsWith('../')||read(path)==null)throw Error(`${a.importer.slice(1)}: 없는 모듈 ${path}`);
   return keepOwnFile(path)?{path:posix.relative(OUT,path).replace(/^(?!\.)/,'./'),external:true}:{path:'/'+path,namespace:'site'};
  });
  b.onLoad({filter:/.*/,namespace:'site'},a=>{
   const path=a.path.slice(1),source=path==='app/index.start.js'?start:read(path);
   sources.push(source);
   const next=path==='app/index.start.js'?null:pinModuleUrl(source,posix.relative(OUT,path),path);
   if(next)pinned.push(path);
   return {contents:next??source,loader:'js'};
  });
 }};
 const result=await build({entryPoints:[{in:'onbatang:start',out:'index.bundle'}],bundle:true,splitting:true,format:'esm',platform:'browser',target:'es2022',
  absWorkingDir:'/',outdir:'/'+OUT,entryNames:'[name]',chunkNames:'chunk-[hash]',minifyWhitespace:true,charset:'utf8',legalComments:'eof',metafile:true,write:false,logLevel:'warning',
  plugins:[plugin]});
 const site=p=>p.replace(/^site:\//,'');
 const bundled=new Set(Object.keys(result.metafile.inputs).map(site).filter(p=>p!=='app/index.start.js'));
 const outputs=Object.entries(result.metafile.outputs).map(([f,o])=>({file:f.replace(/^\//,''),...o}));
 const externals=[...new Set(outputs.flatMap(o=>o.imports.filter(i=>i.external).map(i=>posix.normalize(posix.join(OUT,i.path)))))];
 // 같은 화면에서 따로 부르는 다른 모듈 스크립트(<script type="module" src>)도 묶인 모듈을 따로 부르면 안 된다.
 const others=[...html.matchAll(/<script type="module" src="([^"?]+)[^"]*"><\/script>/g)].map(m=>posix.normalize(posix.join('app',m[1])));
 checkSeparate(read,bundled,[...externals,...others]);
 const texts=result.outputFiles.map(o=>o.text);
 const serialized=checkSerialized(sources,texts),renamed=checkRenamed(sources,texts);
 // 미리 받기: 입구와 모든 조각(과 그것들이 바로 부르는 원래 파일)을 처음부터 함께 받는다. 조각 대부분은 시작하면서 차례로 부르고,
 // 나중에 쓰는 조각은 작아서(모두 합쳐 50KB 안팎) 한꺼번에 받는 편이 한 단계씩 기다리는 것보다 빠르다.
 const byFile=new Map(outputs.map(o=>[o.file,o])),preload=[];
 const add=file=>{if(preload.includes(file))return;preload.push(file);for(const i of byFile.get(file)?.imports||[])if(i.kind==='import-statement')add(i.external?posix.normalize(posix.join(OUT,i.path)):i.path.replace(/^\//,''));};
 add(ENTRY);for(const o of outputs)if(o.file.endsWith('.js'))add(o.file);
 const v=version?'?v='+version:'',rel=f=>'./'+posix.relative(OUT,f);
 const links=preload.map(f=>`  <link rel="modulepreload" href="${rel(f)}${f===ENTRY?v:''}" />`).join('\n');
 const page=html.replace(scripts[0][0],`<script type="module" src="${rel(ENTRY)}${v}"></script>`).replace('</head>',links+'\n</head>');
 const out=Object.fromEntries(result.outputFiles.map(o=>[o.path.replace(/^\//,''),o.text]));
 return {page,outputs:out,preload,modules:bundled.size,inputs:[...bundled],externals,pinned,serialized,renamed};
}
