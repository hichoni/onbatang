// PDF 가져오기에 쓰는 pdf.js 를 app/pdf/vendor 에 그대로 옮겨 둔다(빌드 없이 app/ 만 올려도 돈다 · CDN 을 쓰지 않는다).
// 옮기는 것: 그리는 쪽(pdf.min.mjs) · 일꾼(pdf.worker.min.mjs)(학교 기기의 조금 옛 브라우저에서도 돌게 legacy 판) · 한글 글꼴 표(CMap: Adobe-Korea1 · KSC · UniKS) ·
// 스캔 문서의 그림 풀개(JPEG2000 openjpeg.wasm · JBIG2 jbig2.wasm) · 사용 조건. BUILD.json 에 판 · 크기 · SHA-256 을 적는다.
// node tools/build-pdf-import.mjs [--check]  (--check: 다시 만들어 보고 다르면 실패한다)
import {readFile,writeFile,mkdir,readdir,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url)),from=join(root,'node_modules/pdfjs-dist'),to=join(root,'app/pdf/vendor');
export const PDFJS_VERSION='6.4.299';
const CMAP=/^(Adobe-Korea1-[0-9A-Z]+|KSC(ms|pc)?-[A-Za-z0-9-]+|UniKS-[A-Z0-9]+-[HV])\.bcmap$/;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');

export async function buildPdfImport({check=false}={}){
 const pkg=JSON.parse(await readFile(join(from,'package.json'),'utf8'));
 if(pkg.version!==PDFJS_VERSION)throw Error(`pdfjs-dist must be exactly ${PDFJS_VERSION} (found ${pkg.version})`);
 const files=new Map([
  ['pdf.min.mjs','legacy/build/pdf.min.mjs'],['pdf.worker.min.mjs','legacy/build/pdf.worker.min.mjs'],
  ['wasm/openjpeg.wasm','wasm/openjpeg.wasm'],['wasm/jbig2.wasm','wasm/jbig2.wasm'],
  ['licenses/pdfjs-LICENSE.txt','LICENSE'],
 ]);
 for(const name of (await readdir(join(from,'wasm'))).filter(n=>n.startsWith('LICENSE_')&&/OPENJPEG|JBIG2/.test(n)).sort())files.set(`licenses/${name}.txt`,`wasm/${name}`);
 for(const name of (await readdir(join(from,'cmaps'))).filter(n=>CMAP.test(n)).sort())files.set(`cmaps/${name}`,`cmaps/${name}`);
 const manifest={product:'onbatang-pdf-import',packages:{'pdfjs-dist':pkg.version},files:{}},out=new Map();
 for(const [name,source] of files){const bytes=await readFile(join(from,source));out.set(name,bytes);manifest.files[name]={bytes:bytes.length,sha256:sha(bytes)};}
 const json=Buffer.from(JSON.stringify(manifest,null,1)+'\n');
 if(check){
  for(const [name,bytes] of [...out,['BUILD.json',json]]){const have=await readFile(join(to,name)).catch(()=>null);if(!have||!have.equals(bytes))throw Error(`app/pdf/vendor/${name} differs; run node tools/build-pdf-import.mjs`);}
  const extra=(await list(to)).filter(name=>name!=='BUILD.json'&&!out.has(name));
  if(extra.length)throw Error('unexpected vendor files: '+extra.join(', '));
 }else{
  await rm(to,{recursive:true,force:true});
  for(const [name,bytes] of [...out,['BUILD.json',json]]){await mkdir(join(to,name,'..'),{recursive:true});await writeFile(join(to,name),bytes);}
 }
 return {version:pkg.version,files:out.size,bytes:[...out.values()].reduce((n,b)=>n+b.length,0),cmaps:[...out.keys()].filter(n=>n.startsWith('cmaps/')).length};
}
async function list(dir,prefix=''){
 const entries=await readdir(dir,{withFileTypes:true}).catch(()=>[]);
 return (await Promise.all(entries.map(e=>e.isDirectory()?list(join(dir,e.name),prefix+e.name+'/'):[prefix+e.name]))).flat();
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1])console.log(JSON.stringify(await buildPdfImport({check:process.argv.includes('--check')})));
