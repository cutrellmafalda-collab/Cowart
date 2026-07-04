import {
  ArrowDownToolbarItem,
  ArrowLeftToolbarItem,
  ArrowRightToolbarItem,
  ArrowToolbarItem,
  ArrowUpToolbarItem,
  AssetToolbarItem,
  CheckBoxToolbarItem,
  CloudToolbarItem,
  DefaultToolbar,
  DefaultColorStyle,
  DefaultStylePanel,
  DefaultStylePanelContent,
  DiamondToolbarItem,
  DrawToolbarItem,
  EllipseToolbarItem,
  EraserToolbarItem,
  FrameToolbarItem,
  FrameShapeUtil,
  HandToolbarItem,
  HeartToolbarItem,
  HexagonToolbarItem,
  HighlightToolbarItem,
  LaserToolbarItem,
  LineToolbarItem,
  NoteToolbarItem,
  OvalToolbarItem,
  RectangleToolbarItem,
  RhombusToolbarItem,
  SelectToolbarItem,
  StateNode,
  StarToolbarItem,
  TextToolbarItem,
  Tldraw,
  TldrawUiMenuToolItem,
  TriangleToolbarItem,
  XBoxToolbarItem,
  createShapeId,
  onDragFromToolbarToCreateShape,
  renderPlaintextFromRichText,
  startEditingShapeWithRichText,
  toRichText,
  useEditor,
  useValue
} from 'tldraw'
import { AllSelection } from '@tiptap/pm/state'
import 'tldraw/tldraw.css'
import { useCallback, useEffect, useMemo, useState } from 'react'
import annotationToolIconRaw from './assets/tool-comment.svg?raw'
import {
  describeSkippedRecord,
  isCanvasSnapshot,
  sanitizeCanvasSnapshotForTldraw
} from './canvasSnapshot.js'
import { createHtmlArtboardDocument } from './html-runtime/htmlCanvasDocument.js'
import { attachExternalBackgroundImageToHtmlArtboard } from './html-runtime/htmlArtboardBackground.js'
import {
  attachExternalFusionPatchImageToHtmlArtboard,
  deleteFusionPatchFromHtmlArtboard,
  setFusionPatchVisibilityInHtmlArtboard,
  updateFusionPatchInHtmlArtboard
} from './html-runtime/htmlArtboardFusionPatchEditing.js'
import { addFusionPatchPlaceholderToHtmlArtboard } from './html-runtime/htmlArtboardFusionPatches.js'
import { generateMockFusionPatchAssetForHtmlArtboard } from './html-runtime/htmlArtboardMockFusionPatchAsset.js'
import { extractHtmlArtboardPatchTargets } from './html-runtime/htmlArtboardPatchTargets.js'
import {
  cowartShapeToHtmlArtboard,
  htmlArtboardToCowartShape
} from './html-runtime/cowartHtmlBridge.js'
import { updateHtmlArtboardSource } from './html-runtime/htmlArtboardEditing.js'
import { createHtmlArtboardPreviewSrcDoc } from './html-runtime/htmlArtboardPreview.js'
import {
  createHtmlArtboardExportBundle,
  createHtmlArtboardExportFileName
} from './html-runtime/htmlArtboardExport.js'
import { createHtmlArtboardSourceSnapshot } from './html-runtime/htmlArtboardSource.js'
import { createHtmlArtboardThumbnailAltText } from './html-runtime/htmlArtboardThumbnail.js'
import {
  compareHtmlArtboardPreviewFreshness,
  createHtmlArtboardPreviewMeta,
  getHtmlArtboardPreviewMeta,
  isHtmlArtboardPreviewShapeForArtboard
} from './html-runtime/htmlArtboardPreviewFreshness.js'
import {
  createHtmlArtboardTextLayersFromDocument,
  updateHtmlArtboardTextLayers
} from './html-runtime/htmlArtboardTextLayers.js'

const CANVAS_ENDPOINT = '/api/canvas'
const CANVAS_EVENTS_ENDPOINT = '/api/canvas-events'
const SELECTION_ENDPOINT = '/api/selection'
const VIEW_STATE_ENDPOINT = '/api/view-state'
const PAGE_ASSET_ENDPOINT = '/api/page-asset'
const SELECTION_STATE_ELEMENT_ID = 'cowart-selection-state'
const AI_IMAGE_TOOL_ID = 'ai-image'
const HTML_ARTBOARD_TOOL_ID = 'html-artboard'
const HTML_ARTBOARD_TOOL_LABEL = 'HTML 活海报'
const HTML_ARTBOARD_PREVIEW_VERSION = 1
const HTML_TEXT_LAYER_COLOR_OPTIONS = [
  { value: 'black', label: '黑色' },
  { value: 'grey', label: '灰色' },
  { value: 'blue', label: '蓝色' },
  { value: 'light-blue', label: '浅蓝' },
  { value: 'green', label: '绿色' },
  { value: 'orange', label: '橙色' },
  { value: 'red', label: '红色' }
]
const HTML_TEXT_LAYER_FONT_OPTIONS = [
  { value: 'sans', label: '黑体' },
  { value: 'serif', label: '宋体' },
  { value: 'mono', label: '等宽' },
  { value: 'draw', label: '手写' }
]
const AI_IMAGE_HOLDER_LABEL = 'AI 图片'
const AI_IMAGE_HOLDER_DEFAULT_W = 512
const AI_IMAGE_HOLDER_DEFAULT_H = 683
const AI_IMAGE_SIZE_MIN = 16
const AI_IMAGE_SIZE_MAX = 8192
const AI_IMAGE_ASPECT_PRESETS = [
  { id: '1-1', label: '1:1', w: 512, h: 512 },
  { id: '3-2', label: '3:2', w: 768, h: 512 },
  { id: '2-3', label: '2:3', w: 512, h: 768 },
  { id: '4-3', label: '4:3', w: 683, h: 512 },
  { id: '3-4', label: '3:4', w: 512, h: 683 },
  { id: '16-9', label: '16:9', w: 1024, h: 576 },
  { id: '9-16', label: '9:16', w: 512, h: 910 }
]
const ANNOTATION_TOOL_ID = 'cowart-annotation'
const ANNOTATION_TOOL_LABEL = '标注'
const ANNOTATION_DEFAULT_COLOR = 'red'
const ANNOTATION_MIN_LENGTH = 8
const ANNOTATION_BEND_RATIO = 0.12
const ANNOTATION_MIN_BEND = 16
const ANNOTATION_MAX_BEND = 48
const ANNOTATION_LABEL_POSITION = 0
const ANNOTATION_SELECT_TEXT_MAX_ATTEMPTS = 8
const ANNOTATION_SELECT_TEXT_SETTLE_ATTEMPTS = 4
const annotationToolIconSvg = annotationToolIconRaw.replaceAll('black', 'currentColor')
const annotationToolIcon = (
  <div
    className="cowart-annotation-tool-icon"
    dangerouslySetInnerHTML={{ __html: annotationToolIconSvg }}
  />
)

function recordsAreEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function storeChangedSinceSnapshot(editor, baselineStore) {
  const currentStore = editor.store.getStoreSnapshot().store
  const baselineIds = new Set(Object.keys(baselineStore))

  for (const [id, baselineRecord] of Object.entries(baselineStore)) {
    const currentRecord = currentStore[id]
    if (!currentRecord) return true
    if (!recordsAreEqual(currentRecord, baselineRecord)) return true
  }

  for (const id of Object.keys(currentStore)) {
    if (!baselineIds.has(id)) return true
  }

  return false
}

function applyRemoteCanvasSnapshot(editor, snapshot, { preserveLocalChanges = false } = {}) {
  if (!isCanvasSnapshot(snapshot)) return { changedRecords: 0, skippedRecords: [] }

  const sanitized = sanitizeCanvasSnapshotForTldraw(snapshot)
  if (!sanitized.snapshot) return { changedRecords: 0, skippedRecords: sanitized.skippedRecords }

  const recordsToPut = Object.values(sanitized.snapshot.store).filter((record) => {
    const localRecord = editor.store.get(record.id)
    if (!localRecord) return true
    if (preserveLocalChanges) return false
    return !recordsAreEqual(localRecord, record)
  })

  if (recordsToPut.length === 0) {
    return { changedRecords: 0, skippedRecords: sanitized.skippedRecords }
  }

  let changedRecords = 0
  editor.store.mergeRemoteChanges(() => {
    for (const record of recordsToPut) {
      try {
        editor.store.put([record])
        changedRecords += 1
      } catch (error) {
        sanitized.skippedRecords.push(describeSkippedRecord(record, error))
      }
    }
  })

  return { changedRecords, skippedRecords: sanitized.skippedRecords }
}

function getAiImageHolderMeta() {
  return {
    cowartAiImageHolder: true,
    cowartAiImageHolderVersion: 1
  }
}

function isAiImageHolderShape(shape) {
  return shape?.type === 'frame' && shape.meta?.cowartAiImageHolder === true
}

function isAiImageAspectLocked(shape) {
  return isAiImageHolderShape(shape) && shape.meta?.cowartAiAspectLocked === true
}

function clampAiImageSize(value) {
  if (!Number.isFinite(value)) return null
  return Math.round(Math.min(Math.max(value, AI_IMAGE_SIZE_MIN), AI_IMAGE_SIZE_MAX))
}

function getAiImageAspectRatio(shape) {
  const metaRatio = Number(shape?.meta?.cowartAiAspectRatio)
  if (Number.isFinite(metaRatio) && metaRatio > 0) return metaRatio

  const w = Number(shape?.props?.w)
  const h = Number(shape?.props?.h)
  if (!Number.isFinite(w) || !Number.isFinite(h) || h === 0) return null

  return w / h
}

function getAiImageAspectPreset(shape) {
  if (!shape?.props) return null

  const w = Number(shape.props.w)
  const h = Number(shape.props.h)
  if (!Number.isFinite(w) || !Number.isFinite(h) || h === 0) return null

  const shapeRatio = w / h
  return (
    AI_IMAGE_ASPECT_PRESETS.find((preset) => {
      const presetRatio = preset.w / preset.h
      return Math.abs(shapeRatio - presetRatio) < 0.01
    }) ?? null
  )
}

function formatAiImageSize(value) {
  return String(Math.round(Number.isFinite(value) ? value : 0))
}

function getAspectIconStyle(preset) {
  const maxSize = 22
  const scale = Math.min(maxSize / preset.w, maxSize / preset.h)
  return {
    width: `${Math.max(8, Math.round(preset.w * scale))}px`,
    height: `${Math.max(8, Math.round(preset.h * scale))}px`
  }
}

function createAiImageHolderShape(editor, id, shapeOverrides = {}) {
  const scale = editor.getResizeScaleFactor()
  const { meta, props, ...shapeRecordOverrides } = shapeOverrides
  const { scale: _scale, ...frameProps } = props ?? {}

  return editor.createShape({
    ...shapeRecordOverrides,
    id,
    type: 'frame',
    meta: {
      ...getAiImageHolderMeta(),
      ...meta
    },
    props: {
      w: AI_IMAGE_HOLDER_DEFAULT_W * scale,
      h: AI_IMAGE_HOLDER_DEFAULT_H * scale,
      name: AI_IMAGE_HOLDER_LABEL,
      color: 'blue',
      ...frameProps
    }
  })
}

function createAiImageHolderAtViewportCenter(editor) {
  const scale = editor.getResizeScaleFactor()
  const w = AI_IMAGE_HOLDER_DEFAULT_W * scale
  const h = AI_IMAGE_HOLDER_DEFAULT_H * scale
  const center = editor.getViewportPageBounds().center
  const id = createShapeId()

  createAiImageHolderShape(editor, id, {
    x: center.x - w / 2,
    y: center.y - h / 2,
    props: { w, h }
  })
  editor.select(id)
  editor.setCurrentTool('select.idle')
}

function doBoundsOverlap(left, right, padding = 48) {
  if (!left || !right) return false

  return !(
    left.x + left.w + padding <= right.x ||
    right.x + right.w + padding <= left.x ||
    left.y + left.h + padding <= right.y ||
    right.y + right.h + padding <= left.y
  )
}

function findAvailableHtmlArtboardPosition(editor, width, height) {
  const center = editor.getViewportPageBounds().center
  const base = {
    x: center.x - width / 2,
    y: center.y - height / 2
  }
  const existingBounds = editor
    .getCurrentPageShapes()
    .map((shape) => editor.getShapePageBounds(shape))
    .filter(Boolean)
  const stepX = width + 160
  const stepY = height + 160
  const offsets = [
    [0, 0],
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1],
    [2, 0],
    [-2, 0],
    [0, 2],
    [0, -2]
  ]

  for (const [offsetX, offsetY] of offsets) {
    const candidate = {
      x: base.x + offsetX * stepX,
      y: base.y + offsetY * stepY,
      w: width,
      h: height
    }

    if (!existingBounds.some((bounds) => doBoundsOverlap(candidate, bounds))) {
      return { x: candidate.x, y: candidate.y }
    }
  }

  return base
}

function createHtmlArtboardAtViewportCenter(editor) {
  const initialDocument = createHtmlArtboardDocument()
  const textLayers = createHtmlArtboardTextLayersFromDocument(initialDocument, {
    recreate: true
  })
  const document = updateHtmlArtboardTextLayers(initialDocument, textLayers)
  const shapeId = createShapeId()
  const { x, y } = findAvailableHtmlArtboardPosition(editor, document.width, document.height)
  const bridgeShape = htmlArtboardToCowartShape(document, {
    shapeId,
    x,
    y,
    name: HTML_ARTBOARD_TOOL_LABEL
  })

  editor.createShape({
    id: shapeId,
    type: 'frame',
    x: bridgeShape.x,
    y: bridgeShape.y,
    parentId: editor.getCurrentPageId(),
    props: bridgeShape.props,
    meta: bridgeShape.meta
  })
  const createdShape = editor.getShape(shapeId)
  if (createdShape) {
    upsertHtmlArtboardTextLayerShapes(editor, createdShape, textLayers)
    refreshHtmlArtboardCanvasPreview(editor, createdShape, document).catch((error) => {
      console.error(error)
    })
  }
  editor.select(shapeId)
  editor.zoomToSelection({ animation: { duration: 220 } })
  editor.setCurrentTool('select.idle')
}

function sanitizeTldrawIdPart(value) {
  const sanitized = String(value ?? '')
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')

  return sanitized || 'html-artboard'
}

function getHtmlArtboardPreviewSize(runtimeDocument, shape) {
  const shapeWidth = Number(shape?.props?.w)
  const shapeHeight = Number(shape?.props?.h)

  return {
    w: Number.isFinite(shapeWidth) && shapeWidth > 0 ? shapeWidth : runtimeDocument.width,
    h: Number.isFinite(shapeHeight) && shapeHeight > 0 ? shapeHeight : runtimeDocument.height
  }
}

function createHtmlArtboardPreviewAssetId(shapeId) {
  return `asset:html-artboard-preview-${sanitizeTldrawIdPart(shapeId)}`
}

function findHtmlArtboardPreviewShape(editor, sourceShapeId) {
  const matchingPreviewShapes = editor
    .getCurrentPageShapes()
    .filter((shape) => shape?.type === 'image' && isHtmlArtboardPreviewShapeForArtboard(shape, sourceShapeId))

  if (matchingPreviewShapes.length === 0) return null

  return matchingPreviewShapes.sort((left, right) => {
    const leftTime = Date.parse(getHtmlArtboardPreviewMeta(left)?.generatedAt ?? '')
    const rightTime = Date.parse(getHtmlArtboardPreviewMeta(right)?.generatedAt ?? '')
    return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0)
  })[0]
}

function findHtmlArtboardTextLayerShapes(editor, sourceShapeId) {
  return editor.getCurrentPageShapesSorted().filter((shape) => {
    return (
      shape?.type === 'text' &&
      shape?.meta?.cowartHtmlArtboardTextLayer === true &&
      shape?.meta?.sourceHtmlArtboardShapeId === sourceShapeId
    )
  })
}

function resolveHtmlArtboardSelection(editor, shape) {
  const runtimeDocument = cowartShapeToHtmlArtboard(shape)
  if (runtimeDocument) return { runtimeDocument, shape, selectedShape: shape, textLayerShape: null }

  if (
    !(
      (shape?.type === 'image' && shape?.meta?.cowartHtmlArtboardPreview === true) ||
      (shape?.type === 'text' && shape?.meta?.cowartHtmlArtboardTextLayer === true)
    )
  ) {
    return null
  }

  const sourceShapeId = shape.meta.sourceHtmlArtboardShapeId
  if (typeof sourceShapeId !== 'string') return null

  const sourceShape = editor.getShape(sourceShapeId)
  const sourceRuntimeDocument = cowartShapeToHtmlArtboard(sourceShape)
  return sourceRuntimeDocument
    ? {
        runtimeDocument: sourceRuntimeDocument,
        shape: sourceShape,
        selectedShape: shape,
        textLayerShape: shape?.type === 'text' ? shape : null
      }
    : null
}

function hasHtmlArtboardTextLayers(runtimeDocument) {
  return Array.isArray(runtimeDocument?.textLayers) && runtimeDocument.textLayers.length > 0
}

function createHtmlArtboardCanvasPreviewMeta(selectedShape, runtimeDocument) {
  return {
    cowartHtmlArtboardPreviewVersion: HTML_ARTBOARD_PREVIEW_VERSION,
    ...createHtmlArtboardPreviewMeta(runtimeDocument, {
      sourceHtmlArtboardShapeId: selectedShape.id
    })
  }
}

function arrangeHtmlArtboardCanvasLayers(editor, selectedShape) {
  const previewShape = findHtmlArtboardPreviewShape(editor, selectedShape.id)
  const textLayerShapeIds = findHtmlArtboardTextLayerShapes(editor, selectedShape.id).map(
    (shape) => shape.id
  )

  editor.sendToBack([selectedShape.id])

  if (previewShape) {
    editor.bringToFront([previewShape.id])
  }

  if (textLayerShapeIds.length > 0) {
    editor.bringToFront(textLayerShapeIds)
  }
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => {
      resolve(typeof reader.result === 'string' ? reader.result : '')
    })
    reader.addEventListener('error', () => reject(reader.error ?? new Error('Failed to read blob')))
    reader.readAsDataURL(blob)
  })
}

const HTML_ARTBOARD_IMPORT_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])

function selectHtmlArtboardImageFile() {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/png,image/jpeg,image/webp'
    input.addEventListener('change', () => {
      resolve(input.files?.[0] ?? null)
    })
    input.click()
  })
}

function createBrowserImportedAssetId(kind, id, file) {
  const safeId = String(id ?? 'asset').replace(/[^a-z0-9_-]+/gi, '-')
  const safeName = String(file?.name ?? 'image').replace(/[^a-z0-9_.-]+/gi, '-')
  return `browser-html-artboard-${kind}:${safeId}:${Date.now().toString(36)}:${safeName}`
}

async function readHtmlArtboardImageImport(kind, id, pageId) {
  const file = await selectHtmlArtboardImageFile()
  if (!file) return null

  if (!HTML_ARTBOARD_IMPORT_IMAGE_TYPES.has(file.type)) {
    throw new Error('Unsupported image type')
  }

  const dataUrl = await blobToDataUrl(file)
  const response = await fetch(PAGE_ASSET_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      pageId,
      fileName: file.name,
      dataUrl
    })
  })
  if (!response.ok) {
    throw new Error(`Failed to import image asset: ${response.status}`)
  }

  const uploaded = await response.json()
  return {
    assetId: createBrowserImportedAssetId(kind, id, { name: uploaded.fileName ?? file.name }),
    assetUrl: uploaded.assetUrl,
    fileName: uploaded.fileName ?? file.name,
    relativePath: uploaded.relativePath ?? null,
    mimeType: uploaded.mimeType ?? file.type,
    fileSize: Number.isFinite(uploaded.fileSize) ? uploaded.fileSize : file.size
  }
}

function loadPreviewImage(src) {
  if (typeof src !== 'string' || src.length === 0) return Promise.resolve(null)

  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => resolve(null)
    image.src = src
  })
}

function drawCoverImage(context, image, x, y, width, height) {
  if (!image || width <= 0 || height <= 0) return

  const imageWidth = image.naturalWidth || image.width
  const imageHeight = image.naturalHeight || image.height
  if (!imageWidth || !imageHeight) return

  const scale = Math.max(width / imageWidth, height / imageHeight)
  const scaledWidth = imageWidth * scale
  const scaledHeight = imageHeight * scale
  const offsetX = x + (width - scaledWidth) / 2
  const offsetY = y + (height - scaledHeight) / 2
  context.drawImage(image, offsetX, offsetY, scaledWidth, scaledHeight)
}

function drawRoundRect(context, x, y, width, height, radius) {
  const safeRadius = Math.max(0, Math.min(radius, width / 2, height / 2))
  context.beginPath()
  context.moveTo(x + safeRadius, y)
  context.lineTo(x + width - safeRadius, y)
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius)
  context.lineTo(x + width, y + height - safeRadius)
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height)
  context.lineTo(x + safeRadius, y + height)
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius)
  context.lineTo(x, y + safeRadius)
  context.quadraticCurveTo(x, y, x + safeRadius, y)
  context.closePath()
}

function extractPreviewTextFromHtml(html) {
  const template = document.createElement('template')
  template.innerHTML = typeof html === 'string' ? html : ''
  template.content.querySelectorAll('script, style').forEach((node) => node.remove())
  return (template.content.textContent ?? '').replace(/\s+/g, ' ').trim()
}

function createPreviewTextLines(context, text, maxWidth, maxLines) {
  const source = String(text ?? '').trim()
  if (!source) return []

  const lines = []
  let current = ''

  for (const char of source) {
    const next = current + char
    if (current && context.measureText(next).width > maxWidth) {
      lines.push(current.trim())
      current = char
      if (lines.length >= maxLines) break
    } else {
      current = next
    }
  }

  if (lines.length < maxLines && current.trim()) lines.push(current.trim())
  return lines.slice(0, maxLines)
}

function getValidFusionPatchRegion(region) {
  const x = Number(region?.x)
  const y = Number(region?.y)
  const w = Number(region?.w)
  const h = Number(region?.h)

  if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return null

  return { x, y, w, h }
}

function drawPreviewTextFallback(context, runtimeDocument, width, height) {
  const text = extractPreviewTextFromHtml(runtimeDocument.html)
  if (!text) return

  const fontSize = Math.max(22, Math.min(64, Math.round(width / 12)))
  const lineHeight = Math.round(fontSize * 1.15)
  const panelX = Math.round(width * 0.08)
  const panelWidth = Math.round(width * 0.84)
  context.font = `800 ${fontSize}px Inter, ui-sans-serif, system-ui, sans-serif`
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  const lines = createPreviewTextLines(context, text, panelWidth - 48, 4)
  if (lines.length === 0) return

  const panelHeight = lines.length * lineHeight + lineHeight * 1.2
  const panelY = Math.max(24, Math.round(height * 0.43 - panelHeight / 2))
  drawRoundRect(context, panelX, panelY, panelWidth, panelHeight, 18)
  context.fillStyle = 'rgba(255, 255, 255, 0.52)'
  context.fill()

  lines.forEach((line, index) => {
    const y = panelY + lineHeight * 0.7 + index * lineHeight + fontSize / 2
    context.lineWidth = 8
    context.strokeStyle = 'rgba(255, 255, 255, 0.92)'
    context.fillStyle = '#111827'
    context.strokeText(line, Math.round(width / 2), y)
    context.fillText(line, Math.round(width / 2), y)
  })
}

async function drawFusionPatchPreview(context, patch, assetUrlResolver) {
  const region = getValidFusionPatchRegion(patch?.region)
  if (!region || patch?.visible === false) return

  const opacity =
    typeof patch.opacity === 'number' && Number.isFinite(patch.opacity)
      ? Math.max(0.15, Math.min(1, patch.opacity))
      : 1

  context.save()
  context.globalAlpha = opacity

  const patchAssetUrl =
    typeof patch.patchAssetUrl === 'string' && patch.patchAssetUrl.length > 0
      ? assetUrlResolver(patch.patchAssetUrl)
      : null
  const patchImage = patchAssetUrl ? await loadPreviewImage(patchAssetUrl) : null
  const isMockPatch =
    patch?.provider === 'mock' ||
    patch?.status === 'placeholder' ||
    patch?.status === 'mock-generated'

  if (patchImage && !isMockPatch) {
    context.save()
    context.shadowColor = 'rgba(15, 23, 42, 0.18)'
    context.shadowBlur = 18
    context.shadowOffsetY = 8
    drawCoverImage(context, patchImage, region.x, region.y, region.w, region.h)
    context.restore()
  }

  context.restore()
}

function getHtmlArtboardBackgroundAssetUrl(runtimeDocument) {
  const background = runtimeDocument?.background

  if (!background || typeof background !== 'object') return null

  return (
    [
      background.backgroundAssetUrl,
      background.assetUrl,
      background.url,
      background.src
    ].find((url) => typeof url === 'string' && url.length > 0) ?? null
  )
}

function getHtmlArtboardBackgroundColors(runtimeDocument) {
  const colors = runtimeDocument?.background?.colors
  return Array.isArray(colors) && colors.length >= 2
    ? colors.filter((color) => typeof color === 'string' && color)
    : ['#e8f7ff', '#f5fbff', '#ffe9d4']
}

function drawHtmlArtboardAtmosphereBackground(context, runtimeDocument, width, height) {
  const colors = getHtmlArtboardBackgroundColors(runtimeDocument)
  const gradient = context.createLinearGradient(0, 0, width, height)
  gradient.addColorStop(0, colors[0] ?? '#e8f7ff')
  gradient.addColorStop(0.48, colors[1] ?? '#f5fbff')
  gradient.addColorStop(1, colors[2] ?? colors.at(-1) ?? '#ffe9d4')
  context.fillStyle = gradient
  context.fillRect(0, 0, width, height)

  const topGlow = context.createRadialGradient(width * 0.76, height * 0.18, 1, width * 0.76, height * 0.18, width * 0.42)
  topGlow.addColorStop(0, 'rgba(255,255,255,0.84)')
  topGlow.addColorStop(1, 'rgba(255,255,255,0)')
  context.fillStyle = topGlow
  context.fillRect(0, 0, width, height)

  const blueGlow = context.createRadialGradient(width * 0.18, height * 0.74, 1, width * 0.18, height * 0.74, width * 0.46)
  blueGlow.addColorStop(0, 'rgba(56,189,248,0.22)')
  blueGlow.addColorStop(1, 'rgba(56,189,248,0)')
  context.fillStyle = blueGlow
  context.fillRect(0, 0, width, height)

  context.save()
  context.globalAlpha = 0.28
  context.strokeStyle = 'rgba(255,255,255,0.88)'
  context.lineWidth = Math.max(2, width * 0.006)
  context.beginPath()
  context.moveTo(width * 0.12, height * 0.18)
  context.bezierCurveTo(width * 0.34, height * 0.08, width * 0.58, height * 0.18, width * 0.88, height * 0.08)
  context.stroke()
  context.restore()

  context.save()
  context.globalAlpha = 0.16
  context.fillStyle = '#ffffff'
  context.beginPath()
  context.roundRect(width * 0.55, height * 0.09, width * 0.28, height * 0.14, width * 0.04)
  context.fill()
  context.beginPath()
  context.roundRect(width * 0.13, height * 0.77, width * 0.34, height * 0.12, width * 0.05)
  context.fill()
  context.restore()
}

async function createThumbnailAssetUrlResolver(runtimeDocument) {
  const patchAssetUrls = [
    ...new Set(
      (Array.isArray(runtimeDocument.fusionPatches) ? runtimeDocument.fusionPatches : [])
        .map((patch) => patch.patchAssetUrl)
        .filter((url) => typeof url === 'string' && url.length > 0 && !url.startsWith('data:'))
    )
  ]
  const backgroundAssetUrl = getHtmlArtboardBackgroundAssetUrl(runtimeDocument)
  const assetUrls = [
    ...new Set(
      [
        ...patchAssetUrls,
        typeof backgroundAssetUrl === 'string' && !backgroundAssetUrl.startsWith('data:')
          ? backgroundAssetUrl
          : null
      ].filter(Boolean)
    )
  ]
  const resolvedUrls = new Map()

  await Promise.all(
    assetUrls.map(async (url) => {
      try {
        const response = await fetch(url, { cache: 'no-store' })
        if (!response.ok) return

        const blob = await response.blob()
        if (!blob.type.startsWith('image/')) return

        resolvedUrls.set(url, await blobToDataUrl(blob))
      } catch {
        // Keep the original URL when the page-local asset cannot be inlined.
      }
    })
  )

  return (url) => resolvedUrls.get(url) ?? url
}

async function createHtmlArtboardCanvasPreviewPngDataUrl(runtimeDocument, assetUrlResolver, options = {}) {
  const width = Math.max(1, Math.round(runtimeDocument.width))
  const height = Math.max(1, Math.round(runtimeDocument.height))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d')
  drawHtmlArtboardAtmosphereBackground(context, runtimeDocument, width, height)

  const backgroundAssetUrl = getHtmlArtboardBackgroundAssetUrl(runtimeDocument)
  const backgroundImage =
    typeof backgroundAssetUrl === 'string'
      ? await loadPreviewImage(assetUrlResolver(backgroundAssetUrl))
      : null
  if (backgroundImage) {
    drawCoverImage(context, backgroundImage, 0, 0, width, height)
  }

  if (!options.omitTextFallback && !hasHtmlArtboardTextLayers(runtimeDocument)) {
    drawPreviewTextFallback(context, runtimeDocument, width, height)
  }

  const fusionPatches = Array.isArray(runtimeDocument.fusionPatches)
    ? runtimeDocument.fusionPatches
    : []
  for (const patch of fusionPatches) {
    await drawFusionPatchPreview(context, patch, assetUrlResolver)
  }

  return canvas.toDataURL('image/png')
}

async function refreshHtmlArtboardCanvasPreview(editor, selectedShape, runtimeDocument) {
  const size = getHtmlArtboardPreviewSize(runtimeDocument, selectedShape)
  const thumbnailDocument = {
    ...runtimeDocument,
    width: size.w,
    height: size.h
  }
  const assetUrlResolver = await createThumbnailAssetUrlResolver(runtimeDocument)
  const dataUrl = await createHtmlArtboardCanvasPreviewPngDataUrl(
    thumbnailDocument,
    assetUrlResolver,
    {
      omitTextFallback: findHtmlArtboardTextLayerShapes(editor, selectedShape.id).length > 0
    }
  )
  const altText = createHtmlArtboardThumbnailAltText(thumbnailDocument)
  const existingPreviewShape = findHtmlArtboardPreviewShape(editor, selectedShape.id)
  const assetId =
    existingPreviewShape?.props?.assetId ?? createHtmlArtboardPreviewAssetId(selectedShape.id)
  const previewMeta = createHtmlArtboardCanvasPreviewMeta(selectedShape, runtimeDocument)
  const assetRecord = {
    id: assetId,
    typeName: 'asset',
    type: 'image',
    props: {
      name: `${HTML_ARTBOARD_TOOL_LABEL} 预览.png`,
      src: dataUrl,
      w: size.w,
      h: size.h,
      fileSize: dataUrl.length,
      mimeType: 'image/png',
      isAnimated: false
    },
    meta: previewMeta
  }
  const imageProps = {
    w: size.w,
    h: size.h,
    assetId,
    playing: true,
    url: '',
    crop: null,
    flipX: false,
    flipY: false,
    altText
  }

  editor.markHistoryStoppingPoint('refresh-html-artboard-canvas-preview')

  if (editor.getAsset(assetId)) {
    editor.updateAssets([
      {
        id: assetId,
        type: 'image',
        props: assetRecord.props,
        meta: assetRecord.meta
      }
    ])
  } else {
    editor.createAssets([assetRecord])
  }

  if (existingPreviewShape) {
    editor.store.put([
      {
        ...existingPreviewShape,
        x: selectedShape.x,
        y: selectedShape.y,
        rotation: selectedShape.rotation ?? 0,
        parentId: selectedShape.parentId,
        isLocked: true,
        opacity: 1,
        props: {
          ...existingPreviewShape.props,
          ...imageProps
        },
        meta: {
          ...existingPreviewShape.meta,
          ...previewMeta
        }
      }
    ])
  } else {
    editor.createShape({
      id: createShapeId(),
      type: 'image',
      x: selectedShape.x,
      y: selectedShape.y,
      rotation: selectedShape.rotation ?? 0,
      parentId: selectedShape.parentId,
      isLocked: true,
      opacity: 1,
      props: imageProps,
      meta: previewMeta
    })
  }

  arrangeHtmlArtboardCanvasLayers(editor, selectedShape)
  editor.select(selectedShape.id)
}

function startEditingAnnotationArrowLabel(editor, arrowId) {
  const shape = editor.getShape(arrowId)
  if (!shape || !editor.canEditShape(shape)) {
    return
  }

  editor.select(arrowId)
  startEditingShapeWithRichText(editor, arrowId, { selectAll: true })
  pinAnnotationArrowLabelPosition(editor, arrowId)
  editor.getCurrentTool().setCurrentToolIdMask(ANNOTATION_TOOL_ID)
  selectAnnotationTextWhenReady(editor, arrowId)
}

function pinAnnotationArrowLabelPosition(editor, arrowId, attempt = 0) {
  editor.timers.setTimeout(() => {
    const shape = editor.getShape(arrowId)
    if (!shape || shape.meta?.cowartAnnotationArrow !== true) return
    if (shape.props.labelPosition !== ANNOTATION_LABEL_POSITION) {
      editor.updateShapes([
        {
          id: arrowId,
          type: 'arrow',
          props: {
            labelPosition: ANNOTATION_LABEL_POSITION
          }
        }
      ])
    }

    if (attempt < 2 && editor.getEditingShapeId() === arrowId) {
      pinAnnotationArrowLabelPosition(editor, arrowId, attempt + 1)
    }
  }, 16)
}

function unlockGlobalToolLock(editor) {
  if (!editor.getInstanceState().isToolLocked) return
  editor.updateInstanceState({ isToolLocked: false })
}

function selectAnnotationTextWhenReady(editor, arrowId, attempt = 0) {
  editor.timers.setTimeout(() => {
    const editingShapeId = editor.getEditingShapeId()
    if (editingShapeId !== arrowId) return

    const textEditor = editor.getRichTextEditor()
    if (textEditor) {
      textEditor.view.focus()
      textEditor.view.dispatch(
        textEditor.state.tr.setSelection(new AllSelection(textEditor.state.doc)).scrollIntoView()
      )
    }

    const didSelectText = selectAnnotationTextRange(editor, arrowId)
    if (didSelectText && attempt >= ANNOTATION_SELECT_TEXT_SETTLE_ATTEMPTS) {
      return
    }

    if (attempt < ANNOTATION_SELECT_TEXT_MAX_ATTEMPTS) {
      selectAnnotationTextWhenReady(editor, arrowId, attempt + 1)
    }
  }, 16)
}

function selectAnnotationTextRange(editor, arrowId) {
  const doc = editor.getContainerDocument()
  const shapeElement = Array.from(doc.querySelectorAll('[data-shape-id]')).find(
    (element) => element.getAttribute('data-shape-id') === arrowId
  )
  const editable = shapeElement?.querySelector('[contenteditable="true"]')

  if (!editable || typeof editable.focus !== 'function') {
    return false
  }

  editable.focus()

  const textNodes = getTextNodes(editable)
  if (textNodes.length === 0) {
    return doc.activeElement === editable || editable.contains(doc.activeElement)
  }

  const range = doc.createRange()
  const firstTextNode = textNodes[0]
  const lastTextNode = textNodes[textNodes.length - 1]
  range.setStart(firstTextNode, 0)
  range.setEnd(lastTextNode, lastTextNode.textContent?.length ?? 0)

  const selection = doc.getSelection()
  if (!selection) return false

  selection.removeAllRanges()
  selection.addRange(range)
  doc.execCommand?.('selectAll')

  return selection.rangeCount > 0 && selection.toString() === editable.textContent
}

function getTextNodes(node, textNodes = []) {
  for (const child of node.childNodes) {
    if (child.nodeType === Node.TEXT_NODE && child.textContent) {
      textNodes.push(child)
    } else {
      getTextNodes(child, textNodes)
    }
  }

  return textNodes
}

function getDefaultAnnotationArrowBend(dx, dy, scale) {
  const length = Math.hypot(dx, dy)
  if (length === 0) return 0

  const bend = Math.min(
    Math.max(length * ANNOTATION_BEND_RATIO, ANNOTATION_MIN_BEND * scale),
    ANNOTATION_MAX_BEND * scale
  )

  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? -bend : bend
  }

  return bend
}

function getAnnotationColor(editor) {
  const color = editor.getStyleForNextShape(DefaultColorStyle)
  return color === DefaultColorStyle.defaultValue ? ANNOTATION_DEFAULT_COLOR : color
}

class CowartAnnotationTool extends StateNode {
  static id = ANNOTATION_TOOL_ID
  static initial = 'idle'

  static children() {
    return [CowartAnnotationIdle, CowartAnnotationPointing]
  }

  onEnter() {
    unlockGlobalToolLock(this.editor)
  }
}

class CowartAnnotationIdle extends StateNode {
  static id = 'idle'

  onEnter() {
    this.editor.setCursor({ type: 'cross', rotation: 0 })
  }

  onPointerDown(info) {
    this.parent.transition('pointing', info)
  }

  onCancel() {
    this.editor.setCurrentTool('select')
  }
}

class CowartAnnotationPointing extends StateNode {
  static id = 'pointing'

  arrowId = null
  markId = ''
  origin = null

  onEnter() {
    const origin = this.editor.inputs.getOriginPagePoint()
    const scale = this.editor.getResizeScaleFactor()
    const color = getAnnotationColor(this.editor)
    const arrowId = createShapeId()

    this.arrowId = arrowId
    this.origin = { x: origin.x, y: origin.y }
    this.markId = this.editor.markHistoryStoppingPoint(`creating_annotation:${arrowId}`)

    this.editor.createShape({
      id: arrowId,
      type: 'arrow',
      x: origin.x,
      y: origin.y,
      meta: {
        cowartAnnotationArrow: true
      },
      props: {
        kind: 'arc',
        dash: 'draw',
        size: 'm',
        fill: 'none',
        color,
        labelColor: color,
        bend: 0,
        start: { x: 0, y: 0 },
        end: { x: 1, y: 0 },
        arrowheadStart: 'none',
        arrowheadEnd: 'arrow',
        richText: toRichText(''),
        labelPosition: ANNOTATION_LABEL_POSITION,
        font: 'draw',
        scale
      }
    })
  }

  onPointerMove() {
    this.updateArrowEnd()
  }

  onPointerUp() {
    this.complete()
  }

  onCancel() {
    this.cancel()
  }

  onInterrupt() {
    this.cancel()
  }

  updateArrowEnd() {
    if (!this.arrowId || !this.origin) return

    const point = this.editor.inputs.getCurrentPagePoint()
    this.editor.updateShapes([
      {
        id: this.arrowId,
        type: 'arrow',
        props: {
          end: {
            x: point.x - this.origin.x,
            y: point.y - this.origin.y
          }
        }
      }
    ])
  }

  complete() {
    if (!this.arrowId || !this.origin) {
      this.editor.setCurrentTool(ANNOTATION_TOOL_ID)
      return
    }

    this.updateArrowEnd()

    const point = this.editor.inputs.getCurrentPagePoint()
    const dx = point.x - this.origin.x
    const dy = point.y - this.origin.y
    const length = Math.hypot(dx, dy)

    if (length < ANNOTATION_MIN_LENGTH / this.editor.getZoomLevel()) {
      this.editor.bailToMark(this.markId)
      this.parent.transition('idle')
      return
    }

    this.editor.updateShapes([
      {
        id: this.arrowId,
        type: 'arrow',
        props: {
          bend: getDefaultAnnotationArrowBend(dx, dy, this.editor.getResizeScaleFactor())
        }
      }
    ])

    startEditingAnnotationArrowLabel(this.editor, this.arrowId)
  }

  cancel() {
    if (this.arrowId) {
      this.editor.bailToMark(this.markId)
    }
    this.parent.transition('idle')
  }
}

class CowartFrameShapeUtil extends FrameShapeUtil {
  isAspectRatioLocked(shape) {
    if (isAiImageHolderShape(shape)) {
      return isAiImageAspectLocked(shape)
    }

    return super.isAspectRatioLocked(shape)
  }
}

const cowartShapeUtils = [CowartFrameShapeUtil]

const cowartUiOverrides = {
  translations: {
    en: {
      'tool.ai-image': AI_IMAGE_HOLDER_LABEL,
      'tool.html-artboard': HTML_ARTBOARD_TOOL_LABEL,
      'tool.cowart-annotation': ANNOTATION_TOOL_LABEL
    },
    'zh-cn': {
      'tool.ai-image': AI_IMAGE_HOLDER_LABEL,
      'tool.html-artboard': HTML_ARTBOARD_TOOL_LABEL,
      'tool.cowart-annotation': ANNOTATION_TOOL_LABEL
    }
  },
  tools(editor, tools) {
    return {
      ...tools,
      arrow: {
        ...tools.arrow,
        kbd: undefined
      },
      [AI_IMAGE_TOOL_ID]: {
        id: AI_IMAGE_TOOL_ID,
        label: 'tool.ai-image',
        icon: 'tool-frame',
        kbd: 'a',
        onSelect() {
          createAiImageHolderAtViewportCenter(editor)
        },
        onDragStart(source, info) {
          const scale = editor.getResizeScaleFactor()
          onDragFromToolbarToCreateShape(editor, info, {
            createShape: (id) =>
              createAiImageHolderShape(editor, id, {
                props: {
                  w: AI_IMAGE_HOLDER_DEFAULT_W * scale,
                  h: AI_IMAGE_HOLDER_DEFAULT_H * scale
                }
              }),
            onDragEnd: (id) => editor.select(id)
          })
        },
        meta: {
          cowartTool: 'ai-image-holder'
        }
      },
      [HTML_ARTBOARD_TOOL_ID]: {
        id: HTML_ARTBOARD_TOOL_ID,
        label: 'tool.html-artboard',
        icon: 'tool-frame',
        onSelect() {
          createHtmlArtboardAtViewportCenter(editor)
        },
        meta: {
          cowartTool: 'html-artboard'
        }
      },
      [ANNOTATION_TOOL_ID]: {
        id: ANNOTATION_TOOL_ID,
        label: 'tool.cowart-annotation',
        icon: annotationToolIcon,
        kbd: 'c',
        onSelect() {
          unlockGlobalToolLock(editor)
          editor.setCurrentTool(ANNOTATION_TOOL_ID)
        },
        meta: {
          cowartTool: 'annotation'
        }
      }
    }
  }
}

const cowartComponents = {
  Toolbar: CowartToolbar,
  StylePanel: CowartStylePanel
}

function CowartStylePanel(props) {
  return (
    <DefaultStylePanel {...props}>
      <DefaultStylePanelContent />
      <CowartAiImageStyleControls />
      <CowartHtmlArtboardPreviewControls />
    </DefaultStylePanel>
  )
}

function CowartHtmlArtboardPreviewControls() {
  const editor = useEditor()
  const selectedHtmlArtboard = useValue(
    'selected html artboard',
    () => {
      const selectedShapeIds = editor.getSelectedShapeIds()
      if (selectedShapeIds.length !== 1) return null

      const shape = editor.getShape(selectedShapeIds[0])
      return resolveHtmlArtboardSelection(editor, shape)
    },
    [editor]
  )

  if (!selectedHtmlArtboard) return null

  const { runtimeDocument, shape, textLayerShape } = selectedHtmlArtboard
  const srcDoc = createHtmlArtboardPreviewSrcDoc(runtimeDocument)
  const sourceSnapshot = createHtmlArtboardSourceSnapshot(runtimeDocument)

  return (
    <div className="cowart-html-artboard-preview-panel" aria-label="HTML 画板面板">
      <section className="cowart-html-artboard-summary">
        <div className="cowart-html-preview-heading">
          <span>HTML 活海报</span>
          <span>
            {runtimeDocument.width} × {runtimeDocument.height}
          </span>
        </div>
      </section>
      <CowartHtmlArtboardCanvasPreviewControls
        editor={editor}
        runtimeDocument={runtimeDocument}
        selectedShape={shape}
      />
      <CowartHtmlArtboardBackgroundSummary
        editor={editor}
        runtimeDocument={runtimeDocument}
        selectedShape={shape}
      />
      <CowartHtmlArtboardSelectedTextLayerControls
        editor={editor}
        runtimeDocument={runtimeDocument}
        selectedShape={shape}
        textLayerShape={textLayerShape}
      />
      <CowartHtmlArtboardTextLayerControls
        editor={editor}
        runtimeDocument={runtimeDocument}
        selectedShape={shape}
      />
      <CowartHtmlArtboardFusionPatches
        editor={editor}
        runtimeDocument={runtimeDocument}
        selectedShape={shape}
      />
      <details className="cowart-html-advanced">
        <summary>高级</summary>
        <CowartHtmlArtboardAiGenerationStatus />
        <section className="cowart-html-preview-section">
          <div className="cowart-html-preview-heading">
            <span>安全预览</span>
          </div>
          <iframe
            className="cowart-html-preview-frame"
            sandbox=""
            srcDoc={srcDoc}
            title="HTML 画板安全预览"
          />
        </section>
        <CowartHtmlArtboardSourceControls sourceSnapshot={sourceSnapshot} />
        <CowartHtmlArtboardEditorControls
          editor={editor}
          runtimeDocument={runtimeDocument}
          selectedShape={shape}
        />
        <CowartHtmlArtboardMutationLog runtimeDocument={runtimeDocument} />
        <CowartHtmlArtboardExportControls runtimeDocument={runtimeDocument} />
      </details>
    </div>
  )
}

function formatCanvasPreviewFreshness(freshness) {
  if (freshness?.status === 'current') return '预览已是最新'
  if (freshness?.status === 'stale') return '预览已过期'
  return '缺少画布预览'
}

function formatBackgroundStatus(status) {
  if (status === 'attached') return '已附加'
  if (status === 'metadata') return '仅元数据'
  if (status === 'generated') return '已生成'
  if (status === 'failed') return '失败'
  return status
}

function formatBackgroundType(type) {
  if (type === 'gradient') return '渐变'
  if (type === 'image') return '图片'
  if (type === 'unknown') return '未知'
  return type
}

function CowartHtmlArtboardBackgroundSummary({ editor, runtimeDocument, selectedShape }) {
  const [backgroundStatus, setBackgroundStatus] = useState('')
  const background = runtimeDocument.background ?? {}
  const backgroundAssetUrl = getHtmlArtboardBackgroundAssetUrl(runtimeDocument)
  const type = typeof background.type === 'string' && background.type ? background.type : 'unknown'
  const status =
    typeof background.status === 'string' && background.status
      ? background.status
      : backgroundAssetUrl
      ? 'attached'
      : 'metadata'

  useEffect(() => {
    setBackgroundStatus('')
  }, [selectedShape.id, backgroundAssetUrl, runtimeDocument.renderFingerprint])

  async function importBackgroundImage() {
    try {
      const imageImport = await readHtmlArtboardImageImport(
        'background',
        runtimeDocument.id,
        selectedShape.parentId ?? editor.getCurrentPageId()
      )
      if (!imageImport) return

      const updatedDocument = attachExternalBackgroundImageToHtmlArtboard(
        runtimeDocument,
        {
          backgroundAssetId: imageImport.assetId,
          backgroundAssetUrl: imageImport.assetUrl,
          fileName: imageImport.fileName,
          relativePath: imageImport.relativePath,
          mimeType: imageImport.mimeType,
          fileSize: imageImport.fileSize
        },
        {
          provider: 'browser-file-import',
          prompt: background.prompt
        },
        {
          mutationOptions: {
            meta: {
              source: 'html-artboard-background-panel'
            }
          }
        }
      )

      writeHtmlArtboardRuntimeDocument(
        editor,
        selectedShape,
        updatedDocument,
        'import-html-artboard-background-image'
      )
      await refreshHtmlArtboardCanvasPreview(editor, selectedShape, updatedDocument)
      setBackgroundStatus('背景图已导入，画布预览已刷新')
    } catch {
      setBackgroundStatus('导入失败：请选择 PNG / JPG / WebP')
    }
  }

  return (
    <section className="cowart-html-background" aria-label="HTML 画板背景">
      <div className="cowart-html-preview-heading">
        <span>背景</span>
        <span>{formatBackgroundStatus(status)}</span>
      </div>
      <div className="cowart-html-background-meta">
        <span>类型：{formatBackgroundType(type)}</span>
        {backgroundAssetUrl ? <code>{backgroundAssetUrl}</code> : <span>尚未附加背景图。</span>}
      </div>
      <div className="cowart-html-background-actions">
        <button type="button" onClick={importBackgroundImage}>
          导入背景图
        </button>
        {backgroundStatus ? <span>{backgroundStatus}</span> : null}
      </div>
    </section>
  )
}

function CowartHtmlArtboardCanvasPreviewControls({ editor, runtimeDocument, selectedShape }) {
  const [previewStatus, setPreviewStatus] = useState('')
  const previewShape = useValue(
    'selected html artboard canvas preview shape',
    () => findHtmlArtboardPreviewShape(editor, selectedShape.id),
    [editor, selectedShape.id]
  )
  const freshness = compareHtmlArtboardPreviewFreshness(runtimeDocument, previewShape)
  const freshnessSummary = formatCanvasPreviewFreshness(freshness)
  const freshnessNote = freshness.isMissing
    ? '点击刷新，生成画布缩略图。'
    : freshness.isStale
      ? '点击刷新，让画布缩略图同步到最新内容。'
      : ''

  useEffect(() => {
    setPreviewStatus('')
  }, [selectedShape.id, runtimeDocument.html, runtimeDocument.css])

  async function refreshCanvasPreview() {
    try {
      await refreshHtmlArtboardCanvasPreview(editor, selectedShape, runtimeDocument)
      setPreviewStatus('已刷新')
    } catch {
      setPreviewStatus('刷新失败')
    }
  }

  return (
    <section className="cowart-html-canvas-preview" aria-label="HTML 画板画布预览">
      <div className="cowart-html-preview-heading">
        <span>画布预览</span>
      </div>
      <div
        className={`cowart-html-preview-status cowart-html-preview-status-${freshness.status}`}
      >
        <span>{freshnessSummary}</span>
        {freshnessNote ? (
          <span className="cowart-html-preview-status-note">{freshnessNote}</span>
        ) : null}
      </div>
      <div className="cowart-html-canvas-preview-action">
        <button
          className="cowart-html-canvas-preview-refresh"
          onClick={refreshCanvasPreview}
          type="button"
        >
          刷新画布预览
        </button>
        {previewStatus ? (
          <span className="cowart-html-canvas-preview-status">{previewStatus}</span>
        ) : null}
      </div>
    </section>
  )
}

function getTextLayerTextShapeProps(layer) {
  const textAlign = layer.align === 'center' ? 'middle' : layer.align === 'end' ? 'end' : 'start'
  const scale = Math.max(0.25, Number(layer.scale) || Number(layer.fontSize) / 32 || 1)
  const visualWidth = Math.max(32, Number(layer.w) || 240)
  const color = HTML_TEXT_LAYER_COLOR_OPTIONS.some((option) => option.value === layer.color)
    ? layer.color
    : 'black'
  const font = HTML_TEXT_LAYER_FONT_OPTIONS.some((option) => option.value === layer.font)
    ? layer.font
    : 'sans'

  return {
    color,
    size: 'xl',
    font,
    textAlign,
    w: visualWidth / scale,
    richText: toRichText(layer.text ?? ''),
    scale,
    autoSize: false
  }
}

function createTextLayerShapeMeta(selectedShape, layer) {
  return {
    cowartHtmlArtboardTextLayer: true,
    sourceHtmlArtboardShapeId: selectedShape.id,
    runtimeTextLayerId: layer.id,
    dataNode: layer.dataNode,
    selector: layer.selector
  }
}

function upsertHtmlArtboardTextLayerShapes(editor, selectedShape, textLayers) {
  const existingShapes = findHtmlArtboardTextLayerShapes(editor, selectedShape.id)
  const existingByLayerId = new Map(
    existingShapes
      .map((shape) => [shape.meta?.runtimeTextLayerId, shape])
      .filter(([layerId]) => typeof layerId === 'string' && layerId)
  )
  const nextLayerIds = new Set(textLayers.map((layer) => layer.id))
  const updates = []
  const createdShapeIds = []

  for (const layer of textLayers) {
    const existingShape = existingByLayerId.get(layer.id)
    const shapeRecord = {
      id: existingShape?.id ?? createShapeId(),
      type: 'text',
      x: selectedShape.x + layer.x,
      y: selectedShape.y + layer.y,
      rotation: selectedShape.rotation ?? 0,
      parentId: selectedShape.parentId,
      opacity: layer.visible === false ? 0 : 1,
      props: getTextLayerTextShapeProps(layer),
      meta: {
        ...(existingShape?.meta ?? {}),
        ...createTextLayerShapeMeta(selectedShape, layer)
      }
    }

    if (existingShape) {
      updates.push(shapeRecord)
    } else {
      editor.createShape(shapeRecord)
      createdShapeIds.push(shapeRecord.id)
    }
  }

  if (updates.length > 0) editor.updateShapes(updates)

  const staleShapeIds = existingShapes
    .filter((shape) => !nextLayerIds.has(shape.meta?.runtimeTextLayerId))
    .map((shape) => shape.id)
  if (staleShapeIds.length > 0) editor.deleteShapes(staleShapeIds)

  return [...updates.map((shape) => shape.id), ...createdShapeIds]
}

function getTextLayerFromShape(editor, selectedShape, textShape) {
  const pageBounds = editor.getShapePageBounds?.(textShape)
  const text =
    typeof textShape.props?.richText === 'object'
      ? renderPlaintextFromRichText(editor, textShape.props.richText)
      : ''
  const scale = Number(textShape.props?.scale) || 1

  return {
    id: textShape.meta.runtimeTextLayerId,
    type: 'text',
    dataNode: textShape.meta.dataNode ?? null,
    selector: textShape.meta.selector ?? null,
    sourceText: text,
    text,
    x: Math.round(textShape.x - selectedShape.x),
    y: Math.round(textShape.y - selectedShape.y),
    w: Math.round(pageBounds?.w ?? textShape.props?.w ?? 240),
    h: Math.round(pageBounds?.h ?? 48 * scale),
    fontSize: Math.round(32 * scale),
    scale,
    color: textShape.props?.color ?? 'black',
    font: textShape.props?.font ?? 'sans',
    align: textShape.props?.textAlign === 'middle' ? 'center' : textShape.props?.textAlign ?? 'start',
    visible: textShape.opacity !== 0,
    meta: {}
  }
}

function normalizeTextLayerScale(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return 1
  return Math.min(Math.max(number, 0.25), 4)
}

function normalizeTextLayerVisualWidth(value) {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) return 240
  return Math.min(Math.max(number, 32), 2400)
}

function normalizeTextLayerAlign(value) {
  return value === 'center' || value === 'end' ? value : 'start'
}

function normalizeTextLayerColor(value) {
  return HTML_TEXT_LAYER_COLOR_OPTIONS.some((option) => option.value === value) ? value : 'black'
}

function normalizeTextLayerFont(value) {
  return HTML_TEXT_LAYER_FONT_OPTIONS.some((option) => option.value === value) ? value : 'sans'
}

function CowartHtmlArtboardSelectedTextLayerControls({
  editor,
  runtimeDocument,
  selectedShape,
  textLayerShape
}) {
  const [draftText, setDraftText] = useState('')
  const [draftScale, setDraftScale] = useState('1')
  const [draftWidth, setDraftWidth] = useState('240')
  const [draftColor, setDraftColor] = useState('black')
  const [draftFont, setDraftFont] = useState('sans')
  const [draftAlign, setDraftAlign] = useState('start')
  const [draftVisible, setDraftVisible] = useState(true)
  const [textLayerStatus, setTextLayerStatus] = useState('')

  const currentLayer = useMemo(() => {
    if (!textLayerShape) return null
    return getTextLayerFromShape(editor, selectedShape, textLayerShape)
  }, [editor, selectedShape, textLayerShape])

  useEffect(() => {
    if (!currentLayer) return

    setDraftText(currentLayer.text)
    setDraftScale(String(Number(currentLayer.scale || 1).toFixed(2)).replace(/\.?0+$/, ''))
    setDraftWidth(String(Math.round(currentLayer.w || 240)))
    setDraftColor(normalizeTextLayerColor(currentLayer.color))
    setDraftFont(normalizeTextLayerFont(currentLayer.font))
    setDraftAlign(normalizeTextLayerAlign(currentLayer.align))
    setDraftVisible(currentLayer.visible !== false)
  }, [
    currentLayer?.id,
    currentLayer?.text,
    currentLayer?.scale,
    currentLayer?.w,
    currentLayer?.color,
    currentLayer?.font,
    currentLayer?.align,
    currentLayer?.visible
  ])

  useEffect(() => {
    setTextLayerStatus('')
  }, [currentLayer?.id])

  if (!textLayerShape || !currentLayer) return null

  function applyTextLayerChanges() {
    try {
      const nextScale = normalizeTextLayerScale(draftScale)
      const nextLayer = {
        ...currentLayer,
        text: draftText,
        sourceText: draftText,
        scale: nextScale,
        fontSize: Math.round(32 * nextScale),
        w: normalizeTextLayerVisualWidth(draftWidth),
        color: normalizeTextLayerColor(draftColor),
        font: normalizeTextLayerFont(draftFont),
        align: normalizeTextLayerAlign(draftAlign),
        visible: draftVisible
      }

      editor.updateShapes([
        {
          id: textLayerShape.id,
          type: textLayerShape.type,
          props: getTextLayerTextShapeProps(nextLayer),
          opacity: nextLayer.visible === false ? 0 : 1,
          meta: {
            ...(textLayerShape.meta ?? {}),
            ...createTextLayerShapeMeta(selectedShape, nextLayer)
          }
        }
      ])

      const textLayerShapes = findHtmlArtboardTextLayerShapes(editor, selectedShape.id)
      const nextTextLayers = (textLayerShapes.length > 0 ? textLayerShapes : [textLayerShape]).map(
        (shape) =>
          shape.id === textLayerShape.id
            ? nextLayer
            : getTextLayerFromShape(editor, selectedShape, shape)
      )
      const updatedDocument = updateHtmlArtboardTextLayers(runtimeDocument, nextTextLayers)

      writeHtmlArtboardRuntimeDocument(
        editor,
        selectedShape,
        updatedDocument,
        'update-html-artboard-text-layer'
      )
      editor.select(textLayerShape.id)
      setTextLayerStatus('已更新当前文字层')
    } catch {
      setTextLayerStatus('文字层更新失败')
    }
  }

  return (
    <section className="cowart-html-selected-text-layer" aria-label="当前 HTML 文字层">
      <div className="cowart-html-preview-heading">
        <span>当前文字层</span>
        <span>{currentLayer.dataNode || '文字'}</span>
      </div>
      <label className="cowart-html-text-layer-field">
        <span>文字</span>
        <textarea
          value={draftText}
          onChange={(event) => setDraftText(event.target.value)}
          rows={2}
        />
      </label>
      <div className="cowart-html-text-layer-grid">
        <label className="cowart-html-text-layer-field">
          <span>大小</span>
          <input
            min="0.25"
            max="4"
            step="0.05"
            type="number"
            value={draftScale}
            onChange={(event) => setDraftScale(event.target.value)}
          />
        </label>
        <label className="cowart-html-text-layer-field">
          <span>宽度</span>
          <input
            min="32"
            max="2400"
            step="1"
            type="number"
            value={draftWidth}
            onChange={(event) => setDraftWidth(event.target.value)}
          />
        </label>
      </div>
      <div className="cowart-html-text-layer-grid">
        <label className="cowart-html-text-layer-field">
          <span>颜色</span>
          <select value={draftColor} onChange={(event) => setDraftColor(event.target.value)}>
            {HTML_TEXT_LAYER_COLOR_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="cowart-html-text-layer-field">
          <span>字体</span>
          <select value={draftFont} onChange={(event) => setDraftFont(event.target.value)}>
            {HTML_TEXT_LAYER_FONT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="cowart-html-text-layer-grid">
        <label className="cowart-html-text-layer-field">
          <span>对齐</span>
          <select value={draftAlign} onChange={(event) => setDraftAlign(event.target.value)}>
            <option value="start">左对齐</option>
            <option value="center">居中</option>
            <option value="end">右对齐</option>
          </select>
        </label>
        <label className="cowart-html-text-layer-check">
          <input
            checked={draftVisible}
            onChange={(event) => setDraftVisible(event.target.checked)}
            type="checkbox"
          />
          <span>显示这一行</span>
        </label>
      </div>
      <div className="cowart-html-text-layer-actions">
        <button type="button" onClick={applyTextLayerChanges}>
          应用文字修改
        </button>
        {textLayerStatus ? <span>{textLayerStatus}</span> : null}
      </div>
      <p className="cowart-html-text-layer-note">
        位置直接在画布拖动；改完文字、大小或颜色后，画布预览会提示需要刷新。
      </p>
    </section>
  )
}

function CowartHtmlArtboardTextLayerControls({ editor, runtimeDocument, selectedShape }) {
  const [textLayerStatus, setTextLayerStatus] = useState('')
  const textLayerShapes = useValue(
    'selected html artboard text layer shapes',
    () => findHtmlArtboardTextLayerShapes(editor, selectedShape.id),
    [editor, selectedShape.id]
  )
  const runtimeTextLayers = Array.isArray(runtimeDocument.textLayers)
    ? runtimeDocument.textLayers
    : []

  useEffect(() => {
    setTextLayerStatus('')
  }, [selectedShape.id, runtimeDocument.renderFingerprint])

  async function createOrRefreshTextLayers() {
    try {
      const textLayers = createHtmlArtboardTextLayersFromDocument(runtimeDocument, {
        recreate: true
      })
      const updatedDocument = updateHtmlArtboardTextLayers(runtimeDocument, textLayers)

      writeHtmlArtboardRuntimeDocument(
        editor,
        selectedShape,
        updatedDocument,
        'create-html-artboard-text-layers'
      )
      upsertHtmlArtboardTextLayerShapes(editor, selectedShape, textLayers)
      await refreshHtmlArtboardCanvasPreview(editor, selectedShape, updatedDocument)
      editor.select(selectedShape.id)
      setTextLayerStatus(`已生成 ${textLayers.length} 个文字层`)
    } catch {
      setTextLayerStatus('文字层生成失败')
    }
  }

  async function syncTextLayersToRuntime() {
    try {
      const currentTextLayerShapes = findHtmlArtboardTextLayerShapes(editor, selectedShape.id)
      if (currentTextLayerShapes.length === 0) {
        setTextLayerStatus('画布上还没有文字层')
        return
      }

      const textLayers = currentTextLayerShapes.map((shape) =>
        getTextLayerFromShape(editor, selectedShape, shape)
      )
      const updatedDocument = updateHtmlArtboardTextLayers(runtimeDocument, textLayers)

      writeHtmlArtboardRuntimeDocument(
        editor,
        selectedShape,
        updatedDocument,
        'sync-html-artboard-text-layers'
      )
      await refreshHtmlArtboardCanvasPreview(editor, selectedShape, updatedDocument)
      editor.select(selectedShape.id)
      setTextLayerStatus(`已同步 ${textLayers.length} 个文字层`)
    } catch {
      setTextLayerStatus('文字层同步失败')
    }
  }

  return (
    <section className="cowart-html-text-layers" aria-label="HTML 画板文字层">
      <div className="cowart-html-preview-heading">
        <span>文字层</span>
        <span>{textLayerShapes.length || runtimeTextLayers.length}</span>
      </div>
      <p className="cowart-html-text-layer-note">
        生成后，每一行都能在画布里单独拖动、缩放和双击编辑。
      </p>
      <div className="cowart-html-text-layer-actions">
        <button type="button" onClick={createOrRefreshTextLayers}>
          生成 / 刷新文字层
        </button>
        <button type="button" onClick={syncTextLayersToRuntime}>
          同步文字层
        </button>
        {textLayerStatus ? <span>{textLayerStatus}</span> : null}
      </div>
    </section>
  )
}

function CowartHtmlArtboardSourceControls({ sourceSnapshot }) {
  const [copyStatus, setCopyStatus] = useState({})

  useEffect(() => {
    setCopyStatus({})
  }, [sourceSnapshot.html, sourceSnapshot.css, sourceSnapshot.json])

  async function copySource(kind, value) {
    if (!navigator.clipboard?.writeText) {
      setCopyStatus((status) => ({ ...status, [kind]: '复制失败' }))
      return
    }

    try {
      await navigator.clipboard.writeText(value)
      setCopyStatus((status) => ({ ...status, [kind]: '已复制' }))
    } catch {
      setCopyStatus((status) => ({ ...status, [kind]: '复制失败' }))
    }
  }

  return (
    <section className="cowart-html-artboard-source" aria-label="HTML 画板源码">
      <div className="cowart-html-preview-heading">
        <span>源码查看</span>
      </div>
      <CowartHtmlSourceSection
        copyLabel="复制 HTML"
        copyStatus={copyStatus.html}
        label="HTML"
        onCopy={() => copySource('html', sourceSnapshot.html)}
        value={sourceSnapshot.html}
      />
      <CowartHtmlSourceSection
        copyLabel="复制 CSS"
        copyStatus={copyStatus.css}
        label="CSS"
        onCopy={() => copySource('css', sourceSnapshot.css)}
        value={sourceSnapshot.css}
      />
      <CowartHtmlSourceSection
        copyLabel="复制 JSON"
        copyStatus={copyStatus.json}
        isJson
        label="运行时 JSON"
        onCopy={() => copySource('json', sourceSnapshot.json)}
        value={sourceSnapshot.json}
      />
    </section>
  )
}

function CowartHtmlSourceSection({ copyLabel, copyStatus, isJson = false, label, onCopy, value }) {
  return (
    <section className="cowart-html-source-section">
      <div className="cowart-html-source-header">
        <span>{label}</span>
        <div>
          {copyStatus ? <span className="cowart-html-source-status">{copyStatus}</span> : null}
          <button className="cowart-html-source-copy" onClick={onCopy} type="button">
            {copyLabel}
          </button>
        </div>
      </div>
      <textarea
        aria-label={`${label} 源码`}
        className={
          isJson
            ? 'cowart-html-source-textarea cowart-html-source-textarea__json'
            : 'cowart-html-source-textarea'
        }
        readOnly
        value={value}
      />
    </section>
  )
}

function CowartHtmlArtboardEditorControls({ editor, runtimeDocument, selectedShape }) {
  const [draftHtml, setDraftHtml] = useState(runtimeDocument.html)
  const [draftCss, setDraftCss] = useState(runtimeDocument.css)
  const [saveStatus, setSaveStatus] = useState('')

  useEffect(() => {
    setDraftHtml(runtimeDocument.html)
    setDraftCss(runtimeDocument.css)
    setSaveStatus('')
  }, [selectedShape.id])

  const hasUnsavedChanges = draftHtml !== runtimeDocument.html || draftCss !== runtimeDocument.css
  const statusText = hasUnsavedChanges ? '有未保存修改' : saveStatus

  function saveHtmlArtboardSource() {
    try {
      const updatedDocument = updateHtmlArtboardSource(runtimeDocument, {
        html: draftHtml,
        css: draftCss
      })

      editor.markHistoryStoppingPoint('update-html-artboard-source')
      editor.updateShapes([
        {
          id: selectedShape.id,
          type: selectedShape.type,
          meta: {
            ...selectedShape.meta,
            cowartHtmlArtboard: true,
            runtimeDocument: updatedDocument
          }
        }
      ])
      setSaveStatus('已保存')
    } catch {
      setSaveStatus('保存失败')
    }
  }

  function resetHtmlArtboardDraft() {
    setDraftHtml(runtimeDocument.html)
    setDraftCss(runtimeDocument.css)
    setSaveStatus('')
  }

  return (
    <section className="cowart-html-artboard-editor" aria-label="HTML 画板源码编辑">
      <div className="cowart-html-preview-heading">
        <span>编辑源码</span>
      </div>
      <label className="cowart-html-editor-section">
        <span>HTML</span>
        <textarea
          className="cowart-html-editor-textarea"
          value={draftHtml}
          onChange={(event) => {
            setDraftHtml(event.target.value)
            setSaveStatus('')
          }}
        />
      </label>
      <label className="cowart-html-editor-section">
        <span>CSS</span>
        <textarea
          className="cowart-html-editor-textarea"
          value={draftCss}
          onChange={(event) => {
            setDraftCss(event.target.value)
            setSaveStatus('')
          }}
        />
      </label>
      <div className="cowart-html-editor-actions">
        <button
          className="cowart-html-editor-save"
          disabled={!hasUnsavedChanges}
          onClick={saveHtmlArtboardSource}
          type="button"
        >
          保存修改
        </button>
        <button
          className="cowart-html-editor-reset"
          disabled={!hasUnsavedChanges}
          onClick={resetHtmlArtboardDraft}
          type="button"
        >
          重置
        </button>
        {statusText ? <span className="cowart-html-editor-status">{statusText}</span> : null}
      </div>
    </section>
  )
}

function CowartHtmlArtboardMutationLog({ runtimeDocument }) {
  const mutationLog = Array.isArray(runtimeDocument.mutationLog) ? runtimeDocument.mutationLog : []
  const recentMutations = mutationLog.slice(-3).reverse()

  return (
    <section className="cowart-html-mutation-log" aria-label="HTML 画板变更记录">
      <div className="cowart-html-preview-heading">
        <span>变更记录</span>
        <span>共 {mutationLog.length} 条</span>
      </div>
      {recentMutations.length === 0 ? (
        <p className="cowart-html-mutation-empty">还没有变更记录。</p>
      ) : (
        <ol className="cowart-html-mutation-list">
          {recentMutations.map((mutation, index) => (
            <li
              key={mutation.id ?? `${mutation.type}:${mutation.timestamp}:${index}`}
              className="cowart-html-mutation-item"
            >
              <span>{mutation.type}</span>
              <time>{mutation.timestamp}</time>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

function formatFusionPatchRegion(region) {
  if (!region || typeof region !== 'object') return '区域：无'

  return `区域：x ${region.x}，y ${region.y}，宽 ${region.w}，高 ${region.h}`
}

function formatFusionPatchStatus(status) {
  if (status === 'placeholder') return '占位'
  if (status === 'mock-generated') return '模拟生成'
  if (status === 'generated') return '已生成'
  if (status === 'failed') return '失败'
  return status || '未知'
}

function formatFusionPatchProvider(provider) {
  if (provider === 'mock') return '模拟'
  if (provider === 'codex-image-gen') return 'Codex 生图'
  if (provider === 'external-image-gen') return '外部生图'
  if (provider === 'fixture-image-gen') return '测试图片'
  return provider || '未知来源'
}

function createFusionPatchRegionDraft(region) {
  return {
    x: String(region?.x ?? 0),
    y: String(region?.y ?? 0),
    w: String(region?.w ?? 1),
    h: String(region?.h ?? 1)
  }
}

function parseFusionPatchRegionDraft(regionDraft) {
  const nextRegion = {
    x: Number(regionDraft.x),
    y: Number(regionDraft.y),
    w: Number(regionDraft.w),
    h: Number(regionDraft.h)
  }

  if (
    [regionDraft.x, regionDraft.y, regionDraft.w, regionDraft.h].some(
      (value) => String(value).trim() === ''
    )
  ) {
    return null
  }

  if (![nextRegion.x, nextRegion.y, nextRegion.w, nextRegion.h].every(Number.isFinite)) {
    return null
  }

  if (nextRegion.w <= 0 || nextRegion.h <= 0) return null

  return nextRegion
}

function writeHtmlArtboardRuntimeDocument(editor, selectedShape, runtimeDocument, historyLabel) {
  editor.markHistoryStoppingPoint(historyLabel)
  editor.updateShapes([
    {
      id: selectedShape.id,
      type: selectedShape.type,
      meta: {
        ...selectedShape.meta,
        cowartHtmlArtboard: true,
        runtimeDocument
      }
    }
  ])
}

function hasRuntimeDocumentChange(previousDocument, nextDocument) {
  return (
    previousDocument.renderFingerprint !== nextDocument.renderFingerprint ||
    previousDocument.mutationLog.length !== nextDocument.mutationLog.length ||
    previousDocument.fusionPatches.length !== nextDocument.fusionPatches.length
  )
}

function CowartHtmlFusionPatchEditor({ editor, runtimeDocument, selectedShape, patch }) {
  const [draftName, setDraftName] = useState(patch.name ?? '')
  const [draftPrompt, setDraftPrompt] = useState(patch.prompt ?? '')
  const [draftRegion, setDraftRegion] = useState(createFusionPatchRegionDraft(patch.region))
  const [patchStatus, setPatchStatus] = useState('')
  const visible = patch.visible !== false

  useEffect(() => {
    setDraftName(patch.name ?? '')
    setDraftPrompt(patch.prompt ?? '')
    setDraftRegion(createFusionPatchRegionDraft(patch.region))
    setPatchStatus('')
  }, [
    patch.id,
    patch.name,
    patch.prompt,
    patch.region?.x,
    patch.region?.y,
    patch.region?.w,
    patch.region?.h,
    patch.patchAssetUrl,
    patch.status
  ])

  function updatePatchDocument(updatedDocument, historyLabel, successMessage) {
    if (!hasRuntimeDocumentChange(runtimeDocument, updatedDocument)) {
      setPatchStatus('没有可应用的修改')
      return
    }

    writeHtmlArtboardRuntimeDocument(editor, selectedShape, updatedDocument, historyLabel)
    setPatchStatus(successMessage)
  }

  function applyPatchChanges() {
    const nextRegion = parseFusionPatchRegionDraft(draftRegion)
    if (!nextRegion) {
      setPatchStatus('区域数值无效')
      return
    }

    const updatedDocument = updateFusionPatchInHtmlArtboard(runtimeDocument, patch.id, {
      name: draftName,
      prompt: draftPrompt,
      region: nextRegion
    })
    updatePatchDocument(updatedDocument, 'update-html-artboard-fusion-patch', '图层已更新')
  }

  function togglePatchVisibility() {
    const updatedDocument = setFusionPatchVisibilityInHtmlArtboard(
      runtimeDocument,
      patch.id,
      !visible
    )
    updatePatchDocument(
      updatedDocument,
      'toggle-html-artboard-fusion-patch-visibility',
      visible ? '已隐藏' : '已显示'
    )
  }

  function deletePatch() {
    const updatedDocument = deleteFusionPatchFromHtmlArtboard(runtimeDocument, patch.id)
    updatePatchDocument(updatedDocument, 'delete-html-artboard-fusion-patch', '图层已删除')
  }

  function generateMockPatchAsset() {
    const updatedDocument = generateMockFusionPatchAssetForHtmlArtboard(
      runtimeDocument,
      patch.id
    )
    updatePatchDocument(
      updatedDocument,
      'generate-html-artboard-mock-fusion-patch-asset',
      '已生成模拟素材'
    )
  }

  async function importPatchImageAsset() {
    try {
      const imageImport = await readHtmlArtboardImageImport(
        'fusion-patch',
        patch.id,
        selectedShape.parentId ?? editor.getCurrentPageId()
      )
      if (!imageImport) return

      const updatedDocument = attachExternalFusionPatchImageToHtmlArtboard(
        runtimeDocument,
        patch.id,
        {
          patchAssetId: imageImport.assetId,
          patchAssetUrl: imageImport.assetUrl,
          fileName: imageImport.fileName,
          relativePath: imageImport.relativePath,
          mimeType: imageImport.mimeType,
          fileSize: imageImport.fileSize
        },
        {
          provider: 'browser-file-import',
          generationRequest: {
            prompt: draftPrompt,
            sourceText: patch.sourceText ?? '',
            selector: patch.selector ?? '',
            region: parseFusionPatchRegionDraft(draftRegion) ?? patch.region
          }
        },
        {
          mutationOptions: {
            meta: {
              source: 'html-artboard-fusion-patch-panel'
            }
          }
        }
      )

      writeHtmlArtboardRuntimeDocument(
        editor,
        selectedShape,
        updatedDocument,
        'import-html-artboard-fusion-patch-image'
      )
      await refreshHtmlArtboardCanvasPreview(editor, selectedShape, updatedDocument)
      setPatchStatus('图片素材已导入，画布预览已刷新')
    } catch {
      setPatchStatus('导入失败：请选择 PNG / JPG / WebP')
    }
  }

  function updateRegionDraft(field, value) {
    setDraftRegion((region) => ({
      ...region,
      [field]: value
    }))
  }

  return (
    <li className="cowart-html-fusion-item">
      <div className="cowart-html-fusion-meta">
        <span>{patch.name}</span>
        <span>
          {formatFusionPatchStatus(patch.status)} · {formatFusionPatchProvider(patch.provider)} · {visible ? '显示' : '隐藏'}
        </span>
      </div>
      {patch.selector ? <code>{patch.selector}</code> : null}
      {patch.sourceText ? <code>源文字：{patch.sourceText}</code> : null}
      <code>{formatFusionPatchRegion(patch.region)}</code>
      {patch.patchAssetUrl ? (
        <div className="cowart-html-fusion-asset">
          <span>已有图像素材</span>
          <img alt="" src={patch.patchAssetUrl} />
        </div>
      ) : null}
      <label className="cowart-html-fusion-field">
        <span>名称</span>
        <input
          aria-label={`Fusion patch name ${patch.id}`}
          value={draftName}
          onChange={(event) => setDraftName(event.target.value)}
        />
      </label>
      <label className="cowart-html-fusion-field">
        <span>提示词</span>
        <textarea
          aria-label={`Fusion patch prompt ${patch.id}`}
          value={draftPrompt}
          onChange={(event) => setDraftPrompt(event.target.value)}
        />
      </label>
      <div className="cowart-html-fusion-region" aria-label={`融合图层区域 ${patch.id}`}>
        {['x', 'y', 'w', 'h'].map((field) => {
          const fieldLabel = field === 'w' ? '宽' : field === 'h' ? '高' : field.toUpperCase()

          return (
            <label key={field}>
              <span>{fieldLabel}</span>
              <input
                aria-label={`融合图层区域 ${fieldLabel} ${patch.id}`}
                min={field === 'w' || field === 'h' ? 1 : undefined}
                type="number"
                value={draftRegion[field]}
                onChange={(event) => updateRegionDraft(field, event.target.value)}
              />
            </label>
          )
        })}
      </div>
      <div className="cowart-html-fusion-actions">
        <button
          aria-label={`应用融合图层修改 ${patch.id}`}
          type="button"
          onClick={applyPatchChanges}
        >
          应用修改
        </button>
        <button
          aria-label={`${visible ? '隐藏' : '显示'}融合图层 ${patch.id}`}
          type="button"
          onClick={togglePatchVisibility}
        >
          {visible ? '隐藏' : '显示'}
        </button>
        <button
          aria-label={`删除融合图层 ${patch.id}`}
          type="button"
          onClick={deletePatch}
        >
          删除
        </button>
        <button
          aria-label={`生成模拟素材 ${patch.id}`}
          type="button"
          onClick={generateMockPatchAsset}
        >
          生成模拟素材
        </button>
        <button
          aria-label={`导入融合图层图片素材 ${patch.id}`}
          type="button"
          onClick={importPatchImageAsset}
        >
          导入图片素材
        </button>
        {patchStatus ? <span>{patchStatus}</span> : null}
      </div>
    </li>
  )
}

function CowartHtmlArtboardFusionPatches({ editor, runtimeDocument, selectedShape }) {
  const fusionPatches = Array.isArray(runtimeDocument.fusionPatches)
    ? runtimeDocument.fusionPatches
    : []
  const patchTargets = useMemo(
    () => extractHtmlArtboardPatchTargets(runtimeDocument),
    [runtimeDocument.html]
  )
  const [selectedTargetId, setSelectedTargetId] = useState('')

  useEffect(() => {
    setSelectedTargetId((currentTargetId) => {
      if (patchTargets.some((target) => target.id === currentTargetId)) {
        return currentTargetId
      }

      return patchTargets[0]?.id ?? ''
    })
  }, [patchTargets, selectedShape.id])

  const selectedTarget =
    patchTargets.find((target) => target.id === selectedTargetId) ?? patchTargets[0] ?? null

  function addMockFusionPatch() {
    const targetPatchOptions = selectedTarget
      ? {
          selector: selectedTarget.selector,
          sourceSelector: selectedTarget.selector,
          sourceText: selectedTarget.sourceText,
          name: selectedTarget.label || selectedTarget.dataNode,
          prompt: `为「${selectedTarget.sourceText || selectedTarget.dataNode}」生成一个融合图层`
        }
      : {}
    const updatedDocument = addFusionPatchPlaceholderToHtmlArtboard(
      runtimeDocument,
      targetPatchOptions
    )

    editor.markHistoryStoppingPoint('add-html-artboard-fusion-patch')
    editor.updateShapes([
      {
        id: selectedShape.id,
        type: selectedShape.type,
        meta: {
          ...selectedShape.meta,
          cowartHtmlArtboard: true,
          runtimeDocument: updatedDocument
        }
      }
    ])
  }

  return (
    <section className="cowart-html-fusion-patches" aria-label="HTML 画板融合图层">
      <div className="cowart-html-preview-heading">
        <span>融合图层</span>
        <span>共 {fusionPatches.length} 个</span>
      </div>
      <section className="cowart-html-patch-targets" aria-label="HTML 画板目标节点">
        <div className="cowart-html-preview-heading">
          <span>目标节点</span>
          <span>找到 {patchTargets.length} 个</span>
        </div>
        {patchTargets.length === 0 ? (
          <p className="cowart-html-patch-target-empty">
            没有找到 data-node 目标节点。
          </p>
        ) : (
          <>
            <label className="cowart-html-patch-target-select">
              <span>目标</span>
              <select
                value={selectedTarget?.id ?? ''}
                onChange={(event) => setSelectedTargetId(event.target.value)}
              >
                {patchTargets.map((target) => (
                  <option key={target.id} value={target.id}>
                    {target.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="cowart-html-patch-target-meta">
              <code>{selectedTarget?.selector}</code>
              <span>{selectedTarget?.sourceText || '没有源文字。'}</span>
            </div>
          </>
        )}
      </section>
      {fusionPatches.length === 0 ? (
        <p className="cowart-html-fusion-empty">还没有融合图层。</p>
      ) : (
        <ol className="cowart-html-fusion-list">
          {fusionPatches.map((patch) => (
            <CowartHtmlFusionPatchEditor
              key={patch.id}
              editor={editor}
              runtimeDocument={runtimeDocument}
              selectedShape={selectedShape}
              patch={patch}
            >
              <div className="cowart-html-fusion-meta">
                <span>{patch.name}</span>
                <span>
                  {formatFusionPatchStatus(patch.status)} · {formatFusionPatchProvider(patch.provider)} · {patch.visible === false ? '隐藏' : '显示'}
                </span>
              </div>
              <p>{patch.prompt}</p>
              {patch.selector ? <code>{patch.selector}</code> : null}
              {patch.sourceText ? <code>源文字：{patch.sourceText}</code> : null}
              <code>{formatFusionPatchRegion(patch.region)}</code>
            </CowartHtmlFusionPatchEditor>
          ))}
        </ol>
      )}
      <button className="cowart-html-fusion-add" onClick={addMockFusionPatch} type="button">
        添加模拟融合图层
      </button>
    </section>
  )
}

function CowartHtmlArtboardAiGenerationStatus() {
  return (
    <section className="cowart-html-ai-generation-status" aria-label="HTML 画板 AI 生成状态">
      <div className="cowart-html-preview-heading">
        <span>AI 生成</span>
      </div>
      <div className="cowart-html-ai-generation-status-list">
        <span>模拟生成可用</span>
        <span>真实生图通过 MCP / 外部工具完成</span>
        <span>浏览器端不读取 API Key</span>
      </div>
      <button className="cowart-html-ai-generation-button" disabled type="button">
        真实 AI 生成未启用
      </button>
    </section>
  )
}

function getExportDocumentWithName(runtimeDocument, exportName) {
  return {
    ...runtimeDocument,
    meta: {
      ...runtimeDocument.meta,
      exportName
    }
  }
}

function CowartHtmlArtboardExportControls({ runtimeDocument }) {
  const [exportStatus, setExportStatus] = useState('')
  const exportBundle = useMemo(
    () => createHtmlArtboardExportBundle(runtimeDocument),
    [runtimeDocument]
  )
  const exportItems = [
    {
      id: 'runtime-json',
      label: '运行时 JSON',
      copyLabel: '复制 JSON',
      downloadLabel: '下载 JSON',
      value: exportBundle.json,
      mimeType: 'application/json',
      fileName: createHtmlArtboardExportFileName(
        getExportDocumentWithName(runtimeDocument, 'html-artboard-runtime'),
        'json'
      )
    },
    {
      id: 'html',
      label: 'HTML',
      copyLabel: '复制 HTML',
      downloadLabel: '下载 HTML',
      value: exportBundle.html,
      mimeType: 'text/html',
      fileName: createHtmlArtboardExportFileName(
        getExportDocumentWithName(runtimeDocument, 'html-artboard-source'),
        'html'
      )
    },
    {
      id: 'css',
      label: 'CSS',
      copyLabel: '复制 CSS',
      downloadLabel: '下载 CSS',
      value: exportBundle.css,
      mimeType: 'text/css',
      fileName: createHtmlArtboardExportFileName(
        getExportDocumentWithName(runtimeDocument, 'html-artboard-styles'),
        'css'
      )
    },
    {
      id: 'standalone-html',
      label: '独立预览 HTML',
      copyLabel: '复制独立 HTML',
      downloadLabel: '下载独立 HTML',
      value: exportBundle.standaloneHtml,
      mimeType: 'text/html',
      fileName: createHtmlArtboardExportFileName(
        getExportDocumentWithName(runtimeDocument, 'html-artboard-standalone'),
        'html'
      )
    }
  ]

  useEffect(() => {
    setExportStatus('')
  }, [exportBundle.json, exportBundle.html, exportBundle.css, exportBundle.standaloneHtml])

  async function copyExportItem(item) {
    if (!navigator.clipboard?.writeText) {
      setExportStatus('复制失败')
      return
    }

    try {
      await navigator.clipboard.writeText(item.value)
      setExportStatus('已复制')
    } catch {
      setExportStatus('复制失败')
    }
  }

  function downloadExportItem(item) {
    if (!window.URL?.createObjectURL) {
      setExportStatus('下载失败')
      return
    }

    let objectUrl = ''
    try {
      const blob = new Blob([item.value], { type: `${item.mimeType};charset=utf-8` })
      objectUrl = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = item.fileName
      link.click()
      setExportStatus('已下载')
    } catch {
      setExportStatus('下载失败')
    } finally {
      if (objectUrl) {
        window.URL.revokeObjectURL(objectUrl)
      }
    }
  }

  return (
    <section className="cowart-html-export" aria-label="HTML 画板导出">
      <div className="cowart-html-preview-heading">
        <span>导出</span>
        {exportStatus ? <span>{exportStatus}</span> : null}
      </div>
      <p className="cowart-html-export-note">只导出当前 HTML 画板的运行时内容。</p>
      <div className="cowart-html-export-grid">
        {exportItems.map((item) => (
          <div key={item.id} className="cowart-html-export-row">
            <span>{item.label}</span>
            <button
              className="cowart-html-export-button"
              onClick={() => copyExportItem(item)}
              type="button"
            >
              {item.copyLabel}
            </button>
            <button
              className="cowart-html-export-button"
              onClick={() => downloadExportItem(item)}
              type="button"
            >
              {item.downloadLabel}
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}

function CowartAiImageStyleControls() {
  const editor = useEditor()
  const selectedAiImageShape = useValue(
    'selected ai image holder shape',
    () => {
      const selectedShapeIds = editor.getSelectedShapeIds()
      if (selectedShapeIds.length !== 1) return null

      const shape = editor.getShape(selectedShapeIds[0])
      return isAiImageHolderShape(shape) ? shape : null
    },
    [editor]
  )
  const [widthValue, setWidthValue] = useState('')
  const [heightValue, setHeightValue] = useState('')

  useEffect(() => {
    if (!selectedAiImageShape) {
      setWidthValue('')
      setHeightValue('')
      return
    }

    setWidthValue(formatAiImageSize(selectedAiImageShape.props.w))
    setHeightValue(formatAiImageSize(selectedAiImageShape.props.h))
  }, [selectedAiImageShape?.id, selectedAiImageShape?.props.w, selectedAiImageShape?.props.h])

  if (!selectedAiImageShape) return null

  const activePreset = getAiImageAspectPreset(selectedAiImageShape)
  const currentWidth = Number(selectedAiImageShape.props.w)
  const currentHeight = Number(selectedAiImageShape.props.h)
  const currentRatio = currentHeight ? currentWidth / currentHeight : 1
  const isAspectLocked = isAiImageAspectLocked(selectedAiImageShape)

  function updateAiImageSize(nextWidth, nextHeight, historyMark = 'resize-ai-image-holder') {
    const w = clampAiImageSize(nextWidth)
    const h = clampAiImageSize(nextHeight)
    if (!w || !h) return

    editor.markHistoryStoppingPoint(historyMark)
    editor.updateShapes([
      {
        id: selectedAiImageShape.id,
        type: 'frame',
        meta: {
          ...selectedAiImageShape.meta,
          cowartAiAspectRatio: w / h
        },
        props: { w, h }
      }
    ])
  }

  function toggleAspectLock() {
    const nextIsLocked = !isAspectLocked
    editor.markHistoryStoppingPoint('toggle-ai-image-aspect-lock')
    editor.updateShapes([
      {
        id: selectedAiImageShape.id,
        type: 'frame',
        meta: {
          ...selectedAiImageShape.meta,
          cowartAiAspectLocked: nextIsLocked,
          cowartAiAspectRatio: currentRatio
        }
      }
    ])
  }

  function commitWidth(value) {
    const nextWidth = clampAiImageSize(Number(value))
    if (!nextWidth) {
      setWidthValue(formatAiImageSize(currentWidth))
      return
    }

    const nextHeight = isAspectLocked ? Math.round(nextWidth / currentRatio) : currentHeight
    updateAiImageSize(nextWidth, nextHeight)
  }

  function commitHeight(value) {
    const nextHeight = clampAiImageSize(Number(value))
    if (!nextHeight) {
      setHeightValue(formatAiImageSize(currentHeight))
      return
    }

    const nextWidth = isAspectLocked ? Math.round(nextHeight * currentRatio) : currentWidth
    updateAiImageSize(nextWidth, nextHeight)
  }

  function handleNumberKeyDown(event) {
    if (event.key === 'Enter') {
      event.currentTarget.blur()
    }
    if (event.key === 'Escape') {
      setWidthValue(formatAiImageSize(currentWidth))
      setHeightValue(formatAiImageSize(currentHeight))
      event.currentTarget.blur()
    }
  }

  return (
    <div className="cowart-ai-image-style-panel" aria-label="AI 图片尺寸设置">
      <section className="cowart-ai-style-section">
        <div className="cowart-ai-style-heading">
          <span>尺寸</span>
        </div>
        <div className="cowart-ai-size-row">
          <label className="cowart-ai-size-field">
            <span>W</span>
            <input
              aria-label="AI 图片宽度"
              inputMode="numeric"
              min={AI_IMAGE_SIZE_MIN}
              max={AI_IMAGE_SIZE_MAX}
              value={widthValue}
              onChange={(event) => setWidthValue(event.target.value)}
              onBlur={(event) => commitWidth(event.target.value)}
              onKeyDown={handleNumberKeyDown}
            />
          </label>
          <button
            aria-label={isAspectLocked ? '解除宽高比例锁定' : '锁定宽高比例'}
            aria-pressed={isAspectLocked}
            className="cowart-ai-aspect-lock"
            onClick={toggleAspectLock}
            type="button"
          >
            <CowartAspectLockIcon locked={isAspectLocked} />
          </button>
          <label className="cowart-ai-size-field">
            <span>H</span>
            <input
              aria-label="AI 图片高度"
              inputMode="numeric"
              min={AI_IMAGE_SIZE_MIN}
              max={AI_IMAGE_SIZE_MAX}
              value={heightValue}
              onChange={(event) => setHeightValue(event.target.value)}
              onBlur={(event) => commitHeight(event.target.value)}
              onKeyDown={handleNumberKeyDown}
            />
          </label>
        </div>
      </section>

      <section className="cowart-ai-style-section">
        <div className="cowart-ai-style-heading">
          <span>比例</span>
        </div>
        <div className="cowart-ai-aspect-grid">
          {AI_IMAGE_ASPECT_PRESETS.map((preset) => (
            <button
              key={preset.id}
              aria-pressed={activePreset?.id === preset.id}
              className="cowart-ai-aspect-preset"
              onClick={() =>
                updateAiImageSize(preset.w, preset.h, `resize-ai-image-holder:${preset.id}`)
              }
              type="button"
            >
              <span
                className="cowart-ai-aspect-icon"
                style={getAspectIconStyle(preset)}
              />
              <span>{preset.label}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}

function CowartAspectLockIcon({ locked }) {
  if (locked) {
    return (
      <svg
        aria-hidden="true"
        className="cowart-ai-lock-icon"
        viewBox="0 0 20 20"
      >
        <rect x="4.5" y="8.5" width="11" height="8" rx="2" />
        <path d="M7 8.5V6a3 3 0 0 1 6 0v2.5" />
      </svg>
    )
  }

  return (
    <svg
      aria-hidden="true"
      className="cowart-ai-lock-icon"
      viewBox="0 0 20 20"
    >
      <rect x="4.5" y="8.5" width="11" height="8" rx="2" />
      <path d="M7 8.5V6.5a3 3 0 0 1 5.8-1.1" />
    </svg>
  )
}

function CowartToolbarItem({ toolId }) {
  const editor = useEditor()
  const isSelected = useValue(
    `is ${toolId} selected`,
    () => editor.getCurrentToolId() === toolId,
    [editor, toolId]
  )

  return <TldrawUiMenuToolItem toolId={toolId} isSelected={isSelected} />
}

function CowartAnnotationToolbarItem() {
  const editor = useEditor()
  const isSelected = useValue(
    'is annotation selected',
    () => editor.getCurrentToolId() === ANNOTATION_TOOL_ID,
    [editor]
  )

  return (
    <button
      aria-label={ANNOTATION_TOOL_LABEL}
      aria-pressed={isSelected ? 'true' : 'false'}
      className="tlui-button tlui-button__tool cowart-annotation-toolbar-button"
      data-testid={`tools.${ANNOTATION_TOOL_ID}`}
      data-value={ANNOTATION_TOOL_ID}
      draggable={false}
      onClick={() => {
        unlockGlobalToolLock(editor)
        editor.setCurrentTool(ANNOTATION_TOOL_ID)
      }}
      onTouchStart={(event) => {
        event.preventDefault()
        unlockGlobalToolLock(editor)
        editor.setCurrentTool(ANNOTATION_TOOL_ID)
      }}
      title={ANNOTATION_TOOL_LABEL}
      type="button"
    >
      {annotationToolIcon}
      <span className="cowart-annotation-toolbar-label" draggable={false}>
        {ANNOTATION_TOOL_LABEL}
      </span>
    </button>
  )
}

function CowartToolbarDivider() {
  return <div aria-orientation="vertical" className="cowart-toolbar-divider" role="separator" />
}

function CowartToolbar(props) {
  return (
    <DefaultToolbar {...props} maxItems={9}>
      <CowartAnnotationToolbarItem />
      <CowartToolbarDivider />
      <SelectToolbarItem />
      <HandToolbarItem />
      <CowartToolbarItem toolId={AI_IMAGE_TOOL_ID} />
      <CowartToolbarItem toolId={HTML_ARTBOARD_TOOL_ID} />
      <CowartToolbarDivider />
      <AssetToolbarItem />
      <DrawToolbarItem />
      <EraserToolbarItem />
      <TextToolbarItem />
      <ArrowToolbarItem />
      <NoteToolbarItem />
      <RectangleToolbarItem />
      <EllipseToolbarItem />
      <TriangleToolbarItem />
      <DiamondToolbarItem />
      <HexagonToolbarItem />
      <OvalToolbarItem />
      <RhombusToolbarItem />
      <StarToolbarItem />
      <CloudToolbarItem />
      <HeartToolbarItem />
      <XBoxToolbarItem />
      <CheckBoxToolbarItem />
      <ArrowLeftToolbarItem />
      <ArrowUpToolbarItem />
      <ArrowDownToolbarItem />
      <ArrowRightToolbarItem />
      <LineToolbarItem />
      <HighlightToolbarItem />
      <LaserToolbarItem />
      <FrameToolbarItem />
    </DefaultToolbar>
  )
}

function getCowartSelection(editor) {
  const selectedShapeIds = editor.getSelectedShapeIds()
  return selectedShapeIds.map((id) => {
    const selectedShape = editor.getShape(id)
    const resolvedHtmlArtboard = resolveHtmlArtboardSelection(editor, selectedShape)
    const shape = resolvedHtmlArtboard?.shape ?? selectedShape
    const asset = shape?.props?.assetId ? editor.getAsset(shape.props.assetId) : null
    return {
      id: shape?.id ?? id,
      type: shape?.type ?? null,
      parentId: shape?.parentId ?? null,
      x: shape?.x ?? null,
      y: shape?.y ?? null,
      rotation: shape?.rotation ?? null,
      meta: shape?.meta ?? null,
      isAiImageHolder: shape?.meta?.cowartAiImageHolder === true,
      props: shape?.props ?? null,
      asset: asset
        ? {
            id: asset.id,
            type: asset.type,
            name: asset.props?.name ?? null,
            src: asset.props?.src ?? null,
            w: asset.props?.w ?? null,
            h: asset.props?.h ?? null,
            mimeType: asset.props?.mimeType ?? null,
            fileSize: asset.props?.fileSize ?? null
          }
        : null
    }
  })
}

function getCowartSelectionSnapshot(editor) {
  return {
    selectedShapes: getCowartSelection(editor)
  }
}

function getCowartViewState(editor) {
  const camera = editor.getCamera()
  return {
    version: 1,
    currentPageId: editor.getCurrentPageId(),
    camera: {
      x: camera.x,
      y: camera.y,
      z: camera.z
    }
  }
}

function isRestorableViewState(viewState) {
  return (
    viewState &&
    typeof viewState === 'object' &&
    typeof viewState.currentPageId === 'string' &&
    viewState.camera &&
    Number.isFinite(viewState.camera.x) &&
    Number.isFinite(viewState.camera.y) &&
    Number.isFinite(viewState.camera.z)
  )
}

function restoreCowartViewState(editor, viewState) {
  if (!isRestorableViewState(viewState)) return
  if (!editor.getPage(viewState.currentPageId)) return

  editor.setCurrentPage(viewState.currentPageId)
  editor.setCamera(viewState.camera, { immediate: true, force: true })
}

function writeCowartSelectionState(selectionSnapshot) {
  let stateElement = document.getElementById(SELECTION_STATE_ELEMENT_ID)
  if (!stateElement) {
    stateElement = document.createElement('script')
    stateElement.id = SELECTION_STATE_ELEMENT_ID
    stateElement.type = 'application/json'
    document.body.append(stateElement)
  }

  stateElement.textContent = JSON.stringify({
    ...selectionSnapshot,
    updatedAt: new Date().toISOString()
  })
}

export default function App() {
  const [snapshot, setSnapshot] = useState()
  const [viewState, setViewState] = useState()
  const [loadError, setLoadError] = useState(null)
  const [skippedRecords, setSkippedRecords] = useState([])

  useEffect(() => {
    const controller = new AbortController()

    async function loadCanvas() {
      try {
        const [canvasResponse, viewStateResponse] = await Promise.all([
          fetch(CANVAS_ENDPOINT, { signal: controller.signal }),
          fetch(VIEW_STATE_ENDPOINT, { signal: controller.signal })
        ])
        if (!canvasResponse.ok) {
          throw new Error(`Failed to load canvas: ${canvasResponse.status} - ${canvasResponse.statusText}`)
        }
        if (!viewStateResponse.ok) {
          throw new Error(`Failed to load canvas view state: ${viewStateResponse.status} - ${viewStateResponse.statusText}`)
        }
        const [canvasData, viewStateData] = await Promise.all([
          canvasResponse.json(),
          viewStateResponse.json()
        ])
        const sanitized = sanitizeCanvasSnapshotForTldraw(canvasData.snapshot)
        setSnapshot(sanitized.snapshot)
        setSkippedRecords(sanitized.skippedRecords)
        setViewState(viewStateData.viewState ?? null)
      } catch (error) {
        if (error.name === 'AbortError') return
        setLoadError(error)
        setSnapshot(null)
        setViewState(null)
      }
    }

    loadCanvas()

    return () => controller.abort()
  }, [])

  const handleMount = useCallback((editor) => {
    window.__cowartEditor = editor
    window.__cowartSelection = () => getCowartSelection(editor)
    window.__cowartViewState = () => getCowartViewState(editor)
    let lastSyncedSelectionState = ''
    let isSelectionStateSaving = false
    let hasPendingSelectionState = false
    let lastSyncedViewState = ''
    let isViewStateSaving = false
    let hasPendingViewState = false

    editor.timers.requestAnimationFrame(() => {
      restoreCowartViewState(editor, viewState)
    })

    async function syncSelectionState() {
      const selectionSnapshot = getCowartSelectionSnapshot(editor)
      writeCowartSelectionState(selectionSnapshot)

      const selectionState = JSON.stringify(selectionSnapshot)
      if (selectionState === lastSyncedSelectionState) return
      lastSyncedSelectionState = selectionState

      if (isSelectionStateSaving) {
        hasPendingSelectionState = true
        return
      }

      isSelectionStateSaving = true
      try {
        const response = await fetch(SELECTION_ENDPOINT, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            ...selectionSnapshot,
            updatedAt: new Date().toISOString()
          })
        })
        if (!response.ok) {
          throw new Error(`Failed to save selection: ${response.status}`)
        }
      } catch (error) {
        console.error(error)
      } finally {
        isSelectionStateSaving = false
        if (hasPendingSelectionState) {
          hasPendingSelectionState = false
          syncSelectionState()
        }
      }
    }

    syncSelectionState()
    const selectionStateTimer = window.setInterval(syncSelectionState, 250)

    async function syncViewState() {
      const viewStateSnapshot = {
        ...getCowartViewState(editor),
        updatedAt: new Date().toISOString()
      }

      const nextViewState = JSON.stringify(viewStateSnapshot)
      if (nextViewState === lastSyncedViewState) return
      lastSyncedViewState = nextViewState

      if (isViewStateSaving) {
        hasPendingViewState = true
        return
      }

      isViewStateSaving = true
      try {
        const response = await fetch(VIEW_STATE_ENDPOINT, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: nextViewState
        })
        if (!response.ok) {
          throw new Error(`Failed to save view state: ${response.status}`)
        }
      } catch (error) {
        console.error(error)
      } finally {
        isViewStateSaving = false
        if (hasPendingViewState) {
          hasPendingViewState = false
          syncViewState()
        }
      }
    }

    const viewStateTimer = window.setInterval(syncViewState, 500)
    editor.timers.setTimeout(syncViewState, 100)

    let saveTimer = null
    let isSaving = false
    let hasPendingSave = false
    let hasUnsavedChanges = false
    let isSyncingAnnotationShape = false
    let remoteLoadController = null

    async function saveCanvas() {
      if (!hasUnsavedChanges) return

      if (isSaving) {
        hasPendingSave = true
        return
      }

      isSaving = true
      try {
        const body = JSON.stringify(editor.store.getStoreSnapshot())
        const response = await fetch(CANVAS_ENDPOINT, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body
        })
        if (!response.ok) {
          throw new Error(`Failed to save canvas: ${response.status}`)
        }
        hasUnsavedChanges = false
      } catch (error) {
        console.error(error)
      } finally {
        isSaving = false
        if (hasPendingSave) {
          hasPendingSave = false
          scheduleSave()
        }
      }
    }

    function scheduleSave() {
      hasUnsavedChanges = true
      window.clearTimeout(saveTimer)
      saveTimer = window.setTimeout(saveCanvas, 500)
    }

    async function loadRemoteCanvasSnapshot() {
      remoteLoadController?.abort()
      const controller = new AbortController()
      remoteLoadController = controller

      const preserveLocalChanges = hasUnsavedChanges || isSaving
      const preFetchStore = preserveLocalChanges ? null : editor.store.getStoreSnapshot().store

      try {
        const response = await fetch(CANVAS_ENDPOINT, { signal: controller.signal })
        if (!response.ok) {
          throw new Error(`Failed to refresh canvas: ${response.status}`)
        }

        const canvasData = await response.json()
        const effectivePreserve =
          preserveLocalChanges || (preFetchStore && storeChangedSinceSnapshot(editor, preFetchStore))
        const { changedRecords, skippedRecords: nextSkippedRecords } = applyRemoteCanvasSnapshot(
          editor,
          canvasData.snapshot,
          {
            preserveLocalChanges: effectivePreserve
          }
        )
        setSkippedRecords(nextSkippedRecords)

        if (changedRecords > 0 && effectivePreserve) {
          hasUnsavedChanges = true
          if (isSaving) {
            hasPendingSave = true
          } else {
            scheduleSave()
          }
        }
      } catch (error) {
        if (error.name === 'AbortError') return
        console.error(error)
      } finally {
        if (remoteLoadController === controller) {
          remoteLoadController = null
        }
      }
    }

    const unsubscribe = editor.store.listen(scheduleSave, {
      source: 'user',
      scope: 'document'
    })

    let canvasEvents = null
    if ('EventSource' in window) {
      canvasEvents = new EventSource(CANVAS_EVENTS_ENDPOINT)
      canvasEvents.addEventListener('canvas-changed', loadRemoteCanvasSnapshot)
      canvasEvents.onerror = (error) => {
        console.warn('Cowart canvas live refresh disconnected.', error)
      }
    }

    const unsubscribeAnnotationEditingToolLock = editor.store.listen(
      ({ changes }) => {
        for (const [previous, next] of Object.values(changes.updated)) {
          if (previous?.typeName !== 'instance_page_state') continue
          if (!previous.editingShapeId || next.editingShapeId) continue

          const shape = editor.getShape(previous.editingShapeId)
          if (shape?.meta?.cowartAnnotationArrow !== true) continue

          editor.timers.requestAnimationFrame(() => {
            if (editor.getEditingShapeId()) return
            if (editor.getCurrentToolId() !== 'select') return
            editor.setCurrentTool(ANNOTATION_TOOL_ID)
          })
        }
      },
      {
        source: 'all',
        scope: 'session'
      }
    )

    const unsubscribeAnnotationShapeSync = editor.store.listen(
      ({ changes }) => {
        if (isSyncingAnnotationShape) return

        const updates = []
        for (const [_previous, next] of Object.values(changes.updated)) {
          if (next?.typeName !== 'shape') continue
          if (next.type !== 'arrow') continue
          if (next.meta?.cowartAnnotationArrow !== true) continue

          const props = {}
          if (next.props?.color !== next.props?.labelColor) {
            props.labelColor = next.props.color
          }
          if (next.props?.labelPosition !== ANNOTATION_LABEL_POSITION) {
            props.labelPosition = ANNOTATION_LABEL_POSITION
          }

          if (Object.keys(props).length === 0) continue

          updates.push({
            id: next.id,
            type: 'arrow',
            props
          })
        }

        if (updates.length === 0) return

        isSyncingAnnotationShape = true
        try {
          editor.updateShapes(updates)
        } finally {
          isSyncingAnnotationShape = false
        }
      },
      {
        source: 'all',
        scope: 'document'
      }
    )

    return () => {
      window.clearTimeout(saveTimer)
      window.clearInterval(selectionStateTimer)
      window.clearInterval(viewStateTimer)
      remoteLoadController?.abort()
      canvasEvents?.close()
      if (window.__cowartEditor === editor) {
        delete window.__cowartEditor
        delete window.__cowartSelection
        delete window.__cowartViewState
      }
      document.getElementById(SELECTION_STATE_ELEMENT_ID)?.remove()
      unsubscribe()
      unsubscribeAnnotationEditingToolLock()
      unsubscribeAnnotationShapeSync()
      syncViewState()
      saveCanvas()
    }
  }, [viewState])

  if (snapshot === undefined || viewState === undefined) {
    return (
      <main className="cowart-status" aria-live="polite">
        Loading canvas...
      </main>
    )
  }

  if (loadError) {
    return (
      <main className="cowart-status" aria-live="polite">
        Canvas file could not be loaded.
      </main>
    )
  }

  return (
    <main className="cowart-canvas" aria-label="Cowart infinite canvas">
      <SkippedRecordsNotice records={skippedRecords} />
      <Tldraw
        snapshot={snapshot ?? undefined}
        inferDarkMode
        onMount={handleMount}
        overrides={cowartUiOverrides}
        components={cowartComponents}
        shapeUtils={cowartShapeUtils}
        tools={[CowartAnnotationTool]}
      />
    </main>
  )
}

function SkippedRecordsNotice({ records }) {
  if (!records.length) return null

  return (
    <aside className="cowart-skipped-records" aria-live="polite">
      <strong>Skipped {records.length} invalid canvas record{records.length === 1 ? '' : 's'}.</strong>
      <span>Valid content was loaded.</span>
      <details>
        <summary>Details</summary>
        <ul>
          {records.slice(0, 8).map((record, index) => (
            <li key={`${record.id}:${index}`}>
              <code>{record.id}</code>
              {record.typeName ? ` ${record.typeName}` : ''}
              {record.type ? `/${record.type}` : ''}: {record.reason}
            </li>
          ))}
        </ul>
      </details>
    </aside>
  )
}
