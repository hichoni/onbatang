import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve,extname,sep} from 'node:path';

const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const options={skip:!process.env.MINICAN_PLAYWRIGHT_PATH,timeout:60000};

async function setup(t){
 const server=createServer(async(req,res)=>{
  try{
   const path=new URL(req.url,'http://localhost').pathname;
   if(path==='/fixture.html'){res.setHeader('Content-Type','text/html');return res.end('<!doctype html><title>Self-authored activity draft fixture</title>');}
   const file=resolve(root,'.'+decodeURIComponent(path));if(!file.startsWith(root+sep)){res.writeHead(403);return res.end();}
   res.setHeader('Content-Type',extname(path)==='.js'?'text/javascript':'application/octet-stream');res.end(await readFile(file));
  }catch{res.writeHead(404);res.end();}
 });
 await new Promise(done=>server.listen(0,'127.0.0.1',done));t.after(()=>new Promise(done=>server.close(done)));
 const {chromium}=await import(pathToFileURL(process.env.MINICAN_PLAYWRIGHT_PATH).href),browser=await chromium.launch({channel:process.env.MINICAN_BROWSER||'msedge',headless:true});t.after(()=>browser.close());
 const context=await browser.newContext(),origin=`http://127.0.0.1:${server.address().port}`,external=[],errors=[];
 await context.route('**/*',route=>{if(route.request().url().startsWith(origin+'/'))return route.continue();external.push(route.request().url());return route.abort();});
 await context.routeWebSocket('**/*',socket=>{external.push(socket.url());socket.close();});
 async function newPage(){
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await page.goto(origin+'/fixture.html');
  await page.evaluate(async()=>{window.store=await import('/app/store.js');store.setStorageName('self-authored-activity-cas');});return page;
 }
 const page=await newPage();
 await page.evaluate(async()=>{
  const {migrateRecord}=await import('/app/designs.js'),{newPixelActivity}=await import('/src/pixel-art.js');
  const record=migrateRecord({id:'dactivitydraft01',revision:7,name:'Activity draft',ratio:'16:9',updatedAt:100,
   slides:[{id:'pactivitydraft01',source:{kind:'local'},bg:'#ffffff',items:[],activity:newPixelActivity({id:'aactivitydraft01',title:'Self-authored pixel task'})}]});
  await store.putDesign(record);
 });
 t.after(()=>{assert.deepEqual(errors,[]);assert.deepEqual(external,[],'all requests remain local; paid QA is unused');});
 return {page,newPage};
}

test('activity draft CAS preserves cells and identity, increases revision and survives reload',options,async t=>{
 const {page}=await setup(t),saved=await page.evaluate(async()=>{
  const expected=await store.getDesign('dactivitydraft01'),proposal=structuredClone(expected);proposal.revision=0;proposal.slides[0].activity.cells[5]=2;
  const before=JSON.stringify(proposal),result=await store.replaceDesignIfUnchanged(proposal,expected);
  return {expected,result,proposalUnchanged:before===JSON.stringify(proposal)};
 });
 assert.equal(saved.result.revision,8);assert.ok(saved.result.updatedAt>saved.expected.updatedAt);assert.equal(saved.proposalUnchanged,true);
 assert.equal(saved.result.id,saved.expected.id);assert.equal(saved.result.slides[0].id,saved.expected.slides[0].id);assert.equal(saved.result.slides[0].activity.id,saved.expected.slides[0].activity.id);
 assert.equal(saved.result.slides[0].activity.cells[5],2);assert.deepEqual(saved.result.source,saved.expected.source);assert.deepEqual(saved.result.originalSize,saved.expected.originalSize);
 await page.reload();
 const reopened=await page.evaluate(async()=>{const store=await import('/app/store.js');store.setStorageName('self-authored-activity-cas');return store.getDesign('dactivitydraft01');});
 assert.deepEqual(reopened,saved.result);
});

test('same-revision content changes reject the stale proposal and preserve the newer local content',options,async t=>{
 const {page}=await setup(t),result=await page.evaluate(async()=>{
  const expected=await store.getDesign('dactivitydraft01'),later=structuredClone(expected);later.slides[0].activity.cells[9]=3;await store.putDesign(later);
  const proposal=structuredClone(expected);proposal.slides[0].activity.cells[5]=2;let error;
  try{await store.replaceDesignIfUnchanged(proposal,expected);}catch(ex){error=ex.message;}
  return {error,current:await store.getDesign(expected.id),later};
 });assert.equal(result.error,'DRAFT_CHANGED');assert.deepEqual(result.current,result.later);
});

test('two browser tabs using the same expected snapshot produce exactly one committed winner',options,async t=>{
 const {page,newPage}=await setup(t),second=await newPage(),expected=await page.evaluate(()=>store.getDesign('dactivitydraft01'));
 const execute=(tab,name,index)=>tab.evaluate(async({expected,name,index})=>{
  const proposal=structuredClone(expected);proposal.name=name;proposal.slides[0].activity.cells[index]=2;
  try{return {status:'saved',record:await store.replaceDesignIfUnchanged(proposal,expected)};}
  catch(error){return {status:'rejected',message:error.message};}
 },{expected,name,index});
 const outcomes=await Promise.all([execute(page,'First tab',5),execute(second,'Second tab',9)]),winner=outcomes.find(value=>value.status==='saved');
 assert.equal(outcomes.filter(value=>value.status==='saved').length,1);assert.deepEqual(outcomes.find(value=>value.status==='rejected'),{status:'rejected',message:'DRAFT_CHANGED'});
 const current=await page.evaluate(()=>store.getDesign('dactivitydraft01'));assert.deepEqual(current,winner.record);assert.equal(current.revision,8);
 assert.equal(current.slides[0].activity.cells.filter(value=>value===2).length,1,'the losing edit is not partially merged');
});

test('higher proposed revisions remain monotonic and null expectations only create absent records',options,async t=>{
 const {page}=await setup(t),result=await page.evaluate(async()=>{
  const expected=await store.getDesign('dactivitydraft01'),proposal=structuredClone(expected);proposal.revision=20;
  const first=await store.replaceDesignIfUnchanged(proposal,expected),second=await store.replaceDesignIfUnchanged({...first,revision:1},first);
  let existingError;try{await store.replaceDesignIfUnchanged(proposal,null);}catch(error){existingError=error.message;}
  const created=await store.replaceDesignIfUnchanged({...proposal,id:'dactivitynew01',revision:0},null);
  return {revisions:[first.revision,second.revision,created.revision],existingError,current:await store.getDesign(expected.id),second,created:await store.getDesign(created.id)};
 });assert.deepEqual(result.revisions,[21,22,1]);assert.equal(result.existingError,'DRAFT_CHANGED');assert.deepEqual(result.current,result.second);assert.equal(result.created.id,'dactivitynew01');
});

test('a failed CAS write rolls back and a retry with the same expected snapshot advances exactly once',options,async t=>{
 const {page}=await setup(t),result=await page.evaluate(async()=>{
  const expected=await store.getDesign('dactivitydraft01'),proposal=structuredClone(expected);proposal.slides[0].activity.cells[5]=2;
  const put=IDBObjectStore.prototype.put;let failure;
  IDBObjectStore.prototype.put=function(...args){if(this.transaction.db.name==='self-authored-activity-cas'&&this.name==='designs')throw new DOMException('Self-authored quota failure','QuotaExceededError');return put.apply(this,args);};
  try{await store.replaceDesignIfUnchanged(proposal,expected);}catch(error){failure=error.name;}finally{IDBObjectStore.prototype.put=put;}
  const afterFailure=await store.getDesign(expected.id),retried=await store.replaceDesignIfUnchanged(proposal,expected);
  return {failure,unchanged:JSON.stringify(afterFailure)===JSON.stringify(expected),revision:retried.revision,cells:retried.slides[0].activity.cells[5]};
 });assert.deepEqual(result,{failure:'QuotaExceededError',unchanged:true,revision:8,cells:2});
});
