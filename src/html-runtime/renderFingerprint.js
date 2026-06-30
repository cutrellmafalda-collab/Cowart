import { cloneHtmlArtboardDocument } from './htmlCanvasDocument.js'

function stableValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => stableValue(item))
  }

  if (value !== null && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((result, key) => {
        if (key !== 'renderFingerprint' && value[key] !== undefined) {
          result[key] = stableValue(value[key])
        }
        return result
      }, {})
  }

  return value
}

function stableStringify(value) {
  return JSON.stringify(stableValue(value))
}

function getBackgroundIdentity(background) {
  if (background === null || typeof background !== 'object') {
    return null
  }

  return background.identity ?? background.id ?? background.type ?? null
}

function hashString(value) {
  let hash = 0x811c9dc5

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }

  return hash.toString(16).padStart(8, '0')
}

export function createRenderFingerprint(document) {
  const source = {
    schema: 'cowart-html-artboard-render-source-v1',
    type: document?.type ?? null,
    version: document?.version ?? null,
    width: document?.width ?? null,
    height: document?.height ?? null,
    backgroundIdentity: getBackgroundIdentity(document?.background),
    background: document?.background ?? null,
    html: document?.html ?? '',
    css: document?.css ?? '',
    fusionPatches: document?.fusionPatches ?? [],
    assets: document?.assets ?? []
  }
  const serialized = stableStringify(source)

  return `cowart-source-v1:${hashString(serialized)}:${serialized.length}`
}

export function withRenderFingerprint(document) {
  const nextDocument = cloneHtmlArtboardDocument(document)
  nextDocument.renderFingerprint = createRenderFingerprint(nextDocument)
  return nextDocument
}

export function validateRenderFingerprint(document) {
  const expected = createRenderFingerprint(document)
  const actual = typeof document?.renderFingerprint === 'string' ? document.renderFingerprint : null
  const status = actual === expected ? 'match' : 'mismatch'

  return {
    status,
    matches: status === 'match',
    actual,
    expected
  }
}
