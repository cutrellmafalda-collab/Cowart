import { normalizeFusionPatches } from './fusionPatch.js'

const HTML_ARTBOARD_TYPE = 'cowart-html-artboard'
const HTML_ARTBOARD_VERSION = 1
const DEFAULT_WIDTH = 720
const DEFAULT_HEIGHT = 1280
const FORBIDDEN_UI_FIELDS = ['zoom', 'activeTab', 'selectedSelector', 'workspace']

const DEFAULT_HTML = `<section class="artboard" data-node="hero">
  <p class="eyebrow" data-node="eyebrow">新品视觉</p>
  <h1 data-node="headline">每行文字都能拖动</h1>
  <p class="subhead" data-node="subhead">底图是氛围，文字可编辑，局部可融合。</p>
  <button data-node="cta">生成融合图层</button>
</section>`

const DEFAULT_CSS = `.artboard {
  box-sizing: border-box;
  width: 100%;
  min-height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 24px;
  padding: 96px 72px;
  color: #16212a;
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  background: linear-gradient(160deg, #eef7ff 0%, #f6efe6 58%, #ffffff 100%);
}

.artboard .eyebrow {
  margin: 0;
  width: max-content;
  padding: 10px 18px;
  border-radius: 999px;
  background: rgba(22, 33, 42, 0.08);
  font-size: 24px;
  font-weight: 700;
}

.artboard h1 {
  margin: 0;
  max-width: 560px;
  font-size: 78px;
  line-height: 1.02;
  font-weight: 900;
}

.artboard .subhead {
  margin: 0;
  max-width: 560px;
  font-size: 28px;
  line-height: 1.45;
}

.artboard button {
  width: 220px;
  height: 64px;
  border: 0;
  border-radius: 999px;
  background: #16212a;
  color: #ffffff;
  font-size: 22px;
  font-weight: 800;
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
