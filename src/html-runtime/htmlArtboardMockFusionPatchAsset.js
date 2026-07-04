import { ensureFusionPatch } from './fusionPatch.js'
import { ensureHtmlArtboardDocument } from './htmlCanvasDocument.js'
import {
  appendHtmlArtboardMutations,
  createHtmlArtboardMutation
} from './htmlArtboardMutations.js'
import { createRenderFingerprint } from './renderFingerprint.js'

const MOCK_ASSET_SOURCE = 'html-artboard-mock-fusion-patch-asset-panel'

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

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`
  }

  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`
  }

  return JSON.stringify(value)
}

function hashString(value) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return (hash >>> 0).toString(36)
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function encodeSvgDataUrl(svg) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function getPatchLabel(patch) {
  return (
    [patch.name, patch.sourceText, patch.prompt, patch.id].find(
      (value) => typeof value === 'string' && value.length > 0
    ) ?? 'Mock Fusion Patch'
  )
}

function isArtTextPatch(patch) {
  return patch?.meta?.purpose === 'art-text'
}

function getMutationOptions(options = {}) {
  return {
    ...options.mutationOptions,
    meta: {
      ...options.mutationOptions?.meta,
      source: MOCK_ASSET_SOURCE
    }
  }
}

function updateDocumentFingerprint(document) {
  return {
    ...document,
    renderFingerprint: createRenderFingerprint(document)
  }
}

function createMockAssetKey(patch, document, options = {}) {
  return hashString(
    stableStringify({
      documentId: document.id,
      patchId: patch.id,
      name: patch.name,
      prompt: patch.prompt,
      sourceText: patch.sourceText,
      region: patch.region,
      seed: options.seed ?? patch.seed ?? null
    })
  )
}

function createMockAssetSvg(patch, document, assetId) {
  if (isArtTextPatch(patch)) {
    return createMockArtTextAssetSvg(patch, assetId)
  }

  const label = escapeXml(getPatchLabel(patch))
  const prompt = escapeXml(patch.prompt || 'Mock patch asset')
  const sourceText = escapeXml(patch.sourceText || document.id)

  return `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180" role="img" aria-label="${label}">
  <defs>
    <linearGradient id="mock-fusion-bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#22c55e" />
      <stop offset="1" stop-color="#0f766e" />
    </linearGradient>
  </defs>
  <rect width="320" height="180" rx="18" fill="url(#mock-fusion-bg)" />
  <rect x="16" y="16" width="288" height="148" rx="14" fill="#ffffff" fill-opacity="0.16" stroke="#ffffff" stroke-opacity="0.55" stroke-width="2" />
  <text x="28" y="48" fill="#ffffff" font-family="Inter, ui-sans-serif, system-ui, sans-serif" font-size="20" font-weight="800">Mock Fusion Patch</text>
  <text x="28" y="78" fill="#ecfeff" font-family="Inter, ui-sans-serif, system-ui, sans-serif" font-size="15" font-weight="700">${label}</text>
  <text x="28" y="108" fill="#ccfbf1" font-family="Inter, ui-sans-serif, system-ui, sans-serif" font-size="12">${prompt}</text>
  <text x="28" y="132" fill="#ccfbf1" font-family="Inter, ui-sans-serif, system-ui, sans-serif" font-size="12">${sourceText}</text>
  <text x="28" y="154" fill="#99f6e4" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="10">${escapeXml(assetId)}</text>
</svg>`
}

function createMockArtTextAssetSvg(patch, assetId) {
  const label = escapeXml(getPatchLabel(patch))
  const sourceText = escapeXml(patch.sourceText || label || '艺术字')

  return `<svg xmlns="http://www.w3.org/2000/svg" class="cowart-art-text-mock-asset" width="900" height="260" viewBox="0 0 900 260" role="img" aria-label="${label}">
  <defs>
    <linearGradient id="cowart-art-text-ice" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#eff6ff" />
      <stop offset="0.32" stop-color="#7dd3fc" />
      <stop offset="0.68" stop-color="#38bdf8" />
      <stop offset="1" stop-color="#0f766e" />
    </linearGradient>
    <filter id="cowart-art-text-glow" x="-20%" y="-35%" width="140%" height="170%">
      <feDropShadow dx="0" dy="10" stdDeviation="8" flood-color="#075985" flood-opacity="0.35" />
      <feDropShadow dx="0" dy="0" stdDeviation="5" flood-color="#ffffff" flood-opacity="0.72" />
    </filter>
  </defs>
  <rect width="900" height="260" fill="none" />
  <text x="450" y="158" text-anchor="middle" fill="url(#cowart-art-text-ice)" stroke="#ffffff" stroke-width="10" paint-order="stroke fill" filter="url(#cowart-art-text-glow)" font-family="Inter, ui-sans-serif, system-ui, sans-serif" font-size="118" font-weight="900" letter-spacing="2">${sourceText}</text>
</svg>`
}

export function createMockFusionPatchAsset(patch, document, options = {}) {
  const runtimeDocument = ensureHtmlArtboardDocument(document)
  const normalizedPatch = ensureFusionPatch(patch)
  const key = createMockAssetKey(normalizedPatch, runtimeDocument, options)
  const patchAssetId =
    typeof options.patchAssetId === 'string' && options.patchAssetId
      ? options.patchAssetId
      : `mock-fusion-patch-asset:${key}`
  const generatedAt =
    typeof options.generatedAt === 'string' && options.generatedAt
      ? options.generatedAt
      : new Date().toISOString()
  const svg = createMockAssetSvg(normalizedPatch, runtimeDocument, patchAssetId)

  return {
    patchAssetId,
    patchAssetUrl: encodeSvgDataUrl(svg),
    status: 'mock-generated',
    provider: 'mock',
    generatedAt,
    seed: options.seed ?? normalizedPatch.seed ?? key
  }
}

export function generateMockFusionPatchAssetForHtmlArtboard(document, patchId, options = {}) {
  const runtimeDocument = ensureHtmlArtboardDocument(document)
  const patchIndex = runtimeDocument.fusionPatches.findIndex((patch) => patch.id === patchId)
  if (patchIndex === -1) return runtimeDocument

  const previousPatch = runtimeDocument.fusionPatches[patchIndex]
  const asset = createMockFusionPatchAsset(previousPatch, runtimeDocument, options)
  const nextPatch = ensureFusionPatch({
    ...previousPatch,
    patchAssetId: asset.patchAssetId,
    patchAssetUrl: asset.patchAssetUrl,
    status: asset.status,
    provider: asset.provider,
    seed: asset.seed,
    updatedAt: asset.generatedAt,
    meta: {
      ...previousPatch.meta,
      generatedAt: asset.generatedAt
    }
  })
  let updatedDocument = {
    ...runtimeDocument,
    fusionPatches: runtimeDocument.fusionPatches.map((patch, index) =>
      index === patchIndex ? nextPatch : patch
    )
  }

  if (options.recordMutationLog !== false) {
    updatedDocument = appendHtmlArtboardMutations(updatedDocument, [
      createHtmlArtboardMutation(
        'fusion_patch_mock_asset_generate',
        {
          patchId: nextPatch.id,
          patchAssetId: asset.patchAssetId,
          patchAssetUrl: asset.patchAssetUrl,
          previousPatch: deepClone(previousPatch),
          nextPatch: deepClone(nextPatch)
        },
        getMutationOptions(options)
      )
    ])
  }

  return updateDocumentFingerprint(updatedDocument)
}

export function generateMockFusionPatchAssetsForHtmlArtboard(document, options = {}) {
  const runtimeDocument = ensureHtmlArtboardDocument(document)
  const visiblePatches = runtimeDocument.fusionPatches.filter((patch) => patch.visible !== false)

  return visiblePatches.reduce(
    (nextDocument, patch) =>
      generateMockFusionPatchAssetForHtmlArtboard(nextDocument, patch.id, options),
    runtimeDocument
  )
}
