import {inspectPptx, convertPptx} from './client.js';
import {createPptxPreview} from './preview.js';
import {createPptxImportWorkflow} from './workflow.js';
import {defaultImportFontServices} from './fonts.js';
import {configure} from '../../src/model.js';
import {ONBATANG_FONTS} from '../fonts.js';

/** Keeps preview work isolated from durable imports and preserves original baselines. */
export function createImportUiServices({imports, fonts = ONBATANG_FONTS, fontServices = defaultImportFontServices} = {}) {
  const {getImportFontRegistry, collectImportFonts, createFontPlan, applyFontPlan, loadImportFontAssets, resolveImportFontReplacement} = fontServices;
  configure({fonts: fonts});
  const workflow = createPptxImportWorkflow({imports, applyFonts: applyFontPlan, loadFonts: loadImportFontAssets}), renderer = createPptxPreview({fontServices});
  let session, previewFile, fileSignal, queue = Promise.resolve(), generation = 0;
  const editable = new Map(), fontLoads = new Map(), ownedFaces = new Set();
  const fail = () => { throw Object.assign(new Error('이전 파일의 미리보기를 취소했어요.'), {code: 'CANCELLED'}); };
  const trim = cache => { while (cache.size > 18) cache.delete(cache.keys().next().value); };
  async function loadFonts(plan, signal) {
    if (!plan) return;
    const key = JSON.stringify(plan);
    if (!fontLoads.has(key)) fontLoads.set(key, loadImportFontAssets(plan, {signal}).then(async assets => {
      for (const font of assets.fonts) {
        const face = new FontFace(font.family, `url("${font.url}")`); await face.load(); document.fonts.add(face); ownedFaces.add(face);
      }
      return assets;
    }).catch(error => { fontLoads.delete(key); throw error; }));
    return fontLoads.get(key);
  }
  const sourceNames = inspection => Object.fromEntries((inspection.pages || []).flatMap(page => (page.fontUsage || []).map(usage => [usage.elementId, usage.originalName])));
  const services = {
    async inspect(file, options) {
      generation++; previewFile = file; fileSignal = options?.signal; editable.clear(); queue = Promise.resolve();
      return inspectPptx(file, options);
    },
    async preparePreview({file, inspection, signal}) {
      const current = generation; const next = await renderer.open(file, {inspection, signal});
      if (current !== generation) { next.dispose(); fail(); }
      session?.dispose(); session = next;
      return {pageCount: next.pageCount, pages: next.pages, renderer: next.renderer};
    },
    async previewPage({file, inspection, pageNumber, view, purpose, fontPlan, signal}) {
      if (file !== previewFile) fail(); const current = generation;
      if (view === 'pptx') {
        if (!session) throw Object.assign(new Error('PPT 화면을 준비하고 있어요. 편집 미리보기를 먼저 확인할 수 있어요.'), {code: 'PREVIEW_NOT_OPEN'});
        return session.renderPage(pageNumber, {width: purpose === 'thumbnail' ? 320 : 1280, purpose: purpose === 'thumbnail' ? 'thumbnail' : 'image', fontPlan, signal});
      }
      if (!editable.has(pageNumber)) {
        // A single large PPT is not unpacked by hundreds of concurrent workers.
        const work = queue.then(async () => {
          if (current !== generation || fileSignal?.aborted) fail();
          return convertPptx(file, {selectedPages: [pageNumber], signal: fileSignal});
        });
        queue = work.catch(() => {}); editable.set(pageNumber, work); trim(editable);
        work.catch(() => { if (editable.get(pageNumber) === work) editable.delete(pageNumber); });
      }
      const baseline = (await editable.get(pageNumber)).document;
      if (current !== generation || signal?.aborted) fail();
      configure({fonts: fonts}); await loadFonts(fontPlan, signal);
      const applied = fontPlan ? applyFontPlan(baseline, fontPlan) : baseline;
      return {page: applied.slides[0], size: applied.size, kind: 'editable', available: true};
    },
    async saveAll({retry, ...options}) {
      configure({fonts: fonts});
      // PPT 화면 그리기는 창이 보일 때만 제대로 돈다(가려진 탭에서는 브라우저가 그리기를 멈춰 시간 초과로 미리보기가 닫혔다).
      // 그래서 창이 가려져 있으면 다시 보일 때까지 기다리고, 미리보기가 닫혔거나(시간 초과) 아직 열리지 않았으면 다시 열어 그 쪽을 그린다.
      const visible = () => typeof document === 'undefined' || !document.hidden ? Promise.resolve() : new Promise(resolve => {
        try { options.onProgress?.({phase: 'waiting', message: '창이 가려져 있어 잠시 멈췄어요. 이 창을 다시 보면 이어서 가져와요.'}); } catch { /* 표시는 저장을 막지 않는다 */ }
        const go = () => { if (!document.hidden) { document.removeEventListener('visibilitychange', go); resolve(); } };
        document.addEventListener('visibilitychange', go);
      });
      const live = {renderPage: async (pageNumber, opts) => {
        await visible();
        try { if (!session) throw Object.assign(new Error('PREVIEW_NOT_OPEN'), {code: 'PREVIEW_NOT_OPEN'}); return await session.renderPage(pageNumber, opts); }
        catch (error) {
          if (!['PREVIEW_DISPOSED', 'PREVIEW_TIMEOUT', 'PREVIEW_NOT_OPEN'].includes(error?.code) || options.signal?.aborted) throw error;
          await visible();
          const next = await renderer.open(options.file, {inspection: options.inspection, signal: options.signal});
          session?.dispose(); session = next;
          return session.renderPage(pageNumber, opts);
        }
      }};
      return workflow.saveAll({...options, previewSession: live, retryToken: retry?.retryToken || retry});
    },
    fonts: {
      candidates: getImportFontRegistry(),
      appliedTarget: (sourceFont, plan, pageNumber) => plan ? resolveImportFontReplacement(sourceFont, plan, pageNumber)?.id || null : null,
      inspect: ({inspection, deviceFonts = []}) => collectImportFonts(inspection, {deviceFonts}).map(font => ({...font, name: font.sourceFont})),
      createPlan({inspection, previousPlan, scope, activePage, selectedPages, importModes = {}, mappings}) {
        const rule = {scopePages: scope === 'all' ? 'all' : scope === 'current' ? [activePage] : selectedPages, mappings};
        const inventory = {sourceNamesByElementId: sourceNames(inspection), fontNamesByElementId: Object.fromEntries((inspection.pages || []).flatMap(page => (page.fontUsage || []).map(usage => [usage.elementId, usage.originalNames || [usage.originalName]])))};
        const plan = createFontPlan(previousPlan ? {...previousPlan, rules: [...(previousPlan.rules || []), rule], ...inventory} : {...rule, ...inventory});
        // Validate every editable text box affected by the plan, not only the
        // currently visible preview. No source text is needed for this check.
        applyFontPlan({slides: inspection.pages.filter(page => importModes[page.pageNumber] !== 'image').map(page => ({source: {pageNumber: page.pageNumber},
          items: (page.fontUsage || []).map(usage => ({id: usage.elementId, t: 'text', text: '', typeface: usage.originalName}))}))}, plan);
        return plan;
      }
    },
    disposePreview() { generation++; session?.dispose(); session = null; editable.clear(); fontLoads.clear(); queue = Promise.resolve(); },
    dispose() { services.disposePreview(); workflow.dispose(); for (const face of ownedFaces) document.fonts.delete(face); ownedFaces.clear(); }
  };
  return services;
}
