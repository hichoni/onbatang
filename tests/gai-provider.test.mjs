import test from 'node:test';
import assert from 'node:assert/strict';
import {createGaiPopupProvider} from '../app/gai-provider.js';
import {gaiLessonContext} from '../app/gai-maker.js';

function fixture(){
 let listener;const sent=[],popup={closed:false,focus(){},postMessage(message,origin){sent.push({message,origin});}};
 const host={location:{origin:'https://onbatang.web.app'},addEventListener(name,fn){assert.equal(name,'message');listener=fn;},open(url){this.url=new URL(url);return popup;}};
 const emit=(data,overrides={})=>listener({origin:'https://gai-lab.netlify.app',source:popup,data,...overrides});
 return {host,popup,sent,emit,channel:()=>new URLSearchParams(host.url.hash.slice(1)).get('channel')};
}
test('popup connects only to its exact origin, source and channel and never forwards credentials',async()=>{
 const f=fixture(),provider=createGaiPopupProvider({host:f.host});let ready=false;
 const connection=provider.connect().then(()=>{ready=true;});const channel=f.channel();
 assert.equal(f.host.url.pathname,'/onbatang-gai-connect.html');
 assert.equal(new URLSearchParams(f.host.url.hash.slice(1)).get('origin'),f.host.location.origin);
 const hello={type:'onbatang-gai',channel,event:'ready'};
 f.emit(hello,{origin:'https://evil.test'});f.emit(hello,{source:{}});f.emit({...hello,channel:'wrong'});
 await Promise.resolve();assert.equal(ready,false);
 f.emit(hello);await connection;assert.equal(ready,true);
 const input={prompt:'나만의 앱을 만들어줘',context:'수업 글',project:null,conversation:[]};
 const task=provider.generate(input);const call=f.sent[0];assert.deepEqual(call.message.input,input);assert.equal(call.origin,'https://gai-lab.netlify.app');
 assert.equal(f.sent.length,1);f.emit({type:'onbatang-gai',channel,request:call.message.request,event:'result',result:{kind:'answer',answer:'대화'}});
 assert.deepEqual(await task,{kind:'answer',answer:'대화'});
 f.popup.closed=true;await new Promise(resolve=>setTimeout(resolve,550));
 await assert.rejects(()=>provider.generate(input),/먼저 연결/);
});
test('aborting sends one cancellation, rejects locally and does not reissue a generation',async()=>{
 const f=fixture(),provider=createGaiPopupProvider({host:f.host}),controller=new AbortController();
 const connection=provider.connect();f.emit({type:'onbatang-gai',channel:f.channel(),event:'ready'});await connection;
 const task=provider.generate({prompt:'앱 만들기'},{signal:controller.signal});controller.abort();
 await assert.rejects(task,error=>error.name==='AbortError');
 assert.deepEqual(f.sent.map(v=>v.message.action),['generate','cancel']);assert.equal(f.sent[0].message.request,f.sent[1].message.request);
 f.popup.closed=true;await new Promise(resolve=>setTimeout(resolve,550));
});
test('blocked connection keeps the user in the editor with a useful message',async()=>{
 const f=fixture();f.host.open=()=>null;
 await assert.rejects(createGaiPopupProvider({host:f.host}).connect(),/팝업/);
 assert.throws(()=>createGaiPopupProvider({url:'http://example.com/relay',host:f.host}),/주소/);
});
test('bounded lesson references retain the selected late slide and remain valid JSON',()=>{
 const entries=Array.from({length:500},(_,i)=>({page:{id:`p${i}`,source:{pageNumber:i+1},items:[{t:'text',text:`${i+1}쪽 설명 `+'참고 글 '.repeat(400)}]}}));
 const context=gaiLessonContext(entries,'p498','실제 순서');assert.ok(context.length<=14000);
 const value=JSON.parse(context);assert.equal(value.totalSlides,500);assert.equal(value.insertAfter,499);assert.equal(value.referenceOnly,true);
 assert.match(value.slides.find(p=>p.position===499).text,/499쪽 설명/);
 assert.equal(value.omittedSlides+value.slides.length,500);
 assert.ok(value.slides.every((p,i)=>i===0||value.slides[i-1].position<p.position));
});
