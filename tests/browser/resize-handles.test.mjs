import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve,extname,sep} from 'node:path';

test('actual editor resizes from the opposite corner, respects modifiers and keeps saved geometry',
 {skip:!process.env.MINICAN_PLAYWRIGHT_PATH,timeout:60000},async t=>{
  const hosted=!!process.env.MINICAN_HOST_ROOT,root=resolve(process.env.MINICAN_HOST_ROOT||fileURLToPath(new URL('../../',import.meta.url))),base=hosted?'/minican':'';
  const server=createServer(async(req,res)=>{try{
    const pathname=new URL(req.url,'http://localhost').pathname;
    if(pathname==='/resize-fixture.html'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end('<!doctype html><body>Self-authored resize fixtures</body>');}
    const file=resolve(root,'.'+decodeURIComponent(pathname));if(!file.startsWith(root+sep)){res.writeHead(403);return res.end();}
    res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2','.png':'image/png'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));
  }catch{res.writeHead(404);res.end();}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const {chromium}=await import(pathToFileURL(process.env.MINICAN_PLAYWRIGHT_PATH).href),browser=await chromium.launch({channel:process.env.MINICAN_BROWSER||'msedge',headless:true});t.after(()=>browser.close());
  const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),errors=[];page.on('pageerror',error=>errors.push(error.message));
  const origin=`http://127.0.0.1:${server.address().port}`;await page.goto(origin+'/resize-fixture.html');
  const fixtures=await page.evaluate(async base=>{
    const {newRecord}=await import(base+'/app/designs.js'),{cleanItem}=await import(base+'/src/model.js'),store=await import(base+'/app/store.js');store.setStorageName(base?'gailab-minican':'minican');
    const canvas=document.createElement('canvas');canvas.width=120;canvas.height=80;const context=canvas.getContext('2d');context.fillStyle='#ff7700';context.fillRect(0,0,60,80);context.fillStyle='#0077ff';context.fillRect(60,0,60,80);
    const common={layout:'slide',x:50,y:50,w:26,h:18,rot:32};
    const examples=[
      {name:'회전 도형 손잡이',items:[{...common,id:'eresizeshape001',t:'shape',shape:'rect',color:'#2563eb'}]},
      {name:'회전 사진 손잡이',items:[{...common,id:'eresizeimage001',t:'image',url:canvas.toDataURL(),mask:'none'}]},
      {name:'회전 글상자 손잡이',items:[{...common,id:'eresizetext001',t:'text',text:'Self-authored text\nContent stays editable',size:2,typeface:'Arial',align:'l',w:32,h:20}]},
      {name:'작은 도형 손잡이',items:[{...common,id:'eresizetiny001',t:'shape',shape:'rect',color:'#16a34a',w:1.5,h:2.5}]},
      {name:'여러 도형 미세 이동',items:[35,65].map((x,index)=>({...common,id:`eresizenudge00${index}`,t:'shape',shape:'rect',color:'#9333ea',x,w:14,h:14}))},
      {name:'일반 글상자 줄바꿈',items:[{id:'eresizenatural001',t:'text',x:50,y:50,w:38,size:3,rot:32,align:'l',text:'This self authored classroom note wraps into additional lines when its frame becomes narrower. Every word stays.',source:{kind:'local',filename:'self-authored-resize.txt',objectId:'paragraph-1'}}]},
    ];
    const records=[];for(const example of examples){const record=newRecord('16:9');record.name=example.name;record.source={kind:'local',filename:'self-authored-resize-fixture'};record.originalSize={width:1600,height:900,unit:'px'};record.slides=[{id:`presizecase00${records.length}`,bg:'paper',items:example.items.map(item=>cleanItem(item))}];await store.putDesign(record);records.push({id:record.id,name:record.name});}
    (await import(base+'/app/tour.js')).markTourSeen('editor');return records;
  },base);
  await page.goto(origin+(hosted?'/minican-app.html':'/app/index.html'));
  let current;
  const canvasItems=page.locator('.cv-canvas .fe-card .fi'),stage=page.locator('.cv-canvas .fe-stage');
  const near=(actual,expected,message,tolerance=1.1)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${message}: ${actual} ≈ ${expected}`);
  const geometry=async(index=0)=>canvasItems.nth(index).evaluate(node=>{
    const box=node.getBoundingClientRect(),style=getComputedStyle(node);
    return {x:box.left+box.width/2,y:box.top+box.height/2,w:parseFloat(style.width),h:parseFloat(style.height),font:parseFloat(style.fontSize),rot:Number(node.style.transform.match(/rotate\(([-.\d]+)deg\)/)?.[1]||0)};
  });
  const local=(value,dx,dy)=>{const a=value.rot*Math.PI/180;return {x:Math.cos(a)*dx-Math.sin(a)*dy,y:Math.sin(a)*dx+Math.cos(a)*dy};};
  const point=(value,sx,sy)=>{const delta=local(value,sx*value.w/2,sy*value.h/2);return {x:value.x+delta.x,y:value.y+delta.y};};
  const samePoint=(actual,expected,message)=>{near(actual.x,expected.x,message+' x');near(actual.y,expected.y,message+' y');};
  const persisted=()=>page.evaluate(async({base,id})=>(await import(base+'/app/app.js')).flushSavedDesign(id),{base,id:current.id});
  async function open(fixture){
    if(current){await page.locator('.cv-back').click();await page.getByRole('button',{name:fixture.name+' 열기',exact:true}).waitFor();}
    current=fixture;await page.getByRole('button',{name:fixture.name+' 열기',exact:true}).click();await page.locator('.cv-name').waitFor();
    await page.evaluate(async base=>(await import(base+'/app/tour.js')).stopTour(),base);
    const value=await geometry();await page.mouse.click(value.x,value.y);await page.locator('.cv-canvas .fe-sel:not([hidden])').waitFor();
  }
  async function drag(selector,dx,dy,modifiers=[]){
    const before=await geometry(),handle=await page.locator('.cv-canvas .fe-sel '+selector).boundingBox();assert.ok(handle,'resize handle exists');
    const start={x:handle.x+handle.width/2,y:handle.y+handle.height/2},delta=local(before,dx,dy);
    for(const key of modifiers)await page.keyboard.down(key);
    try{await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(start.x+delta.x,start.y+delta.y,{steps:4});await page.mouse.up();}
    finally{for(const key of [...modifiers].reverse())await page.keyboard.up(key);}
    return {before,after:await geometry()};
  }
  function anchored(result,corner,label){
    const sx=corner.includes('w')?-1:1,sy=corner.includes('n')?-1:1;
    samePoint(point(result.after,-sx,-sy),point(result.before,-sx,-sy),label+' opposite corner stays fixed');
    near(result.after.rot,result.before.rot,label+' keeps rotation',0.001);
  }
  for(const fixture of fixtures.slice(0,3)){
    await open(fixture);
    const original=await persisted();
    for(const corner of ['nw','ne','sw','se']){
      const sx=corner.includes('w')?-1:1,sy=corner.includes('n')?-1:1;
      const result=await drag('.fe-scale.'+corner,sx*18,sy*9);anchored(result,corner,fixture.name+' '+corner);
      near(result.after.w,result.before.w+18,'free resize follows horizontal pointer travel');near(result.after.h,result.before.h+9,'free resize follows vertical pointer travel');
      assert.ok(Math.abs(result.after.w/result.before.w-result.after.h/result.before.h)>0.005,'default corner resize can change aspect ratio');
      if(fixture===fixtures[2])near(result.after.font,result.before.font,'free text-frame resizing keeps the font size',0.01);
    }
    const proportional=await drag('.fe-scale.se',30,4,['Shift']);anchored(proportional,'se',fixture.name+' Shift');
    near(proportional.after.w/proportional.after.h,proportional.before.w/proportional.before.h,'Shift keeps the rendered aspect ratio',0.015);
    assert.ok(proportional.after.w>proportional.before.w,'Shift enlarges the selected element');
    if(fixture===fixtures[2])assert.ok(proportional.after.font>proportional.before.font,'Shift scales text along with its frame');
    const centered=await drag('.fe-scale.nw',-14,-7,['Control']);samePoint(centered.after,centered.before,fixture.name+' Ctrl keeps the center');
    near(centered.after.w,centered.before.w+28,'Ctrl changes width around the center');near(centered.after.h,centered.before.h+14,'Ctrl changes height around the center');
    const centeredRatio=await drag('.fe-scale.se',14,2,['Control','Shift']);samePoint(centeredRatio.after,centeredRatio.before,fixture.name+' Ctrl+Shift keeps the center');
    near(centeredRatio.after.w/centeredRatio.after.h,centeredRatio.before.w/centeredRatio.before.h,'Ctrl+Shift keeps aspect ratio',0.015);
    const saved=await persisted();assert.equal(saved.slides[0].items[0].id,original.slides[0].items[0].id);
    if(fixture===fixtures[2])assert.equal(saved.slides[0].items[0].text,original.slides[0].items[0].text,'text-frame resizing never rewrites the source content');
  }
  await open(fixtures[0]);
  for(const [selector,dx,dy,sx,sy] of [['.fe-wide',22,0,-1,0],['.fe-tall',0,16,0,-1]]){
    const result=await drag(selector,dx,dy);samePoint(point(result.after,sx,sy),point(result.before,sx,sy),'side resize keeps the opposite edge midpoint');
    near(result.after.w,result.before.w+dx,'side width follows pointer');near(result.after.h,result.before.h+dy,'side height follows pointer');
  }
  // Modifiers can change during one gesture; every move is measured from the
  // original frame, so releasing Shift restores free resizing without a jump.
  const beforeSwitch=await geometry(),handle=await page.locator('.cv-canvas .fe-sel .fe-scale.se').boundingBox();
  const start={x:handle.x+handle.width/2,y:handle.y+handle.height/2};await page.mouse.move(start.x,start.y);await page.mouse.down();
  let delta=local(beforeSwitch,24,3);await page.mouse.move(start.x+delta.x,start.y+delta.y,{steps:3});
  await page.keyboard.down('Shift');delta=local(beforeSwitch,30,3);await page.mouse.move(start.x+delta.x,start.y+delta.y,{steps:3});
  const shifted=await geometry();near(shifted.w/shifted.h,beforeSwitch.w/beforeSwitch.h,'pressing Shift during the drag locks aspect ratio',0.015);
  anchored({before:beforeSwitch,after:shifted},'se','Shift pressed during drag');
  await page.keyboard.up('Shift');delta=local(beforeSwitch,36,4);await page.mouse.move(start.x+delta.x,start.y+delta.y,{steps:3});await page.mouse.up();
  const freeAgain=await geometry();near(freeAgain.w,beforeSwitch.w+36,'releasing Shift uses the original width');near(freeAgain.h,beforeSwitch.h+4,'releasing Shift uses the original height');anchored({before:beforeSwitch,after:freeAgain},'se','Shift released during drag');
  const resized=await persisted();await stage.focus();await page.keyboard.press('Control+z');
  samePoint(await geometry(),beforeSwitch,'one undo restores the whole gesture center');near((await geometry()).w,beforeSwitch.w,'one undo restores its width');
  await page.keyboard.press('Control+Shift+z');const redone=await persisted();assert.deepEqual(redone.slides[0].items,resized.slides[0].items,'redo restores the complete resized geometry');
  await open(fixtures[3]);
  const small=await geometry(),selection=await page.locator('.cv-canvas .fe-sel').evaluate(node=>({w:parseFloat(node.style.width),h:parseFloat(node.style.height)}));
  assert.ok(selection.w>small.w+10&&selection.h>small.h+10,'tiny elements expose a padded selection frame');
  const tinyHandle=await page.locator('.cv-canvas .fe-sel .fe-scale.se').boundingBox();
  await page.mouse.move(tinyHandle.x+tinyHandle.width/2,tinyHandle.y+tinyHandle.height/2);await page.mouse.down();await page.mouse.up();
  near((await geometry()).w,small.w,'merely grabbing a padded handle never jumps in width');near((await geometry()).h,small.h,'merely grabbing a padded handle never jumps in height');
  const tiny=await drag('.fe-scale.se',10,7);anchored(tiny,'se','padded tiny selection');near(tiny.after.w,tiny.before.w+10,'tiny width uses pointer movement, not padded frame size');near(tiny.after.h,tiny.before.h+7,'tiny height uses pointer movement, not padded frame size');
  const tinySaved=await persisted();
  await page.reload();await page.getByRole('button',{name:current.name+' 열기',exact:true}).click();await page.locator('.cv-name').waitFor();
  const reopened=await persisted();assert.deepEqual(reopened.slides[0].items,tinySaved.slides[0].items,'local save and reload retain exact element geometry and identity');
  await open(fixtures[5]);
  const naturalOriginal=await persisted();assert.equal(naturalOriginal.slides[0].items[0].h,undefined);assert.equal(naturalOriginal.slides[0].items[0].layout,undefined,'ordinary text stays on its natural-height model path');
  const natural=await drag('.fe-scale.se',-110,0);anchored(natural,'se','ordinary text reflow');
  assert.ok(natural.after.h>natural.before.h+5,'narrowing ordinary text creates additional rendered lines');
  near(natural.after.font,natural.before.font,'ordinary frame resizing keeps its font size',0.01);
  const naturalSaved=await persisted(),originalText=naturalOriginal.slides[0].items[0],savedText=naturalSaved.slides[0].items[0];
  for(const key of ['id','text','source'])assert.deepEqual(savedText[key],originalText[key],`ordinary text preserves ${key}`);
  assert.equal(savedText.h,undefined,'natural text never receives a synthetic fixed height');
  await stage.focus();await page.keyboard.press('Control+z');const naturalUndo=await persisted();
  assert.deepEqual(naturalUndo.slides[0].items,naturalOriginal.slides[0].items,'one undo restores the natural text frame and original wrapping');
  await page.keyboard.press('Control+Shift+z');const naturalRedo=await persisted();assert.deepEqual(naturalRedo.slides[0].items,naturalSaved.slides[0].items);
  await page.reload();await page.getByRole('button',{name:current.name+' 열기',exact:true}).click();await page.locator('.cv-name').waitFor();
  const naturalReopened=await persisted();
  for(const key of ['id','source','originalSize'])assert.deepEqual(naturalReopened[key],naturalSaved[key],`reopening retains document ${key}`);
  assert.deepEqual(naturalReopened.slides,naturalSaved.slides,'reopening retains natural wrapping geometry, page ID and original content');
  await open(fixtures[4]);
  const single=await geometry();await stage.focus();await page.keyboard.press('ArrowRight');near((await geometry()).x,single.x+1,'single arrow moves one screen pixel',0.08);
  await page.keyboard.press('Shift+ArrowDown');near((await geometry()).y,single.y+10,'Shift+arrow moves ten screen pixels',0.08);
  await page.keyboard.press('Control+a');const many=await Promise.all([geometry(0),geometry(1)]);
  await page.keyboard.press('ArrowLeft');for(let i=0;i<2;i++)near((await geometry(i)).x,many[i].x-1,'each selected element moves one screen pixel',0.08);
  await page.keyboard.press('Shift+ArrowUp');for(let i=0;i<2;i++)near((await geometry(i)).y,many[i].y-10,'each selected element moves ten screen pixels with Shift',0.08);
  async function resizeGroup(modifiers=[]){
    const group=page.locator('.cv-canvas .fe-groupbox'),beforeBox=await group.boundingBox(),beforeItems=await Promise.all([geometry(0),geometry(1)]);
    const handle=await group.locator('.fe-scale.se').boundingBox(),start={x:handle.x+handle.width/2,y:handle.y+handle.height/2};
    for(const key of modifiers)await page.keyboard.down(key);
    try{await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(start.x+30,start.y+12,{steps:4});await page.mouse.up();}
    finally{for(const key of [...modifiers].reverse())await page.keyboard.up(key);}
    const afterBox=await group.boundingBox(),afterItems=await Promise.all([geometry(0),geometry(1)]);
    if(modifiers.includes('Control')){
      near(afterBox.x+afterBox.width/2,beforeBox.x+beforeBox.width/2,'Ctrl group resize keeps its horizontal center');
      near(afterBox.y+afterBox.height/2,beforeBox.y+beforeBox.height/2,'Ctrl group resize keeps its vertical center');
    }else{near(afterBox.x,beforeBox.x,'group resize keeps the opposite left edge');near(afterBox.y,beforeBox.y,'group resize keeps the opposite top edge');}
    const scale=afterBox.width/beforeBox.width;assert.ok(scale>1,'group resize enlarges the selection');
    near(afterBox.height/beforeBox.height,scale,'the whole group keeps its aspect ratio',0.008);
    for(let index=0;index<2;index++){
      near(afterItems[index].w/beforeItems[index].w,scale,'each group member scales by the same amount',0.008);
      near(afterItems[index].h/beforeItems[index].h,scale,'each group member keeps its own aspect ratio',0.008);
      near(afterItems[index].rot,beforeItems[index].rot,'group resize preserves member rotation',0.001);
    }
  }
  await resizeGroup();await resizeGroup(['Control']);
  if(process.env.RESIZE_SCREENSHOT_DIR){const directory=resolve(process.env.RESIZE_SCREENSHOT_DIR);await mkdir(directory,{recursive:true});await page.screenshot({path:resolve(directory,'resize-multiple-elements.png')});}
  assert.deepEqual(errors,[]);
 });
