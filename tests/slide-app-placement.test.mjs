import test from 'node:test';
import assert from 'node:assert/strict';
import {newGaiActivity,placeGaiOnSlide,GAI_APP_BRIDGE_MARKER,GAI_APP_CHECKPOINT_MARKER} from '../src/gai-app.js';

test('in-place activity keeps the PPT source, artwork and neighbors; missing or ambiguous targets are rejected',()=>{
 const pages=[{id:'ppage001',items:[]},{id:'ppage002',source:{kind:'pptx',pageNumber:14},notes:'교사 메모',items:[{t:'text',text:'원본'}]}],record={slides:pages};
 const app=newGaiActivity({title:'분수 활동',project:{},document:JSON.stringify(GAI_APP_BRIDGE_MARKER)+GAI_APP_CHECKPOINT_MARKER});
 const result=placeGaiOnSlide(record,'ppage002',app);
 assert.equal(result.slides.length,2);assert.equal(result.slides[0],pages[0]);
 const {activity,...original}=result.slides[1];assert.deepEqual(original,pages[1]);assert.equal(activity.placement,'on-slide');
 assert.equal(pages[1].activity,undefined);assert.throws(()=>placeGaiOnSlide(record,'pmissing',app));
 assert.throws(()=>placeGaiOnSlide({slides:[pages[1],pages[1]]},'ppage002',app));
});
