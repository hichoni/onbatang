// Publish only committed app assets. Never use the checkout itself as Hosting public/.
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {resolve,dirname,relative,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {unzipSync} from 'fflate';

const root=fileURLToPath(new URL('../',import.meta.url)),args=process.argv.slice(2),commit=args.find(a=>a!=='--check');
if(!/^[a-f0-9]{40}$/.test(commit||'')||args.some(a=>a!==commit&&a!=='--check'))throw Error('Usage: node tools/build-firebase-hosting.mjs <full release commit> [--check]');
const output=resolve(root,'work/firebase-public');
if(relative(root,output).split(sep).join('/')!=='work/firebase-public')throw Error('Unsafe output directory');
const archive=execFileSync('git',['archive','--format=zip',commit,'index.html','app','src','LICENSE','NOTICE'],{cwd:root,maxBuffer:64*1024*1024});
const entries=unzipSync(archive),version=JSON.parse(execFileSync('git',['show',commit+':package.json'],{cwd:root,encoding:'utf8'})).version;
const staticFiles=Object.keys(entries).filter(name=>!name.endsWith('/'));
if(staticFiles.some(name=>!['index.html','LICENSE','NOTICE'].includes(name)&&!name.startsWith('app/')&&!name.startsWith('src/')))throw Error('Unexpected public source');
const sourceFiles=staticFiles.filter(name=>!['index.html','app/index.html'].includes(name)).length;
const metadata={product:'onbatang',version,sourceCommit:commit,sourceFiles};
entries['version.json']=new TextEncoder().encode(JSON.stringify(metadata,null,2)+'\n');
const files=Object.keys(entries).filter(name=>!name.endsWith('/')).sort();
async function walk(path){
 return (await Promise.all((await readdir(path,{withFileTypes:true}).catch(error=>error.code==='ENOENT'?[]:Promise.reject(error))).map(async entry=>entry.isDirectory()?walk(resolve(path,entry.name)):resolve(path,entry.name)))).flat();
}
const existing=(await walk(output)).map(path=>relative(output,path).split(sep).join('/')).sort();
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
