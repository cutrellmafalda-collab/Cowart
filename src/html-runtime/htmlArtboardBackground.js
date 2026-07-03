import {
  appendHtmlArtboardMutations,
  createHtmlArtboardMutation
} from './htmlArtboardMutations.js'
import { ensureHtmlArtboardDocument } from './htmlCanvasDocument.js'
import { createRenderFingerprint } from './renderFingerprint.js'

export const HTML_ARTBOARD_BACKGROUND_ATTACH_MUTATION_TYPE = 'background_asset_attach'
const BACKGROUND_ATTACH_SOURCE = 'mcp-html-artboard-background-image-attach'

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

function createExternalImageMetadata(asset = {}) {
  return {
    fileName: asset.fileName ?? null,
    relativePath: asset.relativePath ?? null,
    mimeType: asset.mimeType ?? null,
    fileSize: Number.isFinite(asset.fileSize) ? asset.fileSize : null
  }
}

function normalizeFit(value) {
  return ['cover', 'contain', 'fill'].includes(value) ? value : 'cover'
}

function normalizePosition(value) {
  return typeof value === 'string' && value ? value : 'center'
}

function createBackgroundAsset(asset = {}, request = {}, previousBackground = {}) {
  const provider =
    typeof request.provider === 'string' && request.provider
      ? request.provider
      : 'external-image-gen'
  const externalImage = createExternalImageMetadata(asset)

  return {
    type: 'image',
    identity: asset.backgroundAssetId,
    backgroundAssetId: asset.backgroundAssetId,
    backgroundAssetUrl: asset.backgroundAssetUrl,
    provider,
    status: 'generated',
    fit: normalizeFit(request.fit ?? previousBackground.fit),
    position: normalizePosition(request.position ?? previousBackground.position),
    prompt:
      typeof request.prompt === 'string' && request.prompt
        ? request.prompt
        : typeof previousBackground.prompt === 'string'
          ? previousBackground.prompt
          : '',
    mimeType: asset.mimeType ?? null,
    fileName: asset.fileName ?? null,
    relativePath: asset.relativePath ?? null,
    fileSize: Number.isFinite(asset.fileSize) ? asset.fileSize : null,
    updatedAt: new Date().toISOString(),
    meta: {
      ...(isRecord(previousBackground.meta) ? deepClone(previousBackground.meta) : {}),
      externalImage,
      sourceImageFile: externalImage,
      generationRequest: isRecord(request.generationRequest)
        ? deepClone(request.generationRequest)
        : null
    }
  }
}

function withUpdatedFingerprint(document) {
  return {
    ...document,
    renderFingerprint: createRenderFingerprint(document)
  }
}

export function attachExternalBackgroundImageToHtmlArtboard(document, asset = {}, request = {}, options = {}) {
  const runtimeDocument = ensureHtmlArtboardDocument(document)
  const previousBackground = isRecord(runtimeDocument.background) ? runtimeDocument.background : {}

  if (typeof asset.backgroundAssetId !== 'string' || !asset.backgroundAssetId) {
    return runtimeDocument
  }

  if (typeof asset.backgroundAssetUrl !== 'string' || !asset.backgroundAssetUrl) {
    return runtimeDocument
  }

  const nextBackground = createBackgroundAsset(asset, request, previousBackground)
  let nextDocument = {
    ...runtimeDocument,
    background: nextBackground
  }

  if (options.recordMutationLog !== false) {
    const mutation = createHtmlArtboardMutation(
      HTML_ARTBOARD_BACKGROUND_ATTACH_MUTATION_TYPE,
      {
        provider: nextBackground.provider,
        backgroundAssetId: nextBackground.backgroundAssetId,
        backgroundAssetUrl: nextBackground.backgroundAssetUrl,
        previousBackground: deepClone(previousBackground),
        nextBackground: deepClone(nextBackground),
        generationRequest: isRecord(request.generationRequest)
          ? deepClone(request.generationRequest)
          : null
      },
      {
        meta: {
          source: BACKGROUND_ATTACH_SOURCE
        }
      }
    )

    nextDocument = appendHtmlArtboardMutations(nextDocument, [mutation])
  }

  return withUpdatedFingerprint(nextDocument)
}

export function getHtmlArtboardBackgroundAssetUrl(document) {
  const runtimeDocument = ensureHtmlArtboardDocument(document)
  const background = runtimeDocument.background

  if (!isRecord(background)) return null

  return (
    [background.backgroundAssetUrl, background.assetUrl, background.url, background.src].find(
      (value) => typeof value === 'string' && value.length > 0
    ) ?? null
  )
}
