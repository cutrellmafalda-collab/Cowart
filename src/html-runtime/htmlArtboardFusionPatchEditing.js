import { ensureFusionPatch } from './fusionPatch.js'
import { ensureHtmlArtboardDocument } from './htmlCanvasDocument.js'
import {
  appendHtmlArtboardMutations,
  createHtmlArtboardMutation
} from './htmlArtboardMutations.js'
import { createRenderFingerprint } from './renderFingerprint.js'

const FUSION_PATCH_EDITOR_SOURCE = 'html-artboard-fusion-patch-panel'

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

function getMutationOptions(options = {}) {
  return {
    ...options.mutationOptions,
    meta: {
      ...options.mutationOptions?.meta,
      source: FUSION_PATCH_EDITOR_SOURCE
    }
  }
}

function normalizeRegion(region) {
  if (!isRecord(region)) return null

  const nextRegion = {
    x: Number(region.x),
    y: Number(region.y),
    w: Number(region.w),
    h: Number(region.h)
  }

  if (![nextRegion.x, nextRegion.y, nextRegion.w, nextRegion.h].every(Number.isFinite)) {
    return null
  }

  if (nextRegion.w <= 0 || nextRegion.h <= 0) return null

  return nextRegion
}

function patchesEqual(firstPatch, secondPatch) {
  return JSON.stringify(firstPatch) === JSON.stringify(secondPatch)
}

function regionsEqual(firstRegion, secondRegion) {
  return JSON.stringify(firstRegion) === JSON.stringify(secondRegion)
}

function updateDocumentFingerprint(document) {
  return {
    ...document,
    renderFingerprint: createRenderFingerprint(document)
  }
}

function getPatchIndex(runtimeDocument, patchId) {
  return runtimeDocument.fusionPatches.findIndex((patch) => patch.id === patchId)
}

function getUpdatedDocumentWithPatch(runtimeDocument, patchIndex, patch) {
  return {
    ...runtimeDocument,
    fusionPatches: runtimeDocument.fusionPatches.map((existingPatch, index) =>
      index === patchIndex ? patch : existingPatch
    )
  }
}

function appendPatchMutations(document, mutations, options = {}) {
  if (options.recordMutationLog === false || mutations.length === 0) {
    return document
  }

  return appendHtmlArtboardMutations(document, mutations)
}

function createPatchUpdateMutations(previousPatch, nextPatch, options = {}) {
  const mutationOptions = getMutationOptions(options)
  const mutations = []

  if (previousPatch.name !== nextPatch.name) {
    mutations.push(
      createHtmlArtboardMutation(
        'fusion_patch_rename',
        {
          patchId: nextPatch.id,
          previousName: previousPatch.name,
          nextName: nextPatch.name
        },
        mutationOptions
      )
    )
  }

  if (!regionsEqual(previousPatch.region, nextPatch.region)) {
    mutations.push(
      createHtmlArtboardMutation(
        'fusion_patch_region_update',
        {
          patchId: nextPatch.id,
          previousRegion: previousPatch.region,
          nextRegion: nextPatch.region
        },
        mutationOptions
      )
    )
  }

  const genericUpdateKeys = [
    'selector',
    'sourceSelector',
    'sourceText',
    'prompt',
    'maskAssetId',
    'patchAssetId',
    'patchAssetUrl',
    'blendMode',
    'opacity',
    'provider',
    'seed',
    'status',
    'meta'
  ]
  const genericUpdates = Object.fromEntries(
    genericUpdateKeys
      .filter((key) => JSON.stringify(previousPatch[key]) !== JSON.stringify(nextPatch[key]))
      .map((key) => [key, nextPatch[key]])
  )

  if (Object.keys(genericUpdates).length > 0) {
    mutations.push(
      createHtmlArtboardMutation(
        'fusion_patch_update',
        {
          patchId: nextPatch.id,
          updates: genericUpdates,
          previousPatch,
          nextPatch
        },
        mutationOptions
      )
    )
  }

  return mutations
}

export function updateFusionPatchInHtmlArtboard(document, patchId, updates, options = {}) {
  const runtimeDocument = ensureHtmlArtboardDocument(document)
  const patchIndex = getPatchIndex(runtimeDocument, patchId)
  if (patchIndex === -1 || !isRecord(updates)) return runtimeDocument

  const previousPatch = runtimeDocument.fusionPatches[patchIndex]
  const nextPatchInput = {
    ...previousPatch,
    ...deepClone(updates)
  }
  if (Object.hasOwn(updates, 'region')) {
    nextPatchInput.region = normalizeRegion(updates.region) ?? previousPatch.region
  }
  const nextPatch = ensureFusionPatch(nextPatchInput)

  if (patchesEqual(previousPatch, nextPatch)) return runtimeDocument

  const mutations = createPatchUpdateMutations(previousPatch, nextPatch, options)
  let updatedDocument = getUpdatedDocumentWithPatch(runtimeDocument, patchIndex, nextPatch)
  updatedDocument = appendPatchMutations(updatedDocument, mutations, options)

  return updateDocumentFingerprint(updatedDocument)
}

export function deleteFusionPatchFromHtmlArtboard(document, patchId, options = {}) {
  const runtimeDocument = ensureHtmlArtboardDocument(document)
  const patchIndex = getPatchIndex(runtimeDocument, patchId)
  if (patchIndex === -1) return runtimeDocument

  const deletedPatch = runtimeDocument.fusionPatches[patchIndex]
  let updatedDocument = {
    ...runtimeDocument,
    fusionPatches: runtimeDocument.fusionPatches.filter((patch) => patch.id !== patchId)
  }

  updatedDocument = appendPatchMutations(
    updatedDocument,
    [
      createHtmlArtboardMutation(
        'fusion_patch_delete',
        {
          patchId,
          patch: deletedPatch
        },
        getMutationOptions(options)
      )
    ],
    options
  )

  return updateDocumentFingerprint(updatedDocument)
}

export function setFusionPatchVisibilityInHtmlArtboard(
  document,
  patchId,
  visible,
  options = {}
) {
  const runtimeDocument = ensureHtmlArtboardDocument(document)
  const patchIndex = getPatchIndex(runtimeDocument, patchId)
  if (patchIndex === -1 || typeof visible !== 'boolean') return runtimeDocument

  const previousPatch = runtimeDocument.fusionPatches[patchIndex]
  if (previousPatch.visible === visible) return runtimeDocument

  const nextPatch = ensureFusionPatch({
    ...previousPatch,
    visible
  })
  let updatedDocument = getUpdatedDocumentWithPatch(runtimeDocument, patchIndex, nextPatch)
  updatedDocument = appendPatchMutations(
    updatedDocument,
    [
      createHtmlArtboardMutation(
        'fusion_patch_visibility_update',
        {
          patchId,
          previousVisible: previousPatch.visible,
          nextVisible: nextPatch.visible
        },
        getMutationOptions(options)
      )
    ],
    options
  )

  return updateDocumentFingerprint(updatedDocument)
}

export function renameFusionPatchInHtmlArtboard(document, patchId, name, options = {}) {
  if (typeof name !== 'string') {
    return ensureHtmlArtboardDocument(document)
  }

  return updateFusionPatchInHtmlArtboard(document, patchId, { name }, options)
}

export function updateFusionPatchRegionInHtmlArtboard(document, patchId, region, options = {}) {
  return updateFusionPatchInHtmlArtboard(document, patchId, { region }, options)
}
