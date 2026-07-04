import { normalizeFusionPatches } from './fusionPatch.js'

const HTML_ARTBOARD_TYPE = 'cowart-html-artboard'
const HTML_ARTBOARD_VERSION = 1
const DEFAULT_WIDTH = 720
const DEFAULT_HEIGHT = 1280
const FORBIDDEN_UI_FIELDS = ['zoom', 'activeTab', 'selectedSelector', 'workspace']

const DEFAULT_HTML = `<section class="artboard" data-node="hero">
  <p class="eyebrow" data-node="eyebrow">COWART LIVE POSTER</p>
  <h1 data-node="headline">夏日冰感上新</h1>
  <p class="subhead" data-node="subhead">每一行文字都能在画布里单独拖动、改大小，再局部生成艺术字。</p>
  <p class="detail" data-node="detail">底图负责氛围，HTML 负责可编辑内容，FusionPatch 负责局部融合。</p>
  <button data-node="cta">生成艺术字</button>
</section>`

const DEFAULT_CSS = `.artboard {
  box-sizing: border-box;
  width: 100%;
  min-height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 26px;
  padding: 108px 76px 96px;
  color: #10202f;
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  background:
    radial-gradient(circle at 76% 20%, rgba(255,255,255,.72), transparent 26%),
    radial-gradient(circle at 18% 72%, rgba(56,189,248,.28), transparent 34%),
    linear-gradient(160deg, #e8f7ff 0%, #f5fbff 42%, #ffe9d4 100%);
}

.artboard .eyebrow {
  margin: 0;
  width: max-content;
  padding: 10px 16px;
  border-radius: 999px;
  background: rgba(16, 32, 47, 0.08);
  font-size: 22px;
  font-weight: 700;
  letter-spacing: .12em;
}

.artboard h1 {
  margin: 0;
  max-width: 600px;
  font-size: 92px;
  line-height: .98;
  font-weight: 900;
  letter-spacing: -.04em;
}

.artboard .subhead {
  margin: 0;
  max-width: 590px;
  font-size: 31px;
  line-height: 1.45;
  font-weight: 650;
}

.artboard .detail {
  margin: 0;
  max-width: 560px;
  color: rgba(16, 32, 47, .68);
  font-size: 22px;
  line-height: 1.55;
}

.artboard button {
  width: 208px;
  height: 64px;
  border: 0;
  border-radius: 999px;
  background: #10202f;
  color: #ffffff;
  font-size: 21px;
  font-weight: 800;
}`

const DEFAULT_BACKGROUND = {
  type: 'gradient',
  identity: 'summer-ice-live-poster-gradient-v1',
  description: 'No-text summer ice gradient background metadata for an HTML artboard source.',
  prompt: 'no text, fresh summer ice poster background, soft blue highlights, warm product glow',
  colors: ['#e8f7ff', '#f5fbff', '#ffe9d4']
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
