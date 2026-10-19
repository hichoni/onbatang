// A pure boundary for already-converted pages. Reading a PPTX and storing its bytes belong to the host.
import { migrateRecord } from './designs.js';
import { DOCUMENT_LIMITS, DocumentError, fail, isId, isObject, legacyId } from '../src/document.js';

const text = (v, max = 240) => typeof v === 'string' && v.length > 0 && v.length <= max && !/[\u0000-\u001f]/.test(v);
const natural = v => Number.isSafeInteger(v) && v > 0;
const sourceTypes = {
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  pdf: 'application/pdf',
};

function pages(value, count, path, input) {
  if (!Array.isArray(value) || !value.length || value.some(n => !natural(n) || n > count)) {
    fail('INVALID_PAGE_SELECTION', path, input, { pageCount: count });
  }
  if (new Set(value).size !== value.length) fail('DUPLICATE_PAGE_SELECTION', path, input);
  return [...value];
}

function source(value, expected, path, input) {
  if (value !== undefined && !isObject(value)) fail('INVALID_SOURCE', path, input);
  for (const key of ['kind', 'sourceDocumentId', 'assetId', 'pageNumber']) {
    if (value?.[key] !== undefined && expected[key] !== undefined && value[key] !== expected[key]) {
      fail('SOURCE_MISMATCH', `${path}.${key}`, input, { expected: expected[key], actual: value[key] });
    }
  }
  return { ...value, ...expected };
}

/**
 * input = { report: studio-import.json, document: resolved studio-document.json }.
 * report.selectedPages maps document.slides to original, one-based page numbers.
 * options.selectedPages explicitly chooses/reorders available pages. No implicit truncation.
 * Returns { record, report }; the caller persists the source asset and the report separately.
 * DocumentError.original is always the exact input, including rejected extracted text.
 */
export function importConvertedDocument(input, options = {}) {
  try {
    if (!isObject(input) || !isObject(input.report) || !isObject(input.document) || !isObject(options)) {
      fail('INVALID_IMPORT', 'import', input);
    }
    const { report, document } = input;
    if (report.contractVersion !== 1) fail('UNSUPPORTED_IMPORT_CONTRACT', 'report.contractVersion', input, { supported: 1 });
    if (report.status !== 'ready') fail('IMPORT_NOT_READY', 'report.status', input, { status: report.status });
    for (const key of ['jobId', 'sourceDocumentId', 'sourceAssetId']) {
      if (!isId(report[key])) fail('INVALID_IMPORT', `report.${key}`, input);
    }
    if (!natural(report.pageCount)) fail('INVALID_PAGE_COUNT', 'report.pageCount', input);
    const converter = report.converter;
    if (!isObject(converter) || !text(converter.name) || !text(converter.version)
      || !Array.isArray(converter.fonts) || converter.fonts.some(v => !text(v))) {
      fail('INVALID_CONVERTER', 'report.converter', input);
    }
    const warnings = report.warnings ?? [];
    if (!Array.isArray(warnings) || warnings.some(w => !isObject(w) || !text(w.code) || !text(w.message, 2000)
      || (w.pageNumber !== undefined && (!natural(w.pageNumber) || w.pageNumber > report.pageCount)))) {
      fail('INVALID_IMPORT', 'report.warnings', input);
    }
    const available = pages(report.selectedPages, report.pageCount, 'report.selectedPages', input);
    if (!Array.isArray(document.slides) || document.slides.length !== available.length) {
      fail('PAGE_COUNT_MISMATCH', 'document.slides', input, { expected: available.length, actual: document.slides?.length });
    }
    const selected = pages(options.selectedPages ?? available, report.pageCount, 'selectedPages', input);
    if (selected.length > DOCUMENT_LIMITS.pages) {
      fail('PAGE_LIMIT', 'selectedPages', input, { limit: DOCUMENT_LIMITS.pages, actual: selected.length });
    }
    for (const n of selected) if (!available.includes(n)) fail('PAGE_NOT_AVAILABLE', 'selectedPages', input, { pageNumber: n });
    if (document.originalSize === undefined) fail('MISSING_ORIGINAL_SIZE', 'document.originalSize', input);
    const kind = document.source?.kind;
    if (!Object.hasOwn(sourceTypes, kind)) fail('UNSUPPORTED_IMPORT_KIND', 'document.source.kind', input);
    const originalAsset = Array.isArray(document.assets) && document.assets.find(a => a?.id === report.sourceAssetId);
    if (!originalAsset || originalAsset.kind !== 'source' || originalAsset.mimeType !== sourceTypes[kind]) {
      fail('MISSING_SOURCE_ASSET', 'document.assets', input, { assetId: report.sourceAssetId });
    }
    if (document.source?.sha256 && originalAsset.sha256 && document.source.sha256 !== originalAsset.sha256) {
      fail('SOURCE_MISMATCH', 'document.source.sha256', input);
    }
    const baseSource = { kind, sourceDocumentId: report.sourceDocumentId, assetId: report.sourceAssetId };
    const documentSource = source(document.source, baseSource, 'document.source', input);
    const id = document.id ?? legacyId('d', `${report.sourceDocumentId}:${report.jobId}`);
    // Assign missing IDs from original page numbers before selection, so changing order cannot change identity.
    const mapped = new Map(available.map((n, i) => {
      const page = document.slides[i];
      if (!isObject(page) || !Array.isArray(page.items)) fail('INVALID_PAGE', `document.slides.${i}`, input);
      const expected = { ...baseSource, pageNumber: n };
      const pageId = page.id ?? legacyId('p', `${id}:source-page:${n}`);
      const pageSource = source(page.source, expected, `document.slides.${i}.source`, input);
      return [n, { ...page, id: pageId, source: pageSource, items: page.items.map((item, j) => {
        if (!isObject(item)) fail('UNSUPPORTED_ELEMENT', `document.slides.${i}.items.${j}`, input);
        return { ...item, id: item.id ?? legacyId('e', `${id}:${pageId}:source-object:${item.source?.objectId ?? j}`),
          source: source(item.source, expected, `document.slides.${i}.items.${j}.source`, input) };
      }) }];
    }));
    const record = migrateRecord({ ...document, id, source: documentSource,
      size: document.size ?? document.originalSize, slides: selected.map(n => mapped.get(n)) });
    return {
      record,
      report: {
        contractVersion: 1, jobId: report.jobId, status: 'ready',
        sourceDocumentId: report.sourceDocumentId, sourceAssetId: report.sourceAssetId,
        converter: { name: converter.name, version: converter.version, fonts: [...converter.fonts] },
        pageCount: report.pageCount, availablePages: available, selectedPages: selected,
        omittedPages: available.filter(n => !selected.includes(n)),
        warnings: warnings.map(w => ({ code: w.code, message: w.message, ...(w.pageNumber === undefined ? {} : { pageNumber: w.pageNumber }) })),
      },
    };
  } catch (error) {
    if (error instanceof DocumentError) error.original = input;
    throw error;
  }
}
