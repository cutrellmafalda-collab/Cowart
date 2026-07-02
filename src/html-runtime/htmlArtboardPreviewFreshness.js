import { ensureHtmlArtboardDocument } from './htmlCanvasDocument.js'
import { createRenderFingerprint } from './renderFingerprint.js'

const PREVIEW_GENERATOR = 'html-artboard-thumbnail'

function previewFingerprint(document) {
  return typeof document.renderFingerprint === 'string' && document.renderFingerprint
    ? document.renderFingerprint
    : createRenderFingerprint(document)
}

function countItems(value) {
  return Array.isArray(value) ? value.length : 0
}

export function createHtmlArtboardPreviewMeta(document, options = {}) {
  const normalizedDocument = ensureHtmlArtboardDocument(document)

  return {
    cowartHtmlArtboardPreview: true,
    sourceHtmlArtboardShapeId:
      typeof options.sourceHtmlArtboardShapeId === 'string'
        ? options.sourceHtmlArtboardShapeId
        : null,
    sourceDocumentId: normalizedDocument.id,
    sourceRenderFingerprint: previewFingerprint(normalizedDocument),
    sourceMutationCount: countItems(normalizedDocument.mutationLog),
    sourceFusionPatchCount: countItems(normalizedDocument.fusionPatches),
    generatedAt: new Date().toISOString(),
    generator: typeof options.generator === 'string' && options.generator ? options.generator : PREVIEW_GENERATOR
  }
}

export function getHtmlArtboardPreviewMeta(previewShape) {
  return previewShape?.meta?.cowartHtmlArtboardPreview === true ? previewShape.meta : null
}

export function isHtmlArtboardPreviewShapeForArtboard(previewShape, artboardShapeId) {
  const meta = getHtmlArtboardPreviewMeta(previewShape)

  return (
    meta !== null &&
    typeof artboardShapeId === 'string' &&
    meta.sourceHtmlArtboardShapeId === artboardShapeId
  )
}

export function compareHtmlArtboardPreviewFreshness(document, previewShape) {
  const expectedMeta = createHtmlArtboardPreviewMeta(document)
  const expected = {
    sourceDocumentId: expectedMeta.sourceDocumentId,
    sourceRenderFingerprint: expectedMeta.sourceRenderFingerprint,
    sourceMutationCount: expectedMeta.sourceMutationCount,
    sourceFusionPatchCount: expectedMeta.sourceFusionPatchCount
  }
  const previewMeta = getHtmlArtboardPreviewMeta(previewShape)

  if (!previewMeta) {
    return {
      status: 'missing',
      isMissing: true,
      isCurrent: false,
      isStale: false,
      expected,
      actual: null,
      reasons: ['preview image is missing']
    }
  }

  const actual = {
    sourceDocumentId: previewMeta.sourceDocumentId ?? null,
    sourceRenderFingerprint: previewMeta.sourceRenderFingerprint ?? null,
    sourceMutationCount: Number.isFinite(previewMeta.sourceMutationCount)
      ? previewMeta.sourceMutationCount
      : null,
    sourceFusionPatchCount: Number.isFinite(previewMeta.sourceFusionPatchCount)
      ? previewMeta.sourceFusionPatchCount
      : null
  }
  const reasons = []

  if (actual.sourceDocumentId !== expected.sourceDocumentId) {
    reasons.push('document id changed')
  }

  if (actual.sourceRenderFingerprint !== expected.sourceRenderFingerprint) {
    reasons.push('render fingerprint changed')
  }

  if (actual.sourceMutationCount !== expected.sourceMutationCount) {
    reasons.push('mutation count changed')
  }

  if (actual.sourceFusionPatchCount !== expected.sourceFusionPatchCount) {
    reasons.push('fusion patch count changed')
  }

  const isStale = reasons.length > 0

  return {
    status: isStale ? 'stale' : 'current',
    isMissing: false,
    isCurrent: !isStale,
    isStale,
    expected,
    actual,
    reasons
  }
}

export function summarizeHtmlArtboardPreviewFreshness(result) {
  if (result?.status === 'current') {
    return 'Preview up to date'
  }

  if (result?.status === 'stale') {
    return `Preview stale: ${(result.reasons ?? []).join(', ') || 'source document changed'}`
  }

  return 'Missing preview'
}
