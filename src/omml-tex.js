// PowerPoint 수식(Office Math · OMML) → TeX: PPT 를 가져올 때 수식을 온바탕 수식 조각으로 살린다(app/pptx-import/converter.js).
// 거꾸로(TeX → OMML)는 src/omml.js. 여기서는 PowerPoint · Word 가 쓰는 OMML 요소(분수 · 루트 · 첨자 · 큰 연산자 · 괄호 · 함수 ·
// 극한 · 꾸밈표 · 줄 맞춤 · 행렬 · 상자 …)를 TeX 로 옮긴다. 모르는 요소가 나오면 오류를 낸다: 부르는 쪽은 원본의 그림을 쓴다.
// 글이 긴 글상자 안에 끼어 있는 수식은 수식 조각 대신 한 줄 글(ommlText: x=(−b±√(b²−4ac))/2a 처럼)로 넣는다.
export const M_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/math';
export const OMML_TEX_LIMIT = 600;          // 온바탕 수식 조각의 TeX 길이 한도(src/math.js 의 MATH_LIMITS.tex)

const kids = (n) => Array.prototype.filter.call(n?.childNodes || [], (k) => k.nodeType === 1);
const isM = (n, name) => !!n && n.namespaceURI === M_NS && n.localName === name;
const child = (n, name) => kids(n).find((k) => isM(k, name)) || null;
const val = (n) => (n ? n.getAttributeNS?.(M_NS, 'val') || n.getAttribute?.('m:val') || n.getAttribute?.('val') || '' : '');
const prop = (n, pr, name) => child(child(n, pr), name);
const on = (n, pr, name) => { const k = prop(n, pr, name); return !!k && !['0', 'off', 'false'].includes(val(k)); };

// 수학용 글자(𝑥 𝐱 ℝ …) → 보통 글자와 그 모양
const PLANCK = { '\u210e': 'h' };
const DOUBLE = { '\u2102': 'C', '\u210d': 'H', '\u2115': 'N', '\u2119': 'P', '\u211a': 'Q', '\u211d': 'R', '\u2124': 'Z' };
const BLOCKS = [[0x1d400, 'bold'], [0x1d434, 'italic'], [0x1d468, 'bold-italic'], [0x1d49c, 'script'], [0x1d4d0, 'bold-script'], [0x1d504, 'fraktur'], [0x1d538, 'double-struck'],
  [0x1d56c, 'bold-fraktur'], [0x1d5a0, 'sans-serif'], [0x1d5d4, 'bold-sans-serif'], [0x1d608, 'sans-serif-italic'], [0x1d63c, 'sans-serif-bold-italic'], [0x1d670, 'monospace']];
const GREEK = 'αβγδεζηθικλμνξοπρςστυφχψω';
export function plainLetter(ch) {
  if (PLANCK[ch]) return { ch: PLANCK[ch], style: 'italic' };
  if (DOUBLE[ch]) return { ch: DOUBLE[ch], style: 'double-struck' };
  const c = ch.codePointAt(0);
  for (const [start, style] of BLOCKS) if (c >= start && c < start + 52) { const k = c - start; return { ch: String.fromCharCode(k < 26 ? 65 + k : 97 + k - 26), style }; }
  if (c >= 0x1d7ce && c <= 0x1d7ff) return { ch: String((c - 0x1d7ce) % 10), style: 'bold' };
  if (c >= 0x1d6fc && c <= 0x1d714) return { ch: GREEK[c - 0x1d6fc] || ch, style: 'italic' };       // 기울인 그리스 소문자
  if (c >= 0x1d6e2 && c <= 0x1d6fa) return { ch: String.fromCharCode(0x391 + c - 0x1d6e2), style: 'italic' };
  return { ch, style: '' };
}
const FUNCS = new Set(['sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'sinh', 'cosh', 'tanh', 'coth', 'arcsin', 'arccos', 'arctan', 'log', 'ln', 'lg', 'exp', 'lim', 'max', 'min', 'sup', 'inf', 'det', 'gcd', 'deg', 'dim', 'ker', 'arg', 'Pr', 'liminf', 'limsup']);
const NARY = { '∑': '\\sum', '∏': '\\prod', '∐': '\\coprod', '∫': '\\int', '∬': '\\iint', '∭': '\\iiint', '∮': '\\oint', '⋃': '\\bigcup', '⋂': '\\bigcap', '⋁': '\\bigvee', '⋀': '\\bigwedge', '⨁': '\\bigoplus', '⨂': '\\bigotimes', '⨀': '\\bigodot', '⨄': '\\biguplus', '⨆': '\\bigsqcup' };
const DELIMS = { '(': '(', ')': ')', '[': '[', ']': ']', '{': '\\{', '}': '\\}', '|': '|', '‖': '\\|', '⟨': '\\langle', '⟩': '\\rangle', '〈': '\\langle', '〉': '\\rangle', '⌊': '\\lfloor', '⌋': '\\rfloor', '⌈': '\\lceil', '⌉': '\\rceil', '/': '/', '': '.' };
const ACCENTS = { '\u0302': 'hat', '\u0303': 'tilde', '\u0307': 'dot', '\u0308': 'ddot', '\u20d7': 'vec', '\u20d6': 'overleftarrow', '\u20e1': 'overleftrightarrow', '\u0305': 'bar', '\u00af': 'bar', '\u0304': 'bar', '\u0301': 'acute', '\u0300': 'grave', '\u0306': 'breve', '\u030c': 'check', '\u030a': 'mathring' };
const WIDE = { hat: 'widehat', tilde: 'widetilde', vec: 'overrightarrow', bar: 'overline' };
const SCRIPT_CMD = { 'double-struck': '\\mathbb', script: '\\mathcal', 'bold-script': '\\mathcal', fraktur: '\\mathfrak', 'bold-fraktur': '\\mathfrak', 'sans-serif': '\\mathsf', 'bold-sans-serif': '\\mathsf', 'sans-serif-italic': '\\mathsf', 'sans-serif-bold-italic': '\\mathsf', monospace: '\\mathtt' };
const HANGUL = /[\u1100-\u11ff\u3130-\u318f\uac00-\ud7a3]/;
// TeX 에서 뜻이 있는 글자는 글자 그대로 보이게
const texChar = (ch) => ({ '\u2212': '-', '{': '\\{', '}': '\\}', '#': '\\#', '$': '\\$', '%': '\\%', '&': '\\&', '_': '\\_', '\\': '\\backslash ', '^': '\\hat{}', '~': '\\sim ' }[ch] ?? ch);
export const textArg = (s) => String(s).replace(/[{}#$%&_\\^~]/g, (ch) => ({ '{': '\\{', '}': '\\}', '#': '\\#', '$': '\\$', '%': '\\%', '&': '\\&', '_': '\\_', '\\': '\\backslash', '^': '\\^{}', '~': '\\~{}' }[ch]));

/** OMML(a14:m · m:oMathPara · m:oMath 요소) → TeX. 옮기지 못하면 오류. */
export function ommlTex(node) {
  let budget = 0;
  // 첨자의 밑: 글자 하나 · 명령 하나(\\alpha · \\mathrm{H})는 그대로, 그 밖은 {} 로 묶는다(고치기 쉬운 b^{2} 꼴)
  const group = (s) => ([...s].length === 1 || /^(?:\\[A-Za-z]+ ?|\\[{}#$%&_]|\\(?:mathrm|mathbf|mathbb|mathcal|mathfrak|mathsf|mathtt)\{[A-Za-z0-9]\})$/.test(s) ? s : `{${s}}`);
  function run(r, ctx) {
    const rPr = child(r, 'rPr'), sty = val(child(rPr, 'sty')), nor = !!child(rPr, 'nor'), scr = val(child(rPr, 'scr'));
    const raw = kids(r).filter((k) => isM(k, 't')).map((k) => k.textContent || '').join('');
    if (!raw) return '';
    // 글(한글 · 띄어 쓴 낱말 · "보통 글"로 정한 것)은 \text
    if (nor || HANGUL.test(raw) || (sty === 'p' && /[A-Za-z]{2,}/.test(raw) && /\s/.test(raw.trim()))) return `\\text{${textArg(raw)}}`;
    let out = '';
    const letters = [...raw].map(plainLetter);
    const word = letters.map((l) => l.ch).join('');
    // 함수 이름(sin · log · lim …): 똑바로 쓴 낱말
    if (sty === 'p' && /^[A-Za-z]{2,}$/.test(word)) return FUNCS.has(word) ? `\\${word} ` : `\\mathrm{${word}}`;      // 화학식의 CO · Fe 도 똑바로
    for (const { ch, style } of letters) {
      if (/\s/.test(ch)) continue;
      const s = style || (scr ? { 'double-struck': 'double-struck', script: 'script', fraktur: 'fraktur', 'sans-serif': 'sans-serif', monospace: 'monospace' }[scr] || '' : '');
      let t = ch === '&' && ctx.eqArr ? '&' : texChar(ch);
      if (/[A-Za-z]/.test(ch)) {
        if (SCRIPT_CMD[s]) t = `${SCRIPT_CMD[s]}{${ch}}`;
        else if ((s === 'bold' || s === 'bold-italic' || sty === 'b' || sty === 'bi') && s !== 'italic') t = `\\mathbf{${ch}}`;
        else if (sty === 'p' && s !== 'italic') t = `\\mathrm{${ch}}`;
      }
      out += t;
    }
    return out;
  }
  const seq = (n, ctx) => kids(n).map((k) => one(k, ctx)).join('');
  const arg = (n, name, ctx) => { const a = child(n, name); return a ? seq(a, ctx) : ''; };
  function rows(n, ctx) { return kids(n).filter((k) => isM(k, 'e')).map((e) => seq(e, { ...ctx, eqArr: true })); }
  function matrix(n, ctx) { return kids(n).filter((k) => isM(k, 'mr')).map((r) => kids(r).filter((k) => isM(k, 'e')).map((e) => seq(e, ctx)).join(' & ')).join(' \\\\ '); }
  function one(n, ctx) {
    if (n.namespaceURI !== M_NS) {
      // PowerPoint 는 글자 속성(a:rPr)을 수식 안에 함께 적는다: 수식 내용이 아니다
      if (n.localName === 'rPr' || n.localName === 'm') return n.localName === 'm' ? seq(n, ctx) : '';
      throw Error(`OMML_UNSUPPORTED:${n.localName}`);
    }
    if (++budget > 5000) throw Error('OMML_TOO_BIG');
    switch (n.localName) {
      case 'oMathPara': {
        const lines = kids(n).filter((k) => isM(k, 'oMath')).map((k) => seq(k, ctx));
        return lines.length > 1 ? `\\begin{gathered}${lines.join(' \\\\ ')}\\end{gathered}` : lines.join('');
      }
      case 'oMath': case 'e': case 'num': case 'den': case 'sub': case 'sup': case 'deg': case 'lim': case 'fName': case 'argPr':
        return seq(n, ctx);
      case 'oMathParaPr': case 'rPr': case 'ctrlPr': case 'fPr': case 'radPr': case 'sSubPr': case 'sSupPr': case 'sSubSupPr': case 'sPrePr': case 'naryPr': case 'dPr': case 'funcPr':
      case 'limLowPr': case 'limUppPr': case 'accPr': case 'barPr': case 'groupChrPr': case 'boxPr': case 'borderBoxPr': case 'eqArrPr': case 'mPr': case 'phantPr': case 'bookmarkStart': case 'bookmarkEnd':
        return '';
      case 'r': return run(n, ctx);
      case 'f': {
        const type = val(prop(n, 'fPr', 'type')), a = arg(n, 'num', ctx), b = arg(n, 'den', ctx);
        if (type === 'lin') return `${group(a)}/${group(b)}`;
        if (type === 'noBar') return `\\genfrac{}{}{0pt}{}{${a}}{${b}}`;
        return `\\frac{${a}}{${b}}`;
      }
      case 'rad': {
        const deg = arg(n, 'deg', ctx), e = arg(n, 'e', ctx);
        return on(n, 'radPr', 'degHide') || !deg.trim() ? `\\sqrt{${e}}` : `\\sqrt[${deg}]{${e}}`;
      }
      case 'sSup': return `${group(arg(n, 'e', ctx))}^{${arg(n, 'sup', ctx)}}`;
      case 'sSub': return `${group(arg(n, 'e', ctx))}_{${arg(n, 'sub', ctx)}}`;
      case 'sSubSup': return `${group(arg(n, 'e', ctx))}_{${arg(n, 'sub', ctx)}}^{${arg(n, 'sup', ctx)}}`;
      case 'sPre': return `{}_{${arg(n, 'sub', ctx)}}^{${arg(n, 'sup', ctx)}}${group(arg(n, 'e', ctx))}`;
      case 'nary': {
        const chr = val(prop(n, 'naryPr', 'chr')) || '∫', loc = val(prop(n, 'naryPr', 'limLoc'));
        const cmd = NARY[chr] || chr, integral = /int$/.test(cmd);
        const limits = loc === 'undOvr' && integral ? '\\limits' : loc === 'subSup' && !integral ? '\\nolimits' : '';
        const sub = on(n, 'naryPr', 'subHide') ? '' : arg(n, 'sub', ctx), sup = on(n, 'naryPr', 'supHide') ? '' : arg(n, 'sup', ctx);
        return `${cmd}${limits}${sub ? `_{${sub}}` : ''}${sup ? `^{${sup}}` : ''} ${arg(n, 'e', ctx)}`;
      }
      case 'd': {
        const pr = child(n, 'dPr'), beg = child(pr, 'begChr') ? val(child(pr, 'begChr')) : '(', end = child(pr, 'endChr') ? val(child(pr, 'endChr')) : ')';
        const sep = child(pr, 'sepChr') ? val(child(pr, 'sepChr')) : '|';
        const parts = kids(n).filter((k) => isM(k, 'e'));
        const only = parts.length === 1 ? kids(parts[0]).filter((k) => k.namespaceURI === M_NS && k.localName !== 'ctrlPr') : [];
        // 연립(cases) · 괄호 행렬
        if (only.length === 1 && isM(only[0], 'eqArr') && beg === '{' && !end) return `\\begin{cases}${rows(only[0], ctx).join(' \\\\ ')}\\end{cases}`;
        if (only.length === 1 && isM(only[0], 'm') && beg === '{' && !end) return `\\begin{cases}${matrix(only[0], ctx)}\\end{cases}`;   // 두 칸 연립
        // \\binom: 괄호 안의 막대 없는 분수
        if (only.length === 1 && isM(only[0], 'f') && val(prop(only[0], 'fPr', 'type')) === 'noBar' && beg === '(' && end === ')') return `\\binom{${arg(only[0], 'num', ctx)}}{${arg(only[0], 'den', ctx)}}`;
        if (only.length === 1 && isM(only[0], 'm')) {
          const env = { '(': 'pmatrix', '[': 'bmatrix', '{': 'Bmatrix', '|': 'vmatrix', '‖': 'Vmatrix' }[beg];
          if (env && DELIMS[end] !== undefined) return `\\begin{${env}}${matrix(only[0], ctx)}\\end{${env}}`;
        }
        const d = (ch) => DELIMS[ch] ?? '.';
        return `\\left${d(beg)} ${parts.map((e) => seq(e, ctx)).join(` \\middle${d(sep)} `)} \\right${d(end)}`;
      }
      case 'func': {
        const name = arg(n, 'fName', ctx);
        return `${name.trim().startsWith('\\') || /[_^{]/.test(name) ? name.trim() : `\\operatorname{${name}}`} ${arg(n, 'e', ctx)}`;
      }
      case 'limLow': {
        const e = arg(n, 'e', ctx), lim = arg(n, 'lim', ctx);
        return /^\\(lim|max|min|sup|inf|liminf|limsup) ?$/.test(e) ? `${e.trim()}_{${lim}}` : `\\underset{${lim}}{${e}}`;
      }
      case 'limUpp': return `\\overset{${arg(n, 'lim', ctx)}}{${arg(n, 'e', ctx)}}`;
      case 'acc': {
        const chr = child(child(n, 'accPr'), 'chr') ? val(prop(n, 'accPr', 'chr')) : '\u0302';
        const name = ACCENTS[chr] || 'hat', e = arg(n, 'e', ctx);
        const wide = e.replace(/\\[a-z]+\{(.)\}/g, '$1').replace(/[{}\s]/g, '').length > 1;
        return `\\${wide && WIDE[name] ? WIDE[name] : name}{${e}}`;
      }
      case 'bar': return `\\${val(prop(n, 'barPr', 'pos')) === 'top' ? 'overline' : 'underline'}{${arg(n, 'e', ctx)}}`;
      case 'groupChr': {
        const chr = child(child(n, 'groupChrPr'), 'chr') ? val(prop(n, 'groupChrPr', 'chr')) : '⏟', top = val(prop(n, 'groupChrPr', 'pos')) === 'top', e = arg(n, 'e', ctx);
        if (chr === '⏟') return `\\underbrace{${e}}`;
        if (chr === '⏞') return `\\overbrace{${e}}`;
        return top ? `\\overset{${texChar(chr)}}{${e}}` : `\\underset{${texChar(chr)}}{${e}}`;
      }
      case 'box': return group(arg(n, 'e', ctx));
      case 'borderBox': {
        const e = arg(n, 'e', ctx), up = on(n, 'borderBoxPr', 'strikeBLTR'), down = on(n, 'borderBoxPr', 'strikeTLBR');
        return up && down ? `\\xcancel{${e}}` : up ? `\\cancel{${e}}` : down ? `\\bcancel{${e}}` : `\\boxed{${e}}`;
      }
      case 'eqArr': {
        const list = rows(n, ctx);
        return list.some((r) => r.includes('&')) ? `\\begin{aligned}${list.join(' \\\\ ')}\\end{aligned}` : `\\begin{gathered}${list.join(' \\\\ ')}\\end{gathered}`;
      }
      case 'm': return `\\begin{matrix}${matrix(n, ctx)}\\end{matrix}`;
      case 'phant': return on(n, 'phantPr', 'show') ? arg(n, 'e', ctx) : `\\phantom{${arg(n, 'e', ctx)}}`;
      default: throw Error(`OMML_UNSUPPORTED:${n.localName}`);
    }
  }
  const tex = one(node, {}).replace(/\s+/g, ' ').replace(/ ?(\\\\) ?/g, ' $1 ').trim();
  if (!tex) throw Error('OMML_EMPTY');
  if (tex.length > OMML_TEX_LIMIT) throw Error('OMML_TOO_LONG');
  return tex;
}

// ---------- 한 줄 글(긴 글상자 안의 수식) ----------
const SUP = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '+': '⁺', '-': '⁻', '−': '⁻', '=': '⁼', '(': '⁽', ')': '⁾', n: 'ⁿ', i: 'ⁱ' };
const SUB = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉', '+': '₊', '-': '₋', '−': '₋', '=': '₌', '(': '₍', ')': '₎' };
const small = (s, map) => ([...s].every((c) => map[c]) ? [...s].map((c) => map[c]).join('') : null);
const wrap = (s) => ([...s].length > 1 && !/^\(.*\)$/.test(s) ? `(${s})` : s);
/** OMML → 한 줄 글(PowerPoint 의 "선형" 모양과 비슷하게: 분수 a/b · 루트 √ · 첨자 ² ₂ ^( ) _( )). */
export function ommlText(node) {
  const seq = (n) => kids(n).map(one).join('');
  const arg = (n, name) => { const a = child(n, name); return a ? seq(a) : ''; };
  function one(n) {
    if (n.namespaceURI !== M_NS) return n.localName === 'm' ? seq(n) : '';
    switch (n.localName) {
      case 'r': return kids(n).filter((k) => isM(k, 't')).map((k) => [...(k.textContent || '')].map((c) => plainLetter(c).ch).join('')).join('');
      case 'f': return `${wrap(arg(n, 'num'))}/${wrap(arg(n, 'den'))}`;
      case 'rad': { const deg = on(n, 'radPr', 'degHide') ? '' : arg(n, 'deg').trim(); return `${deg === '3' ? '∛' : deg === '4' ? '∜' : deg ? `${small(deg, SUP) || `(${deg})`}√` : '√'}${wrap(arg(n, 'e'))}`; }
      case 'sSup': { const s = arg(n, 'sup'); return arg(n, 'e') + (small(s, SUP) || `^${wrap(s)}`); }
      case 'sSub': { const s = arg(n, 'sub'); return arg(n, 'e') + (small(s, SUB) || `_${wrap(s)}`); }
      case 'sSubSup': { const b = arg(n, 'sub'), p = arg(n, 'sup'); return arg(n, 'e') + (small(b, SUB) || `_${wrap(b)}`) + (small(p, SUP) || `^${wrap(p)}`); }
      case 'nary': { const chr = val(prop(n, 'naryPr', 'chr')) || '∫', b = on(n, 'naryPr', 'subHide') ? '' : arg(n, 'sub'), p = on(n, 'naryPr', 'supHide') ? '' : arg(n, 'sup'); return `${chr}${b ? `_${wrap(b)}` : ''}${p ? `^${wrap(p)}` : ''} ${arg(n, 'e')}`; }
      case 'd': { const pr = child(n, 'dPr'), beg = child(pr, 'begChr') ? val(child(pr, 'begChr')) : '(', end = child(pr, 'endChr') ? val(child(pr, 'endChr')) : ')', sep = child(pr, 'sepChr') ? val(child(pr, 'sepChr')) : '|'; return beg + kids(n).filter((k) => isM(k, 'e')).map(seq).join(sep) + end; }
      case 'func': return `${arg(n, 'fName')} ${arg(n, 'e')}`;
      case 'limLow': return `${arg(n, 'e')}_${wrap(arg(n, 'lim'))} `;
      case 'limUpp': return `${arg(n, 'e')}^${wrap(arg(n, 'lim'))}`;
      case 'acc': return arg(n, 'e') + (child(child(n, 'accPr'), 'chr') ? val(prop(n, 'accPr', 'chr')) : '\u0302');
      case 'bar': return arg(n, 'e') + (val(prop(n, 'barPr', 'pos')) === 'top' ? '\u0305' : '\u0332');
      case 'eqArr': return kids(n).filter((k) => isM(k, 'e')).map(seq).join(', ');
      case 'm': return kids(n).filter((k) => isM(k, 'mr')).map((r) => kids(r).filter((k) => isM(k, 'e')).map(seq).join(' ')).join('; ');
      case 'oMathPara': return kids(n).filter((k) => isM(k, 'oMath')).map(seq).join(' ');
      case 'phant': return on(n, 'phantPr', 'show') ? arg(n, 'e') : '';
      case 'oMath': case 'e': case 'num': case 'den': case 'sub': case 'sup': case 'deg': case 'lim': case 'fName': case 'box': case 'borderBox': case 'groupChr':
        return seq(n);
      default: return '';
    }
  }
  return one(node).replace(/\s+/g, ' ').trim();
}
