import { normalizeFusionPatches } from './fusionPatch.js'

const HTML_ARTBOARD_TYPE = 'cowart-html-artboard'
const HTML_ARTBOARD_VERSION = 1
const DEFAULT_WIDTH = 720
const DEFAULT_HEIGHT = 1280
const FORBIDDEN_UI_FIELDS = ['zoom', 'activeTab', 'selectedSelector', 'workspace']

const DEFAULT_HTML = `<section class="artboard">
  <h1>Cowart HTML Artboard</h1>
  <p>A source document for future HTML/CSS visual canvases.</p>
</section>`

const DEFAULT_CSS = `.artboard {
  box-sizing: border-box;
  min-height: 100%;
  display: grid;
  place-content: center;
  gap: 16px;
  padding: 64px;
  color: #18222f;
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  text-align: center;
}

.artboard h1 {
  margin: 0;
  font-size: 48px;
  line-height: 1.05;
}

.artboard p {
  margin: 0;
  font-size: 20px;
  line-height: 1.5;
}`

const DEFAULT_BACKGROUND = {
  type: 'gradient',
  identity: 'no-text-atmosphere-gradient-v1',
  description: 'No-text atmosphere gradient metadata for an HTML artboard source.',
  prompt: 'no text, atmospheric gradient background',
  colors: ['#f4f7fb', '#d8e7f0', '#f6e6d9']
}

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

function omitUiFields(document) {
  if (!isRecord(document)) {
    return document
  }

  for (const field of FORBIDDEN_UI_FIELDS) {
    delete document[field]
  }

  return document
}

function createDocumentId() {
  const randomUUID = globalThis.crypto?.randomUUID
  if (typeof randomUUID === 'function') {
    return `html-artboard:${randomUUID.call(globalThis.crypto)}`
  }

  return `html-artboard:${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

function normalizeDimension(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function normalizeArray(value) {
  return Array.isArray(value) ? deepClone(value) : []
}

function normalizeNullableRecord(value) {
  return value == null ? null : deepClone(value)
}

function normalizeMeta(value) {
  const meta = isRecord(value) ? deepClone(value) : {}
  return {
    ...meta,
    provider: typeof meta.provider === 'string' && meta.provider ? meta.provider : 'mock'
  }
}

export function createHtmlArtboardDocument(options = {}) {
  return ensureHtmlArtboardDocument({
    id: createDocumentId(),
    ...options
  })
}

export function ensureHtmlArtboardDocument(document = {}) {
  const source = isRecord(document) ? document : {}
  const ensured = omitUiFields(deepClone(source))

  ensured.id = typeof source.id === 'string' && source.id ? source.id : createDocumentId()
  ensured.type = HTML_ARTBOARD_TYPE
  ensured.version = HTML_ARTBOARD_VERSION
  ensured.width = normalizeDimension(source.width, DEFAULT_WIDTH)
  ensured.height = normalizeDimension(source.height, DEFAULT_HEIGHT)
  ensured.background = isRecord(source.background) ? deepClone(source.background) : deepClone(DEFAULT_BACKGROUND)
  ensured.html = typeof source.html === 'string' ? source.html : DEFAULT_HTML
  ensured.css = typeof source.css === 'string' ? source.css : DEFAULT_CSS
  ensured.textLayers = normalizeArray(source.textLayers)
  ensured.fusionPatches = normalizeFusionPatches(source.fusionPatches)
  ensured.assets = normalizeArray(source.assets)
  ensured.history = normalizeArray(source.history)
  ensured.mutationLog = normalizeArray(source.mutationLog)
  ensured.executionGraph = normalizeNullableRecord(source.executionGraph)
  ensured.renderFingerprint = typeof source.renderFingerprint === 'string' ? source.renderFingerprint : null
  ensured.meta = normalizeMeta(source.meta)

  return ensured
}

export function cloneHtmlArtboardDocument(document) {
  return omitUiFields(deepClone(document ?? {}))
}
