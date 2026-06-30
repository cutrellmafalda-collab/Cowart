import { cloneHtmlArtboardDocument, ensureHtmlArtboardDocument } from './htmlCanvasDocument.js'

const HTML_ARTBOARD_SHAPE_VERSION = 1

function createShapeId(documentId) {
  return `shape:html-artboard-${documentId}`
}

export function isCowartHtmlArtboardShape(shape) {
  return shape?.meta?.cowartHtmlArtboard === true
}

export function htmlArtboardToCowartShape(document, options = {}) {
  const runtimeDocument = ensureHtmlArtboardDocument(document)

  return {
    id: options.shapeId ?? createShapeId(runtimeDocument.id),
    typeName: 'shape',
    type: 'frame',
    x: options.x ?? 0,
    y: options.y ?? 0,
    rotation: 0,
    isLocked: false,
    opacity: 1,
    parentId: options.parentId ?? null,
    index: options.index ?? null,
    props: {
      w: runtimeDocument.width,
      h: runtimeDocument.height,
      name: options.name ?? 'HTML Artboard',
      color: 'blue'
    },
    meta: {
      cowartHtmlArtboard: true,
      cowartHtmlArtboardVersion: HTML_ARTBOARD_SHAPE_VERSION,
      htmlArtboardId: runtimeDocument.id,
      runtimeDocument: cloneHtmlArtboardDocument(runtimeDocument)
    }
  }
}

export function cowartShapeToHtmlArtboard(shape) {
  if (!isCowartHtmlArtboardShape(shape)) {
    return null
  }

  const hasRuntimeDocument = Object.hasOwn(shape.meta, 'runtimeDocument')
  const document = hasRuntimeDocument ? shape.meta.runtimeDocument : shape.props?.document

  if (!document) {
    return null
  }

  return ensureHtmlArtboardDocument(document)
}
