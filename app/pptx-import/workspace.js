import {designView} from '../../src/render.js';

const copy = value => value == null ? value : structuredClone(value);
const errorText = error => error?.message || error?.code || '작업을 마치지 못했어요.';
const cancelled = error => error?.name === 'AbortError' || ['CANCELLED', 'ABORTED'].includes(error?.code);
// License guidance and actual rendering are independent. An unknown rendering
// result must never turn a known license into a copyright warning.
const fontLicense = font => ({status: font.licenseStatus || 'unknown', label: font.licenseLabel || '이용 안내 확인 전'});
const fontRendering = font => ({status: font.renderStatus || font.status || 'unknown', label: font.renderLabel || ({'app-provided': '앱 제공 글꼴 적용', 'verified-ofl': '앱 제공 글꼴 적용', device: '기기 글꼴 확인', substituted: '현재 대체 중'})[font.status] || '기기 표시 확인 전'});

/** A device-only import flow. Dependencies own conversion, rendering and durable writes. */
export function mountImportWorkspace({root, services, onClose, onOpenDocument, onOpenMaterial, onComplete, onLibrary, embedded = false, retainOnClose = false, renderLibrary, materialActions = [['자료 전체 보기', 'view']]} = {}) {
  if (!root || typeof services?.inspect !== 'function' || typeof services?.saveAll !== 'function') throw new TypeError('Import services are required');
  const doc = root.ownerDocument;
  const element = (tag, text, attrs = {}) => {
    const node = doc.createElement(tag); if (text !== undefined) node.textContent = text;
    for (const [key, value] of Object.entries(attrs)) if (value != null) node.setAttribute(key, value);
    return node;
  };
  const button = (text, action, attrs = {}) => { const node = element('button', text, {type: 'button', ...attrs}); node.addEventListener('click', action); return node; };
  const state = {step: 1, tab: 'import', file: null, inspection: null, selected: new Set(), modes: {}, active: 1,
    preview: 'editable', filter: 'all', busy: null, previewPreparing: false, result: null, retry: null, fonts: [], fontPlan: null, priorPlans: [], previewPages: new Map()};
  let disposed = false, suspended = false, renderPending = false, generation = 0, previewGeneration = 0, libraryGeneration = 0, actionController, previewController, fontDialog, thumbObserver;
  const caches = new Map();
  const shell = element('section', undefined, {class: 'oi-workspace', 'aria-label': 'PPT 가져오기 작업 공간'});
  const header = element('header', undefined, {class: 'oi-header'});
  const brand = element('div', undefined, {class: 'oi-brand'});
  brand.append(element('img', undefined, {src: new URL('../brand/app-icon.svg', import.meta.url).href, alt: '', width: '34', height: '34'}), element('strong', '온바탕'), element('span', 'PPT 가져오기'));
  const nav = element('nav', undefined, {'aria-label': '자료 작업', class: 'oi-top-nav'});
  const importTab = button('PPT 가져오기', () => showTab('import'), {'data-import-tab': '', 'aria-current': 'page'});
  const libraryTab = button('내 자료', () => onLibrary ? onLibrary() : showTab('library'), {'data-library-tab': ''});
  const closeButton = button('닫기', requestClose, {'aria-label': 'PPT 가져오기 닫기', class: 'oi-quiet'});
  nav.append(importTab, libraryTab, closeButton); header.append(brand, nav); header.hidden = embedded;
  const steps = element('ol', undefined, {class: 'oi-steps', 'aria-label': '가져오기 단계'});
  for (const [index, name] of ['파일 선택', '슬라이드 확인', '가져오기 완료'].entries()) {
    const item = element('li', undefined, {'data-step': String(index + 1)}); item.append(element('span', String(index + 1)), element('strong', name)); steps.append(item);
  }
  const status = element('p', '', {class: 'oi-status', role: 'status', 'aria-live': 'polite', 'data-import-status': ''});
  const body = element('div', undefined, {class: 'oi-content'});
  const footer = element('footer', undefined, {class: 'oi-footer'});
  const footerNote = element('div', undefined, {class: 'oi-footer-note'}), footerActions = element('div', undefined, {class: 'oi-actions'});
  footer.append(footerNote, footerActions); shell.append(header, steps, status, body, footer); root.replaceChildren(shell);
  const fileInput = element('input', undefined, {type: 'file', accept: '.pptx', 'aria-label': 'PPTX 파일 선택', class: 'oi-file-input'});
  fileInput.addEventListener('change', () => { if (fileInput.files?.[0]) chooseFile(fileInput.files[0]); });

  function say(message, failure = false) { if (disposed) return; status.textContent = message; status.dataset.error = String(failure); }
  function page(number = state.active) { return state.inspection?.pages.find(item => item.pageNumber === number); }
  function selectedPages() { return [...state.selected].sort((a, b) => a - b); }
  function displayedFont(font, pages = font.pageNumbers || []) {
    const targets = pages.filter(number => !font.pageNumbers?.length || font.pageNumbers.includes(number)).map(number => services.fonts?.appliedTarget?.(font.name, state.fontPlan, number) || null);
    if (targets.some(id => id && id !== font.sourceMatchedTargetId)) return {status: 'substituted', label: '현재 대체 중'};
    if (targets.length && targets.every(Boolean)) return {status: 'app-provided', label: '앱 제공 글꼴 적용'};
    return fontRendering(font);
  }
  const fontNeedsReview = font => fontLicense(font).status === 'unknown' || ['unknown', 'substituted'].includes(displayedFont(font).status);
  function imageAvailable(number) { return state.previewPages.get(number)?.available === true; }
  function canSelect(item) { return item.canImport || imageAvailable(item.pageNumber); }
  function editableAvailable(item) { return item?.canImport === true; }
  async function requestClose() {
    if (disposed) return true;
    if (state.busy === 'saving') { say('자료를 저장하고 있어요. 취소 후 저장 상태를 확인하거나 완료될 때까지 기다려주세요.'); return false; }
    if (embedded && !retainOnClose && state.retry && state.result?.complete === false) { say('일부 자료는 저장됐지만 가져오기가 아직 끝나지 않았어요. 재시도할 작업을 보존하고 있으니 ‘이어서 다시 시도’를 눌러 완료해주세요.'); return false; }
    // A retaining host detaches this exact session and resumes it later. In
    // particular, its worker receipt and an inspection in flight must survive.
    if (!retainOnClose) actionController?.abort();
    previewController?.abort();
    fontDialog?.close(); fontDialog?.remove(); fontDialog = null;
    suspended = retainOnClose;
    try { const accepted = await onClose?.() !== false; if (!accepted) { suspended = false; render(); } return accepted; }
    catch (error) { suspended = false; render(); say(errorText(error), true); return false; }
  }
  function updateChrome() {
    const inImport = state.tab === 'import'; steps.hidden = !inImport;
    importTab.setAttribute('aria-current', inImport ? 'page' : 'false'); libraryTab.setAttribute('aria-current', !inImport ? 'page' : 'false');
    for (const item of steps.children) {
      const value = Number(item.dataset.step); item.dataset.state = value < state.step ? 'done' : value === state.step ? 'current' : 'next';
      if (value === state.step) item.setAttribute('aria-current', 'step'); else item.removeAttribute('aria-current');
      item.firstElementChild.textContent = value < state.step ? '✓' : String(value);
    }
    importTab.disabled = libraryTab.disabled = state.busy === 'saving';
    closeButton.disabled = false;
  }
  async function showTab(tab) {
    if (disposed || state.busy === 'saving') return;
    if (tab === 'library' && onLibrary) return onLibrary();
    state.tab = tab; updateChrome();
    if (tab === 'import') { render(); return; }
    const job = ++libraryGeneration; body.replaceChildren(); footerActions.replaceChildren();
    footerNote.textContent = '이 기기에 저장된 자료 · 원본과 고정 버전을 보관해요.';
    footerActions.append(button('새 PPT 가져오기', () => showTab('import'), {class: 'oi-primary'}));
    const title = element('div', undefined, {class: 'oi-library-heading'});
    title.append(element('h2', '가져온 자료 보관함'), element('p', '전체 슬라이드를 다시 열어 편집하고 PPTX로 내려받을 수 있어요.', {class: 'oi-help'}));
    body.append(title); const host = element('div', undefined, {class: 'oi-library'}); body.append(host);
    say('기기 보관함을 여는 중이에요…');
    try { await renderLibrary?.(host, {report: say, refresh: () => showTab('library'), close: requestClose}); if (!disposed && job === libraryGeneration) say('원본 PPT와 고정 자료는 이 브라우저에 저장되어 있어요.'); }
    catch (error) { if (!disposed && job === libraryGeneration) say(errorText(error), true); }
  }
  function render() {
    if (disposed || state.tab !== 'import') return;
    if (suspended) { renderPending = true; return; }
    renderPending = false; updateChrome(); body.replaceChildren(); footerActions.replaceChildren();
    if (state.step === 1) renderFile(); else if (state.step === 2) renderReview(); else renderResult();
  }
  function renderFile() {
    const intro = element('section', undefined, {class: 'oi-file-step'});
    intro.append(element('span', 'PPT에서 온바탕으로', {class: 'oi-eyebrow'}), element('h1', '수업 자료를 가져와요'),
      element('p', '슬라이드를 살펴보고, 필요한 모습으로 온바탕에서 이어서 편집하세요.', {class: 'oi-lead'}));
    const drop = element('div', undefined, {class: 'oi-drop', 'data-file-drop': ''});
    drop.append(element('span', 'P', {class: 'oi-ppt-icon', 'aria-hidden': 'true'}), element('h2', state.file?.name || 'PPT 파일을 여기에 놓아주세요'),
      element('p', 'PPTX · 최대 50MB · 최대 200쪽', {class: 'oi-help'}));
    const pick = button(state.file ? '다른 파일 선택' : '파일 선택', () => fileInput.click(), {class: 'oi-primary'}); pick.disabled = !!state.busy;
    fileInput.disabled = !!state.busy; drop.append(pick, fileInput);
    drop.addEventListener('dragover', event => { event.preventDefault(); if (!state.busy) drop.dataset.drag = 'true'; });
    drop.addEventListener('dragleave', () => { delete drop.dataset.drag; });
    drop.addEventListener('drop', event => { event.preventDefault(); delete drop.dataset.drag; if (!state.busy && event.dataTransfer?.files?.[0]) chooseFile(event.dataTransfer.files[0]); });
    intro.append(drop, element('p', '원본 파일은 바뀌지 않아요. 선택한 자료는 이 기기에 저장합니다.', {class: 'oi-device-note'}));
    const links = element('div', undefined, {class: 'oi-file-links'});
    links.append(element('a', '직접 만든 예제 PPT로 살펴보기 ↗', {href: new URL('./samples/self-authored-4x3.pptx', import.meta.url).href, download: 'self-authored-4x3.pptx'}),
      button('이미 가져온 자료 보기', () => showTab('library'), {class: 'oi-text-button'})); intro.append(links); body.append(intro);
    footerNote.textContent = '계정과 자동으로 동기화되지 않아요. 브라우저 데이터를 지우면 기기 자료가 사라집니다.';
    if (state.busy) footerActions.append(button('확인 취소', cancelWork, {'data-import-cancel': ''}));
    else if (state.inspection) footerActions.append(button('슬라이드 확인으로', () => { state.step = 2; render(); }, {class: 'oi-primary'}));
  }
  async function chooseFile(file) {
    if (disposed || state.busy === 'saving') return;
    if (!/\.pptx$/i.test(file.name || '')) { say('PPTX 파일을 선택해주세요.', true); return; }
    actionController?.abort(); previewController?.abort(); services.disposePreview?.(); generation++; previewGeneration++;
    const job = generation; actionController = new AbortController(); caches.clear(); state.previewPages.clear();
    Object.assign(state, {file, inspection: null, selected: new Set(), modes: {}, active: 1, busy: 'inspecting', step: 1,
      result: null, retry: null, fonts: [], fontPlan: null, priorPlans: [], preview: 'editable'});
    render(); say('PPT의 슬라이드와 글꼴을 확인하고 있어요…');
    try {
      const inspection = await services.inspect(file, {signal: actionController.signal});
      if (disposed || job !== generation) return;
      state.inspection = inspection; state.active = inspection.pages[0]?.pageNumber || 1;
      for (const item of inspection.pages) { if (item.canImport) state.selected.add(item.pageNumber); state.modes[item.pageNumber] = 'editable'; }
      state.fonts = await services.fonts?.inspect?.({file, inspection}) || [];
      if (disposed || job !== generation) return;
      state.busy = null; state.previewPreparing = !!services.preparePreview; state.step = 2; render();
      say(`${inspection.pageCount}쪽 확인 · 가능한 슬라이드를 모두 선택했어요. 원하는 쪽과 가져오기 방식을 확인하세요.`);
      const previewInfo = await services.preparePreview?.({file, inspection, signal: actionController.signal});
      if (disposed || job !== generation) return;
      state.previewPreparing = false;
      if (previewInfo?.pages) {
        for (const item of previewInfo.pages) {
          state.previewPages.set(item.pageNumber, item);
          if (item.available && !page(item.pageNumber)?.canImport) { state.selected.add(item.pageNumber); state.modes[item.pageNumber] = 'image'; }
        }
        if (imageAvailable(state.active)) state.preview = 'pptx';
      }
      render();
    } catch (error) {
      if (!disposed && job === generation) { state.busy = null; state.previewPreparing = false; render(); say(cancelled(error) ? '확인을 취소했어요. 파일과 이전 저장 자료는 그대로예요.' : errorText(error), !cancelled(error)); }
    }
  }
  function cancelWork() {
    if (state.busy === 'saving') { actionController?.abort(); say('저장을 멈추고 완료된 자료를 확인하는 중이에요…'); return; }
    generation++; actionController?.abort(); previewController?.abort(); state.busy = null; state.previewPreparing = false; render(); say('확인을 취소했어요. 선택한 파일을 다시 확인할 수 있어요.');
  }
  function selectionChanged() {
    for (const item of body.querySelectorAll('[data-page-number]')) item.dataset.selected = String(state.selected.has(Number(item.dataset.pageNumber)));
    for (const check of body.querySelectorAll('[data-page-select]')) {
      const number = Number(check.value);
      check.disabled = !!state.busy || !!state.retry || (!canSelect(page(number)) && !state.selected.has(number));
    }
    updateFooter(); const all = body.querySelector('[data-select-all]'); if (all) {
      const available = state.inspection.pages.filter(canSelect); all.checked = !!available.length && available.every(item => state.selected.has(item.pageNumber));
      all.indeterminate = state.selected.size > 0 && !all.checked;
    }
    const count = body.querySelector('[data-selected-count]'); if (count) count.textContent = `${state.selected.size}쪽 선택`;
  }
  function renderReview() {
    thumbObserver?.disconnect();
    const filebar = element('div', undefined, {class: 'oi-filebar'}); filebar.append(element('span', 'P', {class: 'oi-ppt-small', 'aria-hidden': 'true'}),
      element('strong', state.file.name), element('span', `${state.inspection.pageCount}쪽`, {class: 'oi-help'})); body.append(filebar);
    const grid = element('div', undefined, {class: 'oi-review'}), rail = element('aside', undefined, {class: 'oi-rail', 'aria-label': '슬라이드 목록'});
    const selectRow = element('div', undefined, {class: 'oi-select-row'}), allLabel = element('label'), all = element('input', undefined, {type: 'checkbox', 'data-select-all': '', 'aria-label': '가능한 쪽 전체 선택'});
    all.disabled = !!state.busy || !!state.retry;
    all.addEventListener('change', () => {
      state.selected = all.checked ? new Set(state.inspection.pages.filter(canSelect).map(item => item.pageNumber)) : new Set();
      for (const check of rail.querySelectorAll('[data-page-select]')) check.checked = state.selected.has(Number(check.value)); selectionChanged();
    }); allLabel.append(all, element('span', '전체 선택')); selectRow.append(allLabel, element('span', '', {'data-selected-count': ''})); rail.append(selectRow);
    const filters = element('div', undefined, {class: 'oi-segment', 'aria-label': '슬라이드 필터'});
    for (const [key, title] of [['all', '전체'], ['warnings', '확인 필요']]) filters.append(button(title, () => { state.filter = key; render(); }, {'aria-pressed': String(state.filter === key)})); rail.append(filters);
    const list = element('div', undefined, {class: 'oi-pages'}), pendingThumbs = [];
    for (const item of state.inspection.pages) {
      if (state.filter === 'warnings' && !item.warnings?.length) continue;
      const card = element('article', undefined, {class: 'oi-page', 'data-page-number': String(item.pageNumber), 'data-active': String(item.pageNumber === state.active)});
      const thumb = button('', () => { state.active = item.pageNumber; render(); }, {class: 'oi-thumbnail', 'aria-label': `${item.pageNumber}쪽 미리보기`, 'aria-pressed': String(item.pageNumber === state.active)});
      const placeholder = element('span', '미리보기 준비 중', {class: 'oi-preview-empty'}); thumb.append(placeholder);
      const label = element('label'), check = element('input', undefined, {type: 'checkbox', value: String(item.pageNumber), 'data-page-select': '', 'aria-label': `${item.pageNumber}쪽 선택`});
      check.checked = state.selected.has(item.pageNumber); check.disabled = !!state.busy || !!state.retry || (!canSelect(item) && !check.checked);
      check.addEventListener('change', () => { check.checked ? state.selected.add(item.pageNumber) : state.selected.delete(item.pageNumber); selectionChanged(); });
      label.append(check, element('span', `${item.pageNumber}쪽`));
      if (item.warnings?.length) label.append(element('span', '!', {class: 'oi-warning-dot', title: `${item.warnings.length}개 확인 사항`}));
      card.append(thumb, label); list.append(card); pendingThumbs.push([item, thumb]);
    }
    rail.append(list); if (!list.children.length) list.append(element('p', '확인할 항목이 없어요.', {class: 'oi-help'}));
    const center = element('section', undefined, {class: 'oi-preview-column', 'aria-label': '슬라이드 미리보기'});
    const previewBar = element('div', undefined, {class: 'oi-preview-bar'}), views = element('div', undefined, {class: 'oi-segment'});
    for (const [key, title] of [['pptx', 'PPT 화면'], ['editable', '편집 미리보기']]) {
      const toggle = button(title, () => { state.preview = key; render(); }, {'aria-pressed': String(state.preview === key), 'data-preview-mode': key});
      toggle.disabled = key === 'pptx' ? !imageAvailable(state.active) : !editableAvailable(page()); views.append(toggle);
    }
    const pagination = element('div', undefined, {class: 'oi-preview-pagination'});
    const prev = button('‹', () => changeActive(-1), {'aria-label': '이전 슬라이드'}), next = button('›', () => changeActive(1), {'aria-label': '다음 슬라이드'});
    prev.disabled = state.active <= 1; next.disabled = state.active >= state.inspection.pageCount;
    pagination.append(prev, element('span', `${state.active} / ${state.inspection.pageCount}`), next); previewBar.append(views, pagination); center.append(previewBar);
    const preview = element('div', undefined, {class: 'oi-large-preview', tabindex: '0', 'data-large-preview': '', 'aria-label': `${state.active}쪽 큰 미리보기`});
    preview.addEventListener('keydown', event => { if (['ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); changeActive(event.key === 'ArrowLeft' ? -1 : 1); body.querySelector('[data-large-preview]')?.focus(); } });
    center.append(preview, element('p', state.preview === 'pptx' ? 'PPT 파일 미리보기입니다. PowerPoint와 글꼴·효과가 다를 수 있어요.' : '온바탕에서 편집할 모습을 보여줘요. 글꼴·줄바꿈·배치를 확인하세요.', {class: 'oi-preview-caption'}));
    center.append(element('div', undefined, {'data-render-warnings': '', 'aria-live': 'polite'}));
    const details = element('details', undefined, {class: 'oi-warning-details'}), warnings = page()?.warnings || [];
    details.append(element('summary', warnings.length ? `이 슬라이드 확인 사항 ${warnings.length}개` : '슬라이드 정보'));
    const warningList = element('ul'); for (const warning of warnings) warningList.append(element('li', warning.message || warning.code));
    details.append(warningList, element('p', '애니메이션은 정적인 화면으로 표시합니다.', {class: 'oi-help'}));
    center.append(details);
    const aside = element('aside', undefined, {class: 'oi-options', 'aria-label': '가져오기 설정'}); aside.append(element('h2', '이 슬라이드 가져오기'));
    for (const [key, title, description] of [['image', '화면 유지 · 이미지', '슬라이드를 이미지로 가져와요. 이미지 위에 새 요소를 추가할 수 있어요.'], ['editable', '글 · 도형 편집', '지원하는 글과 도형을 각각 편집할 수 있어요.']]) {
      const label = element('label', undefined, {class: 'oi-mode', 'data-mode': key}), radio = element('input', undefined, {type: 'radio', name: 'slide-import-mode', value: key, 'aria-label': title});
      radio.checked = state.modes[state.active] === key; radio.disabled = !!state.busy || !!state.retry || (key === 'image' ? !imageAvailable(state.active) : !editableAvailable(page()));
      radio.addEventListener('change', () => { state.modes[state.active] = key; selectionChanged(); render(); });
      const wording = element('span'); wording.append(element('strong', title), element('small', description)); label.append(radio, wording); aside.append(label);
    }
    if (!imageAvailable(state.active)) aside.append(element('p', state.previewPages.get(state.active)?.reason || 'PPT 화면을 준비하면 이미지 방식도 선택할 수 있어요.', {class: 'oi-help'}));
    const fontBox = element('section', undefined, {class: 'oi-font-box'}), unknownLicenses = state.fonts.filter(font => fontLicense(font).status === 'unknown').length;
    fontBox.append(element('h3', '글꼴 점검'), element('p', state.fonts.length ? `${state.fonts.length}종 · 이용 안내 확인 ${state.fonts.length - unknownLicenses}종 / 확인 전 ${unknownLicenses}종` : '글꼴 이름을 확인하고 있어요.', {class: 'oi-help', 'data-font-license-summary': ''}));
    if (state.fonts.length) fontBox.append(element('p', `표시 상태: 대체 중 ${state.fonts.filter(font => displayedFont(font).status === 'substituted').length}종 · 기기 확인 전 ${state.fonts.filter(font => displayedFont(font).status === 'unknown').length}종`, {class: 'oi-help', 'data-font-render-summary': ''}));
    const fonts = button('글꼴 교체 설정', openFontDialog, {'data-font-settings': ''}); fonts.disabled = !!state.busy || !!state.retry || !state.fonts.length || !services.fonts; fontBox.append(fonts); aside.append(fontBox);
    aside.append(element('div', '앱 제공 글꼴 · OFL 확인', {class: 'oi-license-note'}), element('p', '원본 글꼴을 기본으로 유지해요. 교체는 범위를 확인한 뒤 직접 적용합니다.', {class: 'oi-help'}));
    if (state.fontPlan) aside.append(element('p', '글꼴 교체 설정이 적용되어 있어요.', {class: 'oi-chip'}));
    grid.append(rail, center, aside); body.append(grid); selectionChanged(); loadLargePreview(preview);
    if (doc.defaultView.IntersectionObserver) {
      const byHost = new Map(pendingThumbs.map(([item, host]) => [host, item]));
      thumbObserver = new doc.defaultView.IntersectionObserver(entries => { for (const entry of entries) if (entry.isIntersecting) { thumbObserver.unobserve(entry.target); loadThumbnail(byHost.get(entry.target), entry.target); } }, {root: list, rootMargin: '100px'});
      for (const [, host] of pendingThumbs) thumbObserver.observe(host);
    } else for (const [item, host] of pendingThumbs.slice(0, 12)) loadThumbnail(item, host);
  }
  function changeActive(delta) { state.active = Math.max(1, Math.min(state.inspection.pageCount, state.active + delta)); render(); }
  function updateFooter() {
    if (state.tab !== 'import' || state.step !== 2) return;
    footerNote.replaceChildren(element('strong', `${state.selected.size}쪽 선택`), element('span', '선택한 쪽을 모두 가져와요. 큰 자료는 여러 파트로 자동 저장합니다.'));
    footerActions.replaceChildren();
    if (state.busy === 'saving') { footerActions.append(button('저장 취소', cancelWork, {'data-import-cancel': ''})); return; }
    footerActions.append(button('이전', () => { state.step = 1; render(); }));
    const save = button(state.previewPreparing ? '미리보기 준비 중…' : `${state.selected.size}쪽 가져오기`, saveAll, {class: 'oi-primary', 'data-import-save': ''}); save.disabled = !state.selected.size || !!state.busy || state.previewPreparing; footerActions.append(save);
  }
  const planKey = plan => JSON.stringify(plan || null);
  async function previewData(number, view, purpose, plan = state.fontPlan, signal) {
    if (purpose !== 'thumbnail') return services.previewPage({file: state.file, inspection: state.inspection, pageNumber: number, view, purpose, fontPlan: plan, signal});
    const key = `${generation}:${number}:${view}:${purpose}:${planKey(plan)}`;
    if (!caches.has(key)) caches.set(key, Promise.resolve().then(() => services.previewPage({file: state.file, inspection: state.inspection, pageNumber: number, view, purpose, fontPlan: plan, signal})).catch(error => { caches.delete(key); throw error; }));
    const result = caches.get(key); while (caches.size > 48) caches.delete(caches.keys().next().value); return result;
  }
  function paintPreview(host, result) {
    host.replaceChildren();
    if (!result || result.available === false) { host.append(element('span', result?.reason || '이 미리보기를 준비하지 못했어요.', {class: 'oi-preview-empty'})); return; }
    const url = result.dataUrl || result.url;
    if (url && /^(?:data:image\/(?:png|jpeg|webp);base64,|blob:)/.test(url)) host.append(element('img', undefined, {src: url, alt: '슬라이드 미리보기'}));
    else if (result.page || result.slide) {
      const canvas = designView(result.page || result.slide), size = result.size || state.inspection.originalSize;
      if (size?.width > 0 && size?.height > 0) canvas.style.setProperty('--fe-ratio', String(size.width / size.height));
      host.append(canvas);
    } else host.append(element('span', '미리보기가 제공되지 않았어요.', {class: 'oi-preview-empty'}));
    if (host.hasAttribute('data-large-preview')) {
      const notices = host.parentElement.querySelector('[data-render-warnings]');
      notices?.replaceChildren();
      const warnings = result.warnings || [];
      if (notices && warnings.length) {
        const adjusted = warnings.filter(warning => warning.code === 'TEXT_FIT_ADJUSTED');
        if (adjusted.length) notices.append(element('p', adjusted.map(warning => warning.message).join(' '), {class: 'oi-render-adjustment'}));
        const details = element('details', undefined, {class: 'oi-warning-details'});
        details.append(element('summary', `PPT 화면 표시 확인 ${warnings.length}개`));
        const list = element('ul'); for (const warning of warnings) list.append(element('li', warning.message || warning.code)); details.append(list); notices.append(details);
      }
    }
  }
  async function loadThumbnail(item, host) {
    const job = generation, view = imageAvailable(item.pageNumber) ? 'pptx' : 'editable';
    if (!services.previewPage || (!item.canImport && view === 'editable')) { host.replaceChildren(element('span', '확인 필요', {class: 'oi-preview-empty'})); return; }
    try {
      const result = await previewData(item.pageNumber, view, 'thumbnail', state.fontPlan, actionController?.signal);
      if (!disposed && job === generation && host.isConnected) paintPreview(host, result);
    } catch { if (!disposed && job === generation && host.isConnected) host.replaceChildren(element('span', '미리보기 없음', {class: 'oi-preview-empty'})); }
  }
  async function loadLargePreview(host) {
    previewController?.abort(); previewController = new AbortController(); const job = ++previewGeneration, generationAtStart = generation;
    host.append(element('span', '슬라이드를 준비하고 있어요…', {class: 'oi-preview-empty'}));
    try {
      const result = await previewData(state.active, state.preview, 'large', state.fontPlan, previewController.signal);
      if (!disposed && job === previewGeneration && generationAtStart === generation && host.isConnected) paintPreview(host, result);
    } catch (error) { if (!disposed && job === previewGeneration && host.isConnected) host.replaceChildren(element('span', errorText(error), {class: 'oi-preview-empty'})); }
  }
  async function saveAll() {
    if (state.busy || state.previewPreparing || !state.selected.size || disposed) return;
    const job = generation; state.busy = 'saving'; actionController = new AbortController(); render(); say('선택한 슬라이드를 변환하고 이 기기에 저장하고 있어요…');
    try {
      const result = await services.saveAll({file: state.file, inspection: state.inspection, selectedPages: selectedPages(), importModes: copy(state.modes),
        fontPlan: copy(state.fontPlan), retry: state.retry, signal: actionController.signal, onProgress: progress => {
          if (!disposed && job === generation) say(progress.message || `${progress.completed || 0} / ${progress.total || state.selected.size}쪽 처리 중…`);
        }});
      if (disposed || job !== generation) return;
      state.result = result; state.retry = result.complete === true ? null : result.retry || result.recovery || (result.retryToken ? {retryToken: result.retryToken} : null); state.step = 3;
      say(result.complete === true ? `${result.pageCount || state.selected.size}쪽을 이 기기에 저장했어요.` : '아직 모든 쪽이 저장되지 않았어요. 저장된 자료는 보존하고 이어서 다시 시도할 수 있어요.', result.complete !== true);
    } catch (error) {
      if (disposed || job !== generation) return;
      state.retry = error.recovery || state.retry;
      state.result = {...error.recovery, complete: false, documents: error.documents || error.recovery?.documents || [], pageCount: error.pageCount || error.recovery?.pageCount || 0, error: errorText(error)};
      state.step = 3; say(cancelled(error) ? '가져오기를 멈췄어요. 저장 상태를 확인하고 이어서 진행할 수 있어요.' : errorText(error), !cancelled(error));
    } finally { if (!disposed && job === generation) { state.busy = null; render(); } }
    if (!disposed && job === generation && state.result?.complete === true && onComplete) {
      try { await onComplete(copy(state.result)); } catch (error) { say(`자료는 저장됐어요. ${errorText(error)}`, true); }
    }
  }
  function renderResult() {
    const result = state.result || {}, complete = result.complete === true, rows = result.documents || [];
    const section = element('section', undefined, {class: 'oi-result', 'data-import-result': complete ? 'complete' : 'partial'});
    section.append(element('span', complete ? '✓' : '!', {class: `oi-result-icon ${complete ? '' : 'warning'}`, 'aria-hidden': 'true'}),
      element('h1', complete ? '가져오기를 마쳤어요' : '가져오기를 이어서 진행해요'),
      element('p', complete ? result.materialRef ? `${result.pageCount || state.selected.size}쪽을 하나의 수업 자료로 묶었어요. ${rows.length}개 파트는 자동으로 보관됩니다.` : `${result.pageCount || state.selected.size}쪽을 ${rows.length}개 자료로 저장했어요.` : '모든 슬라이드가 저장되기 전까지 완료로 표시하지 않아요.', {class: 'oi-lead'}));
    if (result.error) section.append(element('p', result.error, {class: 'oi-help'}));
    section.append(element('p', '원본 PPT와 고정 자료는 이 기기에 보관됩니다.', {class: 'oi-device-note'}));
    if (complete && result.materialRef && onOpenMaterial) {
      const actions = element('div', undefined, {class: 'oi-actions'});
      for (const [text, intent] of materialActions) actions.append(button(text, async event => {
        const node = event.currentTarget; node.disabled = true;
        try { await onOpenMaterial(result.materialRef, intent); } catch (error) { say(errorText(error), true); } finally { node.disabled = false; }
      }, {'data-open-material': intent, class: intent === 'view' ? 'oi-primary' : ''}));
      section.append(actions);
    }
    const list = element('div', undefined, {class: 'oi-result-parts'});
    rows.forEach((row, index) => {
      const part = (result.parts || []).find(value => value.documentId === row.id) || result.parts?.[index];
      const card = element('article', undefined, {class: 'oi-result-part', 'data-result-document': row.id});
      const description = element('div'); description.append(element('strong', row.payload?.name || `자료 ${index + 1}`),
        element('p', part?.pages?.length ? `원본 ${part.pages.join(', ')}쪽 · 이 기기에 저장` : `${row.payload?.slides?.length || 0}쪽 · 이 기기에 저장`, {class: 'oi-help'}));
      const open = button('온바탕에서 편집', async () => { if (state.busy === 'saving' || embedded && !complete) return; try { await onOpenDocument?.(row); } catch (error) { say(errorText(error), true); } }, {'data-open-document': row.id});
      open.disabled = state.busy === 'saving' || embedded && !complete; card.append(description, open); list.append(card);
    });
    if (complete && result.materialRef) { const details = element('details'); details.append(element('summary', `개별 파트 ${rows.length}개 보기`), list); section.append(details); }
    else section.append(list);
    body.append(section);
    footerNote.textContent = complete ? '보관함에서 전체 자료를 다시 열어 편집하거나 내려받을 수 있어요.' : '이미 저장된 파트는 그대로 유지하고 남은 작업을 다시 시도합니다.';
    if (state.busy === 'saving') { footerActions.append(button('저장 취소', cancelWork, {'data-import-cancel': ''})); return; }
    footerActions.append(button('슬라이드 확인', () => { if (state.busy === 'saving') return; state.step = 2; render(); }));
    if (!complete) footerActions.append(button('이어서 다시 시도', saveAll, {class: 'oi-primary', 'data-import-retry': ''}));
    else footerActions.append(button('기기 보관함 보기', () => showTab('library'), {class: 'oi-primary'}));
  }
  function openFontDialog() {
    if (fontDialog?.open || !services.fonts) return;
    fontDialog = element('dialog', undefined, {class: 'oi-font-dialog', 'aria-label': '글꼴 교체 설정'});
    const modal = fontDialog, restore = doc.activeElement; let scope = 'selected', filter = 'review', draft = copy(state.fontPlan), previewJob = 0, fontPreviewController, fontPreviewTimer, previewValid = false;
    const mappings = new Map();
    const head = element('div', undefined, {class: 'oi-font-heading'});
    const close = () => { previewJob++; clearTimeout(fontPreviewTimer); fontPreviewController?.abort(); modal.close(); modal.remove(); restore?.focus(); };
    head.append(element('h2', '글꼴을 확인하고 바꿔요'), button('닫기', close, {'aria-label': '글꼴 설정 닫기'}));
    modal.append(head, element('p', '이용 안내와 기기의 표시 상태는 별개예요. 공식 안내가 있는 이름도 원본 파일의 진위를 보장하지 않아요. 기본값은 원본 유지입니다.', {class: 'oi-help'}));
    const controls = element('div', undefined, {class: 'oi-font-controls'});
    for (const [key, title] of [['all', `전체 ${state.inspection.pageCount}쪽`], ['selected', `선택한 ${state.selected.size}쪽`], ['current', `현재 ${state.active}쪽`]]) {
      const label = element('label'), input = element('input', undefined, {type: 'radio', name: 'font-scope', value: key}); input.checked = scope === key;
      input.addEventListener('change', () => { scope = key; refreshRows(); }); label.append(input, element('span', title)); controls.append(label);
    }
    const filterLabel = element('label'), filterInput = element('input', undefined, {type: 'checkbox'}); filterInput.checked = true;
    filterInput.addEventListener('change', () => { filter = filterInput.checked ? 'review' : 'all'; refreshRows(); }); filterLabel.append(filterInput, element('span', '이용 안내·표시를 확인할 글꼴만')); controls.append(filterLabel); modal.append(controls);
    const table = element('table', undefined, {class: 'oi-font-table'}), thead = element('thead'), tr = element('tr');
    for (const name of ['원본 지정 글꼴', '교체할 글꼴', '적용 범위']) tr.append(element('th', name, {scope: 'col'})); thead.append(tr); const tbody = element('tbody'); table.append(thead, tbody); modal.append(table);
    const comparisons = element('div', undefined, {class: 'oi-font-comparison'});
    const before = element('div', undefined, {class: 'oi-font-preview'}), after = element('div', undefined, {class: 'oi-font-preview'});
    const currentBox = element('section'), nextBox = element('section'); currentBox.append(element('h3', '현재 미리보기'), before); nextBox.append(element('h3', '교체 후 미리보기'), after); comparisons.append(currentBox, nextBox); modal.append(comparisons);
    const feedback = element('p', '줄바꿈과 배치가 달라지는 곳을 확인해주세요.', {class: 'oi-help', role: 'status'}); modal.append(feedback);
    const actions = element('div', undefined, {class: 'oi-font-actions'});
    const undo = button('이전 변경 되돌리기', () => { if (!state.priorPlans.length) return; state.fontPlan = state.priorPlans.pop(); close(); caches.clear(); render(); say('이전 글꼴 설정으로 되돌렸어요.'); }); undo.disabled = !state.priorPlans.length;
    const apply = button('선택 범위에 적용', async () => {
      if (!previewValid || apply.disabled) return;
      try { draft = await makePlan(); state.priorPlans.push(copy(state.fontPlan)); state.fontPlan = draft; caches.clear(); close(); render(); say('선택한 범위에 글꼴 설정을 적용했어요. 원본 PPT는 그대로예요.'); }
      catch (error) { feedback.textContent = errorText(error); }
    }, {class: 'oi-primary', 'data-font-apply': ''}); actions.append(element('span', '원본 PPT는 바뀌지 않아요.'), undo, button('취소', close), apply); modal.append(actions);
    async function makePlan() { return services.fonts.createPlan({inspection: state.inspection, previousPlan: state.fontPlan, scope, activePage: state.active, selectedPages: selectedPages(), importModes: state.modes, mappings: Object.fromEntries(mappings)}); }
    async function refreshPreview() {
      const job = ++previewJob; clearTimeout(fontPreviewTimer); fontPreviewController?.abort(); previewValid = false; apply.disabled = true;
      before.replaceChildren(element('span', '준비 중…')); after.replaceChildren(element('span', '준비 중…')); feedback.textContent = '선택한 설정으로 미리보기를 확인하고 있어요…';
      fontPreviewTimer = setTimeout(async () => {
        fontPreviewController = new AbortController();
        try {
          draft = await makePlan();
          const scoped = scope === 'all' ? state.inspection.pages.map(item => item.pageNumber) : scope === 'current' ? [state.active] : selectedPages();
          const previewPage = scoped.includes(state.active) ? state.active : scoped[0] || state.active;
          currentBox.firstElementChild.textContent = `현재 미리보기 · ${previewPage}쪽`; nextBox.firstElementChild.textContent = `교체 후 미리보기 · ${previewPage}쪽`;
          const view = !editableAvailable(page(previewPage)) || state.modes[previewPage] === 'image' ? 'pptx' : 'editable';
          const results = await Promise.all([previewData(previewPage, view, 'large', state.fontPlan, fontPreviewController.signal), previewData(previewPage, view, 'large', draft, fontPreviewController.signal)]);
          if (job !== previewJob || !modal.open) return;
          if (results.some(result => result?.available === false)) throw new Error('교체 후 미리보기를 확인하지 못했어요. 설정을 바꾸어 다시 확인해주세요.');
          paintPreview(before, results[0]); paintPreview(after, results[1]); previewValid = true;
          apply.disabled = scope === 'selected' && !state.selected.size;
          feedback.textContent = results[1].warnings?.some(warning => warning.code === 'TEXT_FIT_ADJUSTED') ? '표시 영역에 맞게 글자 크기를 조정했어요. 줄바꿈과 배치를 확인해주세요.' : '줄바꿈과 배치가 달라지는 곳을 확인해주세요.';
        } catch (error) { if (job === previewJob && modal.open) { feedback.textContent = errorText(error); after.replaceChildren(); previewValid = false; apply.disabled = true; } }
      }, 180);
    }
    function refreshRows() {
      tbody.replaceChildren(); const pages = scope === 'all' ? state.inspection.pages.map(value => value.pageNumber) : scope === 'current' ? [state.active] : selectedPages();
      const fonts = state.fonts.filter(font => (filter === 'all' || fontNeedsReview(font)) && (!font.pageNumbers?.length || font.pageNumbers.some(number => pages.includes(number))));
      for (const font of fonts) {
        const row = element('tr'), original = element('td'), selectCell = element('td'), range = element('td');
        row.setAttribute('data-font-source', font.name);
        original.append(element('strong', font.name), element('span', `이용 안내: ${fontLicense(font).label}`, {class: 'oi-chip', 'data-font-license': fontLicense(font).status}),
          element('span', `표시: ${displayedFont(font, pages).label}`, {class: 'oi-chip', 'data-font-render': displayedFont(font, pages).status}));
        if (font.licenseUrl) original.append(element('a', font.licenseStatus === 'bundled-ofl' ? '앱 제공 파일 이용 고지 ↗' : '공식 이용 안내 ↗', {href: font.licenseUrl, target: '_blank', rel: 'noopener', class: 'oi-help', 'data-font-guidance': ''}));
        if (font.licenseNote) original.append(element('small', font.licenseNote, {class: 'oi-help'}));
        if (font.mixed) original.append(element('small', '여러 글꼴이 섞인 글상자예요. 편집용에서는 글상자 전체에 적용돼요.', {class: 'oi-help'}));
        const select = element('select', undefined, {'aria-label': `${font.name} 교체할 글꼴`}); select.append(element('option', '원본 유지', {value: ''}));
        for (const candidate of services.fonts.candidates || []) select.append(element('option', `${candidate.name} · OFL 확인`, {value: candidate.id}));
        const license = element('a', '앱 제공 파일의 OFL 고지 ↗', {target: '_blank', rel: 'noopener', class: 'oi-help'}); license.hidden = true;
        const updateLicense = () => { const candidate = services.fonts.candidates.find(item => item.id === select.value); license.hidden = !candidate; if (candidate) license.href = candidate.licenseUrl; };
        const effective = new Set(pages.filter(number => !font.pageNumbers?.length || font.pageNumbers.includes(number)).map(number => services.fonts.appliedTarget?.(font.name, state.fontPlan, number) || null));
        if (effective.size > 1) select.append(element('option', '쪽마다 다른 설정 · 그대로 유지', {value: '__unchanged__'}));
        select.value = mappings.has(font.name) ? mappings.get(font.name) || '' : effective.size > 1 ? '__unchanged__' : [...effective][0] || '';
        select.addEventListener('change', () => { if (select.value === '__unchanged__') mappings.delete(font.name); else mappings.set(font.name, select.value || null); updateLicense(); refreshPreview(); });
        updateLicense(); selectCell.append(select, license); range.textContent = `${font.pageNumbers?.filter(number => pages.includes(number)).length || pages.length}쪽`; row.append(original, selectCell, range); tbody.append(row);
      }
      if (!fonts.length) { const row = element('tr'); row.append(element('td', '이 범위에 확인할 글꼴이 없어요.', {colspan: '3'})); tbody.append(row); }
      apply.textContent = `${pages.length}쪽에 적용`; refreshPreview();
    }
    modal.addEventListener('cancel', event => { event.preventDefault(); close(); });
    modal.addEventListener('close', () => { previewJob++; clearTimeout(fontPreviewTimer); fontPreviewController?.abort(); });
    doc.body.append(modal); modal.showModal(); refreshRows();
  }
  render();
  function startNewImport() {
    if (disposed) return false;
    if (state.busy || (state.retry && state.result?.complete === false)) {
      say('진행 중인 가져오기를 먼저 마치거나 저장 상태를 확인해주세요. 파일과 이미 저장한 자료는 유지돼요.');
      return false;
    }
    actionController?.abort(); previewController?.abort(); services.disposePreview?.();
    generation++; previewGeneration++; libraryGeneration++; thumbObserver?.disconnect(); caches.clear(); fileInput.value = '';
    fontDialog?.close(); fontDialog?.remove(); fontDialog = null;
    Object.assign(state, {step: 1, tab: 'import', file: null, inspection: null, selected: new Set(), modes: {}, active: 1,
      preview: 'editable', filter: 'all', busy: null, previewPreparing: false, result: null, retry: null, fonts: [], fontPlan: null, priorPlans: [], previewPages: new Map()});
    render(); say('새 PPT를 골라주세요. 편집하던 그림과 이전에 가져온 자료는 그대로 보관돼요.'); return true;
  }
  return {requestClose, resume() { if (disposed) return; suspended = false; if (renderPending) return render(); }, startNewImport, showLibrary: () => showTab('library'), showImport: () => showTab('import'), chooseFile, getState: () => ({step: state.step, tab: state.tab, selectedPages: selectedPages(), activePage: state.active, busy: state.busy, resumable: !!state.retry && state.result?.complete === false}),
    dispose() { if (disposed) return; disposed = true; generation++; previewGeneration++; libraryGeneration++; thumbObserver?.disconnect(); actionController?.abort(); previewController?.abort(); services.disposePreview?.(); fontDialog?.close(); fontDialog?.remove(); root.replaceChildren(); }};
}

/** An acknowledged partial import survives editing a saved part in this page.
 * Reloading the page still starts a new session; durable documents remain in the library.
 */
export function manageImportDialog({dialog, workspace, services}) {
  let disposed = false;
  const dispose = () => {
    if (disposed) return; disposed = true; dialog.removeEventListener('close', onClose);
    workspace.dispose(); services.dispose(); dialog.remove();
  };
  const onClose = () => { if (!workspace.getState().resumable) dispose(); };
  dialog.addEventListener('close', onClose);
  return {reopen() { if (disposed || !dialog.isConnected) return false; if (!dialog.open) dialog.showModal(); return true; }, dispose};
}

/** One owner retains each route's DOM, so returning to a form never recreates its draft. */
export function createImportRoutes({root, window: browser = root?.ownerDocument?.defaultView, canLeave = () => true, onChange = () => {}} = {}) {
  if (!root) throw new TypeError('Workspace route root is required');
  const entries = new Map(), session = globalThis.crypto.randomUUID(); let current = null;
  function register(key, {node, route, title}) {
    if (entries.has(key)) return entries.get(key);
    node.hidden = true; node.dataset.workspaceRoute = route; node.dataset.routeKey = key; root.append(node);
    const entry = {key, node, route, title}; entries.set(key, entry); return entry;
  }
  function show(key, {replace = false, history = true} = {}) {
    const next = entries.get(key); if (!next) throw new Error('Unknown workspace route');
    if (current && !canLeave(current, next)) return false;
    for (const entry of entries.values()) entry.node.hidden = entry !== next;
    current = next;
    if (history) {
      const state = {...browser.history.state, onbatangWorkspace: {session, key}};
      if (replace || browser.history.state?.onbatangWorkspace?.key === key) browser.history.replaceState(state, '');
      else browser.history.pushState(state, '');
    }
    onChange(next); return true;
  }
  const pop = event => {
    const target = event.state?.onbatangWorkspace;
    if (target?.session !== session || !entries.has(target.key)) return;
    if (!show(target.key, {history: false})) browser.history.pushState({...browser.history.state, onbatangWorkspace: {session, key: current.key}}, '');
  };
  browser.addEventListener('popstate', pop);
  return {register, show, get: key => entries.get(key), get current() { return current; }, dispose() { browser.removeEventListener('popstate', pop); }};
}
