import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanPalettes,updatePalettes} from '../src/palettes.js';
import {orderPages,movePage,validatePageOrder} from '../app/page-order.js';
import {createLocalPalettes} from '../app/palettes.js';

test('four independent palettes sanitize persisted values, bound colors and keep recent order',()=>{
 let state=cleanPalettes(null);assert.equal(state.slots.length,4);
 state=updatePalettes(state,{type:'add',color:'#AaBBcC'});
 state=updatePalettes(state,{type:'select',index:2});state=updatePalettes(state,{type:'rename',name:'내 수업'});
 for(let i=0;i<15;i++)state=updatePalettes(state,{type:'add',color:'#'+i.toString(16).padStart(6,'0')});
 assert.deepEqual(state.slots[0].colors,['#aabbcc']);assert.equal(state.slots[2].colors.length,12);assert.equal(state.recent.length,12);assert.equal(state.recent[0],'#00000e');
 assert.equal(state.slots[2].name,'내 수업');assert.deepEqual(cleanPalettes({slots:[{colors:['red','#abc','#123456','#123456']}]}).slots[0].colors,['#123456']);
 const earlier=structuredClone(state);state=updatePalettes(state,{type:'remove',color:'#00000e'});assert.equal(state.slots[2].colors.length,11);assert.equal(earlier.slots[2].colors.length,12);
});
test('palette persistence isolates host/account namespaces and tolerates invalid storage',()=>{
 const data=new Map();globalThis.localStorage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};
 const a=createLocalPalettes('a'),b=createLocalPalettes('b');a.write(updatePalettes(a.read(),{type:'add',color:'#112233'}));
 assert.deepEqual(a.read().slots[0].colors,['#112233']);assert.deepEqual(b.read().slots[0].colors,[]);
 data.set('onbatang.palettes.v1.a','null');assert.equal(a.read().slots.length,4);delete globalThis.localStorage;
});
test('global page order preserves source rows and rejects missing, duplicate or foreign IDs',()=>{
 const pages=['a','b','c'].map((id,index)=>({page:{id,source:{pageNumber:index+1}},partIndex:index%2}));
 const moved=movePage(['a','b','c'],2,0);assert.deepEqual(orderPages(pages,moved,{strict:true}).map(p=>p.page.source.pageNumber),[3,1,2]);
 assert.deepEqual(pages.map(p=>p.page.id),['a','b','c']);
 for(const bad of [['a'],['a','a','c'],['a','b','z']])assert.throws(()=>validatePageOrder(bad,['a','b','c']),{code:'INVALID_PAGE_ORDER'});
});
