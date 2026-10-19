// List markers for PPT paragraphs. Symbol fonts (Wingdings, Symbol, ...) draw a bullet from an
// ordinary letter, e.g. Wingdings "l" is a black circle. A device without that font would show the
// letter itself, so the marker is turned into the Unicode character it stands for.
const SYMBOL_FONT=/^(?:wingdings(?: 2| 3)?|symbol|webdings|marlett)$/i;
const WINGDINGS={0x6c:'●',0x6d:'❍',0x6e:'■',0x6f:'□',0x70:'◻',0x71:'❑',0x72:'❒',0x73:'⬧',0x74:'⧫',0x75:'◆',0x76:'❖',0x77:'⬥',0x9f:'•',0xa1:'○',0xa7:'▪',0xa8:'◻',0xd8:'➢',0xe0:'→',0xe8:'➔',0xf0:'⇨',0xfb:'✗',0xfc:'✓',0xfe:'☑'};
const SYMBOL={0xb7:'•',0xa8:'♦',0xa9:'♥',0xaa:'♠',0xab:'↔',0xae:'→',0xd8:'¬',0xe0:'◊'};

/** The character to show for a buChar marker in the given bullet font ('' = the text's own font). */
export function bulletChar(char,font=''){
  const value=String(char||'');if(!value)return '';
  let code=value.codePointAt(0);
  const privateUse=code>=0xf020&&code<=0xf0ff;
  if(!privateUse&&!SYMBOL_FONT.test(String(font).trim()))return [...value][0];
  if(privateUse)code-=0xf000;
  const table=/^symbol$/i.test(String(font).trim())?SYMBOL:WINGDINGS;
  return table[code]||'•';
}

const roman=n=>{let out='';for(const [v,s] of [[1000,'m'],[900,'cm'],[500,'d'],[400,'cd'],[100,'c'],[90,'xc'],[50,'l'],[40,'xl'],[10,'x'],[9,'ix'],[5,'v'],[4,'iv'],[1,'i']])while(n>=v){out+=s;n-=v;}return out;};
const alpha=n=>{let out='';while(n>0){n--;out=String.fromCharCode(97+n%26)+out;n=Math.floor(n/26);}return out;};
const circled=n=>n>=1&&n<=20?String.fromCodePoint(0x2460+n-1):String(n);

/** "1.", "a)", "(iii)", "①" ... for a buAutoNum scheme at the given 1-based position. */
export function autoNumber(scheme,n){
  const s=String(scheme||'arabicPeriod'),number=Math.max(1,Math.min(9999,Math.floor(Number(n)||1)));
  const base=/^circleNum/.test(s)?circled(number):/^alphaLc/.test(s)?alpha(number):/^alphaUc/.test(s)?alpha(number).toUpperCase():/^romanLc/.test(s)?roman(number):/^romanUc/.test(s)?roman(number).toUpperCase():String(number);
  if(/^circleNum/.test(s)||/Plain$/.test(s))return base;
  if(/ParenBoth$/.test(s))return `(${base})`;
  if(/ParenR$/.test(s))return `${base})`;
  return `${base}.`;
}
