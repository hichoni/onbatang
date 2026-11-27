// A generated proposal always targets the captured document state, never a later edit.
export const emptyAiPage = page => !!page && !(page.items?.length || page.notes || page.video || page.web || page.activity || page.voice || page.topic || page.hidden);
export function insertAiPages(current, base, at, pages, max = 100, insertAt) {
  if (!Array.isArray(base) || JSON.stringify(current) !== JSON.stringify(base)) throw Error('생성을 부탁한 뒤 발표가 바뀌었어요. 현재 내용을 보존했으니 다시 생성해 주세요.');
  if (!Number.isInteger(at) || !current[at] || !Array.isArray(pages) || !pages.length) throw Error('장을 넣을 위치를 다시 확인해 주세요.');
  if (insertAt !== undefined && (!Number.isInteger(insertAt) || insertAt < 0 || insertAt > current.length)) throw Error('새 장을 넣을 위치를 다시 확인해 주세요.');
  const replace = insertAt === undefined && emptyAiPage(current[at]);
  if (current.length + pages.length - (replace ? 1 : 0) > max) throw Error(`한 발표에는 ${max}장까지 넣을 수 있어요. 장 수를 줄여 주세요.`);
  const index = insertAt ?? (at + (replace ? 0 : 1)), slides = current.slice();
  slides.splice(index, replace ? 1 : 0, ...structuredClone(pages));
  return { slides, at: index };
}
