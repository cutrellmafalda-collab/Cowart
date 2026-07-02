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
import {
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
import {
  createHtmlArtboardThumbnailAltText,
  createHtmlArtboardThumbnailDataUrl
} from './html-runtime/htmlArtboardThumbnail.js'
import {
  compareHtmlArtboardPreviewFreshness,
  createHtmlArtboardPreviewMeta,
  getHtmlArtboardPreviewMeta,
  isHtmlArtboardPreviewShapeForArtboard,
  summarizeHtmlArtboardPreviewFreshness
} from './html-runtime/htmlArtboardPreviewFreshness.js'

const CANVAS_ENDPOINT = '/api/canvas'
const CANVAS_EVENTS_ENDPOINT = '/api/canvas-events'
const SELECTION_ENDPOINT = '/api/selection'
const VIEW_STATE_ENDPOINT = '/api/view-state'
const SELECTION_STATE_ELEMENT_ID = 'cowart-selection-state'
const AI_IMAGE_TOOL_ID = 'ai-image'
const HTML_ARTBOARD_TOOL_ID = 'html-artboard'
const HTML_ARTBOARD_TOOL_LABEL = 'HTML Artboard'
const HTML_ARTBOARD_PREVIEW_VERSION = 1
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

function createHtmlArtboardAtViewportCenter(editor) {
  const document = createHtmlArtboardDocument()
  const shapeId = createShapeId()
  const center = editor.getViewportPageBounds().center
  const x = center.x - document.width / 2
  const y = center.y - document.height / 2
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
    props: bridgeShape.props,
    meta: bridgeShape.meta
  })
  editor.select(shapeId)
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

function createHtmlArtboardCanvasPreviewMeta(selectedShape, runtimeDocument) {
  return {
    cowartHtmlArtboardPreviewVersion: HTML_ARTBOARD_PREVIEW_VERSION,
    ...createHtmlArtboardPreviewMeta(runtimeDocument, {
      sourceHtmlArtboardShapeId: selectedShape.id
    })
  }
}

function refreshHtmlArtboardCanvasPreview(editor, selectedShape, runtimeDocument) {
  const size = getHtmlArtboardPreviewSize(runtimeDocument, selectedShape)
  const thumbnailDocument = {
    ...runtimeDocument,
    width: size.w,
    height: size.h
  }
  const dataUrl = createHtmlArtboardThumbnailDataUrl(thumbnailDocument)
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
      name: `${HTML_ARTBOARD_TOOL_LABEL} Preview.svg`,
      src: dataUrl,
      w: size.w,
      h: size.h,
      fileSize: dataUrl.length,
      mimeType: 'image/svg+xml',
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
      const runtimeDocument = cowartShapeToHtmlArtboard(shape)
      return runtimeDocument ? { runtimeDocument, shape } : null
    },
    [editor]
  )

  if (!selectedHtmlArtboard) return null

  const { runtimeDocument, shape } = selectedHtmlArtboard
  const srcDoc = createHtmlArtboardPreviewSrcDoc(runtimeDocument)
  const sourceSnapshot = createHtmlArtboardSourceSnapshot(runtimeDocument)

  return (
    <div className="cowart-html-artboard-preview-panel" aria-label="HTML Artboard preview">
      <section className="cowart-html-preview-section">
        <div className="cowart-html-preview-heading">
          <span>HTML Artboard</span>
          <span>
            {runtimeDocument.width} × {runtimeDocument.height}
          </span>
        </div>
        <iframe
          className="cowart-html-preview-frame"
          sandbox=""
          srcDoc={srcDoc}
          title="HTML Artboard preview"
        />
      </section>
      <CowartHtmlArtboardCanvasPreviewControls
        editor={editor}
        runtimeDocument={runtimeDocument}
        selectedShape={shape}
      />
      <CowartHtmlArtboardSourceControls sourceSnapshot={sourceSnapshot} />
      <CowartHtmlArtboardEditorControls
        editor={editor}
        runtimeDocument={runtimeDocument}
        selectedShape={shape}
      />
      <CowartHtmlArtboardMutationLog runtimeDocument={runtimeDocument} />
      <CowartHtmlArtboardFusionPatches
        editor={editor}
        runtimeDocument={runtimeDocument}
        selectedShape={shape}
      />
      <CowartHtmlArtboardExportControls runtimeDocument={runtimeDocument} />
    </div>
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
  const freshnessSummary = summarizeHtmlArtboardPreviewFreshness(freshness)
  const freshnessNote = freshness.isMissing
    ? 'Create a canvas preview thumbnail.'
    : freshness.isStale
      ? 'Refresh Canvas Preview to update the canvas thumbnail.'
      : ''

  useEffect(() => {
    setPreviewStatus('')
  }, [selectedShape.id, runtimeDocument.html, runtimeDocument.css])

  function refreshCanvasPreview() {
    try {
      refreshHtmlArtboardCanvasPreview(editor, selectedShape, runtimeDocument)
      setPreviewStatus('Canvas preview refreshed')
    } catch {
      setPreviewStatus('Refresh failed')
    }
  }

  return (
    <section className="cowart-html-canvas-preview" aria-label="HTML Artboard canvas preview">
      <div className="cowart-html-preview-heading">
        <span>Canvas Preview</span>
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
          Refresh Canvas Preview
        </button>
        {previewStatus ? (
          <span className="cowart-html-canvas-preview-status">{previewStatus}</span>
        ) : null}
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
      setCopyStatus((status) => ({ ...status, [kind]: 'Copy failed' }))
      return
    }

    try {
      await navigator.clipboard.writeText(value)
      setCopyStatus((status) => ({ ...status, [kind]: 'Copied' }))
    } catch {
      setCopyStatus((status) => ({ ...status, [kind]: 'Copy failed' }))
    }
  }

  return (
    <section className="cowart-html-artboard-source" aria-label="HTML Artboard source">
      <div className="cowart-html-preview-heading">
        <span>Source</span>
      </div>
      <CowartHtmlSourceSection
        copyLabel="Copy HTML"
        copyStatus={copyStatus.html}
        label="HTML"
        onCopy={() => copySource('html', sourceSnapshot.html)}
        value={sourceSnapshot.html}
      />
      <CowartHtmlSourceSection
        copyLabel="Copy CSS"
        copyStatus={copyStatus.css}
        label="CSS"
        onCopy={() => copySource('css', sourceSnapshot.css)}
        value={sourceSnapshot.css}
      />
      <CowartHtmlSourceSection
        copyLabel="Copy JSON"
        copyStatus={copyStatus.json}
        isJson
        label="Runtime JSON"
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
        aria-label={`${label} source`}
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
  const statusText = hasUnsavedChanges ? 'Unsaved changes' : saveStatus

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
      setSaveStatus('Saved')
    } catch {
      setSaveStatus('Save failed')
    }
  }

  function resetHtmlArtboardDraft() {
    setDraftHtml(runtimeDocument.html)
    setDraftCss(runtimeDocument.css)
    setSaveStatus('')
  }

  return (
    <section className="cowart-html-artboard-editor" aria-label="HTML Artboard source editor">
      <div className="cowart-html-preview-heading">
        <span>Edit Source</span>
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
          Save Changes
        </button>
        <button
          className="cowart-html-editor-reset"
          disabled={!hasUnsavedChanges}
          onClick={resetHtmlArtboardDraft}
          type="button"
        >
          Reset
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
    <section className="cowart-html-mutation-log" aria-label="HTML Artboard mutation log">
      <div className="cowart-html-preview-heading">
        <span>Mutation Log</span>
        <span>Total: {mutationLog.length}</span>
      </div>
      {recentMutations.length === 0 ? (
        <p className="cowart-html-mutation-empty">No mutations yet.</p>
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
  if (!region || typeof region !== 'object') return 'Region: none'

  return `Region: x ${region.x}, y ${region.y}, w ${region.w}, h ${region.h}`
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
      setPatchStatus('No patch changes')
      return
    }

    writeHtmlArtboardRuntimeDocument(editor, selectedShape, updatedDocument, historyLabel)
    setPatchStatus(successMessage)
  }

  function applyPatchChanges() {
    const nextRegion = parseFusionPatchRegionDraft(draftRegion)
    if (!nextRegion) {
      setPatchStatus('Invalid region')
      return
    }

    const updatedDocument = updateFusionPatchInHtmlArtboard(runtimeDocument, patch.id, {
      name: draftName,
      prompt: draftPrompt,
      region: nextRegion
    })
    updatePatchDocument(updatedDocument, 'update-html-artboard-fusion-patch', 'Patch updated')
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
      visible ? 'Patch hidden' : 'Patch shown'
    )
  }

  function deletePatch() {
    const updatedDocument = deleteFusionPatchFromHtmlArtboard(runtimeDocument, patch.id)
    updatePatchDocument(updatedDocument, 'delete-html-artboard-fusion-patch', 'Patch deleted')
  }

  function generateMockPatchAsset() {
    const updatedDocument = generateMockFusionPatchAssetForHtmlArtboard(
      runtimeDocument,
      patch.id
    )
    updatePatchDocument(
      updatedDocument,
      'generate-html-artboard-mock-fusion-patch-asset',
      'Mock asset generated'
    )
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
          {patch.status} 路 {patch.provider} 路 {visible ? 'Visible' : 'Hidden'}
        </span>
      </div>
      {patch.selector ? <code>{patch.selector}</code> : null}
      {patch.sourceText ? <code>Source: {patch.sourceText}</code> : null}
      <code>{formatFusionPatchRegion(patch.region)}</code>
      {patch.patchAssetUrl ? (
        <div className="cowart-html-fusion-asset">
          <span>Mock asset generated</span>
          <img alt="" src={patch.patchAssetUrl} />
        </div>
      ) : null}
      <label className="cowart-html-fusion-field">
        <span>Name</span>
        <input
          aria-label={`Fusion patch name ${patch.id}`}
          value={draftName}
          onChange={(event) => setDraftName(event.target.value)}
        />
      </label>
      <label className="cowart-html-fusion-field">
        <span>Prompt</span>
        <textarea
          aria-label={`Fusion patch prompt ${patch.id}`}
          value={draftPrompt}
          onChange={(event) => setDraftPrompt(event.target.value)}
        />
      </label>
      <div className="cowart-html-fusion-region" aria-label={`Fusion patch region ${patch.id}`}>
        {['x', 'y', 'w', 'h'].map((field) => (
          <label key={field}>
            <span>{field}</span>
            <input
              aria-label={`Fusion patch region ${field} ${patch.id}`}
              min={field === 'w' || field === 'h' ? 1 : undefined}
              type="number"
              value={draftRegion[field]}
              onChange={(event) => updateRegionDraft(field, event.target.value)}
            />
          </label>
        ))}
      </div>
      <div className="cowart-html-fusion-actions">
        <button
          aria-label={`Apply Fusion Patch Changes ${patch.id}`}
          type="button"
          onClick={applyPatchChanges}
        >
          Apply Patch Changes
        </button>
        <button
          aria-label={`${visible ? 'Hide' : 'Show'} Fusion Patch ${patch.id}`}
          type="button"
          onClick={togglePatchVisibility}
        >
          {visible ? 'Hide' : 'Show'}
        </button>
        <button
          aria-label={`Delete Fusion Patch ${patch.id}`}
          type="button"
          onClick={deletePatch}
        >
          Delete
        </button>
        <button
          aria-label={`Generate Mock Patch Asset ${patch.id}`}
          type="button"
          onClick={generateMockPatchAsset}
        >
          Generate Mock Patch Asset
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
          prompt: `Mock fusion patch for ${selectedTarget.sourceText || selectedTarget.dataNode}`
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
    <section className="cowart-html-fusion-patches" aria-label="HTML Artboard fusion patches">
      <div className="cowart-html-preview-heading">
        <span>Fusion Patches</span>
        <span>Total: {fusionPatches.length}</span>
      </div>
      <section className="cowart-html-patch-targets" aria-label="HTML Artboard patch targets">
        <div className="cowart-html-preview-heading">
          <span>Patch Targets</span>
          <span>{patchTargets.length} found</span>
        </div>
        {patchTargets.length === 0 ? (
          <p className="cowart-html-patch-target-empty">
            No data-node patch targets found.
          </p>
        ) : (
          <>
            <label className="cowart-html-patch-target-select">
              <span>Target</span>
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
              <span>{selectedTarget?.sourceText || 'No source text.'}</span>
            </div>
          </>
        )}
      </section>
      <CowartHtmlArtboardAiGenerationStatus />
      {fusionPatches.length === 0 ? (
        <p className="cowart-html-fusion-empty">No fusion patches yet.</p>
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
                  {patch.status} · {patch.provider} · {patch.visible === false ? 'Hidden' : 'Visible'}
                </span>
              </div>
              <p>{patch.prompt}</p>
              {patch.selector ? <code>{patch.selector}</code> : null}
              {patch.sourceText ? <code>Source: {patch.sourceText}</code> : null}
              <code>{formatFusionPatchRegion(patch.region)}</code>
            </CowartHtmlFusionPatchEditor>
          ))}
        </ol>
      )}
      <button className="cowart-html-fusion-add" onClick={addMockFusionPatch} type="button">
        Add Mock Fusion Patch
      </button>
    </section>
  )
}

function CowartHtmlArtboardAiGenerationStatus() {
  return (
    <section className="cowart-html-ai-generation-status" aria-label="HTML Artboard AI generation status">
      <div className="cowart-html-preview-heading">
        <span>AI Generation</span>
      </div>
      <div className="cowart-html-ai-generation-status-list">
        <span>Mock provider available</span>
        <span>Real provider requires MCP/server-side configuration</span>
        <span>No browser-side API key</span>
      </div>
      <button className="cowart-html-ai-generation-button" disabled type="button">
        Generate AI Patch
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
      label: 'Runtime JSON',
      copyLabel: 'Copy Runtime JSON',
      downloadLabel: 'Download Runtime JSON',
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
      copyLabel: 'Copy HTML',
      downloadLabel: 'Download HTML',
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
      copyLabel: 'Copy CSS',
      downloadLabel: 'Download CSS',
      value: exportBundle.css,
      mimeType: 'text/css',
      fileName: createHtmlArtboardExportFileName(
        getExportDocumentWithName(runtimeDocument, 'html-artboard-styles'),
        'css'
      )
    },
    {
      id: 'standalone-html',
      label: 'Standalone HTML',
      copyLabel: 'Copy Standalone HTML',
      downloadLabel: 'Download Standalone HTML',
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
      setExportStatus('Copy failed')
      return
    }

    try {
      await navigator.clipboard.writeText(item.value)
      setExportStatus('Copied')
    } catch {
      setExportStatus('Copy failed')
    }
  }

  function downloadExportItem(item) {
    if (!window.URL?.createObjectURL) {
      setExportStatus('Download failed')
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
      setExportStatus('Downloaded')
    } catch {
      setExportStatus('Download failed')
    } finally {
      if (objectUrl) {
        window.URL.revokeObjectURL(objectUrl)
      }
    }
  }

  return (
    <section className="cowart-html-export" aria-label="HTML Artboard export">
      <div className="cowart-html-preview-heading">
        <span>Export</span>
        {exportStatus ? <span>{exportStatus}</span> : null}
      </div>
      <p className="cowart-html-export-note">Exports runtime document content only.</p>
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
    const shape = editor.getShape(id)
    const asset = shape?.props?.assetId ? editor.getAsset(shape.props.assetId) : null
    return {
      id,
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
