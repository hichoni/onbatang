import {unzipSync} from './vendor/story-zip.js';
const MAX_FILE=20*1024*1024,MAX_XML=4*1024*1024;
export function readHwpxParagraphs(xml,Parser=globalThis.DOMParser){
 if(xml.includes('<!DOCTYPE')||xml.includes('<!ENTITY'))throw Error('외부 선언이 있는 원고는 읽을 수 없어요.');
 const doc=new Parser().parseFromString(xml,'application/xml');
 if(doc.getElementsByTagName('parsererror').length)throw Error('원고 XML을 읽지 못했어요.');
 return Array.from(doc.getElementsByTagNameNS('*','p')).map(p=>{
  const parts=Array.from(p.getElementsByTagNameNS('*','t')).filter(t=>{let at=t.parentElement;while(at&&at.localName!=='p')at=at.parentElement;return at===p;});
  return parts.map(t=>t.textContent).join('').trim();
 }).filter(Boolean);
}
export async function readStoryFile(file){
 if(!file||file.size>MAX_FILE)throw Error('원고 파일은 20MB까지 읽을 수 있어요.');
 if(/\.(txt|md)$/i.test(file.name))return await file.text();
 if(!/\.hwpx$/i.test(file.name))throw Error('HWPX 또는 TXT 원고를 골라 주세요.');
 let total=0;
 const data=unzipSync(new Uint8Array(await file.arrayBuffer()),{filter:entry=>{
  if(!/^Contents\/section\d+\.xml$/.test(entry.name))return false;
  total+=entry.originalSize;
  if(total>MAX_XML)throw Error('원고 본문이 너무 커요. 짧은 구간을 TXT로 넣어 주세요.');
  return true;
 }});
 const names=Object.keys(data).sort((a,b)=>Number(a.match(/\d+/)[0])-Number(b.match(/\d+/)[0]));
 if(!names.length)throw Error('HWPX에서 본문을 찾지 못했어요.');
 const decoder=new TextDecoder('utf-8',{fatal:true});
 return names.flatMap(name=>readHwpxParagraphs(decoder.decode(data[name]))).join('\n');
}
