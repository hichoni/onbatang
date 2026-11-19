import {el, openModal, closeModal, toast} from './ui.js';
import {webFrame} from '../src/render.js';

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
    destroy() { for (const entry of [...kept.values()]) remove(entry); active = null; },
  };
}

// Parse source in an inert document, never the running iframe or the host page.
// Editing a Text node escapes markup and leaves script/style content untouched.
export function htmlTextDraft(source) {
  const doc = new DOMParser().parseFromString(source, 'text/html');
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT), nodes = [], fields = [];
  const excluded = 'script,style,noscript,template,textarea,select,iframe,svg,canvas,[hidden],[aria-hidden="true"]';
  for (let node; (node = walker.nextNode());) {
    if (!node.data.trim() || node.parentElement.closest(excluded)) continue;
    fields.push({id: String(nodes.length), text: node.data, tag: node.parentElement.localName});
    nodes.push(node);
  }
  return {
    fields,
    apply(changes) {
      const edits = [...changes].filter(([id, text]) => {
        if (!fields[Number(id)] || fields[Number(id)].id !== id || typeof text !== 'string') throw Error('수정할 글을 다시 골라 주세요.');
        return text !== fields[Number(id)].text;
      });
      if (!edits.length) return source;
      for (let i = 0; i < nodes.length; i++) nodes[i].data = fields[i].text;
      for (const [id, text] of edits) nodes[Number(id)].data = text;
      const xml = new XMLSerializer();
      return [...doc.childNodes].map(node => node.nodeType === Node.ELEMENT_NODE ? node.outerHTML : xml.serializeToString(node)).join('');
    },
  };
}

export function editHtmlText(source, apply, onClose) {
  const draft = htmlTextDraft(source), changes = new Map();
  let selected = '';
  const search = el('input', {type: 'search', class: 'cv-html-search', placeholder: '찾을 글을 입력하세요', 'aria-label': '글 찾기', onInput: () => fill()});
  const list = el('select', {size: 7, 'aria-label': '수정할 글', onChange: () => choose(list.value)});
  const input = el('textarea', {rows: 5, 'aria-label': '바꿀 글', onInput: () => {
    if (!selected) return;
    const field = draft.fields[Number(selected) - 1];
    if (input.value === field.text) changes.delete(field.id); else changes.set(field.id, input.value);
    save.disabled = !changes.size;
  }});
  const save = el('button', {type: 'button', class: 'btn btn-primary', disabled: true, onClick: () => {
    try { if (apply(draft.apply(changes)) !== false) closeModal(); }
    catch (error) { toast(error.message || '글을 저장하지 못했어요.', 4500); }
  }}, '저장');
  function choose(value) {
    selected = value;
    const field = draft.fields[Number(value) - 1];
    input.disabled = !field;
    input.value = field ? changes.get(field.id) ?? field.text : '';
  }
  function fill() {
    const query = search.value.trim().toLocaleLowerCase();
    const matches = draft.fields.filter(field => field.text.toLocaleLowerCase().includes(query));
    list.replaceChildren(...matches.map(field => el('option', {value: String(Number(field.id) + 1), text: field.text.trim().replace(/\s+/g, ' ').slice(0, 140)})));
    list.value = matches.some(field => String(Number(field.id) + 1) === selected) ? selected : matches.length ? String(Number(matches[0].id) + 1) : '';
    choose(list.value);
  }
  fill();
  openModal(el('section', {class: 'cv-html-text-editor', role: 'dialog', 'aria-label': 'HTML 글 수정'},
    el('h2', {text: 'HTML 글 수정'}),
    el('p', {text: '원본에 들어 있는 글을 선택해 바꿔요. 저장하면 HTML 화면이 처음부터 다시 열려요.'}),
    el('p', {class: 'muted', text: '코드로 생성되는 글과 이미지 안의 글은 여기서 수정할 수 없어요.'}),
    search, list, el('label', {}, '바꿀 글', input),
    !draft.fields.length ? el('p', {text: '수정할 수 있는 원본 글이 없어요.'}) : null,
    el('div', {class: 'row'}, el('button', {type: 'button', class: 'btn btn-ghost', onClick: closeModal}, '취소'), save)),
  {onClose});
  search.focus();
}
