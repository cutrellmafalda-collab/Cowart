import { ensureHtmlArtboardDocument } from './htmlCanvasDocument.js'

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

function createMutationId(type) {
  return `mutation:${type}:${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

export function createHtmlArtboardMutation(type, payload = {}, options = {}) {
  const meta = isRecord(options.meta) ? deepClone(options.meta) : {}

  return {
    id: typeof options.id === 'string' && options.id ? options.id : createMutationId(type),
    type,
    timestamp:
      typeof options.timestamp === 'string' && options.timestamp
        ? options.timestamp
        : new Date().toISOString(),
    target: typeof options.target === 'string' && options.target ? options.target : 'runtimeDocument',
    payload: deepClone(payload),
    meta: {
      ...meta,
      source: typeof meta.source === 'string' && meta.source ? meta.source : 'html-artboard-editor'
    }
  }
}

export function appendHtmlArtboardMutations(document, mutations) {
  const runtimeDocument = ensureHtmlArtboardDocument(document)
  const nextMutations = Array.isArray(mutations) ? mutations.map((mutation) => deepClone(mutation)) : []

  return {
    ...runtimeDocument,
    mutationLog: [...runtimeDocument.mutationLog, ...nextMutations]
  }
}

export function createSourceUpdateMutations(beforeDocument, afterDocument, options = {}) {
  const before = ensureHtmlArtboardDocument(beforeDocument)
  const after = ensureHtmlArtboardDocument(afterDocument)
  const mutations = []

  if (before.html !== after.html) {
    mutations.push(
      createHtmlArtboardMutation(
        'html_update',
        {
          previousHtml: before.html,
          nextHtml: after.html
        },
        options
      )
    )
  }

  if (before.css !== after.css) {
    mutations.push(
      createHtmlArtboardMutation(
        'css_update',
        {
          previousCss: before.css,
          nextCss: after.css
        },
        options
      )
    )
  }

  return mutations
}
