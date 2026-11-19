import {el, openModal, closeModal, toast} from './ui.js';
import {webFrame} from '../src/render.js';
import {HTML_FILE_MAX_BYTES} from '../src/html-file.js';
import {inlineTextScript} from './html-inline-edit.js';

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
  const excluded = 'script,style,noscript,template,textarea,select,iframe,object,embed,svg,canvas,[hidden],[aria-hidden="true"]';
  for (let node; (node = walker.nextNode());) {
    if (!node.data.trim() || node.parentElement.closest(excluded)) continue;
    fields.push({id: String(nodes.length), text: node.data, tag: node.parentElement.localName});
    nodes.push(node);
  }
  return {
    fields,
    preview(channel) {
      // Annotate a separate copy with invisible markers; never save preview markup.
      const copy = doc.cloneNode(true), texts = copy.createTreeWalker(copy.body, NodeFilter.SHOW_TEXT);
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
      const runtime = copy.createElement('script'); runtime.setAttribute('nonce', channel); runtime.textContent = inlineTextScript(channel);
      copy.head.prepend(charset, csp, base, runtime);
      return '<!doctype html>' + copy.documentElement.outerHTML;
    },
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
  const draft = htmlTextDraft(source), changes = new Map(), channel = crypto.randomUUID().replaceAll('-', '');
  const frame = el('iframe', {title: 'HTML 화면에서 글 수정', sandbox: 'allow-scripts', referrerpolicy: 'no-referrer', srcdoc: draft.preview(channel), dataset: {htmlTextFrame: ''}});
  const status = el('p', {role: 'status', text: '글을 불러오는 중…'});
  let pending = '', timeout = 0;
  const save = el('button', {type: 'button', class: 'btn btn-primary', disabled: true, onClick: () => {
    if (pending) return;
    pending = crypto.randomUUID(); save.disabled = true;
    frame.contentWindow.postMessage({channel, type: 'commit', request: pending}, '*');
    timeout = setTimeout(() => { pending = ''; save.disabled = !changes.size; toast('수정한 글을 받지 못했어요. 다시 저장해 주세요.'); }, 5000);
  }}, '저장');
  const valid = (id, text) => typeof id === 'string' && draft.fields[Number(id)]?.id === id && typeof text === 'string' && text.length <= HTML_FILE_MAX_BYTES && !text.includes('\0');
  const update = (id, text) => { if (text === draft.fields[Number(id)].text) changes.delete(id); else changes.set(id, text); };
  const receive = event => {
    const data = event.data;
    if (event.source !== frame.contentWindow || !data || data.channel !== channel) return;
    if (data.type === 'ready') { status.textContent = draft.fields.length ? '화면의 글을 눌러 바로 수정하세요. 수정 중에는 버튼 동작을 멈춰요.' : '직접 수정할 원본 글이 없어요. 코드로 생성되는 글과 이미지 속 글은 지원하지 않아요.'; return; }
    if (data.type === 'committed') {
      if (!pending || data.request !== pending) return;
      clearTimeout(timeout); pending = '';
      try {
        if (!Array.isArray(data.edits) || data.edits.length > draft.fields.length || !data.edits.every(row => Array.isArray(row) && row.length === 2 && valid(...row))) throw Error('수정한 글을 확인할 수 없어요. 다시 열어 주세요.');
        changes.clear(); for (const [id, text] of data.edits) update(id, text);
        if (!changes.size || apply(draft.apply(changes)) !== false) closeModal();
      } catch (error) { toast(error.message || '글을 저장하지 못했어요.', 4500); }
      save.disabled = !changes.size; return;
    }
    if (data.type !== 'change' || !valid(data.id, data.text)) return;
    update(data.id, data.text);
    save.disabled = !!pending || !changes.size;
    status.textContent = changes.size ? `${changes.size}곳 수정됨 · 저장하면 HTML을 다시 열어요.` : '화면의 글을 눌러 바로 수정하세요.';
  };
  window.addEventListener('message', receive);
  openModal(el('section', {class: 'cv-html-inline-editor', role: 'dialog', 'aria-label': 'HTML 글 수정'},
    el('header', {class: 'cv-html-edit-bar'}, el('div', {}, el('h2', {text: '화면에서 글 수정'}), status),
      el('div', {class: 'row'}, el('button', {type: 'button', class: 'btn btn-ghost', onClick: closeModal}, '취소'), save)), frame),
  {wide: true, onClose: () => { clearTimeout(timeout); window.removeEventListener('message', receive); onClose?.(); }});
}
