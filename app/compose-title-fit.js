// Fallback for an editor document that cannot currently lay out its DOM.
// Native text size is a percentage of slide width, while y is a percentage of
// height. Reserve a little space for font metrics and wrapping at Korean words.
function lineWidth(line) {
  return Array.from(line).reduce((sum, char) =>
    sum + (/\s/u.test(char) ? 0.35 : /[\u0000-\u007f]/u.test(char) ? 0.62 : 1), 0);
}

export function fitComposeTitles(pages, aspect) {
  return pages.map(page => {
    const text = page.items.filter(item => item.t === 'text' && !item.rot);
    const items = page.items.map(item => {
      if (item.t !== 'text' || item.rot || item.size < 4.5 || !item.text.includes('\n') || !/[\uAC00-\uD7A3]/u.test(item.text)) return item;
      const lines = item.text.split('\n').map(lineWidth);
      const usableWidth = item.w * 0.94;
      const perLine = item.size * (item.lh || 1.2) * aspect;
      const lineCount = lines.reduce((n, w) => n + Math.max(1, Math.ceil(w * item.size / usableWidth)), 0);
      if (lineCount === lines.length) return item;
      let clearance = Math.min(item.y, 100-item.y);
      for (const other of text) {
        if (other === item || Math.abs(item.x-other.x) >= (item.w+other.w)/2) continue;
        const otherHeight = other.size * (other.lh || 1.2) * aspect * other.text.split('\n').length;
        clearance = Math.min(clearance, Math.abs(item.y-other.y)-otherHeight/2-1);
      }
      if (lineCount * perLine / 2 <= clearance) return item;
      const size = Math.max(4, Math.floor(100 * Math.min(usableWidth/Math.max(...lines), 2*clearance/(lines.length*(item.lh || 1.2)*aspect)))/100);
      return {...item, size: Math.min(size,item.size)};
    });
    return {...page,items};
  });
}
