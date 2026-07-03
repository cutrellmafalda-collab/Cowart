import { ensureHtmlArtboardDocument } from './htmlCanvasDocument.js'
import { ensureFusionPatch, normalizeFusionPatches } from './fusionPatch.js'
import { createRenderFingerprint } from './renderFingerprint.js'

const REPLAY_MUTATION_TYPES = new Set([
  'html_update',
  'css_update',
  'fusion_patch_create',
  'fusion_patch_update',
  'fusion_patch_delete',
  'fusion_patch_visibility_update',
  'fusion_patch_region_update',
  'fusion_patch_rename',
  'fusion_patch_mock_asset_generate',
  'fusion_patch_external_asset_attach',
  'background_asset_attach',
  'text_layer_sync',
  'document_meta_update'
])

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

function getPayload(mutation) {
  return isRecord(mutation?.payload) ? mutation.payload : {}
}

function withUpdatedFingerprint(document) {
  return {
    ...document,
    renderFingerprint: createRenderFingerprint(document)
  }
}

function appendReplayHistory(document, mutation) {
  return {
    ...document,
    history: [
      ...document.history,
      {
        action: 'replay-mutation',
        mutationId: typeof mutation?.id === 'string' ? mutation.id : null,
        type: typeof mutation?.type === 'string' ? mutation.type : 'unknown'
      }
    ]
  }
}

function replaceFusionPatch(document, patchId, nextPatch) {
  const patch = ensureFusionPatch(nextPatch)

  return {
    ...document,
    fusionPatches: document.fusionPatches.map((existingPatch) =>
      existingPatch.id === patchId ? patch : existingPatch
    )
  }
}

function updateFusionPatch(document, patchId, updates) {
  if (!isRecord(updates)) return document

  const existingPatch = document.fusionPatches.find((patch) => patch.id === patchId)
  if (!existingPatch) return document

  return replaceFusionPatch(document, patchId, {
    ...existingPatch,
    ...deepClone(updates)
  })
}

function getInitialSourceValue(options, meta, key, fallback) {
  if (typeof options[key] === 'string') {
    return options[key]
  }

  if (typeof meta[key] === 'string') {
    return meta[key]
  }

  return fallback
}

function getInitialFusionPatches(options, meta, fallback) {
  if (Array.isArray(options.initialFusionPatches)) {
    return normalizeFusionPatches(options.initialFusionPatches)
  }

  if (Array.isArray(meta.initialFusionPatches)) {
    return normalizeFusionPatches(meta.initialFusionPatches)
  }

  return normalizeFusionPatches(fallback)
}

export function applyHtmlArtboardMutation(document, mutation, options = {}) {
  let nextDocument = ensureHtmlArtboardDocument(document)
  const mutationType = typeof mutation?.type === 'string' ? mutation.type : ''
  const payload = getPayload(mutation)

  if (!REPLAY_MUTATION_TYPES.has(mutationType)) {
    if (options.strict === true) {
      throw new Error(`Unsupported HTML Artboard mutation type: ${mutationType || 'unknown'}`)
    }

    return withUpdatedFingerprint(nextDocument)
  }

  if (mutationType === 'html_update' && typeof payload.nextHtml === 'string') {
    nextDocument = {
      ...nextDocument,
      html: payload.nextHtml
    }
  }

  if (mutationType === 'css_update' && typeof payload.nextCss === 'string') {
    nextDocument = {
      ...nextDocument,
      css: payload.nextCss
    }
  }

  if (mutationType === 'fusion_patch_create' && isRecord(payload.patch)) {
    const patch = ensureFusionPatch(payload.patch)
    const hasPatch = nextDocument.fusionPatches.some((existingPatch) => existingPatch.id === patch.id)

    if (!hasPatch) {
      nextDocument = {
        ...nextDocument,
        fusionPatches: [...nextDocument.fusionPatches, patch]
      }
    }
  }

  if (mutationType === 'fusion_patch_update' && typeof payload.patchId === 'string') {
    if (isRecord(payload.nextPatch)) {
      nextDocument = replaceFusionPatch(nextDocument, payload.patchId, payload.nextPatch)
    } else {
      nextDocument = updateFusionPatch(nextDocument, payload.patchId, payload.updates)
    }
  }

  if (mutationType === 'fusion_patch_delete' && typeof payload.patchId === 'string') {
    nextDocument = {
      ...nextDocument,
      fusionPatches: nextDocument.fusionPatches.filter((patch) => patch.id !== payload.patchId)
    }
  }

  if (
    mutationType === 'fusion_patch_visibility_update' &&
    typeof payload.patchId === 'string' &&
    typeof payload.nextVisible === 'boolean'
  ) {
    nextDocument = updateFusionPatch(nextDocument, payload.patchId, { visible: payload.nextVisible })
  }

  if (
    mutationType === 'fusion_patch_region_update' &&
    typeof payload.patchId === 'string' &&
    isRecord(payload.nextRegion)
  ) {
    nextDocument = updateFusionPatch(nextDocument, payload.patchId, { region: payload.nextRegion })
  }

  if (
    mutationType === 'fusion_patch_rename' &&
    typeof payload.patchId === 'string' &&
    typeof payload.nextName === 'string'
  ) {
    nextDocument = updateFusionPatch(nextDocument, payload.patchId, { name: payload.nextName })
  }

  if (mutationType === 'fusion_patch_mock_asset_generate' && typeof payload.patchId === 'string') {
    if (isRecord(payload.nextPatch)) {
      nextDocument = replaceFusionPatch(nextDocument, payload.patchId, payload.nextPatch)
    } else {
      nextDocument = updateFusionPatch(nextDocument, payload.patchId, {
        patchAssetId: payload.patchAssetId,
        patchAssetUrl: payload.patchAssetUrl,
        status: 'mock-generated',
        provider: 'mock'
      })
    }
  }

  if (mutationType === 'fusion_patch_external_asset_attach' && typeof payload.patchId === 'string') {
    if (isRecord(payload.nextPatch)) {
      nextDocument = replaceFusionPatch(nextDocument, payload.patchId, payload.nextPatch)
    } else {
      nextDocument = updateFusionPatch(nextDocument, payload.patchId, {
        patchAssetId: payload.patchAssetId,
        patchAssetUrl: payload.patchAssetUrl,
        status: 'generated',
        provider: typeof payload.provider === 'string' ? payload.provider : 'external-image-gen'
      })
    }
  }

  if (mutationType === 'background_asset_attach') {
    if (isRecord(payload.nextBackground)) {
      nextDocument = {
        ...nextDocument,
        background: deepClone(payload.nextBackground)
      }
    } else if (typeof payload.backgroundAssetUrl === 'string') {
      nextDocument = {
        ...nextDocument,
        background: {
          ...(isRecord(nextDocument.background) ? deepClone(nextDocument.background) : {}),
          type: 'image',
          identity:
            typeof payload.backgroundAssetId === 'string'
              ? payload.backgroundAssetId
              : payload.backgroundAssetUrl,
          backgroundAssetId:
            typeof payload.backgroundAssetId === 'string' ? payload.backgroundAssetId : null,
          backgroundAssetUrl: payload.backgroundAssetUrl,
          status: 'generated',
          provider: typeof payload.provider === 'string' ? payload.provider : 'external-image-gen'
        }
      }
    }
  }

  if (mutationType === 'text_layer_sync' && Array.isArray(payload.nextTextLayers)) {
    nextDocument = {
      ...nextDocument,
      html: typeof payload.nextHtml === 'string' ? payload.nextHtml : nextDocument.html,
      textLayers: deepClone(payload.nextTextLayers)
    }
  }

  if (mutationType === 'document_meta_update' && isRecord(payload.meta)) {
    nextDocument = {
      ...nextDocument,
      meta: {
        ...nextDocument.meta,
        ...deepClone(payload.meta)
      }
    }
  }

  if (options.recordReplayHistory === true) {
    nextDocument = appendReplayHistory(nextDocument, mutation)
  }

  return withUpdatedFingerprint(nextDocument)
}

export function replayHtmlArtboardMutations(baseDocument, mutations, options = {}) {
  const mutationList = Array.isArray(mutations) ? deepClone(mutations) : []
  let nextDocument = {
    ...ensureHtmlArtboardDocument(baseDocument),
    mutationLog: []
  }

  for (const mutation of mutationList) {
    nextDocument = applyHtmlArtboardMutation(nextDocument, mutation, options)
  }

  nextDocument = {
    ...nextDocument,
    mutationLog: options.includeMutationLog === false ? [] : deepClone(mutationList)
  }

  return withUpdatedFingerprint(nextDocument)
}

export function replayHtmlArtboardMutationLog(document, options = {}) {
  const runtimeDocument = ensureHtmlArtboardDocument(document)
  const baseDocument = createReplayBaseDocument(runtimeDocument, options)

  return replayHtmlArtboardMutations(baseDocument, runtimeDocument.mutationLog, options)
}

export function createReplayBaseDocument(document, options = {}) {
  const runtimeDocument = ensureHtmlArtboardDocument(document)
  const meta = isRecord(runtimeDocument.meta) ? runtimeDocument.meta : {}
  const baseDocument = {
    ...runtimeDocument,
    html: getInitialSourceValue(options, meta, 'initialHtml', runtimeDocument.html),
    css: getInitialSourceValue(options, meta, 'initialCss', runtimeDocument.css),
    fusionPatches: getInitialFusionPatches(options, meta, runtimeDocument.fusionPatches),
    mutationLog: []
  }

  return withUpdatedFingerprint(baseDocument)
}
