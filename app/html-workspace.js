import {el, openModal, closeModal, toast} from './ui.js';
import {webFrame} from '../src/render.js';
import {HTML_FILE_MAX_BYTES} from '../src/html-file.js';
import {inlineTextScript} from './html-inline-edit.js';
import {HTML_TEXT_FONTS, embeddedHtmlFont} from './html-text-fonts.js';

const textFont = id => HTML_TEXT_FONTS.find(font => font.id === id);
const validTextStyle = style => !!style && typeof style === 'object' && !Array.isArray(style) &&
  Object.keys(style).length > 0 && Object.keys(style).every(key => ['fontSize', 'color', 'fontId', 'fontWeight'].includes(key)) &&
  (!('fontSize' in style) || (Number.isFinite(style.fontSize) && style.fontSize >= 6 && style.fontSize <= 300)) &&
  (!('fontId' in style) || !!textFont(style.fontId)) &&
  (!('fontWeight' in style) || [400, 700].includes(style.fontWeight)) &&
  (!('color' in style) || (typeof style.color === 'string' && /^#[\da-f]{6}$/i.test(style.color)));
const validParagraphStyle = style => !!style && typeof style === 'object' && !Array.isArray(style) &&
  Object.keys(style).length > 0 && Object.keys(style).every(key => ['textAlign', 'lineHeight'].includes(key)) &&
  (!('textAlign' in style) || ['left', 'center', 'right', 'justify'].includes(style.textAlign)) &&
  (!('lineHeight' in style) || style.lineHeight === 'normal' || (Number.isFinite(style.lineHeight) && style.lineHeight >= 0.8 && style.lineHeight <= 3));

// Only the opened document runs. Covers, thumbnails and exports stay inert.
export function createHtmlWorkspace(host) {
  const kept = new Map();
  let active = null;
  const remove = entry => { entry.frame.remove(); kept.delete(entry.id); };
  return {
    show(design) {
      const web = design?.web, id = design?.id;
      if (active && active.id === id && active.html === web?.html) {
        active.keep = web.keep === true;
        return;
      }
      if (active) {
        if (active.keep && active.id !== id) { active.frame.hidden = true; active.frame.inert = true; }
        else remove(active);
      }
      active = null;
      host.hidden = !web?.html;
      if (!web?.html) return;
      let entry = kept.get(id);
      if (entry && entry.html !== web.html) { remove(entry); entry = null; }
      if (!entry) {
        if (kept.size >= 6) remove(kept.values().next().value);
        const frame = webFrame(web);
        // In this workspace use the real available viewport, including responsive HTML on phones.
        frame.dataset.fit = 'native';
        entry = {id, html: web.html, frame};
        kept.set(id, entry); host.append(frame);
      }
      entry.keep = web.keep === true;
      entry.frame.hidden = false; entry.frame.inert = false;
      active = entry;
    },
    pause() { if (active) remove(active); active = null; },
    destroy() { for (const entry of [...kept.values()]) remove(entry); active = null; },
  };
}

// Parse source in an inert document, never the running iframe or the host page.
// Editing a Text node escapes markup and leaves script/style content untouched.
export function htmlTextDraft(source) {
  const doc = new DOMParser().parseFromString(source, 'text/html');
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT), nodes = [], fields = [];
  const elements = [doc.body, ...doc.body.querySelectorAll('*')], elementIds = new Map(elements.map((element, id) => [element, String(id)]));
  const excluded = 'script,style,noscript,template,textarea,select,iframe,object,embed,svg,canvas,[hidden],[aria-hidden="true"]';
  for (let node; (node = walker.nextNode());) {
    if (!node.data.trim() || node.parentElement.closest(excluded)) continue;
    const paragraphIds = [];
    for (let element = node.parentElement; element && elementIds.has(element); element = element.parentElement) paragraphIds.push(elementIds.get(element));
    fields.push({id: String(nodes.length), text: node.data, tag: node.parentElement.localName, paragraphIds});
    nodes.push(node);
  }
  const validParagraph = (id, paragraphId, style) => typeof id === 'string' && fields[Number(id)]?.id === id && typeof paragraphId === 'string' && fields[Number(id)].paragraphIds.includes(paragraphId) && validParagraphStyle(style);
  return {
    fields,
    validParagraph,
    preview(channel) {
      // Annotate a separate copy with invisible markers; never save preview markup.
      const copy = doc.cloneNode(true), texts = copy.createTreeWalker(copy.body, NodeFilter.SHOW_TEXT);
      const copies = [copy.body, ...copy.body.querySelectorAll('*')];
      for (const id of new Set(fields.flatMap(field => field.paragraphIds))) copies[Number(id)].setAttribute(`data-onba-paragraph-${channel}`, id);
      const editable = [];
      for (let node; (node = texts.nextNode());) if (node.data.trim() && !node.parentElement.closest(excluded)) editable.push(node);
      editable.forEach((node, id) => node.before(copy.createComment(`onba-text-${channel}:${id}`)));
      copy.querySelectorAll('script,base,meta[http-equiv],iframe,object,embed').forEach(node => node.remove());
      for (const node of copy.querySelectorAll('*')) {
        for (const attr of [...node.attributes]) if (/^on/i.test(attr.name) || ['nonce','contenteditable','autofocus','autoplay'].includes(attr.name.toLowerCase())) node.removeAttribute(attr.name);
        if (node.matches('input,textarea,select')) node.disabled = true;
        if (node.matches('audio,video')) { node.muted = true; node.removeAttribute('controls'); }
      }
      const csp = copy.createElement('meta'); csp.httpEquiv = 'Content-Security-Policy';
      csp.content = `default-src 'none'; script-src 'nonce-${channel}'; style-src 'unsafe-inline' https: data:; img-src https: data: blob:; font-src https: data:; media-src https: data: blob:; connect-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'`;
      const base = copy.createElement('base'); base.href = 'about:blank';
      const charset = copy.createElement('meta'); charset.charset = 'utf-8';
      const runtime = copy.createElement('script'); runtime.setAttribute('nonce', channel); runtime.textContent = inlineTextScript(channel, HTML_TEXT_FONTS.map(({id, family}) => ({id, family})));
      copy.head.prepend(charset, csp, base, runtime);
      return '<!doctype html>' + copy.documentElement.outerHTML;
    },
    apply(changes, styles = new Map(), fontAssets = new Map(), paragraphs = new Map()) {
      const edits = [...changes].filter(([id, text]) => {
        if (!fields[Number(id)] || fields[Number(id)].id !== id || typeof text !== 'string') throw Error('수정할 글을 다시 골라 주세요.');
        return text !== fields[Number(id)].text;
      });
      for (const [id, style] of styles) if (typeof id !== 'string' || fields[Number(id)]?.id !== id || !validTextStyle(style)) throw Error('글자 모양을 확인해 주세요.');
      for (const [paragraphId, record] of paragraphs) if (!record || !validParagraph(record.id, paragraphId, record.style)) throw Error('문단 정렬과 줄간격을 확인해 주세요.');
      if (!edits.length && !styles.size && !paragraphs.size) return source;
      // Work on a fresh copy: repeated saves cannot accumulate formatting wrappers.
      const output = doc.cloneNode(true), texts = output.createTreeWalker(output.body, NodeFilter.SHOW_TEXT), targets = [];
      const paragraphTargets = [output.body, ...output.body.querySelectorAll('*')];
      for (let node; (node = texts.nextNode());) if (node.data.trim() && !node.parentElement.closest(excluded)) targets.push(node);
      for (const [id, text] of edits) targets[Number(id)].data = text;
      for (const [id, style] of styles) {
        const node = targets[Number(id)];
        let target = node.parentElement;
        // A sole text child can use its own element. Mixed content needs a span
        // around only the chosen text, so sibling words keep their formatting.
        if (target.childNodes.length !== 1) { target = output.createElement('span'); node.replaceWith(target); target.append(node); }
        if (style.fontSize !== undefined) target.style.setProperty('font-size', style.fontSize + 'px', 'important');
        if (style.color !== undefined) target.style.setProperty('color', style.color, 'important');
        if (style.fontWeight !== undefined) target.style.setProperty('font-weight', String(style.fontWeight), 'important');
        if (style.fontId !== undefined) {
          const font = textFont(style.fontId), css = fontAssets.get(style.fontId);
          if (typeof css !== 'string') throw Error('글꼴을 불러온 뒤 다시 저장해 주세요.');
          target.style.setProperty('font-family', `"${font.family}"`, 'important');
          output.querySelectorAll(`style[data-onba-html-font="${font.id}"]`).forEach(node => node.remove());
          const face = output.createElement('style'); face.dataset.onbaHtmlFont = font.id; face.textContent = css; output.head.append(face);
        }
      }
      for (const [paragraphId, {style}] of paragraphs) {
        const block = paragraphTargets[Number(paragraphId)];
        if (style.textAlign !== undefined) block.style.setProperty('text-align', style.textAlign, 'important');
        if (style.lineHeight !== undefined) {
          block.style.setProperty('line-height', String(style.lineHeight), 'important');
          for (const node of targets) {
            if (!block.contains(node)) continue;
            for (let element = node.parentElement; element && element !== block; element = element.parentElement) element.style.setProperty('line-height', String(style.lineHeight), 'important');
          }
        }
      }
      const xml = new XMLSerializer();
      return [...output.childNodes].map(node => node.nodeType === Node.ELEMENT_NODE ? node.outerHTML : xml.serializeToString(node)).join('');
    },
  };
}

export function editHtmlText(source, apply, onClose) {
  const draft = htmlTextDraft(source), changes = new Map(), styles = new Map(), paragraphs = new Map(), fontAssets = new Map(), channel = crypto.randomUUID().replaceAll('-', '');
  const frame = el('iframe', {title: 'HTML 화면에서 글 수정', sandbox: 'allow-scripts', referrerpolicy: 'no-referrer', srcdoc: draft.preview(channel), dataset: {htmlTextFrame: ''}});
  const status = el('p', {role: 'status', text: '글을 불러오는 중…'});
  let pending = '', timeout = 0, selected = null, selectedParagraph = null, fontRequest = 0, fontLoading = false, closed = false;
  const countChanges = () => new Set([...changes.keys(), ...styles.keys()]).size + paragraphs.size;
  const sendStyle = style => {
    if (selected === null || pending || fontLoading || !validTextStyle(style)) return;
    frame.contentWindow.postMessage({channel, type: 'format', id: selected, style}, '*');
  };
  const size = el('input', {type: 'number', min: 6, max: 300, step: 1, disabled: true, 'aria-label': '글자 크기 (px)', onInput: event => {
    if (event.target.value !== '') sendStyle({fontSize: Number(event.target.value)});
  }});
  const color = el('input', {type: 'color', value: '#000000', disabled: true, 'aria-label': '글자 색깔', onInput: event => sendStyle({color: event.target.value})});
  const originalFont = el('option', {value: '', disabled: true, text: '현재 글꼴'});
  const family = el('select', {disabled: true, 'aria-label': '글꼴', onChange: async event => {
    const id = selected, fontId = event.target.value, request = ++fontRequest;
    if (id === null || pending || !textFont(fontId)) return;
    const previous = styles.get(id)?.fontId || family.dataset.current || '';
    fontLoading = true; refresh();
    try {
      const css = await embeddedHtmlFont(fontId);
      if (closed || request !== fontRequest || selected !== id) return;
      fontAssets.set(fontId, css);
      frame.contentWindow.postMessage({channel, type: 'format', id, style: {fontId}, fontCss: css}, '*');
    } catch {
      if (!closed && request === fontRequest) { family.value = previous; toast('글꼴을 불러오지 못했어요. 다시 골라 주세요.'); }
    } finally { if (!closed && request === fontRequest) { fontLoading = false; refresh(); } }
  }}, originalFont, ...HTML_TEXT_FONTS.map(font => el('option', {value: font.id, text: font.name})));
  const originalWeight = el('option', {value: '', disabled: true, text: '현재 굵기'});
  const weight = el('select', {disabled: true, 'aria-label': '글자 굵기', onChange: event => sendStyle({fontWeight: Number(event.target.value)})},
    originalWeight, el('option', {value: '400', text: '보통'}), el('option', {value: '700', text: '굵게'}));
  const weightNote = el('span', {class: 'cv-html-font-note', hidden: true, text: '이 글꼴은 한 가지 굵기로 제공돼요.'});
  const sendParagraph = style => {
    if (pending || fontLoading || !draft.validParagraph(selected, selectedParagraph, style)) return;
    frame.contentWindow.postMessage({channel, type: 'format-paragraph', id: selected, paragraphId: selectedParagraph, style}, '*');
  };
  const originalAlign = el('option', {value: '', disabled: true, text: '현재 정렬'});
  const align = el('select', {disabled: true, 'aria-label': '문단 정렬', onChange: event => sendParagraph({textAlign: event.target.value})}, originalAlign,
    ...[['left','왼쪽'],['center','가운데'],['right','오른쪽'],['justify','양쪽']].map(([value,text]) => el('option', {value,text})));
  const originalSpacing = el('option', {value: '', disabled: true, text: '현재 줄간격'});
  const spacing = el('select', {disabled: true, 'aria-label': '문단 줄간격', onChange: event => sendParagraph({lineHeight: event.target.value === 'normal' ? 'normal' : Number(event.target.value)})}, originalSpacing,
    el('option', {value: 'normal', text: '기본'}), ...[1,1.15,1.2,1.5,1.8,2,2.5,3].map(value => el('option', {value: String(value), text: `${value}배`})));
  const paragraphNote = el('span', {class: 'cv-html-paragraph-note', text: '정렬·줄간격은 선택한 문단 전체에 적용돼요.'});
  const updateParagraphInfo = data => {
    selectedParagraph = draft.validParagraph(selected, data.paragraphId, {textAlign: 'left'}) ? data.paragraphId : null;
    align.value = ['left','center','right','justify'].includes(data.textAlign) ? data.textAlign : '';
    spacing.value = data.lineHeight === 'normal' || [1,1.15,1.2,1.5,1.8,2,2.5,3].includes(data.lineHeight) ? String(data.lineHeight) : '';
    originalSpacing.textContent = Number.isFinite(data.lineHeight) ? `현재 (${data.lineHeight}배)` : '현재 줄간격';
  };
  const selectedLabel = el('span', {class: 'cv-html-text-selected', text: '화면의 글을 먼저 눌러 주세요.'});
  const save = el('button', {type: 'button', class: 'btn btn-primary', disabled: true, onClick: () => {
    if (pending || fontLoading) return;
    pending = crypto.randomUUID(); refresh();
    frame.contentWindow.postMessage({channel, type: 'commit', request: pending}, '*');
    timeout = setTimeout(() => { pending = ''; refresh(); toast('수정한 글을 받지 못했어요. 다시 저장해 주세요.'); }, 5000);
  }}, '저장');
  const valid = (id, text) => typeof id === 'string' && draft.fields[Number(id)]?.id === id && typeof text === 'string' && text.length <= HTML_FILE_MAX_BYTES && !text.includes('\0');
  const update = (id, text) => { if (text === draft.fields[Number(id)].text) changes.delete(id); else changes.set(id, text); };
  const refresh = () => {
    const count = countChanges(), unavailable = !!pending || selected === null;
    save.disabled = !!pending || fontLoading || !count;
    size.disabled = color.disabled = unavailable || fontLoading; family.disabled = unavailable;
    align.disabled = spacing.disabled = unavailable || fontLoading || selectedParagraph === null;
    paragraphNote.textContent = selected !== null && selectedParagraph === null ? '이 글에서는 문단 정렬·줄간격을 사용할 수 없어요.' : '정렬·줄간격은 선택한 문단 전체에 적용돼요.';
    const fixedWeight = !!textFont(family.value)?.noFakeBold;
    weight.disabled = unavailable || fontLoading || fixedWeight; weightNote.hidden = selected === null || !fixedWeight;
    status.textContent = fontLoading ? '글꼴을 불러오는 중…' : count ? `${count}곳 수정됨 · 저장하면 HTML을 다시 열어요.` : '화면의 글을 눌러 내용과 글자 모양을 바꾸세요.';
  };
  const receive = event => {
    const data = event.data;
    if (event.source !== frame.contentWindow || !data || data.channel !== channel) return;
    if (data.type === 'ready') { status.textContent = draft.fields.length ? '화면의 글을 눌러 내용과 글자 모양을 바꾸세요. 수정 중에는 버튼 동작을 멈춰요.' : '직접 수정할 원본 글이 없어요. 코드로 생성되는 글과 이미지 속 글은 지원하지 않아요.'; return; }
    if (data.type === 'selected') {
      if (data.id === null) { fontRequest++; fontLoading = false; selected = null; selectedParagraph = null; selectedLabel.textContent = '화면의 글을 먼저 눌러 주세요.'; refresh(); return; }
      if (!valid(data.id, draft.fields[Number(data.id)]?.text) || !Number.isFinite(data.fontSize) || data.fontSize <= 0 || !validTextStyle({color: data.color})) return;
      fontRequest++; fontLoading = false;
      selected = data.id; size.value = String(Math.round(data.fontSize * 100) / 100); color.value = data.color;
      family.value = textFont(data.fontId) ? data.fontId : ''; family.dataset.current = family.value;
      originalFont.textContent = `현재: ${typeof data.fontFamily === 'string' ? data.fontFamily.slice(0, 40) : '원본 글꼴'}`;
      weight.value = [400, 700].includes(data.fontWeight) ? String(data.fontWeight) : '';
      originalWeight.textContent = Number.isFinite(data.fontWeight) ? `현재 (${data.fontWeight})` : '현재 굵기';
      updateParagraphInfo(data);
      selectedLabel.textContent = (changes.get(selected) ?? draft.fields[Number(selected)].text).trim().slice(0, 100);
      refresh(); return;
    }
    if (data.type === 'style-change') {
      if (!valid(data.id, draft.fields[Number(data.id)]?.text) || !validTextStyle(data.style)) return;
      styles.set(data.id, data.style); refresh(); return;
    }
    if (data.type === 'paragraph-info') {
      if (data.id !== selected) return;
      updateParagraphInfo(data); refresh(); return;
    }
    if (data.type === 'paragraph-change') {
      if (!draft.validParagraph(data.id, data.paragraphId, data.style)) return;
      paragraphs.set(data.paragraphId, {id: data.id, style: data.style}); refresh(); return;
    }
    if (data.type === 'committed') {
      if (!pending || data.request !== pending) return;
      clearTimeout(timeout); pending = '';
      try {
        if (!Array.isArray(data.edits) || data.edits.length > draft.fields.length || !data.edits.every(row => Array.isArray(row) && row.length === 2 && valid(...row))) throw Error('수정한 글을 확인할 수 없어요. 다시 열어 주세요.');
        if (!Array.isArray(data.styles) || data.styles.length > draft.fields.length || !data.styles.every(row => Array.isArray(row) && row.length === 2 && valid(row[0], draft.fields[Number(row[0])]?.text) && validTextStyle(row[1]))) throw Error('글자 모양을 확인할 수 없어요. 다시 열어 주세요.');
        if (!Array.isArray(data.paragraphs) || data.paragraphs.length > draft.fields.length || !data.paragraphs.every(row => Array.isArray(row) && row.length === 2 && row[1] && draft.validParagraph(row[1].id, row[0], row[1].style))) throw Error('문단 정렬과 줄간격을 확인할 수 없어요. 다시 열어 주세요.');
        changes.clear(); for (const [id, text] of data.edits) update(id, text);
        styles.clear(); for (const [id, style] of data.styles) styles.set(id, style);
        paragraphs.clear(); for (const [id, record] of data.paragraphs) paragraphs.set(id, {id: record.id, style: record.style});
        if (!countChanges() || apply(draft.apply(changes, styles, fontAssets, paragraphs)) !== false) closeModal();
      } catch (error) { toast(error.message || '글을 저장하지 못했어요.', 4500); }
      refresh(); return;
    }
    if (data.type !== 'change' || !valid(data.id, data.text)) return;
    update(data.id, data.text);
    if (selected === data.id) selectedLabel.textContent = data.text.trim().slice(0, 100);
    refresh();
  };
  window.addEventListener('message', receive);
  openModal(el('section', {class: 'cv-html-inline-editor', role: 'dialog', 'aria-label': 'HTML 글 수정'},
    el('header', {class: 'cv-html-edit-bar'}, el('div', {}, el('h2', {text: '화면에서 글 수정'}), status),
      el('div', {class: 'row'}, el('button', {type: 'button', class: 'btn btn-ghost', onClick: closeModal}, '취소'), save)),
    el('div', {class: 'cv-html-text-format', role: 'group', 'aria-label': '글자 모양'},
      selectedLabel, el('label', {}, '글꼴', family), el('label', {}, '굵기', weight), el('label', {}, '크기', size, el('span', {text: 'px'})), el('label', {}, '색깔', color), weightNote),
    el('div', {class: 'cv-html-paragraph-format', role: 'group', 'aria-label': '문단 모양'}, paragraphNote,
      el('label', {}, '정렬', align), el('label', {}, '줄간격', spacing)), frame),
  {wide: true, onClose: () => { closed = true; fontRequest++; clearTimeout(timeout); window.removeEventListener('message', receive); onClose?.(); }});
}
