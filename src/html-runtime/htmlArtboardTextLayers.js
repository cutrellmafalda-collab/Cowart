import { ensureHtmlArtboardDocument } from './htmlCanvasDocument.js'
import {
  appendHtmlArtboardMutations,
  createHtmlArtboardMutation
} from './htmlArtboardMutations.js'
import { extractHtmlArtboardPatchTargets } from './htmlArtboardPatchTargets.js'
import { withRenderFingerprint } from './renderFingerprint.js'

const DEFAULT_LAYER_SOURCE = 'html-artboard-text-layer-panel'

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

  const marginX = Math.round(runtimeDocument.width * 0.1)
  const usableWidth = Math.round(runtimeDocument.width * 0.8)
  const startY = Math.round(runtimeDocument.height * 0.42)
  const gap = Math.max(96, Math.round(runtimeDocument.height * 0.092))

  return sourceTargets.map((target, index) => {
    const isHeadline = ['h1', 'h2'].includes(target.tagName)
    const isEyebrow = target.dataNode === 'eyebrow'
    const isAction = ['button', 'a'].includes(target.tagName) || target.dataNode === 'cta'
    const fontSize = isHeadline ? 88 : isEyebrow || isAction ? 28 : 34
    const scale = isHeadline ? 0.98 : isEyebrow || isAction ? 0.55 : 0.62
    return normalizeHtmlArtboardTextLayer({
      id: createTextLayerId(target, index),
      dataNode: target.dataNode ?? null,
      selector: target.selector ?? null,
      sourceText: target.sourceText ?? '',
      text: target.sourceText ?? '',
      x: marginX,
      y: startY + index * gap,
      w: usableWidth,
      h: Math.round(fontSize * (isHeadline ? 1.15 : 1.5)),
      fontSize,
      scale,
      color: 'black',
      align: 'center'
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
