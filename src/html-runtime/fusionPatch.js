const FUSION_PATCH_TYPE = 'fusion-patch'
const DEFAULT_REGION = { x: 80, y: 80, w: 240, h: 120 }

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

function createFusionPatchId() {
  const randomUUID = globalThis.crypto?.randomUUID
  if (typeof randomUUID === 'function') {
    return `fusion-patch:${randomUUID.call(globalThis.crypto)}`
  }

  return `fusion-patch:${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

function normalizeString(value, fallback, { allowEmpty = false } = {}) {
  if (typeof value !== 'string') return fallback
  if (!allowEmpty && value.length === 0) return fallback
  return value
}

function normalizeNullableString(value) {
  return typeof value === 'string' && value ? value : null
}

function normalizeRegion(value) {
  const source = isRecord(value) ? value : {}

  return {
    ...deepClone(source),
    x: Number.isFinite(source.x) ? source.x : DEFAULT_REGION.x,
    y: Number.isFinite(source.y) ? source.y : DEFAULT_REGION.y,
    w: Number.isFinite(source.w) && source.w > 0 ? source.w : DEFAULT_REGION.w,
    h: Number.isFinite(source.h) && source.h > 0 ? source.h : DEFAULT_REGION.h
  }
}

function normalizeOpacity(value) {
  if (!Number.isFinite(value)) return 1
  return Math.min(Math.max(value, 0), 1)
}

function normalizeMeta(value) {
  return isRecord(value) ? deepClone(value) : {}
}

export function createFusionPatchPlaceholder(options = {}) {
  const source = isRecord(options) ? options : {}
  const selector = normalizeNullableString(source.selector)
  const createdAt = normalizeString(source.createdAt, new Date().toISOString())
  const updatedAt = normalizeString(source.updatedAt, createdAt)

  return {
    ...deepClone(source),
    id: normalizeString(source.id, createFusionPatchId()),
    type: FUSION_PATCH_TYPE,
    name: normalizeString(source.name, 'Mock Fusion Patch'),
    selector,
    sourceSelector: normalizeNullableString(source.sourceSelector) ?? selector,
    sourceText: normalizeString(source.sourceText, '', { allowEmpty: true }),
    region: normalizeRegion(source.region),
    prompt: normalizeString(source.prompt, 'Mock fusion patch placeholder'),
    maskAssetId: normalizeNullableString(source.maskAssetId),
    patchAssetId: normalizeNullableString(source.patchAssetId),
    patchAssetUrl: normalizeNullableString(source.patchAssetUrl),
    blendMode: normalizeString(source.blendMode, 'normal'),
    opacity: normalizeOpacity(source.opacity),
    provider: normalizeString(source.provider, 'mock'),
    seed: deepClone(source.seed ?? null),
    status: normalizeString(source.status, 'placeholder'),
    visible: typeof source.visible === 'boolean' ? source.visible : true,
    createdAt,
    updatedAt,
    meta: normalizeMeta(source.meta)
  }
}

export function ensureFusionPatch(patch) {
  return createFusionPatchPlaceholder(isRecord(patch) ? patch : {})
}

export function normalizeFusionPatches(patches) {
  return Array.isArray(patches) ? patches.map((patch) => ensureFusionPatch(patch)) : []
}

export function cloneFusionPatch(patch) {
  return deepClone(ensureFusionPatch(patch))
}
