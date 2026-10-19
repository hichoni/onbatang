import test from 'node:test';
import assert from 'node:assert/strict';
import {materialPageDescription,materialPageLabel,materialPreviewPages} from '../app/material-preview.js';

test('whole-deck preview follows page IDs across parts and labels added apps/results without borrowed original numbers',()=>{
  const original=n=>({id:`source${n}`,source:{kind:'pptx',pageNumber:n}});
  const records=[{id:'part1',slides:[original(1),{id:'app',source:{kind:'local'},activity:{kind:'gai-app'}},{id:'result',source:{kind:'result',pageNumber:1}}]},{id:'part2',slides:[original(13),original(19)]}];
  const before=structuredClone(records),order=['source19','source1','source13','app','result'];
  const pages=materialPreviewPages(records,order);
  assert.deepEqual(pages.map(p=>materialPageLabel(p.page,pages.indexOf(p)+1)),['1쪽 · 원본 19쪽','2쪽 · 원본 1쪽','3쪽 · 원본 13쪽','4쪽 · 수업 앱','5쪽 · 활동 결과']);
  assert.equal(pages[3].index,1,'original local index stays usable for opening the correct part');
  assert.deepEqual(records,before,'preview does not rewrite source numbers or saved payloads');
});
test('unranked draft additions stay visible and receive their own page type',()=>{
  const records=[{id:'a',slides:[{id:'old',source:{kind:'pptx',pageNumber:6}},{id:'new',activity:{kind:'pixel-art'}}]}];
  assert.deepEqual(materialPreviewPages(records,['old']).map(p=>materialPageDescription(p.page)),['원본 6쪽','픽셀아트 활동']);
  assert.equal(materialPageDescription({source:{pageNumber:7}}),'새 쪽');
});
