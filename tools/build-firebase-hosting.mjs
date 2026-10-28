// Publish only committed app assets. Never use the checkout itself as Hosting public/.
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir,readdir,rm} from 'node:fs/promises';
import {resolve,dirname,relative,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {unzipSync} from 'fflate';
import {bundleApp,ENTRY,CHUNK_PREFIX} from './bundle-app.mjs';

const root=fileURLToPath(new URL('../',import.meta.url)),args=process.argv.slice(2),commit=args.find(a=>a!=='--check');
if(!/^[a-f0-9]{40}$/.test(commit||'')||args.some(a=>a!==commit&&a!=='--check'))throw Error('Usage: node tools/build-firebase-hosting.mjs <full release commit> [--check]');
const output=resolve(root,'work/firebase-public');
if(relative(root,output).split(sep).join('/')!=='work/firebase-public')throw Error('Unsafe output directory');
const archive=execFileSync('git',['archive','--format=zip',commit,'index.html','app','src','LICENSE','NOTICE'],{cwd:root,maxBuffer:64*1024*1024});
const entries=unzipSync(archive),version=JSON.parse(execFileSync('git',['show',commit+':package.json'],{cwd:root,encoding:'utf8'})).version;
const staticFiles=Object.keys(entries).filter(name=>!name.endsWith('/'));
if(staticFiles.some(name=>!['index.html','LICENSE','NOTICE'].includes(name)&&!name.startsWith('app/')&&!name.startsWith('src/')))throw Error('Unexpected public source');
const sourceFiles=staticFiles.filter(name=>!['index.html','app/index.html'].includes(name)).length;
// 공용 온바탕 화면(app/index.html)의 스크립트는 몇 개로 묶는다(tools/bundle-app.mjs). 원래 파일은 그대로 두어 다른 화면 · 워커가 쓴다.
const bundle=await bundleApp(entries,{version}),encode=body=>new TextEncoder().encode(body);
entries['app/index.html']=encode(bundle.page);
for(const [name,body] of Object.entries(bundle.outputs))entries[name]=encode(body);
const metadata={product:'onbatang',version,sourceCommit:commit,sourceFiles,bundle:{entry:ENTRY,modules:bundle.modules,files:Object.keys(bundle.outputs).length}};
entries['version.json']=new TextEncoder().encode(JSON.stringify(metadata,null,2)+'\n');
const files=Object.keys(entries).filter(name=>!name.endsWith('/')).sort();
async function walk(path){
 return (await Promise.all((await readdir(path,{withFileTypes:true}).catch(error=>error.code==='ENOENT'?[]:Promise.reject(error))).map(async entry=>entry.isDirectory()?walk(resolve(path,entry.name)):resolve(path,entry.name)))).flat();
}
let existing=(await walk(output)).map(path=>relative(output,path).split(sep).join('/')).sort();
// 지난번 묶음 조각(이름에 내용 해시)은 지운다
const stale=existing.filter(name=>(name===ENTRY||name.startsWith(CHUNK_PREFIX))&&!files.includes(name));
if(stale.length&&!args.includes('--check')){for(const name of stale)await rm(resolve(output,name));existing=existing.filter(name=>!stale.includes(name));}
if(existing.some(name=>!files.includes(name)))throw Error('Unexpected files in Hosting staging; review them before deployment');
for(const name of files){
 const path=resolve(output,name);if(!path.startsWith(output+sep))throw Error('Unsafe archive path');
 if(args.includes('--check')){
  if(!Buffer.from(await readFile(path)).equals(Buffer.from(entries[name])))throw Error('Staging bytes differ: '+name);
 }else{await mkdir(dirname(path),{recursive:true});await writeFile(path,entries[name]);}
}
const report={...metadata,publicFiles:files.length,files:Object.fromEntries(files.map(name=>[name,createHash('sha256').update(entries[name]).digest('hex')])),status:'PASS'};
if(!args.includes('--check'))await writeFile(resolve(root,'work/firebase-build.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:'PASS',...metadata,publicFiles:files.length,output:relative(root,output)}));
