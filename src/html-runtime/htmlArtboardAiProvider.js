import { ensureFusionPatch } from './fusionPatch.js'
import { ensureHtmlArtboardDocument } from './htmlCanvasDocument.js'
import {
  appendHtmlArtboardMutations,
  createHtmlArtboardMutation
} from './htmlArtboardMutations.js'
import { createMockFusionPatchAsset } from './htmlArtboardMockFusionPatchAsset.js'
import { createHtmlArtboardThumbnailDataUrl } from './htmlArtboardThumbnail.js'
import { createRenderFingerprint } from './renderFingerprint.js'

const PROVIDER_REQUEST_KIND = 'html-artboard-ai-provider-request'
const PROVIDER_RESULT_KIND = 'html-artboard-ai-provider-result'
const PROVIDER_VERSION = 1
const MOCK_PROVIDER_NAME = 'mock'
const MOCK_PROVIDER_MODEL = 'mock-fusion-patch-v1'
const PROVIDER_MUTATION_SOURCE = 'html-artboard-ai-provider'

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

function getPatchDimensions(patch) {
  const region = normalizeRegion(patch.region)
  return {
    width: region?.w ?? 0,
    height: region?.h ?? 0
  }
}

function getProviderOptions(options = {}) {
  return {
    provider:
      typeof options.providerName === 'string' && options.providerName
        ? options.providerName
        : typeof options.provider === 'string' && options.provider
          ? options.provider
          : MOCK_PROVIDER_NAME,
    model:
      typeof options.model === 'string' && options.model
        ? options.model
        : MOCK_PROVIDER_MODEL,
    seed: options.seed ?? null,
    quality:
      typeof options.quality === 'string' && options.quality ? options.quality : 'standard',
    timeoutMs: Number.isFinite(options.timeoutMs) ? options.timeoutMs : 60000
  }
}

function getConstraints(patch, options = {}) {
  const dimensions = getPatchDimensions(patch)

  return {
    width: Number.isFinite(options.width) ? options.width : dimensions.width,
    height: Number.isFinite(options.height) ? options.height : dimensions.height,
    transparentBackground:
      typeof options.transparentBackground === 'boolean' ? options.transparentBackground : true,
    preserveTextEditability:
      typeof options.preserveTextEditability === 'boolean'
        ? options.preserveTextEditability
        : true,
    doNotModifyHtml:
      typeof options.doNotModifyHtml === 'boolean' ? options.doNotModifyHtml : true,
    doNotModifyCss:
      typeof options.doNotModifyCss === 'boolean' ? options.doNotModifyCss : true
  }
}

function getMutationOptions(options = {}) {
  return {
    ...options.mutationOptions,
    meta: {
      ...options.mutationOptions?.meta,
      source: PROVIDER_MUTATION_SOURCE
    }
  }
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

function getErrorMessage(error) {
  if (typeof error === 'string') return error
  if (error instanceof Error) return error.message
  return null
}

export function createHtmlArtboardAiProviderRequest(document, patch, options = {}) {
  const normalizedDocument = ensureHtmlArtboardDocument(document)
  const normalizedPatch = ensureFusionPatch(patch)
  const providerOptions = {
    ...getProviderOptions(options.providerOptions ?? options)
  }
  const thumbnailDocument = {
    ...normalizedDocument,
    width: normalizedDocument.width,
    height: normalizedDocument.height
  }

  return {
    kind: PROVIDER_REQUEST_KIND,
    version: PROVIDER_VERSION,
    document: normalizedDocument,
    patch: normalizedPatch,
    target: {
      selector: normalizedPatch.selector,
      sourceText: normalizedPatch.sourceText,
      region: normalizeRegion(normalizedPatch.region)
    },
    prompt:
      typeof options.prompt === 'string' && options.prompt
        ? options.prompt
        : normalizedPatch.prompt,
    preview: {
      thumbnailDataUrl:
        typeof options.thumbnailDataUrl === 'string' && options.thumbnailDataUrl
          ? options.thumbnailDataUrl
          : createHtmlArtboardThumbnailDataUrl(thumbnailDocument),
      renderFingerprint: normalizedDocument.renderFingerprint ?? createRenderFingerprint(normalizedDocument)
    },
    constraints: getConstraints(normalizedPatch, options.constraints ?? options),
    providerOptions
  }
}

export function validateHtmlArtboardAiProviderRequest(request) {
  const reasons = []

  if (!isRecord(request)) reasons.push('request must be an object')
  if (request?.kind !== PROVIDER_REQUEST_KIND) reasons.push('kind must be html-artboard-ai-provider-request')
  if (request?.version !== PROVIDER_VERSION) reasons.push('version must be 1')
  if (!isRecord(request?.document)) reasons.push('document is required')
  if (!isRecord(request?.patch)) reasons.push('patch is required')
  if (!isRecord(request?.target)) reasons.push('target is required')
  if (typeof request?.prompt !== 'string') reasons.push('prompt must be a string')
  if (!isRecord(request?.constraints)) reasons.push('constraints are required')
  if (request?.constraints?.preserveTextEditability !== true) {
    reasons.push('preserveTextEditability must be true')
  }
  if (request?.constraints?.doNotModifyHtml !== true) {
    reasons.push('doNotModifyHtml must be true')
  }
  if (request?.constraints?.doNotModifyCss !== true) {
    reasons.push('doNotModifyCss must be true')
  }
  if (!isRecord(request?.providerOptions)) reasons.push('providerOptions are required')

  return {
    ok: reasons.length === 0,
    reasons
  }
}

export function createHtmlArtboardAiProviderResult(result = {}) {
  const source = isRecord(result) ? result : {}
  const ok = source.ok === true

  return {
    kind: PROVIDER_RESULT_KIND,
    version: PROVIDER_VERSION,
    ok,
    provider:
      typeof source.provider === 'string' && source.provider ? source.provider : MOCK_PROVIDER_NAME,
    model:
      typeof source.model === 'string' && source.model ? source.model : MOCK_PROVIDER_MODEL,
    seed: source.seed ?? null,
    patchAssetId:
      typeof source.patchAssetId === 'string' && source.patchAssetId
        ? source.patchAssetId
        : null,
    patchAssetUrl:
      typeof source.patchAssetUrl === 'string' && source.patchAssetUrl
        ? source.patchAssetUrl
        : null,
    maskAssetId:
      typeof source.maskAssetId === 'string' && source.maskAssetId ? source.maskAssetId : null,
    width: Number.isFinite(source.width) ? source.width : null,
    height: Number.isFinite(source.height) ? source.height : null,
    mimeType:
      typeof source.mimeType === 'string' && source.mimeType
        ? source.mimeType
        : 'image/svg+xml',
    promptUsed:
      typeof source.promptUsed === 'string' && source.promptUsed ? source.promptUsed : '',
    cost: Number.isFinite(source.cost) ? source.cost : 0,
    durationMs: Number.isFinite(source.durationMs) ? source.durationMs : 0,
    warnings: Array.isArray(source.warnings) ? deepClone(source.warnings) : [],
    error: source.error ?? null,
    meta: isRecord(source.meta) ? deepClone(source.meta) : {}
  }
}

export function validateHtmlArtboardAiProviderResult(result) {
  const reasons = []

  if (!isRecord(result)) reasons.push('result must be an object')
  if (result?.kind !== PROVIDER_RESULT_KIND) reasons.push('kind must be html-artboard-ai-provider-result')
  if (result?.version !== PROVIDER_VERSION) reasons.push('version must be 1')
  if (typeof result?.ok !== 'boolean') reasons.push('ok must be boolean')
  if (typeof result?.provider !== 'string' || !result.provider) reasons.push('provider is required')
  if (typeof result?.model !== 'string' || !result.model) reasons.push('model is required')

  if (result?.ok === true) {
    if (typeof result.patchAssetId !== 'string' || !result.patchAssetId) {
      reasons.push('patchAssetId is required when ok is true')
    }
    if (typeof result.patchAssetUrl !== 'string' || !result.patchAssetUrl) {
      reasons.push('patchAssetUrl is required when ok is true')
    }
    if (typeof result.mimeType !== 'string' || !result.mimeType) {
      reasons.push('mimeType is required when ok is true')
    }
  }

  return {
    ok: reasons.length === 0,
    reasons
  }
}

export function createMockHtmlArtboardAiProvider(options = {}) {
  return {
    name: MOCK_PROVIDER_NAME,
    generateFusionPatchAsset(request) {
      const validatedRequest = validateHtmlArtboardAiProviderRequest(request)
      if (!validatedRequest.ok) {
        return createHtmlArtboardAiProviderResult({
          ok: false,
          provider: MOCK_PROVIDER_NAME,
          model: MOCK_PROVIDER_MODEL,
          error: validatedRequest.reasons.join('; ')
        })
      }

      const startedAt = Date.now()
      const asset = createMockFusionPatchAsset(request.patch, request.document, {
        seed: request.providerOptions?.seed ?? options.seed,
        patchAssetId: options.patchAssetId
      })
      const dimensions = getPatchDimensions(request.patch)

      return createHtmlArtboardAiProviderResult({
        ok: true,
        provider: MOCK_PROVIDER_NAME,
        model: options.model ?? request.providerOptions?.model ?? MOCK_PROVIDER_MODEL,
        seed: asset.seed,
        patchAssetId: asset.patchAssetId,
        patchAssetUrl: asset.patchAssetUrl,
        maskAssetId: null,
        width: dimensions.width,
        height: dimensions.height,
        mimeType: 'image/svg+xml',
        promptUsed: request.prompt,
        cost: 0,
        durationMs: Date.now() - startedAt,
        warnings: [],
        meta: {
          generatedAt: asset.generatedAt,
          deterministic: true
        }
      })
    }
  }
}

export function getDefaultHtmlArtboardAiProvider(options = {}) {
  return createMockHtmlArtboardAiProvider(options)
}

export function generateHtmlArtboardFusionPatchAssetWithProvider(document, patchId, options = {}) {
  const runtimeDocument = ensureHtmlArtboardDocument(document)
  const patchIndex = getPatchIndex(runtimeDocument, patchId)
  if (patchIndex === -1) {
    throw new Error(`FusionPatch not found: ${patchId}`)
  }

  const previousPatch = runtimeDocument.fusionPatches[patchIndex]
  const provider = isRecord(options.provider)
    ? options.provider
    : getDefaultHtmlArtboardAiProvider(options.providerOptions ?? options)
  const request = createHtmlArtboardAiProviderRequest(runtimeDocument, previousPatch, options)
  const rawResult =
    typeof provider.generateFusionPatchAsset === 'function'
      ? provider.generateFusionPatchAsset(request)
      : {
          ok: false,
          provider: provider.name ?? MOCK_PROVIDER_NAME,
          error: 'provider.generateFusionPatchAsset is not available'
        }
  const providerResult = createHtmlArtboardAiProviderResult(rawResult)
  const resultValidation = validateHtmlArtboardAiProviderResult(providerResult)
  const providerError =
    providerResult.ok === true && resultValidation.ok === false
      ? resultValidation.reasons.join('; ')
      : getErrorMessage(providerResult.error)
  const nextPatch = ensureFusionPatch({
    ...previousPatch,
    patchAssetId: providerResult.ok ? providerResult.patchAssetId : previousPatch.patchAssetId,
    patchAssetUrl: providerResult.ok ? providerResult.patchAssetUrl : previousPatch.patchAssetUrl,
    maskAssetId:
      providerResult.ok && providerResult.maskAssetId
        ? providerResult.maskAssetId
        : previousPatch.maskAssetId,
    provider: providerResult.provider,
    seed: providerResult.seed ?? previousPatch.seed,
    status:
      providerResult.ok && resultValidation.ok
        ? providerResult.provider === MOCK_PROVIDER_NAME
          ? 'mock-generated'
          : 'generated'
        : 'failed',
    updatedAt:
      typeof options.generatedAt === 'string' && options.generatedAt
        ? options.generatedAt
        : new Date().toISOString(),
    meta: {
      ...previousPatch.meta,
      providerResult: deepClone(providerResult),
      providerError
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
        'fusion_patch_provider_asset_generate',
        {
          patchId: nextPatch.id,
          provider: providerResult.provider,
          model: providerResult.model,
          ok: providerResult.ok && resultValidation.ok,
          patchAssetId: providerResult.ok ? providerResult.patchAssetId : null,
          previousPatch: deepClone(previousPatch),
          nextPatch: deepClone(nextPatch),
          error: providerError
        },
        getMutationOptions(options)
      )
    ])
  }

  return updateDocumentFingerprint(updatedDocument)
}
