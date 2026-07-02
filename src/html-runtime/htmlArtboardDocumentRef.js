import {
  cloneHtmlArtboardDocument,
  ensureHtmlArtboardDocument
} from './htmlCanvasDocument.js'

const DOCUMENT_REF_KIND = 'html-artboard-document-ref'
const DOCUMENT_REF_VERSION = 1
const DEFAULT_MAX_INLINE_BYTES = 50000
const DEFAULT_DOCUMENT_ID = 'html-artboard'

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function deepClone(value) {
  if (Array.isArray(value)) {
    return value.map((item) => deepClone(item))
  }

  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, deepClone(item)]))
  }

  return value
}

function normalizePositiveInteger(value, fallback) {
  return Number.isInteger(value) && value > 0 ? value : fallback
}

function normalizeBaseDir(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return ''
  }

  return value
    .split(/[\\/]+/)
    .map((part) => sanitizeHtmlArtboardDocumentId(part))
    .filter((part) => part && part !== '.' && part !== '..')
    .join('/')
}

export function sanitizeHtmlArtboardDocumentId(value) {
  const sanitized = String(value ?? '')
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')

  return sanitized || DEFAULT_DOCUMENT_ID
}

export function createHtmlArtboardDocumentPath(documentRef, options = {}) {
  const source = isRecord(documentRef) ? documentRef : {}
  const documentId = sanitizeHtmlArtboardDocumentId(source.documentId)
  const pageId =
    typeof source.pageId === 'string' && source.pageId
      ? sanitizeHtmlArtboardDocumentId(source.pageId)
      : null
  const baseDir = normalizeBaseDir(options.baseDir ?? source.baseDir)
  const relativePath = pageId
    ? `pages/${pageId}/html-artboards/${documentId}.json`
    : `html-artboards/${documentId}.json`

  return [baseDir, relativePath].filter(Boolean).join('/')
}

export function createHtmlArtboardDocumentRef(document, options = {}) {
  const sourceOptions = isRecord(options) ? options : {}
  const normalizedDocument = ensureHtmlArtboardDocument(document)
  const documentId = sanitizeHtmlArtboardDocumentId(
    sourceOptions.documentId ?? normalizedDocument.id
  )
  const pageId =
    typeof sourceOptions.pageId === 'string' && sourceOptions.pageId
      ? sanitizeHtmlArtboardDocumentId(sourceOptions.pageId)
      : null
  const documentRef = {
    kind: DOCUMENT_REF_KIND,
    version: normalizePositiveInteger(sourceOptions.version, DOCUMENT_REF_VERSION),
    documentId,
    pageId,
    path: null,
    createdFromInlineDocument: true
  }

  documentRef.path = createHtmlArtboardDocumentPath(documentRef, {
    baseDir: sourceOptions.baseDir
  })

  return documentRef
}

export function isHtmlArtboardDocumentRef(value) {
  return isRecord(value) && value.kind === DOCUMENT_REF_KIND
}

export function estimateHtmlArtboardDocumentSize(document) {
  try {
    return JSON.stringify(document ?? {}).length
  } catch {
    return 0
  }
}

export function shouldExternalizeHtmlArtboardDocument(document, options = {}) {
  const sourceOptions = isRecord(options) ? options : {}
  const maxInlineBytes =
    Number.isFinite(sourceOptions.maxInlineBytes) && sourceOptions.maxInlineBytes >= 0
      ? sourceOptions.maxInlineBytes
      : DEFAULT_MAX_INLINE_BYTES

  return estimateHtmlArtboardDocumentSize(document) > maxInlineBytes
}

export function createHtmlArtboardMetaWithDocumentRef(meta, documentRef, options = {}) {
  const sourceMeta = isRecord(meta) ? meta : {}
  const sourceOptions = isRecord(options) ? options : {}
  const nextMeta = deepClone(sourceMeta)

  nextMeta.runtimeDocumentRef = deepClone(documentRef)

  if (sourceOptions.keepInlineDocument === false) {
    delete nextMeta.runtimeDocument
  }

  return nextMeta
}

export function splitHtmlArtboardRuntimeDocumentFromShape(shapeRecord, options = {}) {
  const sourceOptions = isRecord(options) ? options : {}
  const nextShape = deepClone(shapeRecord ?? {})
  const runtimeDocument = shapeRecord?.meta?.runtimeDocument

  if (!runtimeDocument) {
    return {
      shapeRecord: nextShape,
      runtimeDocument: null,
      documentRef: null,
      changed: false
    }
  }

  const normalizedDocument = ensureHtmlArtboardDocument(runtimeDocument)
  const pageId = sourceOptions.pageId ?? shapeRecord?.parentId ?? null
  const documentRef = createHtmlArtboardDocumentRef(normalizedDocument, {
    ...sourceOptions,
    pageId
  })
  const nextMeta = createHtmlArtboardMetaWithDocumentRef(nextShape.meta, documentRef, sourceOptions)

  if (sourceOptions.keepInlineDocument !== false) {
    nextMeta.runtimeDocument = cloneHtmlArtboardDocument(normalizedDocument)
  }

  nextShape.meta = nextMeta

  return {
    shapeRecord: nextShape,
    runtimeDocument: cloneHtmlArtboardDocument(normalizedDocument),
    documentRef,
    changed: true
  }
}

export function hydrateHtmlArtboardShapeWithRuntimeDocument(
  shapeRecord,
  runtimeDocument,
  options = {}
) {
  const nextShape = deepClone(shapeRecord ?? {})
  const nextMeta = isRecord(nextShape.meta) ? deepClone(nextShape.meta) : {}

  nextMeta.runtimeDocument = ensureHtmlArtboardDocument(runtimeDocument)
  nextShape.meta = nextMeta

  return nextShape
}
