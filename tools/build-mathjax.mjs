// 수식 고치기 창(src/math-dialog.js)이 쓰는 MathJax 를 src/mathjax/ 에 그대로 옮겨 둔다(빌드 없이 올려도 돌고 CDN 을 쓰지 않는다).
// 옮기는 것: es5/tex-svg-full.js(TeX 입력 · SVG 출력 · 화학식 mhchem 을 포함한 모든 TeX 확장) · 사용 조건. BUILD.json 에 판 · 크기 · SHA-256.
// 수식을 고칠 때만 받는다(보는 쪽은 저장해 둔 모양을 그린다: src/math.js).
// node tools/build-mathjax.mjs [--check]
import {readFile,writeFile,mkdir,rm,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url)),from=join(root,'node_modules/mathjax'),to=join(root,'src/mathjax');
export const MATHJAX_VERSION='3.2.2';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');

export async function buildMathJax({check=false}={}){
 const pkg=JSON.parse(await readFile(join(from,'package.json'),'utf8'));
 if(pkg.version!==MATHJAX_VERSION)throw Error(`mathjax must be exactly ${MATHJAX_VERSION} (found ${pkg.version})`);
 const files=new Map([['tex-svg-full.js','es5/tex-svg-full.js'],['LICENSE.txt','LICENSE']]);
 const manifest={product:'onbatang-math',packages:{mathjax:pkg.version},files:{}},out=new Map();
 for(const [name,source] of files){const bytes=await readFile(join(from,source));out.set(name,bytes);manifest.files[name]={bytes:bytes.length,sha256:sha(bytes)};}
 const json=Buffer.from(JSON.stringify(manifest,null,1)+'\n');
 if(check){
  for(const [name,bytes] of [...out,['BUILD.json',json]]){const have=await readFile(join(to,name)).catch(()=>null);if(!have||!have.equals(bytes))throw Error(`src/mathjax/${name} differs; run node tools/build-mathjax.mjs`);}
  const extra=(await readdir(to)).filter(name=>name!=='BUILD.json'&&!out.has(name));
  if(extra.length)throw Error('unexpected files: '+extra.join(', '));
 }else{
  await rm(to,{recursive:true,force:true});await mkdir(to,{recursive:true});
  for(const [name,bytes] of [...out,['BUILD.json',json]])await writeFile(join(to,name),bytes);
 }
 return {version:pkg.version,bytes:[...out.values()].reduce((n,b)=>n+b.length,0)};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1])console.log(JSON.stringify(await buildMathJax({check:process.argv.includes('--check')})));
