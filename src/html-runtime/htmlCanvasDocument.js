import { normalizeFusionPatches } from './fusionPatch.js'

const HTML_ARTBOARD_TYPE = 'cowart-html-artboard'
const HTML_ARTBOARD_VERSION = 1
const DEFAULT_WIDTH = 720
const DEFAULT_HEIGHT = 1280
const FORBIDDEN_UI_FIELDS = ['zoom', 'activeTab', 'selectedSelector', 'workspace']

const DEFAULT_HTML = `<section class="artboard" data-node="hero">
  <p class="eyebrow" data-node="eyebrow">夏日限定</p>
  <h1 data-node="headline">
    <span data-node="headline-line-1">冰感桃桃</span>
    <span data-node="headline-line-2">乌龙</span>
  </h1>
  <p class="subhead" data-node="subhead">清爽桃桃乌龙 · 今日上新</p>
  <p class="detail" data-node="detail">底图负责氛围，文字每行都能单独拖动，局部图像作为 FusionPatch 覆盖。</p>
  <button data-node="cta">立即尝鲜</button>
</section>`

const DEFAULT_CSS = `.artboard {
  box-sizing: border-box;
  width: 100%;
  min-height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 22px;
  padding: 112px 72px 88px;
  color: #10202f;
  font-family: Inter, "Microsoft YaHei", ui-sans-serif, system-ui, sans-serif;
  background:
    radial-gradient(circle at 78% 16%, rgba(255,255,255,.78), transparent 28%),
    radial-gradient(circle at 20% 72%, rgba(56,189,248,.32), transparent 34%),
    linear-gradient(160deg, #e8f7ff 0%, #f5fbff 46%, #ffe9d4 100%);
}

.artboard .eyebrow {
  margin: 0 0 18px;
  width: max-content;
  padding: 10px 18px;
  border-radius: 999px;
  background: rgba(255, 255, 255, .52);
  font-size: 24px;
  font-weight: 800;
  letter-spacing: .16em;
}

.artboard h1 {
  margin: 0;
  display: grid;
  gap: 2px;
  max-width: 610px;
  font-size: 90px;
  line-height: .94;
  font-weight: 900;
  letter-spacing: -.05em;
}

.artboard h1 span {
  display: block;
}

.artboard .subhead {
  margin: 24px 0 0;
  max-width: 560px;
  font-size: 32px;
  line-height: 1.32;
  font-weight: 750;
}

.artboard .detail {
  margin: 0;
  max-width: 560px;
  color: rgba(16, 32, 47, .72);
  font-size: 22px;
  line-height: 1.55;
}

.artboard button {
  width: 210px;
  height: 64px;
  margin-top: 26px;
  border: 0;
  border-radius: 999px;
  color: #ffffff;
  background: #10324a;
  font-size: 22px;
  font-weight: 850;
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
