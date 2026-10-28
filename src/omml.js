// 수식 → Office 수식(OMML): PowerPoint · Word 에서 그대로 고칠 수 있는 수식으로 내보낼 때 쓴다(app/pptx.js).
// MathJax 가 TeX 에서 만든 MathML 을 받아 OMML 로 옮긴다. MathJax 가 만드는 모양(분수 · 루트 · 첨자 · 합 · 적분 · 극한 · 괄호 ·
// 연립(cases) · 행렬 · 벡터 같은 꾸밈표 · 화학식 mhchem)을 다루고, 모르는 것이 나오면 오류를 낸다: 그때 부르는 쪽은 그림으로 내보낸다.
// 글자 하나하나(m:r)에 PowerPoint 의 글자 속성(a:rPr: 크기 · 색 · Cambria Math)을 붙인다. 변수(한 글자 mi)는 OMML 의 기본(기울임)으로 두고,
// 숫자 · 기호 · 함수 이름 · 글(한글)은 똑바로(m:sty p) 둔다.
const MATH_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/math';
export const OMML_LIMITS = Object.freeze({ depth: 60, nodes: 6000, chars: 400000 });

const esc = (s) => String(s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const name = (n) => (n.localName || n.nodeName || '').replace(/^.*:/, '');
const kids = (n) => Array.prototype.filter.call(n.childNodes || [], (k) => k.nodeType === 1);   // 브라우저 · xmldom 둘 다(xmldom 의 목록은 for…of 를 못 쓴다)
const attr = (n, key) => (n.getAttribute ? n.getAttribute(key) || '' : '');
const text = (n) => String(n.textContent || '');
// 큰 연산자(합 · 곱 · 적분 …): 아래 · 위 범위와 뒤따르는 식을 하나의 m:nary 로
const NARY = new Set(['∑', '∏', '∐', '∫', '∬', '∭', '∮', '∯', '∰', '⋃', '⋂', '⋁', '⋀', '⨁', '⨂', '⨀', '⨄', '⨆']);
// 위에 붙는 꾸밈표(MathML 의 mo) → OMML 의 결합 문자(m:acc 의 chr)
const ACCENTS = { '\u2192': '\u20d7', '\u27f6': '\u20d7', '\u2190': '\u20d6', '^': '\u0302', '\u02c6': '\u0302', '~': '\u0303', '\u02dc': '\u0303', '\u02d9': '\u0307', '\u00a8': '\u0308', '\u00b4': '\u0301', '\u02ca': '\u0301', '`': '\u0300', '\u02cb': '\u0300', '\u02d8': '\u0306', '\u02c7': '\u030c', '\u02da': '\u030a', '\u20d7': '\u20d7' };
const BARS = new Set(['\u00af', '\u203e', '\u2015', '_', '\u2017', '\u2212', '\u2014']);
const INVISIBLE = new Set(['\u2061', '\u2062', '\u2063', '\u2064']);
// 식 안의 관계 기호: 큰 연산자의 몸통(뒤따르는 식)은 여기서 끝난다
const STOPS = new Set(['=', '<', '>', '≤', '≥', '≠', '≈', '≡', '∼', '≃', '≅', '∝', '→', '⟶', '⇒', '⟹', '⇔', '⟺', '↔', '⇌', ',', ';']);
const VARIANTS = { normal: 'p', bold: 'b', italic: 'i', 'bold-italic': 'bi' };
const SCRIPTS = { 'double-struck': 'double-struck', script: 'script', 'bold-script': 'script', fraktur: 'fraktur', 'bold-fraktur': 'fraktur', 'sans-serif': 'sans-serif', 'bold-sans-serif': 'sans-serif', 'sans-serif-italic': 'sans-serif', monospace: 'monospace' };

/**
 * MathML(문서의 math 요소 · DOM) → OMML 글(<m:oMathPara> …). 못 옮기는 것이 있으면 오류를 낸다.
 * size: 글자 크기(1/100 pt, PowerPoint 의 sz) · color: '#rrggbb' · alpha: 0~100(불투명도)
 */
export function mathmlToOmml(math, { size = 2800, color = '#1d2433', alpha = 100 } = {}) {
  if (!math || name(math) !== 'math') throw Error('OMML_NOT_MATH');
  const sz = Math.max(100, Math.min(400000, Math.round(size)));
  const budget = { nodes: 0 };
  const fill = (c) => `<a:solidFill><a:srgbClr val="${(/^#[0-9a-f]{6}$/i.test(c) ? c : '#1d2433').slice(1).toUpperCase()}">${alpha < 100 ? `<a:alpha val="${Math.round(Math.max(0, alpha) * 1000)}"/>` : ''}</a:srgbClr></a:solidFill>`;
  const rpr = (ctx, { italic = false, bold = false, hangul = false } = {}) =>
    `<a:rPr lang="${hangul ? 'ko-KR' : 'en-US'}" sz="${sz}" b="${bold ? 1 : 0}" i="${italic ? 1 : 0}">${fill(ctx.color)}<a:latin typeface="Cambria Math" panose="02040503050406030204" pitchFamily="18" charset="0"/><a:ea typeface="맑은 고딕"/></a:rPr>`;
  const ctrl = (ctx) => `<m:ctrlPr>${rpr(ctx, { italic: true })}</m:ctrlPr>`;
  // 글자 묶음 하나(m:r). sty: 'p'(똑바로) · 'b' · 'bi' · 'i' · ''(OMML 기본: 글자는 기울임) · scr: 글꼴 모양(겹선 · 필기체 …)
  const run = (ctx, s, { sty = 'p', scr = '' } = {}) => {
    if (!s) return '';
    const hangul = /[\u1100-\u11ff\u3130-\u318f\uac00-\ud7a3]/.test(s);
    const props = scr || sty ? `<m:rPr>${scr ? `<m:scr m:val="${scr}"/>` : ''}${sty ? `<m:sty m:val="${sty}"/>` : ''}</m:rPr>` : '';
    return `<m:r>${props}${rpr(ctx, { italic: sty === '' || sty === 'i' || sty === 'bi', bold: sty === 'b' || sty === 'bi', hangul })}<m:t xml:space="preserve">${esc(s)}</m:t></m:r>`;
  };
  const withColor = (ctx, n) => { const c = attr(n, 'mathcolor'); return /^#[0-9a-f]{6}$/i.test(c) ? { ...ctx, color: c } : ctx; };
  const arg = (tag, inner) => `<m:${tag}>${inner}</m:${tag}>`;

  // 비어 보이는 것(받침만 하는 mhchem 의 투명한 글자 · 빈 묶음): 첨자를 앞의 것에 붙일 때 본다
  const empty = (n) => {
    const t = name(n);
    if (t === 'mphantom' || t === 'mspace') return true;
    if (['mrow', 'mstyle', 'mpadded', 'semantics'].includes(t)) return kids(n).every(empty);
    if (['mi', 'mn', 'mo', 'mtext'].includes(t)) return !text(n).trim() || INVISIBLE.has(text(n).trim());
    return false;
  };
  const opText = (n) => {
    // 한 겹 감싼 mrow · TeXAtom 안의 mo 하나(예: \sum 의 OP)
    let k = n;
    while (k && ['mrow', 'mstyle'].includes(name(k)) && kids(k).length === 1) k = kids(k)[0];
    return k && name(k) === 'mo' ? text(k).trim() : '';
  };
  // 괄호: 여는 · 닫는 mo(\left · \right), 또는 그것을 한 겹 감싼 mrow(\binom 처럼 크기를 정한 괄호)
  const bracket = (k, side) => {
    if (!k) return null;
    if (name(k) === 'mo') return attr(k, 'data-mjx-texclass') === side || attr(k, 'fence') === 'true' ? k : null;
    const c = kids(k);
    return name(k) === 'mrow' && attr(k, 'data-mjx-texclass') === side && c.length === 1 && name(c[0]) === 'mo' ? c[0] : null;
  };
  const fence = (n) => {
    const c = kids(n);
    if (c.length < 2) return null;
    const open = bracket(c[0], 'OPEN'), close = bracket(c[c.length - 1], 'CLOSE');
    return open && close ? [text(open).trim(), text(close).trim()] : null;
  };

  // 차례로 놓인 것들. 큰 연산자 · 함수 · 앞에 붙는 첨자(mhchem)를 여기서 묶는다.
  function seq(list, ctx, depth) {
    const out = [];
    for (let i = 0; i < list.length; i++) {
      const n = list[i], t = name(n);
      // 큰 연산자: (첨자 · 아래 · 위가 붙은) ∑ ∫ … → m:nary. 몸통은 관계 기호(=)나 끝까지
      const base = ['msub', 'msup', 'msubsup', 'munder', 'mover', 'munderover'].includes(t) ? kids(n)[0] : t === 'mo' ? n : null;
      const op = base ? opText(base) : '';
      if (op && NARY.has(op)) {
        const parts = kids(n);
        const under = ['msub', 'munder', 'msubsup', 'munderover'].includes(t) ? parts[1] : null;
        const over = t === 'msup' || t === 'mover' ? parts[1] : t === 'msubsup' || t === 'munderover' ? parts[2] : null;
        const body = [];
        while (i + 1 < list.length && !(name(list[i + 1]) === 'mo' && STOPS.has(text(list[i + 1]).trim()))) body.push(list[++i]);
        const loc = t.startsWith('mu') || (t === 'mo' && op !== '∫') ? 'undOvr' : 'subSup';
        out.push(`<m:nary><m:naryPr><m:chr m:val="${esc(op)}"/><m:limLoc m:val="${loc}"/>${under ? '' : '<m:subHide m:val="1"/>'}${over ? '' : '<m:supHide m:val="1"/>'}${ctrl(ctx)}</m:naryPr>`
          + arg('sub', under ? one(under, ctx, depth) : '') + arg('sup', over ? one(over, ctx, depth) : '') + arg('e', seq(body, ctx, depth)) + '</m:nary>');
        continue;
      }
      // 함수(sin x · lim …): 이름 다음의 보이지 않는 "함수 적용" 표시(U+2061) 또는 아래첨자가 붙은 lim → m:func
      const word = (k) => !!k && name(k) === 'mi' && text(k).trim().length > 1;
      const fname = word(n) || (['msub', 'msup', 'msubsup'].includes(t) && word(kids(n)[0])) ? n            // sin x · sin² θ · log₂ 8
        : t === 'munder' && /^[A-Za-z]{2,}$/.test(opText(kids(n)[0]) || text(kids(n)[0]).trim()) ? n : null;   // lim
      if (fname) {
        let j = i + 1;
        if (j < list.length && name(list[j]) === 'mo' && INVISIBLE.has(text(list[j]).trim())) j++;
        if (j < list.length && (j > i + 1 || t === 'munder') && !(name(list[j]) === 'mo' && STOPS.has(text(list[j]).trim()))) {
          out.push(`<m:func><m:funcPr>${ctrl(ctx)}</m:funcPr>${arg('fName', one(n, ctx, depth))}${arg('e', one(list[j], ctx, depth))}</m:func>`);
          i = j;
          continue;
        }
      }
      // 앞에 붙는 첨자: 밑이 비어 있으면(mhchem 의 H₂) 바로 앞의 것을 밑으로 쓴다
      if (['msub', 'msup', 'msubsup'].includes(t) && empty(kids(n)[0])) {
        const prev = out.length ? out.pop() : '';
        out.push(script(n, ctx, depth, prev));
        continue;
      }
      out.push(one(n, ctx, depth));
    }
    return out.join('');
  }
  function script(n, ctx, depth, baseXml = null) {
    const t = name(n), [b, x, y] = kids(n);
    const e = arg('e', baseXml ?? one(b, ctx, depth));
    if (t === 'msub') return `<m:sSub><m:sSubPr>${ctrl(ctx)}</m:sSubPr>${e}${arg('sub', one(x, ctx, depth))}</m:sSub>`;
    if (t === 'msup') return `<m:sSup><m:sSupPr>${ctrl(ctx)}</m:sSupPr>${e}${arg('sup', one(x, ctx, depth))}</m:sSup>`;
    return `<m:sSubSup><m:sSubSupPr>${ctrl(ctx)}</m:sSubSupPr>${e}${arg('sub', one(x, ctx, depth))}${arg('sup', one(y, ctx, depth))}</m:sSubSup>`;
  }
  function table(n, ctx, depth) {
    const rows = kids(n).filter((r) => ['mtr', 'mlabeledtr'].includes(name(r))).map((r) => kids(r).filter((c) => name(c) === 'mtd').slice(name(r) === 'mlabeledtr' ? 1 : 0));
    if (!rows.length) return '';
    const cols = Math.max(...rows.map((r) => r.length));
    // 한 줄에 한 칸이면 줄 맞춤 식(m:eqArr: 연립 방정식 · cases), 아니면 행렬(m:m)
    if (cols <= 1) return `<m:eqArr><m:eqArrPr>${ctrl(ctx)}</m:eqArrPr>${rows.map((r) => arg('e', r[0] ? seq(kids(r[0]), ctx, depth) : '')).join('')}</m:eqArr>`;
    const align = { left: 'left', right: 'right' }[String(attr(n, 'columnalign')).split(/\s+/)[0]] || 'center';
    return `<m:m><m:mPr><m:mcs><m:mc><m:mcPr><m:count m:val="${cols}"/><m:mcJc m:val="${align}"/></m:mcPr></m:mc></m:mcs>${ctrl(ctx)}</m:mPr>`
      + rows.map((r) => `<m:mr>${Array.from({ length: cols }, (_, k) => arg('e', r[k] ? seq(kids(r[k]), ctx, depth) : '')).join('')}</m:mr>`).join('') + '</m:m>';
  }
  function one(n, ctx, depth) {
    if (!n) return '';
    if (++budget.nodes > OMML_LIMITS.nodes || depth > OMML_LIMITS.depth) throw Error('OMML_TOO_BIG');
    const t = name(n), d = depth + 1;
    ctx = withColor(ctx, n);
    switch (t) {
      case 'math': case 'mstyle': case 'mpadded': case 'TeXAtom':
        return seq(kids(n), ctx, d);
      case 'semantics':
        return one(kids(n)[0], ctx, d);
      case 'mrow': {
        const pair = fence(n);
        if (pair) {
          const c = kids(n), [beg, end] = pair;
          return `<m:d><m:dPr><m:begChr m:val="${esc(beg)}"/><m:endChr m:val="${esc(end)}"/>${ctrl(ctx)}</m:dPr>${arg('e', seq(c.slice(1, -1), ctx, d))}</m:d>`;
        }
        return seq(kids(n), ctx, d);
      }
      case 'mphantom': case 'annotation': case 'annotation-xml': case 'none': case 'mprescripts':
        return '';
      case 'mi': {
        const s = text(n).trim(), v = attr(n, 'mathvariant');
        if (SCRIPTS[v]) return run(ctx, s, { sty: v.includes('italic') ? 'i' : 'p', scr: SCRIPTS[v] });
        // 한 글자 변수는 OMML 기본(기울임), 여러 글자(sin · log …)는 똑바로
        const sty = v ? VARIANTS[v] ?? 'p' : [...s].length === 1 ? '' : 'p';
        return run(ctx, s, { sty });
      }
      case 'mn':
        return run(ctx, text(n).trim(), { sty: VARIANTS[attr(n, 'mathvariant')] || 'p' });
      case 'mo': {
        const s = text(n).trim();
        return INVISIBLE.has(s) ? '' : run(ctx, s, { sty: 'p' });
      }
      case 'mtext': case 'ms':
        return run(ctx, text(n).replace(/\s+/g, ' '), { sty: VARIANTS[attr(n, 'mathvariant')] || 'p' });
      case 'mspace': {
        const w = parseFloat(attr(n, 'width'));
        return !(w > 0) ? '' : run(ctx, w >= 0.9 ? '\u2003' : w >= 0.4 ? '\u2002' : '\u2009', { sty: 'p' });
      }
      case 'mfrac': {
        const [a, b] = kids(n), flat = /^0(?:\D|$)/.test(attr(n, 'linethickness'));
        return `<m:f><m:fPr>${flat ? '<m:type m:val="noBar"/>' : ''}${ctrl(ctx)}</m:fPr>${arg('num', one(a, ctx, d))}${arg('den', one(b, ctx, d))}</m:f>`;
      }
      case 'msqrt':
        return `<m:rad><m:radPr><m:degHide m:val="1"/>${ctrl(ctx)}</m:radPr><m:deg/>${arg('e', seq(kids(n), ctx, d))}</m:rad>`;
      case 'mroot': {
        const [b, k] = kids(n);
        return `<m:rad><m:radPr>${ctrl(ctx)}</m:radPr>${arg('deg', one(k, ctx, d))}${arg('e', one(b, ctx, d))}</m:rad>`;
      }
      case 'msub': case 'msup': case 'msubsup':
        return script(n, ctx, d);
      case 'mover': case 'munder': case 'munderover': {
        const [b, x, y] = kids(n);
        const mark = (k) => (k && name(k) === 'mo' ? text(k).trim() : '');
        if (t === 'mover' && ACCENTS[mark(x)]) return `<m:acc><m:accPr><m:chr m:val="${ACCENTS[mark(x)]}"/>${ctrl(ctx)}</m:accPr>${arg('e', one(b, ctx, d))}</m:acc>`;
        if (t !== 'munderover' && BARS.has(mark(x))) return `<m:bar><m:barPr><m:pos m:val="${t === 'mover' ? 'top' : 'bot'}"/>${ctrl(ctx)}</m:barPr>${arg('e', one(b, ctx, d))}</m:bar>`;
        const low = (e, lim) => `<m:limLow><m:limLowPr>${ctrl(ctx)}</m:limLowPr>${arg('e', e)}${arg('lim', lim)}</m:limLow>`;
        const upp = (e, lim) => `<m:limUpp><m:limUppPr>${ctrl(ctx)}</m:limUppPr>${arg('e', e)}${arg('lim', lim)}</m:limUpp>`;
        if (t === 'munder') return low(one(b, ctx, d), one(x, ctx, d));
        if (t === 'mover') return upp(one(b, ctx, d), one(x, ctx, d));
        return upp(low(one(b, ctx, d), one(x, ctx, d)), one(y, ctx, d));
      }
      case 'mtable':
        return table(n, ctx, d);
      case 'menclose': {
        const notes = attr(n, 'notation').split(/\s+/);
        const strike = { updiagonalstrike: 'strikeBLTR', downdiagonalstrike: 'strikeTLBR', horizontalstrike: 'strikeH', verticalstrike: 'strikeV' };
        const lines = notes.map((k) => strike[k]).filter(Boolean);
        const hide = lines.length && !notes.includes('box') ? '<m:hideTop m:val="1"/><m:hideBot m:val="1"/><m:hideLeft m:val="1"/><m:hideRight m:val="1"/>' : '';
        return `<m:borderBox><m:borderBoxPr>${hide}${lines.map((k) => `<m:${k} m:val="1"/>`).join('')}${ctrl(ctx)}</m:borderBoxPr>${arg('e', seq(kids(n), ctx, d))}</m:borderBox>`;
      }
      default:
        throw Error(`OMML_UNSUPPORTED:${t}`);      // merror · mmultiscripts · 모르는 것 → 그림으로
    }
  }
  const body = one(math, { color }, 0);
  if (!body) throw Error('OMML_EMPTY');
  const out = `<m:oMathPara xmlns:m="${MATH_NS}"><m:oMathParaPr><m:jc m:val="centerGroup"/></m:oMathParaPr><m:oMath>${body}</m:oMath></m:oMathPara>`;
  if (out.length > OMML_LIMITS.chars) throw Error('OMML_TOO_BIG');
  return out;
}

/** MathML 글 → OMML 글. Parser: DOMParser(브라우저 · 시험에서는 @xmldom/xmldom). */
export function texMathmlToOmml(mathml, options = {}, Parser = globalThis.DOMParser) {
  if (typeof mathml !== 'string' || !mathml.trim() || mathml.length > 2_000_000) throw Error('OMML_NO_MATHML');
  const doc = new Parser().parseFromString(mathml, 'application/xml');
  const root = doc.documentElement;
  if (!root || name(root) !== 'math' || doc.getElementsByTagName('parsererror').length) throw Error('OMML_BAD_MATHML');
  return mathmlToOmml(root, options);
}
