import {orderPages} from './page-order.js';

// Display position belongs to the whole deck. Source page numbers belong only
// to the original PPT page, never to a part's local array index or its neighbour.
export function materialPageDescription(page){
  if(page.source?.kind==='pptx'&&Number.isSafeInteger(page.source.pageNumber)&&page.source.pageNumber>0)return `원본 ${page.source.pageNumber}쪽`;
  if(page.source?.kind==='result')return '활동 결과';
  if(page.activity?.kind==='gai-app')return '수업 앱';
  if(page.activity?.kind==='pixel-art')return '픽셀아트 활동';
  return '새 쪽';
}
export const materialPageLabel=(page,position)=>`${position}쪽 · ${materialPageDescription(page)}`;
export function materialPreviewPages(records,pageOrder){
  return orderPages(records.flatMap(record=>record.slides.map((page,index)=>({record,page,index}))),pageOrder);
}
