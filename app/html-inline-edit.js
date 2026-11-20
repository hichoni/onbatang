// This function is serialized into an opaque-origin editing preview. Keep it self-contained.
function inlineTextRuntime(channel, fonts) {
  const prefix = `onba-text-${channel}:`, fields = new Map(), byNode = new WeakMap(), edits = new Map(), styles = new Map(), holders = new Map();
  const paragraphAttribute = `data-onba-paragraph-${channel}`, paragraphs = new Map();
  const decorationResets = new Map();
  let editing = null, selected = null, outline;
  const send = data => parent.postMessage({channel, ...data}, '*');
  const value = () => editing.element.innerText.replace(/\r\n/g, '\n');
  const changed = () => { if (editing) { const text = value(); edits.set(editing.id, text); send({type: 'change', id: editing.id, text}); } };
  function underlines(element) {
    const origins = [];
    for (; element; element = element.parentElement) {
      const css = getComputedStyle(element);
      if (css.textDecorationLine.split(' ').includes('underline')) origins.push(element);
      // Decorations do not propagate into atomic or out-of-flow descendants.
      if (['inline-block', 'inline-flex', 'inline-grid', 'inline-table'].includes(css.display) || css.float !== 'none' || ['absolute','fixed'].includes(css.position)) break;
    }
    return origins;
  }
  function decorationInfo() {
    return {italic: !!editing && getComputedStyle(editing.element).fontStyle !== 'normal', underline: !!editing && underlines(editing.element).length > 0};
  }
  function holderFor(id) {
    let holder = holders.get(id);
    if (!holder) {
      const target = editing?.id === id ? editing.element : fields.get(id), parentElement = target.parentElement;
      // Ignore only our markers: use exactly the same target as saved source.
      const siblings = [...parentElement.childNodes].filter(node => !(node.nodeType === Node.COMMENT_NODE && node.data.startsWith(prefix)));
      if (siblings.length === 1) holder = parentElement;
      else { holder = document.createElement('span'); target.replaceWith(holder); holder.append(target); }
      holders.set(id, holder);
    }
    return holder;
  }
  function paintStyle(id, patch) {
    const style = {...styles.get(id), ...patch}, holder = holderFor(id);
    styles.set(id, style);
    if (style.fontSize !== undefined) holder.style.setProperty('font-size', style.fontSize + 'px', 'important');
    if (style.color !== undefined) holder.style.setProperty('color', style.color, 'important');
    if (style.fontId !== undefined) holder.style.setProperty('font-family', `"${fonts.find(item => item.id === style.fontId).family}"`, 'important');
    if (style.fontWeight !== undefined) holder.style.setProperty('font-weight', String(style.fontWeight), 'important');
    for (const [key, css] of [['fontStyle','font-style'],['textDecorationLine','text-decoration-line'],['textDecorationStyle','text-decoration-style'],['textDecorationColor','text-decoration-color'],['textDecorationThickness','text-decoration-thickness']]) if (style[key] !== undefined) holder.style.setProperty(css, style[key], 'important');
    send({type: 'style-change', id, style});
  }
  function toggleUnderline(data) {
    if (data.id !== selected || !editing || typeof data.enabled !== 'boolean') return;
    const holder = holderFor(selected);
    if (!data.enabled) {
      const ancestors = underlines(editing.element).filter(element => element !== holder && element.hasAttribute(paragraphAttribute));
      // CSS cannot cancel an ancestor's underline on one inline child. Move
      // only those underlines onto their text runs before clearing this run.
      // This preserves wrapping, sibling text and unrelated strike-throughs.
      const preserve = [];
      for (const [id, node] of fields) {
        if (id === selected) continue;
        const leaf = editing?.id === id ? editing.element : node.parentElement, origins = underlines(leaf);
        if (!origins.some(element => ancestors.includes(element))) continue;
        const origin = getComputedStyle(origins[0]), own = getComputedStyle(holderFor(id));
        preserve.push([id, {textDecorationLine: [...new Set([...own.textDecorationLine.split(' ').filter(line => line !== 'none'), 'underline'])].join(' '),
          textDecorationColor: origin.textDecorationColor, textDecorationStyle: origin.textDecorationStyle, textDecorationThickness: origin.textDecorationThickness}]);
      }
      for (const element of ancestors) {
        const elementId = element.getAttribute(paragraphAttribute), line = getComputedStyle(element).textDecorationLine.split(' ').filter(line => line !== 'underline').join(' ') || 'none';
        const record = {id: selected, line}; decorationResets.set(elementId, record);
        element.style.setProperty('text-decoration-line', line, 'important');
        send({type: 'decoration-reset', elementId, record});
      }
      for (const [id, patch] of preserve) paintStyle(id, patch);
    }
    const lines = getComputedStyle(holder).textDecorationLine.split(' ').filter(line => line !== 'none' && line !== 'underline');
    if (data.enabled) lines.push('underline');
    paintStyle(selected, {textDecorationLine: lines.join(' ') || 'none'});
    send({type: 'decoration-info', id: selected, ...decorationInfo()});
  }
  const isTextBlock = display => ['block', 'flow-root', 'list-item', 'table-cell', 'inline-block'].includes(display);
  function paragraphFor(node) {
    for (let element = node.parentElement; element; element = element.parentElement) {
      if (!element.hasAttribute(paragraphAttribute)) continue;
      const display = getComputedStyle(element).display;
      if (['inline-flex', 'inline-grid'].includes(display)) continue;
      if (['flex', 'grid', 'table', 'table-row'].includes(display)) return null;
      if (display === 'inline-block' && !/^(p|h[1-6]|li|td|th|button|div|section|article|blockquote|pre|figcaption)$/.test(element.localName)) continue;
      if (!isTextBlock(display)) continue;
      // A container with separate text blocks is not one paragraph. Never align
      // an entire card/page just because its loose text was clicked.
      const nested = [...element.querySelectorAll(`[${paragraphAttribute}]`)];
      if (nested.some(child => ['block', 'flow-root', 'list-item', 'table-cell', 'flex', 'grid', 'table', 'table-row'].includes(getComputedStyle(child).display))) return null;
      return element;
    }
    return null;
  }
  function paragraphInfo() {
    const block = editing && paragraphFor(editing.element);
    if (!block) return {paragraphId: null};
    const computed = getComputedStyle(block), rtl = computed.direction === 'rtl';
    let textAlign = computed.textAlign;
    if (textAlign === 'start') textAlign = rtl ? 'right' : 'left';
    if (textAlign === 'end') textAlign = rtl ? 'left' : 'right';
    const lineHeight = computed.lineHeight === 'normal' ? 'normal' : Math.round(parseFloat(computed.lineHeight) / parseFloat(computed.fontSize) * 1000) / 1000;
    return {paragraphId: block.getAttribute(paragraphAttribute), textAlign, lineHeight};
  }
  function paintParagraph(block, style) {
    if (style.textAlign !== undefined) block.style.setProperty('text-align', style.textAlign, 'important');
    if (style.lineHeight !== undefined) {
      // Include the paragraph's inline text runs, which may have their own
      // line-height. Different font sizes still use the same unitless spacing.
      block.style.setProperty('line-height', String(style.lineHeight), 'important');
      for (const [id, node] of fields) {
        const leaf = editing?.id === id ? editing.element : node;
        if (!block.contains(leaf)) continue;
        for (let element = leaf.nodeType === Node.TEXT_NODE ? leaf.parentElement : leaf; element && element !== block; element = element.parentElement) element.style.setProperty('line-height', String(style.lineHeight), 'important');
      }
    }
  }
  function formatParagraph(data) {
    const block = editing && paragraphFor(editing.element), patch = data.style;
    if (data.id !== selected || !block || data.paragraphId !== block.getAttribute(paragraphAttribute) || !patch || typeof patch !== 'object') return;
    const keys = Object.keys(patch);
    if (!keys.length || keys.some(key => !['textAlign', 'lineHeight'].includes(key))) return;
    if ('textAlign' in patch && !['left', 'center', 'right', 'justify'].includes(patch.textAlign)) return;
    if ('lineHeight' in patch && patch.lineHeight !== 'normal' && (!Number.isFinite(patch.lineHeight) || patch.lineHeight < 0.8 || patch.lineHeight > 3)) return;
    const record = {id: selected, style: {...paragraphs.get(data.paragraphId)?.style, ...patch}};
    paragraphs.set(data.paragraphId, record); paintParagraph(block, record.style);
    send({type: 'paragraph-change', paragraphId: data.paragraphId, ...record});
    send({type: 'paragraph-info', id: selected, ...paragraphInfo()});
  }
  function selectionInfo() {
    if (!editing) return;
    const computed = getComputedStyle(editing.element), canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = computed.color; ctx.fillRect(0, 0, 1, 1);
    const rgb = ctx.getImageData(0, 0, 1, 1).data;
    const color = '#' + [...rgb].slice(0, 3).map(n => n.toString(16).padStart(2, '0')).join('');
    const family = computed.fontFamily.split(',')[0].trim().replace(/^["']|["']$/g, '');
    send({type: 'selected', id: editing.id, fontSize: parseFloat(computed.fontSize), color,
      fontId: fonts.find(font => font.family === family)?.id || '', fontFamily: family.slice(0, 100), fontWeight: Number(computed.fontWeight), ...decorationInfo(), ...paragraphInfo()});
  }
  function format(data) {
    if (data.id !== selected || !fields.has(data.id) || !data.style || typeof data.style !== 'object') return;
    const patch = data.style, keys = Object.keys(patch);
    if (!keys.length || keys.some(key => !['fontSize', 'color', 'fontId', 'fontWeight', 'fontStyle'].includes(key))) return;
    if ('fontSize' in patch && (!Number.isFinite(patch.fontSize) || patch.fontSize < 6 || patch.fontSize > 300)) return;
    if ('color' in patch && (typeof patch.color !== 'string' || !/^#[\da-f]{6}$/i.test(patch.color))) return;
    const font = fonts.find(item => item.id === patch.fontId);
    if ('fontId' in patch && !font) return;
    if ('fontWeight' in patch && ![400, 700].includes(patch.fontWeight)) return;
    if ('fontStyle' in patch && !['normal', 'italic'].includes(patch.fontStyle)) return;
    if (font) {
      if (typeof data.fontCss !== 'string' || data.fontCss.length > 8 * 1024 * 1024) return;
      let face = document.querySelector(`style[data-onba-html-font="${font.id}"]`);
      if (!face) { face = document.createElement('style'); face.dataset.onbaHtmlFont = font.id; document.head.append(face); }
      face.textContent = data.fontCss;
    }
    paintStyle(data.id, patch);
    const block = editing && paragraphFor(editing.element), paragraphStyle = block && paragraphs.get(block.getAttribute(paragraphAttribute))?.style;
    if (paragraphStyle) paintParagraph(block, paragraphStyle);
    send({type: 'decoration-info', id: selected, ...decorationInfo()});
    send({type: 'paragraph-info', id: selected, ...paragraphInfo()});
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
    if (event.data.type === 'underline') {toggleUnderline(event.data); return;}
    if (event.data.type === 'format-paragraph') {formatParagraph(event.data); return;}
    if (event.data.type !== 'commit') return;
    finish(); send({type: 'committed', request: event.data.request, edits: [...edits], styles: [...styles], paragraphs: [...paragraphs], decorationResets: [...decorationResets]});
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

export const inlineTextScript = (channel, fonts) => `(${inlineTextRuntime.toString()})(${JSON.stringify(channel)},${JSON.stringify(fonts)});`;
