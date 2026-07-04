import { ensureHtmlArtboardDocument } from './htmlCanvasDocument.js'
import {
  appendHtmlArtboardMutations,
  createHtmlArtboardMutation
} from './htmlArtboardMutations.js'
import { extractHtmlArtboardPatchTargets } from './htmlArtboardPatchTargets.js'
import { withRenderFingerprint } from './renderFingerprint.js'

const DEFAULT_LAYER_SOURCE = 'html-artboard-text-layer-panel'
const CONTAINER_TEXT_TARGET_TAGS = new Set([
  'article',
  'aside',
  'div',
  'footer',
  'header',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'main',
  'nav',
  'section'
])

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function deepClone(value) {
  if (Array.isArray(value)) return value.map((item) => deepClone(item))

  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, deepClone(item)]))
  }

  return value
}

function normalizeNumber(value, fallback) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function normalizePositiveNumber(value, fallback) {
  const number = normalizeNumber(value, fallback)
  return number > 0 ? number : fallback
}

function createTextLayerId(target, index) {
  const dataNode = typeof target?.dataNode === 'string' && target.dataNode.trim()
    ? target.dataNode.trim()
    : `text-${index + 1}`
  return `text-layer:${dataNode.replace(/[^\w:-]+/g, '-')}`
}

function getDefaultTextLayerPlacement(target, index, document) {
  const width = Number(document.width) || 720
  const height = Number(document.height) || 1280
  const role = target.dataNode ?? target.tagName ?? 'text'
  const left = Math.round(width * 0.105)
  const contentWidth = Math.round(width * 0.79)
  const placements = {
    eyebrow: {
      x: left,
      y: Math.round(height * 0.18),
      w: Math.round(width * 0.42),
      fontSize: 24,
      scale: 0.9,
      color: 'black',
      font: 'sans',
      align: 'start'
    },
    headline: {
      x: left,
      y: Math.round(height * 0.305),
      w: contentWidth,
      fontSize: 88,
      scale: 2.05,
      color: 'black',
      font: 'sans',
      align: 'start'
    },
    'headline-line-1': {
      x: left,
      y: Math.round(height * 0.305),
      w: contentWidth,
      fontSize: 88,
      scale: 2.05,
      color: 'black',
      font: 'sans',
      align: 'start'
    },
    'headline-line-2': {
      x: left,
      y: Math.round(height * 0.405),
      w: Math.round(width * 0.58),
      fontSize: 88,
      scale: 2.05,
      color: 'black',
      font: 'sans',
      align: 'start'
    },
    subhead: {
      x: left,
      y: Math.round(height * 0.61),
      w: Math.round(width * 0.72),
      fontSize: 28,
      scale: 0.92,
      color: 'black',
      font: 'sans',
      align: 'start'
    },
    detail: {
      x: left,
      y: Math.round(height * 0.69),
      w: Math.round(width * 0.68),
      fontSize: 20,
      scale: 0.58,
      color: 'black',
      font: 'sans',
      align: 'start'
    },
    cta: {
      x: left,
      y: Math.round(height * 0.82),
      w: Math.round(width * 0.32),
      fontSize: 26,
      scale: 0.92,
      color: 'black',
      font: 'sans',
      align: 'start'
    }
  }

  if (placements[role]) return placements[role]

  const isHeadline = ['h1', 'h2'].includes(target.tagName)
  const isAction = ['button', 'a'].includes(target.tagName)
  const fontSize = isHeadline ? 88 : isAction ? 28 : 34
  return {
    x: left,
    y: Math.round(height * 0.42) + index * Math.max(82, Math.round(height * 0.075)),
    w: contentWidth,
    fontSize,
    scale: isHeadline ? 1.08 : isAction ? 0.65 : 0.72,
    color: 'black',
    font: 'sans',
    align: 'start'
  }
}

function escapeHtmlText(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function replaceDataNodeText(html, dataNode, nextText) {
  if (typeof html !== 'string' || typeof dataNode !== 'string' || !dataNode.trim()) return html

  const escapedDataNode = escapeRegExp(dataNode.trim())
  const pattern = new RegExp(
    `(<([a-zA-Z][\\w:-]*)(?=[^>]*\\sdata-node\\s*=\\s*["']${escapedDataNode}["'])[^>]*>)([\\s\\S]*?)(<\\/\\2\\s*>)`,
    'i'
  )

  return html.replace(pattern, (match, openTag, _tagName, content, closeTag) => {
    if (/\sdata-node\s*=/i.test(content)) return match

    return `${openTag}${escapeHtmlText(nextText)}${closeTag}`
  })
}

export function normalizeHtmlArtboardTextLayer(layer = {}) {
  const id = typeof layer.id === 'string' && layer.id ? layer.id : `text-layer:${Date.now()}`
  const text = typeof layer.text === 'string' ? layer.text : ''
  const dataNode = typeof layer.dataNode === 'string' && layer.dataNode ? layer.dataNode : null
  const selector = typeof layer.selector === 'string' && layer.selector ? layer.selector : null

  return {
    id,
    type: 'text',
    dataNode,
    selector,
    sourceText: typeof layer.sourceText === 'string' ? layer.sourceText : text,
    text,
    x: normalizeNumber(layer.x, 0),
    y: normalizeNumber(layer.y, 0),
    w: normalizePositiveNumber(layer.w, 240),
    h: normalizePositiveNumber(layer.h, 48),
    fontSize: normalizePositiveNumber(layer.fontSize, 32),
    scale: normalizePositiveNumber(layer.scale, 1),
    color: typeof layer.color === 'string' && layer.color ? layer.color : 'black',
    font: typeof layer.font === 'string' && layer.font ? layer.font : 'sans',
    align: typeof layer.align === 'string' && layer.align ? layer.align : 'start',
    visible: layer.visible !== false,
    meta: isRecord(layer.meta) ? deepClone(layer.meta) : {}
  }
}

export function normalizeHtmlArtboardTextLayers(layers) {
  return Array.isArray(layers) ? layers.map((layer) => normalizeHtmlArtboardTextLayer(layer)) : []
}

export function createHtmlArtboardTextLayersFromDocument(document, options = {}) {
  const runtimeDocument = ensureHtmlArtboardDocument(document)
  const existingLayers = normalizeHtmlArtboardTextLayers(runtimeDocument.textLayers)
  if (existingLayers.length > 0 && options.recreate !== true) return existingLayers

  const targets = extractHtmlArtboardPatchTargets(runtimeDocument).filter((target) => target.sourceText)
  const leafTargets = targets.filter((target) => {
    const isContainerTarget = CONTAINER_TEXT_TARGET_TAGS.has(String(target.tagName ?? '').toLowerCase())
    if (!isContainerTarget) return true

    return !targets.some((otherTarget) => {
      return (
        otherTarget !== target &&
        target.sourceText.includes(otherTarget.sourceText) &&
        target.sourceText.length > otherTarget.sourceText.length
      )
    })
  })
  const fallbackText = runtimeDocument.html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const sourceTargets = leafTargets.length > 0
    ? leafTargets
    : fallbackText
      ? [{ dataNode: 'text', selector: null, sourceText: fallbackText, tagName: 'p' }]
      : []

  return sourceTargets.map((target, index) => {
    const placement = getDefaultTextLayerPlacement(target, index, runtimeDocument)
    return normalizeHtmlArtboardTextLayer({
      id: createTextLayerId(target, index),
      dataNode: target.dataNode ?? null,
      selector: target.selector ?? null,
      sourceText: target.sourceText ?? '',
      text: target.sourceText ?? '',
      x: placement.x,
      y: placement.y,
      w: placement.w,
      h: Math.round(placement.fontSize * (placement.scale > 1 ? 1.2 : 1.55)),
      fontSize: placement.fontSize,
      scale: placement.scale,
      color: placement.color,
      font: placement.font,
      align: placement.align
    })
  })
}

export function applyHtmlArtboardTextLayersToHtml(html, textLayers) {
  return normalizeHtmlArtboardTextLayers(textLayers).reduce((nextHtml, layer) => {
    return layer.dataNode ? replaceDataNodeText(nextHtml, layer.dataNode, layer.text) : nextHtml
  }, typeof html === 'string' ? html : '')
}

export function updateHtmlArtboardTextLayers(document, textLayers, options = {}) {
  const beforeDocument = ensureHtmlArtboardDocument(document)
  const nextTextLayers = normalizeHtmlArtboardTextLayers(textLayers)
  const nextHtml = options.updateHtml === false
    ? beforeDocument.html
    : applyHtmlArtboardTextLayersToHtml(beforeDocument.html, nextTextLayers)
  const withLayers = withRenderFingerprint({
    ...beforeDocument,
    html: nextHtml,
    textLayers: nextTextLayers
  })

  if (options.recordMutationLog === false) return withLayers

  const mutation = createHtmlArtboardMutation(
    'text_layer_sync',
    {
      previousTextLayers: beforeDocument.textLayers,
      nextTextLayers,
      previousHtml: beforeDocument.html,
      nextHtml
    },
    {
      meta: {
        source: DEFAULT_LAYER_SOURCE
      }
    }
  )

  return withRenderFingerprint(appendHtmlArtboardMutations(withLayers, [mutation]))
}
