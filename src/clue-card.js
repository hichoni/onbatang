// A teacher writes the question and clues. The answer always comes from the
// current text box, so editing the slide also edits the answer.
export const CLUE_LIMITS = Object.freeze({ prompt:80, hint:64, hints:3, answer:80 });
const plain = value => typeof value === 'string' ? value.trim().replace(/\s+/gu,' ') : '';
const bounded = (value,length) => Array.from(plain(value)).slice(0,length).join('');

export function clueOptions(raw = {}) {
  const prompt = bounded(raw.prompt,CLUE_LIMITS.prompt);
  const hints = Array.isArray(raw.hints)
    ? raw.hints.slice(0,CLUE_LIMITS.hints).map(value=>bounded(value,CLUE_LIMITS.hint)).filter(Boolean) : [];
  return {...(prompt && {prompt}), ...(hints.length && {hints})};
}

export function clueAnswer(item) {
  const text = plain(item?.text);
  return item?.t==='text' && text && Array.from(text).length<=CLUE_LIMITS.answer ? {t:'text',text} : null;
}

const demo = {prompt:'화면에서 색 하나를 담는 가장 작은 칸을 무엇이라고 할까요?',
  hints:['사진을 아주 크게 확대하면 볼 수 있어요.','이 칸이 모이면 하나의 그림이 돼요.']};
const defaultPrompt = '어떤 답이 떠오르나요?';

function drawClue({part,ink,content,step,options}) {
  const {prompt=defaultPrompt,hints=[]}=options;
  const last=hints.length+1, final=step===last;
  const paper=final?'#E3F2E5':'#FCF5E4', type='#1D3331';
  function label(text,x,y,size,color,attrs={},frames) {
    const node=part('text',{x,y,fill:color,'font-size':size,'font-family':'system-ui,sans-serif',...attrs},frames,0,320);
    node.textContent=text;
  }
  part('rect',{width:720,height:360,rx:14,fill:'#142E31'});
  label('수업 단서 카드',31,37,19,ink[0],{'font-weight':750});
  label((step+1)+' / '+(last+1),686,36,17,'#D1DDD4',{'text-anchor':'end'});
  part('rect',{x:30,y:60,width:660,height:246,rx:10,fill:paper});
  // Try large text first. Wrap on word boundaries, including a single long
  // unspaced Korean/Latin word, within the same printable area.
  const ctx=document.createElement('canvas').getContext('2d');
  function paragraph(value,center,height,sizes,color,weight,animate) {
    let lines,size;
    for(size of sizes){
      ctx.font=weight+' '+size+'px system-ui,sans-serif';lines=[''];
      for(const word of value.split(' ')){
        const tokens=ctx.measureText(word).width>605?Array.from(word):[word];
        for(const [i,token] of tokens.entries()){
          const row=lines.length-1, candidate=lines[row]+(lines[row]&&i===0?' ':'')+token;
          if(lines[row]&&ctx.measureText(candidate).width>605)lines.push(token);
          else lines[row]=candidate;
        }
      }
      if(lines.length*size*1.24<=height)break;
    }
    const y=center-(lines.length-1)*size*.62+size*.33;
    lines.forEach((line,i)=>label(line,56,y+i*size*1.24,size,color,{'font-weight':weight},
      animate?[{opacity:0,transform:'translateY(7px)'},{opacity:1,transform:'none'}]:null));
  }
  if(step)paragraph(prompt,98,65,[23,20,17,15],'#405C56',550,false);
  const ruleY=step?147:115;
  part('path',{d:'M56 '+ruleY+'h606',stroke:'#A7BCAD'});
  label(final?'정답':step?'힌트 '+step:'질문',56,step?177:100,18,'#37665C',{'font-weight':750});
  paragraph(final?content.text:step?hints[step-1]:prompt,step?235:211,step?104:150,[48,39,32,26,21,18],type,700,true);
  for(let i=0;i<=last;i++)part('rect',{x:31+i*31,y:330,width:23,height:5,rx:2.5,fill:i<=step?ink[0]:'#476260'});
}

export const CLUE_CARD = {
  id:'cluecard',name:'단서 카드',requires:'80자 이하 글 조각',hint:'고른 글을 정답으로 가리고, 직접 쓴 질문과 힌트를 차례로 공개해요.',
  example:{t:'text',text:'픽셀'},demo,draw:drawClue,
  last:(_content,options={})=>(options.hints?.length||0)+1,
  next:(step,_content,options={})=>step<(options.hints?.length||0)?'힌트 '+(step+1)+' 공개':'정답 공개',
};
