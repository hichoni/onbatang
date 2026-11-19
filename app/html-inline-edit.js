// This function is serialized into an opaque-origin editing preview. Keep it self-contained.
function inlineTextRuntime(channel) {
  const prefix = `onba-text-${channel}:`, fields = new Map(), byNode = new WeakMap(), edits = new Map(), styles = new Map(), holders = new Map();
  let editing = null, selected = null, outline;
  const send = data => parent.postMessage({channel, ...data}, '*');
  const value = () => editing.element.innerText.replace(/\r\n/g, '\n');
  const changed = () => { if (editing) { const text = value(); edits.set(editing.id, text); send({type: 'change', id: editing.id, text}); } };
  function selectionInfo() {
    if (!editing) return;
    const computed = getComputedStyle(editing.element), canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = computed.color; ctx.fillRect(0, 0, 1, 1);
    const rgb = ctx.getImageData(0, 0, 1, 1).data;
    const color = '#' + [...rgb].slice(0, 3).map(n => n.toString(16).padStart(2, '0')).join('');
    send({type: 'selected', id: editing.id, fontSize: parseFloat(computed.fontSize), color});
  }
  function format(data) {
    if (data.id !== selected || !fields.has(data.id) || !data.style || typeof data.style !== 'object') return;
    const patch = data.style, keys = Object.keys(patch);
    if (!keys.length || keys.some(key => !['fontSize', 'color'].includes(key))) return;
    if ('fontSize' in patch && (!Number.isFinite(patch.fontSize) || patch.fontSize < 6 || patch.fontSize > 300)) return;
    if ('color' in patch && (typeof patch.color !== 'string' || !/^#[\da-f]{6}$/i.test(patch.color))) return;
    const style = {...styles.get(data.id), ...patch}; styles.set(data.id, style);
    let holder = holders.get(data.id);
    if (!holder) {
      const target = editing?.id === data.id ? editing.element : fields.get(data.id);
      holder = document.createElement('span'); target.replaceWith(holder); holder.append(target); holders.set(data.id, holder);
    }
    if (style.fontSize !== undefined) holder.style.setProperty('font-size', style.fontSize + 'px', 'important');
    if (style.color !== undefined) holder.style.setProperty('color', style.color, 'important');
    send({type: 'style-change', id: data.id, style});
  }
  function finish() {
    if (!editing) return;
    changed();
    const {id, element} = editing, node = document.createTextNode(value());
    editing = null; element.replaceWith(node); fields.set(id, node); byNode.set(node, id);
  }
  function at(event) {
    const caret = document.caretPositionFromPoint?.(event.clientX, event.clientY);
    const textRange = caret ? null : document.caretRangeFromPoint?.(event.clientX, event.clientY);
    const node = caret?.offsetNode || textRange?.startContainer;
    if (byNode.has(node)) return {node, offset: caret?.offset ?? textRange.startOffset};
    for (const node of fields.values()) {
      if (!node.isConnected || !event.target.contains(node)) continue;
      const box = document.createRange(); box.selectNodeContents(node);
      if ([...box.getClientRects()].some(r => event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom)) return {node, offset: node.length};
    }
    return null;
  }
  function begin({node, offset}) {
    const id = byNode.get(node), element = document.createElement('span');
    element.setAttribute('contenteditable', 'plaintext-only');
    element.setAttribute('role', 'textbox'); element.setAttribute('aria-label', '화면의 글 수정');
    element.setAttribute('spellcheck', 'false'); element.dataset.onbaEditing = '';
    element.style.cssText = 'display:inline!important;min-width:1ch;margin:0!important;padding:0!important;border:0!important;outline:2px solid #286f62!important;outline-offset:3px!important;font:inherit!important;color:inherit!important;background:#fff8d080!important;white-space:pre-wrap!important;cursor:text!important';
    element.textContent = node.data;
    node.replaceWith(element); editing = {id, element}; selected = id;
    element.addEventListener('input', changed);
    // Keep the chosen text outlined while the user operates the parent toolbar.
    element.addEventListener('blur', changed);
    element.addEventListener('paste', event => {
      event.preventDefault();
      const selection = getSelection();
      if (!selection.rangeCount) return;
      const textRange = selection.getRangeAt(0);
      if (!element.contains(textRange.commonAncestorContainer)) return;
      textRange.deleteContents();
      const text = document.createTextNode(event.clipboardData?.getData('text/plain') || '');
      textRange.insertNode(text); textRange.setStartAfter(text); textRange.collapse(true); selection.removeAllRanges(); selection.addRange(textRange);
      changed();
    });
    element.focus();
    const textRange = document.createRange();
    textRange.setStart(element.firstChild || element, Math.min(offset, element.firstChild?.length || 0)); textRange.collapse(true);
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(textRange);
    selectionInfo();
  }
  // The preview has no source scripts or handlers. Capture native navigation too.
  document.addEventListener('click', event => {
    event.preventDefault(); event.stopImmediatePropagation();
    if (editing?.element.contains(event.target)) return;
    const picked = at(event); finish(); if (outline) outline.hidden = true;
    if (picked) begin(picked);
    else { selected = null; send({type: 'selected', id: null}); }
  }, true);
  for (const type of ['submit', 'auxclick', 'drop']) document.addEventListener(type, event => {event.preventDefault(); event.stopImmediatePropagation();}, true);
  document.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {event.preventDefault(); changed();}
    if (event.key === 'Escape') {event.preventDefault(); finish(); selected = null; send({type: 'selected', id: null});}
  }, true);
  document.addEventListener('pointermove', event => {
    if (!outline || event.pointerType === 'touch' || editing) return;
    const picked = at(event); outline.hidden = !picked;
    if (!picked) return;
    const textRange = document.createRange(); textRange.selectNodeContents(picked.node);
    const r = textRange.getBoundingClientRect();
    Object.assign(outline.style, {left: `${r.left - 2}px`, top: `${r.top - 2}px`, width: `${r.width + 4}px`, height: `${r.height + 4}px`});
  }, true);
  document.addEventListener('scroll', () => { if (outline) outline.hidden = true; }, true);
  addEventListener('message', event => {
    if (event.source !== parent || event.data?.channel !== channel) return;
    if (event.data.type === 'format') {format(event.data); return;}
    if (event.data.type !== 'commit') return;
    finish(); send({type: 'committed', request: event.data.request, edits: [...edits], styles: [...styles]});
  });
  document.addEventListener('DOMContentLoaded', () => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_COMMENT);
    for (let marker; (marker = walker.nextNode());) {
      if (!marker.data.startsWith(prefix) || marker.nextSibling?.nodeType !== Node.TEXT_NODE) continue;
      const id = marker.data.slice(prefix.length), node = marker.nextSibling;
      fields.set(id, node); byNode.set(node, id);
    }
    outline = document.createElement('div'); outline.hidden = true;
    outline.style.cssText = 'position:fixed!important;pointer-events:none!important;z-index:2147483647!important;border:1px dashed #286f62!important;background:#286f6210!important;border-radius:2px!important';
    document.body.append(outline);
    send({type: 'ready', count: fields.size});
  }, {once: true});
}

export const inlineTextScript = channel => `(${inlineTextRuntime.toString()})(${JSON.stringify(channel)});`;
