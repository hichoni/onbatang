import {titleOf} from './ai-edits.js';

// These suggestions are shown before submitting. The user's explicit scope always wins.
const counts = { 한:1, 하나:1, 두:2, 둘:2, 세:3, 셋:3, 네:4, 넷:4, 다섯:5, 여섯:6, 일곱:7, 여덟:8, 아홉:9, 열:10 };
const countWord = '(\\d+|'+Object.keys(counts).join('|')+')';
const quantity = new RegExp(countWord+'\\s*장(?:을|만|씩)?\\s*(?:더\\s*)?(?:추가|넣|만들|붙|늘|보태|이어)');
const namedCount = new RegExp('(?:슬라이드|장면|페이지|(?:^|\\s)장)(?:을|를)?\\s*'+countWord+'\\s*(?:개|장)?\\s*(?:를|을)?\\s*(?:더\\s*)?(?:추가|넣|만들|붙|보태)');
const looseCount = new RegExp(countWord+'\\s*장(?!\\s*(?:앞|뒤|다음|전|후|의|에서|에))');
const pageNoun = /(?:슬라이드|페이지|장면|(?:^|\s)장)(?:을|를|도)?\s*(?:새로\s*)?(?:추가|확장|늘려|늘리|덧붙|보태)/;
const mediaCount = /(?:사진|이미지|그림|카드|도표|표)(?:을|를)?\s*$/;
const deckWords = /(?:발표|자료|덱|슬라이드|페이지)\s*전체|(?:전체|모든|모두|각각의|각)\s*(?:장|슬라이드|페이지|발표)|(?:장|슬라이드|페이지)마다|전체적으로/;

export function requestTarget(text, {scope, at, total, picked, canInsert}) {
  const prompt = text.trim();
  const amount = namedCount.exec(prompt) || quantity.exec(prompt);
  const media = amount && mediaCount.test(prompt.slice(0,amount.index));
  const adding = !media && (pageNoun.test(prompt) || amount ||
    /새\s*(?:슬라이드|페이지|장)(?:을|를)?\s*(?:더|추가|넣|만들|붙)|(?:발표|스토리)\s*(?:를|을)?\s*확장/.test(prompt));
  if (canInsert && (scope === 'insert' || scope === 'auto' && adding)) {
    const anchor = /(\d+)\s*(?:번째\s*)?(?:장|페이지|슬라이드)\s*(앞|뒤|다음|전|후)/.exec(prompt);
    const after = /마지막|맨\s*(?:뒤|끝)|끝에/.test(prompt);
    const before = /맨\s*(?:앞|처음)|첫\s*장\s*앞/.test(prompt);
    const matches = amount || looseCount.exec(anchor ? prompt.replace(anchor[0],'') : prompt);
    const count = matches ? Number(counts[matches[1]] ?? matches[1]) : 1;
    const position = anchor ? Number(anchor[1]) - Number(['앞','전'].includes(anchor[2])) :
      before ? 0 : after ? total : at + 1;
    const invalidAnchor = !!anchor && (Number(anchor[1]) < 1 || Number(anchor[1]) > total);
    return {kind:'insert',count,position,invalidAnchor};
  }
  if (scope === 'auto' && prompt) {
    if (deckWords.test(prompt)) scope = 'all';
    else if (/선택한\s*(?:요소|글|사진|도형|제목)/.test(prompt)) scope = 'selection';
    else if (/(?:지금|현재|이번|이)\s*(?:장|슬라이드|페이지)/.test(prompt)) scope = 'here';
    else {
      // A bare page reference can narrow the edit. Let the model see the deck for
      // ranges, comparisons and other requests involving more than one page.
      const targetText=media ? prompt.slice(0,amount.index)+prompt.slice(amount.index+amount[0].length) : prompt;
      const numbers = [...targetText.matchAll(/(\d+)\s*(?:번째\s*)?(?:장|슬라이드|페이지)/g)];
      if (numbers.length === 1 && !/[~～–]|부터|까지|\d\s*[-,·]/.test(prompt)) {
        const i = Number(numbers[0][1])-1;
        return {kind:'pick',picks:i>=0 && i<total ? [i] : []};
      }
      scope = media ? 'here' : 'all';
    }
  }
  const picks = scope === 'pick' ? [...picked].sort((a,b)=>a-b) :
    scope === 'all' ? Array.from({length:total},(_,i)=>i) : [at];
  return {kind:scope,picks};
}

export function insertionReference(title, slides, position) {
  const outline = slides.map((s,i)=>`${i+1}장 · ${s.topic || titleOf(s) || '제목 없음'}`);
  const nearby = slides.slice(Math.max(0,position-1),position+1).map(s=>({
    title:titleOf(s),background:s.bg,
    text:(s.items || []).filter(it=>it.t==='text').slice(0,6).map(it=>({
      text:String(it.text || '').slice(0,160),font:it.font,color:it.color,size:it.size
    }))
  }));
  return [`기존 발표 「${title}」에 새 장만 작성합니다. 삽입 위치는 ${position}개 장 다음입니다.`,
    '인접한 장의 이야기와 시각 스타일을 이어 주세요.',JSON.stringify(nearby),...outline].join('\n').slice(0,16000);
}
