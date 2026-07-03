import assert from 'node:assert/strict'

import {
  cloneHtmlArtboardDocument,
  createHtmlArtboardDocument,
  ensureHtmlArtboardDocument
} from '../src/html-runtime/htmlCanvasDocument.js'
import {
  createHtmlArtboardDocumentPath,
  createHtmlArtboardDocumentRef,
  createHtmlArtboardMetaWithDocumentRef,
  estimateHtmlArtboardDocumentSize,
  hydrateHtmlArtboardShapeWithRuntimeDocument,
  isHtmlArtboardDocumentRef,
  sanitizeHtmlArtboardDocumentId,
  shouldExternalizeHtmlArtboardDocument,
  splitHtmlArtboardRuntimeDocumentFromShape
} from '../src/html-runtime/htmlArtboardDocumentRef.js'
import {
  cowartShapeToHtmlArtboard,
  htmlArtboardToCowartShape,
  isCowartHtmlArtboardShape
} from '../src/html-runtime/cowartHtmlBridge.js'
import { updateHtmlArtboardSource } from '../src/html-runtime/htmlArtboardEditing.js'
import {
  deleteFusionPatchFromHtmlArtboard,
  renameFusionPatchInHtmlArtboard,
  setFusionPatchVisibilityInHtmlArtboard,
  updateFusionPatchInHtmlArtboard,
  updateFusionPatchRegionInHtmlArtboard
} from '../src/html-runtime/htmlArtboardFusionPatchEditing.js'
import { addFusionPatchPlaceholderToHtmlArtboard } from '../src/html-runtime/htmlArtboardFusionPatches.js'
import {
  createMockFusionPatchAsset,
  generateMockFusionPatchAssetForHtmlArtboard,
  generateMockFusionPatchAssetsForHtmlArtboard
} from '../src/html-runtime/htmlArtboardMockFusionPatchAsset.js'
import {
  createHtmlArtboardAiProviderRequest,
  createHtmlArtboardAiProviderResult,
  createMockHtmlArtboardAiProvider,
  generateHtmlArtboardFusionPatchAssetWithProvider,
  getDefaultHtmlArtboardAiProvider,
  validateHtmlArtboardAiProviderRequest,
  validateHtmlArtboardAiProviderResult
} from '../src/html-runtime/htmlArtboardAiProvider.js'
import {
  attachExternalBackgroundImageToHtmlArtboard,
  getHtmlArtboardBackgroundAssetUrl
} from '../src/html-runtime/htmlArtboardBackground.js'
import {
  createSelectorForDataNode,
  extractHtmlArtboardPatchTargets
} from '../src/html-runtime/htmlArtboardPatchTargets.js'
import {
  appendHtmlArtboardMutations,
  createHtmlArtboardMutation,
  createSourceUpdateMutations
} from '../src/html-runtime/htmlArtboardMutations.js'
import {
  applyHtmlArtboardMutation,
  createReplayBaseDocument,
  replayHtmlArtboardMutationLog,
  replayHtmlArtboardMutations
} from '../src/html-runtime/htmlArtboardReplay.js'
import { createHtmlArtboardPreviewSrcDoc } from '../src/html-runtime/htmlArtboardPreview.js'
import {
  createHtmlArtboardExportBundle,
  createHtmlArtboardExportFileName,
  createHtmlArtboardStandaloneHtml
} from '../src/html-runtime/htmlArtboardExport.js'
import { createHtmlArtboardSourceSnapshot } from '../src/html-runtime/htmlArtboardSource.js'
import {
  cloneFusionPatch,
  createFusionPatchPlaceholder,
  ensureFusionPatch,
  normalizeFusionPatches
} from '../src/html-runtime/fusionPatch.js'
import {
  createRenderFingerprint,
  validateRenderFingerprint,
  withRenderFingerprint
} from '../src/html-runtime/renderFingerprint.js'
import {
  createHtmlArtboardCanvasThumbnailDataUrl,
  createHtmlArtboardFusionPatchOverlaySvg,
  createHtmlArtboardThumbnailAltText,
  createHtmlArtboardThumbnailDataUrl,
  createHtmlArtboardThumbnailSvg
} from '../src/html-runtime/htmlArtboardThumbnail.js'
import {
  compareHtmlArtboardPreviewFreshness,
  createHtmlArtboardPreviewMeta,
  getHtmlArtboardPreviewMeta,
  isHtmlArtboardPreviewShapeForArtboard,
  summarizeHtmlArtboardPreviewFreshness
} from '../src/html-runtime/htmlArtboardPreviewFreshness.js'
import {
  applyHtmlArtboardTextLayersToHtml,
  createHtmlArtboardTextLayersFromDocument,
  normalizeHtmlArtboardTextLayers,
  updateHtmlArtboardTextLayers
} from '../src/html-runtime/htmlArtboardTextLayers.js'

const forbiddenUiFields = ['zoom', 'activeTab', 'selectedSelector', 'workspace']

function assertNoUiFields(document) {
  for (const field of forbiddenUiFields) {
    assert.equal(Object.hasOwn(document, field), false)
  }
}

function test(name, run) {
  run()
  console.log(`ok - ${name}`)
}

test('createHtmlArtboardDocument returns required schema fields', () => {
  const document = createHtmlArtboardDocument()
  const requiredFields = [
    'id',
    'type',
    'version',
    'width',
    'height',
    'background',
    'html',
    'css',
    'textLayers',
    'fusionPatches',
    'assets',
    'history',
    'mutationLog',
    'executionGraph',
    'renderFingerprint',
    'meta'
  ]

  for (const field of requiredFields) {
    assert.equal(Object.hasOwn(document, field), true)
  }

  assert.equal(document.type, 'cowart-html-artboard')
  assert.equal(document.version, 1)
  assert.equal(document.width, 720)
  assert.equal(document.height, 1280)
  assert.equal(Array.isArray(document.textLayers), true)
  assert.equal(document.meta.provider, 'mock')
  assert.equal(document.executionGraph, null)
  assert.equal(document.renderFingerprint, null)
})

test('ensureHtmlArtboardDocument fills missing fields', () => {
  const document = ensureHtmlArtboardDocument({ id: 'artboard:existing' })

  assert.equal(document.id, 'artboard:existing')
  assert.equal(document.type, 'cowart-html-artboard')
  assert.equal(document.version, 1)
  assert.equal(document.width, 720)
  assert.equal(document.height, 1280)
  assert.equal(Array.isArray(document.assets), true)
  assert.equal(Array.isArray(document.textLayers), true)
  assert.equal(Array.isArray(document.history), true)
  assert.equal(Array.isArray(document.mutationLog), true)
})

test('ensureHtmlArtboardDocument preserves existing html/css/fusionPatches', () => {
  const fusionPatches = [
    {
      id: 'patch:headline',
      target: 'h1',
      operation: 'replaceText',
      value: 'Existing headline'
    }
  ]
  const document = ensureHtmlArtboardDocument({
    html: '<section><h1>Existing</h1></section>',
    css: 'h1 { color: red; }',
    fusionPatches
  })

  assert.equal(document.html, '<section><h1>Existing</h1></section>')
  assert.equal(document.css, 'h1 { color: red; }')
  assert.equal(document.fusionPatches.length, 1)
  assert.equal(document.fusionPatches[0].id, 'patch:headline')
  assert.equal(document.fusionPatches[0].type, 'fusion-patch')
  assert.equal(document.fusionPatches[0].target, 'h1')
  assert.equal(document.fusionPatches[0].operation, 'replaceText')
  assert.equal(document.fusionPatches[0].value, 'Existing headline')
  assert.notEqual(document.fusionPatches, fusionPatches)
  assert.notEqual(document.fusionPatches[0], fusionPatches[0])
})

test('cloneHtmlArtboardDocument performs deep clone', () => {
  const original = createHtmlArtboardDocument({
    fusionPatches: [{ id: 'patch:1', edits: [{ selector: 'p', value: 'First' }] }],
    assets: [{ id: 'asset:1', meta: { label: 'Original' } }]
  })
  const cloned = cloneHtmlArtboardDocument(original)

  cloned.fusionPatches[0].edits[0].value = 'Changed'
  cloned.assets[0].meta.label = 'Changed'

  assert.equal(original.fusionPatches[0].edits[0].value, 'First')
  assert.equal(original.assets[0].meta.label, 'Original')
})

test('runtime document does not include UI fields', () => {
  const document = ensureHtmlArtboardDocument({
    zoom: 1.25,
    activeTab: 'source',
    selectedSelector: 'h1',
    workspace: { panel: 'left' }
  })
  const cloned = cloneHtmlArtboardDocument({
    id: 'artboard:ui-state',
    zoom: 2,
    activeTab: 'preview',
    selectedSelector: 'p',
    workspace: { panel: 'right' }
  })

  assertNoUiFields(document)
  assertNoUiFields(cloned)
})

test('createHtmlArtboardDocumentRef returns kind html-artboard-document-ref', () => {
  const ref = createHtmlArtboardDocumentRef({ id: 'artboard:ref-kind' })

  assert.equal(ref.kind, 'html-artboard-document-ref')
  assert.equal(ref.version, 1)
})

test('createHtmlArtboardDocumentRef uses document id', () => {
  const ref = createHtmlArtboardDocumentRef({ id: 'artboard:document-ref-id' })

  assert.equal(ref.documentId, 'artboard-document-ref-id')
})

test('createHtmlArtboardDocumentRef sanitizes document id', () => {
  const ref = createHtmlArtboardDocumentRef({ id: 'html artboard/unsafe:id' })

  assert.equal(ref.documentId, 'html-artboard-unsafe-id')
})

test('createHtmlArtboardDocumentRef creates path', () => {
  const ref = createHtmlArtboardDocumentRef(
    { id: 'html-artboard:path-test' },
    { pageId: 'page:one' }
  )

  assert.equal(ref.path, 'pages/page-one/html-artboards/html-artboard-path-test.json')
})

test('createHtmlArtboardDocumentRef does not mutate input', () => {
  const document = createHtmlArtboardDocument({ id: 'html-artboard:immutable-ref' })
  const before = JSON.stringify(document)

  createHtmlArtboardDocumentRef(document, { pageId: 'page:immutable' })

  assert.equal(JSON.stringify(document), before)
})

test('isHtmlArtboardDocumentRef detects valid ref', () => {
  const ref = createHtmlArtboardDocumentRef({ id: 'html-artboard:valid-ref' })

  assert.equal(isHtmlArtboardDocumentRef(ref), true)
})

test('isHtmlArtboardDocumentRef rejects invalid value', () => {
  assert.equal(isHtmlArtboardDocumentRef({ kind: 'other-ref' }), false)
  assert.equal(isHtmlArtboardDocumentRef(null), false)
})

test('estimateHtmlArtboardDocumentSize returns number', () => {
  const size = estimateHtmlArtboardDocumentSize(createHtmlArtboardDocument())

  assert.equal(typeof size, 'number')
  assert.equal(size > 0, true)
})

test('shouldExternalizeHtmlArtboardDocument false for small document', () => {
  const document = createHtmlArtboardDocument({ html: '<section>Small</section>' })

  assert.equal(shouldExternalizeHtmlArtboardDocument(document, { maxInlineBytes: 100000 }), false)
})

test('shouldExternalizeHtmlArtboardDocument true when maxInlineBytes is small', () => {
  const document = createHtmlArtboardDocument({ html: '<section>Large enough</section>' })

  assert.equal(shouldExternalizeHtmlArtboardDocument(document, { maxInlineBytes: 1 }), true)
})

test('createHtmlArtboardMetaWithDocumentRef adds runtimeDocumentRef', () => {
  const ref = createHtmlArtboardDocumentRef({ id: 'html-artboard:meta-ref' })
  const meta = createHtmlArtboardMetaWithDocumentRef({ cowartHtmlArtboard: true }, ref)

  assert.equal(meta.runtimeDocumentRef.documentId, 'html-artboard-meta-ref')
})

test('createHtmlArtboardMetaWithDocumentRef preserves cowartHtmlArtboard', () => {
  const meta = createHtmlArtboardMetaWithDocumentRef(
    { cowartHtmlArtboard: true },
    createHtmlArtboardDocumentRef({ id: 'html-artboard:meta-preserve' })
  )

  assert.equal(meta.cowartHtmlArtboard, true)
})

test('createHtmlArtboardMetaWithDocumentRef preserves runtimeDocument by default', () => {
  const runtimeDocument = createHtmlArtboardDocument({ id: 'html-artboard:inline-default' })
  const meta = createHtmlArtboardMetaWithDocumentRef(
    { cowartHtmlArtboard: true, runtimeDocument },
    createHtmlArtboardDocumentRef(runtimeDocument)
  )

  assert.equal(meta.runtimeDocument.id, runtimeDocument.id)
})

test('createHtmlArtboardMetaWithDocumentRef removes runtimeDocument when keepInlineDocument false', () => {
  const runtimeDocument = createHtmlArtboardDocument({ id: 'html-artboard:inline-remove' })
  const meta = createHtmlArtboardMetaWithDocumentRef(
    { cowartHtmlArtboard: true, runtimeDocument },
    createHtmlArtboardDocumentRef(runtimeDocument),
    { keepInlineDocument: false }
  )

  assert.equal(Object.hasOwn(meta, 'runtimeDocument'), false)
})

test('createHtmlArtboardMetaWithDocumentRef does not mutate input meta', () => {
  const runtimeDocument = createHtmlArtboardDocument({ id: 'html-artboard:meta-immutable' })
  const meta = { cowartHtmlArtboard: true, runtimeDocument }
  const before = JSON.stringify(meta)

  createHtmlArtboardMetaWithDocumentRef(meta, createHtmlArtboardDocumentRef(runtimeDocument), {
    keepInlineDocument: false
  })

  assert.equal(JSON.stringify(meta), before)
})

test('splitHtmlArtboardRuntimeDocumentFromShape returns changed false when no runtimeDocument', () => {
  const shape = {
    id: 'shape:no-runtime-document',
    type: 'frame',
    meta: { cowartHtmlArtboard: true }
  }
  const result = splitHtmlArtboardRuntimeDocumentFromShape(shape)

  assert.equal(result.changed, false)
  assert.equal(result.runtimeDocument, null)
  assert.equal(result.documentRef, null)
})

test('splitHtmlArtboardRuntimeDocumentFromShape returns documentRef when runtimeDocument exists', () => {
  const document = createHtmlArtboardDocument({ id: 'html-artboard:split-ref' })
  const result = splitHtmlArtboardRuntimeDocumentFromShape({
    id: 'shape:split-ref',
    type: 'frame',
    parentId: 'page:split',
    meta: { cowartHtmlArtboard: true, runtimeDocument: document }
  })

  assert.equal(result.changed, true)
  assert.equal(result.documentRef.documentId, 'html-artboard-split-ref')
  assert.equal(result.shapeRecord.meta.runtimeDocumentRef.documentId, 'html-artboard-split-ref')
})

test('splitHtmlArtboardRuntimeDocumentFromShape preserves inline runtimeDocument by default', () => {
  const document = createHtmlArtboardDocument({ id: 'html-artboard:split-inline' })
  const result = splitHtmlArtboardRuntimeDocumentFromShape({
    id: 'shape:split-inline',
    type: 'frame',
    meta: { cowartHtmlArtboard: true, runtimeDocument: document }
  })

  assert.equal(result.shapeRecord.meta.runtimeDocument.id, document.id)
})

test('splitHtmlArtboardRuntimeDocumentFromShape can remove inline runtimeDocument with keepInlineDocument false', () => {
  const document = createHtmlArtboardDocument({ id: 'html-artboard:split-external' })
  const result = splitHtmlArtboardRuntimeDocumentFromShape(
    {
      id: 'shape:split-external',
      type: 'frame',
      meta: { cowartHtmlArtboard: true, runtimeDocument: document }
    },
    { keepInlineDocument: false }
  )

  assert.equal(Object.hasOwn(result.shapeRecord.meta, 'runtimeDocument'), false)
  assert.equal(result.shapeRecord.meta.runtimeDocumentRef.documentId, 'html-artboard-split-external')
})

test('splitHtmlArtboardRuntimeDocumentFromShape does not mutate input shape', () => {
  const shape = {
    id: 'shape:split-immutable',
    type: 'frame',
    meta: {
      cowartHtmlArtboard: true,
      runtimeDocument: createHtmlArtboardDocument({ id: 'html-artboard:split-immutable' })
    }
  }
  const before = JSON.stringify(shape)

  splitHtmlArtboardRuntimeDocumentFromShape(shape, { keepInlineDocument: false })

  assert.equal(JSON.stringify(shape), before)
})

test('hydrateHtmlArtboardShapeWithRuntimeDocument restores runtimeDocument', () => {
  const hydrated = hydrateHtmlArtboardShapeWithRuntimeDocument(
    {
      id: 'shape:hydrate',
      type: 'frame',
      meta: { cowartHtmlArtboard: true }
    },
    { id: 'html-artboard:hydrate', html: '<section>Hydrated</section>' }
  )

  assert.equal(hydrated.meta.runtimeDocument.id, 'html-artboard:hydrate')
  assert.equal(hydrated.meta.runtimeDocument.html, '<section>Hydrated</section>')
})

test('hydrateHtmlArtboardShapeWithRuntimeDocument preserves runtimeDocumentRef', () => {
  const ref = createHtmlArtboardDocumentRef({ id: 'html-artboard:hydrate-ref' })
  const hydrated = hydrateHtmlArtboardShapeWithRuntimeDocument(
    {
      id: 'shape:hydrate-ref',
      type: 'frame',
      meta: { cowartHtmlArtboard: true, runtimeDocumentRef: ref }
    },
    { id: 'html-artboard:hydrate-ref' }
  )

  assert.equal(hydrated.meta.runtimeDocumentRef.documentId, ref.documentId)
})

test('hydrateHtmlArtboardShapeWithRuntimeDocument does not mutate input shape', () => {
  const shape = {
    id: 'shape:hydrate-immutable',
    type: 'frame',
    meta: {
      cowartHtmlArtboard: true,
      runtimeDocumentRef: createHtmlArtboardDocumentRef({ id: 'html-artboard:hydrate-immutable' })
    }
  }
  const before = JSON.stringify(shape)

  hydrateHtmlArtboardShapeWithRuntimeDocument(shape, { id: 'html-artboard:hydrate-immutable' })

  assert.equal(JSON.stringify(shape), before)
})

test('sanitizeHtmlArtboardDocumentId handles empty value', () => {
  assert.equal(sanitizeHtmlArtboardDocumentId(''), 'html-artboard')
})

test('sanitizeHtmlArtboardDocumentId removes unsafe characters', () => {
  assert.equal(sanitizeHtmlArtboardDocumentId('../bad\\id:one'), 'bad-id-one')
})

test('createHtmlArtboardDocumentPath does not include ..', () => {
  const path = createHtmlArtboardDocumentPath({
    documentId: '../bad-document',
    pageId: '../bad-page'
  })

  assert.equal(path.includes('..'), false)
})

test('createHtmlArtboardDocumentPath uses forward slashes', () => {
  const path = createHtmlArtboardDocumentPath(
    { documentId: 'html-artboard:path-slash', pageId: 'page:path-slash' },
    { baseDir: 'canvas\\documents' }
  )

  assert.equal(path.includes('\\'), false)
  assert.equal(path, 'canvas/documents/pages/page-path-slash/html-artboards/html-artboard-path-slash.json')
})

test('extractHtmlArtboardPatchTargets returns data-node targets', () => {
  const targets = extractHtmlArtboardPatchTargets({
    html: '<section><h1 data-node="headline">Headline</h1><p data-node="subhead">Subhead</p></section>'
  })

  assert.equal(targets.length, 2)
  assert.deepEqual(
    targets.map((target) => target.dataNode),
    ['headline', 'subhead']
  )
})

test('extractHtmlArtboardPatchTargets returns selector [data-node="headline"]', () => {
  const targets = extractHtmlArtboardPatchTargets({
    html: '<h1 data-node="headline">Headline</h1>'
  })

  assert.equal(targets[0].selector, '[data-node="headline"]')
})

test('extractHtmlArtboardPatchTargets extracts text content', () => {
  const targets = extractHtmlArtboardPatchTargets({
    html: '<button data-node="cta">Start now</button>'
  })

  assert.equal(targets[0].text, 'Start now')
  assert.equal(targets[0].sourceText, 'Start now')
  assert.equal(targets[0].label, 'cta - Start now')
})

test('extractHtmlArtboardPatchTargets strips nested tags from text', () => {
  const targets = extractHtmlArtboardPatchTargets({
    html: '<h1 data-node="headline">Hello <strong>World</strong></h1>'
  })

  assert.equal(targets[0].sourceText, 'Hello World')
})

test('extractHtmlArtboardPatchTargets supports single-quoted data-node', () => {
  const targets = extractHtmlArtboardPatchTargets({
    html: "<p data-node='single-quote'>Single quoted</p>"
  })

  assert.equal(targets.length, 1)
  assert.equal(targets[0].dataNode, 'single-quote')
  assert.equal(targets[0].selector, '[data-node="single-quote"]')
})

test('extractHtmlArtboardPatchTargets supports unquoted data-node', () => {
  const targets = extractHtmlArtboardPatchTargets({
    html: '<h1 data-node=headline>Unquoted target</h1>'
  })

  assert.equal(targets.length, 1)
  assert.equal(targets[0].dataNode, 'headline')
  assert.equal(targets[0].sourceText, 'Unquoted target')
  assert.equal(targets[0].selector, '[data-node="headline"]')
})

test('extractHtmlArtboardPatchTargets returns [] when no data-node exists', () => {
  const targets = extractHtmlArtboardPatchTargets({
    html: '<section><h1>No target</h1></section>'
  })

  assert.deepEqual(targets, [])
})

test('extractHtmlArtboardPatchTargets does not mutate input', () => {
  const document = {
    html: '<h1 data-node="headline">Stable</h1>',
    fusionPatches: [{ id: 'patch:stable', value: 'Original' }]
  }
  const before = JSON.stringify(document)

  extractHtmlArtboardPatchTargets(document)

  assert.equal(JSON.stringify(document), before)
})

test('createSelectorForDataNode returns null for empty input', () => {
  assert.equal(createSelectorForDataNode(''), null)
  assert.equal(createSelectorForDataNode('   '), null)
  assert.equal(createSelectorForDataNode(null), null)
})

test('createSelectorForDataNode escapes double quotes/backslashes', () => {
  assert.equal(createSelectorForDataNode('hero"\\title'), '[data-node="hero\\"\\\\title"]')
})

test('createHtmlArtboardTextLayersFromDocument creates layers from data-node text', () => {
  const document = createHtmlArtboardDocument({
    html: '<section><h1 data-node="headline">Title</h1><p data-node="subhead">Subtitle</p></section>'
  })
  const layers = createHtmlArtboardTextLayersFromDocument(document)

  assert.equal(layers.length, 2)
  assert.equal(layers[0].dataNode, 'headline')
  assert.equal(layers[0].text, 'Title')
  assert.equal(layers[1].dataNode, 'subhead')
  assert.equal(layers[1].text, 'Subtitle')
})

test('createHtmlArtboardTextLayersFromDocument skips container data-node text', () => {
  const document = createHtmlArtboardDocument({
    html: '<section data-node="hero"><h1 data-node="headline">Title</h1><p data-node="subhead">Subtitle</p></section>'
  })
  const layers = createHtmlArtboardTextLayersFromDocument(document)

  assert.equal(layers.length, 2)
  assert.deepEqual(layers.map((layer) => layer.dataNode), ['headline', 'subhead'])
})

test('normalizeHtmlArtboardTextLayers normalizes numeric fields', () => {
  const [layer] = normalizeHtmlArtboardTextLayers([
    { id: 'layer:one', text: 'Text', x: '12', y: '24', w: '360', h: '40', fontSize: '30' }
  ])

  assert.equal(layer.x, 12)
  assert.equal(layer.y, 24)
  assert.equal(layer.w, 360)
  assert.equal(layer.h, 40)
  assert.equal(layer.fontSize, 30)
})

test('applyHtmlArtboardTextLayersToHtml updates matching data-node text', () => {
  const html = '<section><h1 data-node="headline">Before</h1><p>Keep</p></section>'
  const nextHtml = applyHtmlArtboardTextLayersToHtml(html, [
    { id: 'layer:headline', dataNode: 'headline', text: 'After' }
  ])

  assert.equal(nextHtml, '<section><h1 data-node="headline">After</h1><p>Keep</p></section>')
})

test('applyHtmlArtboardTextLayersToHtml escapes text content', () => {
  const html = '<section><h1 data-node="headline">Before</h1></section>'
  const nextHtml = applyHtmlArtboardTextLayersToHtml(html, [
    { id: 'layer:headline', dataNode: 'headline', text: 'A < B & C' }
  ])

  assert.equal(nextHtml, '<section><h1 data-node="headline">A &lt; B &amp; C</h1></section>')
})

test('applyHtmlArtboardTextLayersToHtml does not overwrite container data-node content', () => {
  const html = '<section data-node="hero"><h1 data-node="headline">Before</h1></section>'
  const nextHtml = applyHtmlArtboardTextLayersToHtml(html, [
    { id: 'layer:hero', dataNode: 'hero', text: 'Container text' },
    { id: 'layer:headline', dataNode: 'headline', text: 'After' }
  ])

  assert.equal(nextHtml, '<section data-node="hero"><h1 data-node="headline">After</h1></section>')
})

test('updateHtmlArtboardTextLayers stores layers and updates html', () => {
  const document = createHtmlArtboardDocument({
    html: '<section><h1 data-node="headline">Before</h1></section>'
  })
  const updated = updateHtmlArtboardTextLayers(document, [
    { id: 'layer:headline', dataNode: 'headline', text: 'After', x: 10, y: 20, w: 320, h: 64 }
  ])

  assert.equal(updated.textLayers.length, 1)
  assert.equal(updated.textLayers[0].text, 'After')
  assert.equal(updated.html.includes('After'), true)
})

test('updateHtmlArtboardTextLayers records mutationLog', () => {
  const document = createHtmlArtboardDocument()
  const updated = updateHtmlArtboardTextLayers(document, [
    { id: 'layer:headline', text: 'Layer', x: 10, y: 20, w: 320, h: 64 }
  ])

  assert.equal(updated.mutationLog.at(-1).type, 'text_layer_sync')
  assert.equal(updated.mutationLog.at(-1).payload.nextTextLayers.length, 1)
})

test('updateHtmlArtboardTextLayers supports recordMutationLog false', () => {
  const document = createHtmlArtboardDocument()
  const updated = updateHtmlArtboardTextLayers(
    document,
    [{ id: 'layer:headline', text: 'Layer', x: 10, y: 20, w: 320, h: 64 }],
    { recordMutationLog: false }
  )

  assert.equal(updated.mutationLog.length, 0)
})

test('updateHtmlArtboardTextLayers recalculates renderFingerprint', () => {
  const document = withRenderFingerprint(createHtmlArtboardDocument())
  const updated = updateHtmlArtboardTextLayers(document, [
    { id: 'layer:headline', text: 'Layer', x: 10, y: 20, w: 320, h: 64 }
  ])

  assert.notEqual(updated.renderFingerprint, document.renderFingerprint)
})

test('updateHtmlArtboardTextLayers does not mutate input document', () => {
  const document = createHtmlArtboardDocument({
    html: '<section><h1 data-node="headline">Before</h1></section>'
  })
  const before = cloneHtmlArtboardDocument(document)

  updateHtmlArtboardTextLayers(document, [
    { id: 'layer:headline', dataNode: 'headline', text: 'After', x: 10, y: 20, w: 320, h: 64 }
  ])

  assert.deepEqual(document, before)
})

test('createFusionPatchPlaceholder returns required fields', () => {
  const patch = createFusionPatchPlaceholder()
  const requiredFields = [
    'id',
    'type',
    'name',
    'selector',
    'sourceSelector',
    'sourceText',
    'region',
    'prompt',
    'maskAssetId',
    'patchAssetId',
    'patchAssetUrl',
    'blendMode',
    'opacity',
    'provider',
    'seed',
    'status',
    'visible',
    'createdAt',
    'updatedAt',
    'meta'
  ]

  for (const field of requiredFields) {
    assert.equal(Object.hasOwn(patch, field), true)
  }
})

test('createFusionPatchPlaceholder defaults type to fusion-patch', () => {
  const patch = createFusionPatchPlaceholder()

  assert.equal(patch.type, 'fusion-patch')
  assert.equal(patch.name, 'Mock Fusion Patch')
  assert.equal(patch.provider, 'mock')
  assert.equal(patch.status, 'placeholder')
  assert.equal(patch.visible, true)
})

test('createFusionPatchPlaceholder includes asset fields maskAssetId/patchAssetId/patchAssetUrl', () => {
  const patch = createFusionPatchPlaceholder()

  assert.equal(patch.maskAssetId, null)
  assert.equal(patch.patchAssetId, null)
  assert.equal(patch.patchAssetUrl, null)
})

test('ensureFusionPatch normalizes legacy ai-fusion-placeholder', () => {
  const patch = ensureFusionPatch({
    id: 'legacy:patch',
    type: 'ai-fusion-placeholder',
    name: 'Legacy Patch'
  })

  assert.equal(patch.id, 'legacy:patch')
  assert.equal(patch.type, 'fusion-patch')
  assert.equal(patch.name, 'Legacy Patch')
})

test('ensureFusionPatch preserves selector/sourceText/prompt/region', () => {
  const patch = ensureFusionPatch({
    selector: '[data-node="hero"]',
    sourceText: 'Hero',
    prompt: 'Make the hero brighter',
    region: { x: 12, y: 24, w: 320, h: 180 }
  })

  assert.equal(patch.selector, '[data-node="hero"]')
  assert.equal(patch.sourceSelector, '[data-node="hero"]')
  assert.equal(patch.sourceText, 'Hero')
  assert.equal(patch.prompt, 'Make the hero brighter')
  assert.deepEqual(patch.region, { x: 12, y: 24, w: 320, h: 180 })
})

test('normalizeFusionPatches returns [] for invalid input', () => {
  assert.deepEqual(normalizeFusionPatches(null), [])
  assert.deepEqual(normalizeFusionPatches({ id: 'not-array' }), [])
})

test('normalizeFusionPatches normalizes each patch', () => {
  const patches = normalizeFusionPatches([
    { id: 'patch:a', type: 'ai-fusion-placeholder' },
    { id: 'patch:b', selector: '.card' }
  ])

  assert.equal(patches.length, 2)
  assert.equal(patches[0].type, 'fusion-patch')
  assert.equal(patches[1].type, 'fusion-patch')
  assert.equal(patches[1].sourceSelector, '.card')
})

test('cloneFusionPatch deep clones', () => {
  const patch = createFusionPatchPlaceholder({
    id: 'patch:clone',
    region: { x: 1, y: 2, w: 3, h: 4 },
    meta: { nested: { value: 'Original' } }
  })
  const cloned = cloneFusionPatch(patch)

  cloned.region.x = 100
  cloned.meta.nested.value = 'Changed'

  assert.equal(patch.region.x, 1)
  assert.equal(patch.meta.nested.value, 'Original')
})

test('ensureHtmlArtboardDocument normalizes fusionPatches', () => {
  const document = ensureHtmlArtboardDocument({
    fusionPatches: [{ id: 'patch:document-normalize', type: 'ai-fusion-placeholder' }]
  })

  assert.equal(document.fusionPatches.length, 1)
  assert.equal(document.fusionPatches[0].type, 'fusion-patch')
})

test('legacy fusion patch in document becomes type fusion-patch', () => {
  const document = ensureHtmlArtboardDocument({
    fusionPatches: [
      {
        id: 'legacy:document-patch',
        type: 'ai-fusion-placeholder',
        selector: '.legacy'
      }
    ]
  })

  assert.equal(document.fusionPatches[0].id, 'legacy:document-patch')
  assert.equal(document.fusionPatches[0].type, 'fusion-patch')
  assert.equal(document.fusionPatches[0].selector, '.legacy')
})

test('ensureHtmlArtboardDocument preserves fusion patch count', () => {
  const document = ensureHtmlArtboardDocument({
    fusionPatches: [{ id: 'patch:one' }, { id: 'patch:two' }]
  })

  assert.equal(document.fusionPatches.length, 2)
})

test('createRenderFingerprint returns stable string', () => {
  const patch = {
    id: 'fusion-patch:stable',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    b: 2,
    a: 1
  }
  const first = createHtmlArtboardDocument({
    background: { type: 'gradient', identity: 'background:stable', colors: ['#fff', '#111'] },
    fusionPatches: [patch]
  })
  const second = createHtmlArtboardDocument({
    id: first.id,
    background: { colors: ['#fff', '#111'], identity: 'background:stable', type: 'gradient' },
    fusionPatches: [{ a: 1, b: 2, id: patch.id, createdAt: patch.createdAt, updatedAt: patch.updatedAt }]
  })

  assert.equal(typeof createRenderFingerprint(first), 'string')
  assert.equal(createRenderFingerprint(first), createRenderFingerprint(second))
})

test('renderFingerprint changes when html changes', () => {
  const document = createHtmlArtboardDocument()
  const before = createRenderFingerprint(document)
  const after = createRenderFingerprint({ ...document, html: `${document.html}\n<strong>Changed</strong>` })

  assert.notEqual(before, after)
})

test('renderFingerprint changes when css changes', () => {
  const document = createHtmlArtboardDocument()
  const before = createRenderFingerprint(document)
  const after = createRenderFingerprint({ ...document, css: `${document.css}\n.artboard { color: blue; }` })

  assert.notEqual(before, after)
})

test('renderFingerprint changes when fusionPatches changes', () => {
  const document = createHtmlArtboardDocument({
    fusionPatches: [
      {
        id: 'patch:1',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        value: 'A'
      }
    ]
  })
  const before = createRenderFingerprint(document)
  const after = createRenderFingerprint({
    ...document,
    fusionPatches: [{ ...document.fusionPatches[0], value: 'B' }]
  })

  assert.notEqual(before, after)
})

test('withRenderFingerprint adds renderFingerprint', () => {
  const document = withRenderFingerprint(createHtmlArtboardDocument())

  assert.equal(typeof document.renderFingerprint, 'string')
  assert.equal(document.renderFingerprint, createRenderFingerprint(document))
})

test('validateRenderFingerprint returns match for valid fingerprint', () => {
  const document = withRenderFingerprint(createHtmlArtboardDocument())
  const result = validateRenderFingerprint(document)

  assert.equal(result.status, 'match')
  assert.equal(result.matches, true)
})

test('validateRenderFingerprint returns mismatch when document changes after fingerprint', () => {
  const document = withRenderFingerprint(createHtmlArtboardDocument())
  const result = validateRenderFingerprint({ ...document, html: '<section>Changed</section>' })

  assert.equal(result.status, 'mismatch')
  assert.equal(result.matches, false)
})

test('createHtmlArtboardThumbnailSvg returns svg string', () => {
  const svg = createHtmlArtboardThumbnailSvg(createHtmlArtboardDocument())

  assert.equal(typeof svg, 'string')
  assert.equal(svg.startsWith('<svg'), true)
})

test('thumbnail svg includes foreignObject', () => {
  const svg = createHtmlArtboardThumbnailSvg(createHtmlArtboardDocument())

  assert.equal(svg.includes('<foreignObject'), true)
})

test('thumbnail svg includes document html', () => {
  const document = createHtmlArtboardDocument({
    html: '<section><h1>Thumbnail HTML</h1></section>'
  })
  const svg = createHtmlArtboardThumbnailSvg(document)

  assert.equal(svg.includes(document.html), true)
})

test('thumbnail svg includes document css', () => {
  const document = createHtmlArtboardDocument({
    css: '.thumbnail-test { color: teal; }'
  })
  const svg = createHtmlArtboardThumbnailSvg(document)

  assert.equal(svg.includes(document.css), true)
})

test('thumbnail svg includes document width/height', () => {
  const svg = createHtmlArtboardThumbnailSvg(
    createHtmlArtboardDocument({ width: 640, height: 360 })
  )

  assert.equal(svg.includes('width="640"'), true)
  assert.equal(svg.includes('height="360"'), true)
})

test('thumbnail helper does not mutate input', () => {
  const document = createHtmlArtboardDocument({
    html: '<section>Immutable thumbnail</section>',
    css: 'section { color: black; }'
  })
  const before = JSON.stringify(document)

  createHtmlArtboardThumbnailSvg(document)
  createHtmlArtboardThumbnailDataUrl(document)
  createHtmlArtboardThumbnailAltText(document)

  assert.equal(JSON.stringify(document), before)
})

test('createHtmlArtboardThumbnailDataUrl returns data:image/svg+xml', () => {
  const dataUrl = createHtmlArtboardThumbnailDataUrl(createHtmlArtboardDocument())

  assert.equal(dataUrl.startsWith('data:image/svg+xml;charset=utf-8,'), true)
})

test('thumbnail data url can be decoded to SVG text', () => {
  const document = createHtmlArtboardDocument({
    html: '<section>Decoded thumbnail</section>'
  })
  const dataUrl = createHtmlArtboardThumbnailDataUrl(document)
  const decodedSvg = decodeURIComponent(dataUrl.split(',')[1])

  assert.equal(decodedSvg.startsWith('<svg'), true)
  assert.equal(decodedSvg.includes(document.html), true)
})

test('thumbnail alt text includes HTML Artboard', () => {
  const altText = createHtmlArtboardThumbnailAltText(createHtmlArtboardDocument())

  assert.equal(altText.includes('HTML Artboard'), true)
})

test('thumbnail svg includes gradient background fallback', () => {
  const svg = createHtmlArtboardThumbnailSvg(
    createHtmlArtboardDocument({
      background: {
        type: 'gradient',
        colors: ['#111111', '#eeeeee']
      }
    })
  )

  assert.equal(svg.includes('linearGradient'), true)
  assert.equal(svg.includes('#111111'), true)
  assert.equal(svg.indexOf('<rect') < svg.indexOf('<foreignObject'), true)
})

test('thumbnail svg includes image background asset', () => {
  const svg = createHtmlArtboardThumbnailSvg(
    createHtmlArtboardDocument({
      background: {
        type: 'image',
        backgroundAssetUrl: 'data:image/png;base64,background-data',
        fit: 'cover'
      }
    })
  )

  assert.equal(svg.includes('data:image/png;base64,background-data'), true)
  assert.equal(svg.indexOf('<image') < svg.indexOf('<foreignObject'), true)
})

test('canvas-safe thumbnail omits foreignObject', () => {
  const svg = createHtmlArtboardThumbnailSvg(
    createHtmlArtboardDocument({
      html: '<section><h1>Canvas Text</h1></section>'
    }),
    { canvasSafe: true }
  )

  assert.equal(svg.includes('<foreignObject'), false)
  assert.equal(svg.includes('cowart-html-artboard-canvas-text-fallback'), true)
  assert.equal(svg.includes('Canvas Text'), true)
})

test('createHtmlArtboardCanvasThumbnailDataUrl returns canvas-safe SVG data URL', () => {
  const dataUrl = createHtmlArtboardCanvasThumbnailDataUrl(
    createHtmlArtboardDocument({
      html: '<section>Canvas URL</section>'
    })
  )
  const decodedSvg = decodeURIComponent(dataUrl.split(',')[1])

  assert.equal(dataUrl.startsWith('data:image/svg+xml;charset=utf-8,'), true)
  assert.equal(decodedSvg.includes('<foreignObject'), false)
  assert.equal(decodedSvg.includes('Canvas URL'), true)
})

test('thumbnail svg can inline external background asset urls', () => {
  const svg = createHtmlArtboardThumbnailSvg(
    createHtmlArtboardDocument({
      background: {
        type: 'image',
        backgroundAssetUrl: '/page-assets/page/background.png'
      }
    }),
    {
      backgroundAssetUrlResolver: (url) =>
        url === '/page-assets/page/background.png'
          ? 'data:image/png;base64,inlined-background'
          : url
    }
  )

  assert.equal(svg.includes('data:image/png;base64,inlined-background'), true)
  assert.equal(svg.includes('href="/page-assets/page/background.png"'), false)
})

test('getHtmlArtboardBackgroundAssetUrl reads background asset url', () => {
  const document = createHtmlArtboardDocument({
    background: {
      type: 'image',
      backgroundAssetUrl: '/page-assets/page/background.png'
    }
  })

  assert.equal(getHtmlArtboardBackgroundAssetUrl(document), '/page-assets/page/background.png')
})

test('createHtmlArtboardFusionPatchOverlaySvg returns empty string when no patches', () => {
  const overlay = createHtmlArtboardFusionPatchOverlaySvg(createHtmlArtboardDocument())

  assert.equal(overlay, '')
})

test('createHtmlArtboardThumbnailSvg includes overlay for visible fusion patch', () => {
  const document = createHtmlArtboardDocument({
    fusionPatches: [
      createFusionPatchPlaceholder({
        id: 'patch:visible-thumbnail',
        name: 'Visible Patch',
        region: { x: 12, y: 24, w: 120, h: 80 }
      })
    ]
  })
  const svg = createHtmlArtboardThumbnailSvg(document)

  assert.equal(svg.includes('cowart-html-artboard-fusion-patch-overlays'), true)
  assert.equal(svg.indexOf('</foreignObject>') < svg.indexOf('Visible Patch'), true)
})

test('thumbnail svg includes patch label', () => {
  const document = createHtmlArtboardDocument({
    fusionPatches: [
      createFusionPatchPlaceholder({
        name: 'Patch Label',
        region: { x: 20, y: 30, w: 140, h: 90 }
      })
    ]
  })
  const svg = createHtmlArtboardThumbnailSvg(document)

  assert.equal(svg.includes('Patch Label'), true)
})

test('thumbnail svg includes patch region coordinates', () => {
  const document = createHtmlArtboardDocument({
    fusionPatches: [
      createFusionPatchPlaceholder({
        name: 'Coordinate Patch',
        region: { x: 12, y: 24, w: 120, h: 80 }
      })
    ]
  })
  const svg = createHtmlArtboardThumbnailSvg(document)

  assert.equal(svg.includes('x="12"'), true)
  assert.equal(svg.includes('y="24"'), true)
  assert.equal(svg.includes('width="120"'), true)
  assert.equal(svg.includes('height="80"'), true)
})

test('thumbnail svg skips invisible fusion patch', () => {
  const document = createHtmlArtboardDocument({
    fusionPatches: [
      createFusionPatchPlaceholder({
        name: 'Hidden Patch',
        visible: false,
        region: { x: 10, y: 10, w: 100, h: 60 }
      })
    ]
  })
  const svg = createHtmlArtboardThumbnailSvg(document)

  assert.equal(svg.includes('Hidden Patch'), false)
})

test('thumbnail svg skips patch with invalid region', () => {
  const svg = createHtmlArtboardThumbnailSvg({
    fusionPatches: [
      {
        id: 'patch:invalid-region',
        type: 'fusion-patch',
        name: 'Invalid Region Patch',
        region: { x: 10, y: 20, w: 0, h: 80 },
        visible: true
      }
    ]
  })

  assert.equal(svg.includes('Invalid Region Patch'), false)
})

test('thumbnail svg includes multiple visible patches', () => {
  const document = createHtmlArtboardDocument({
    fusionPatches: [
      createFusionPatchPlaceholder({
        name: 'Patch One',
        region: { x: 20, y: 30, w: 100, h: 70 }
      }),
      createFusionPatchPlaceholder({
        name: 'Patch Two',
        region: { x: 150, y: 180, w: 140, h: 90 }
      })
    ]
  })
  const svg = createHtmlArtboardThumbnailSvg(document)

  assert.equal(svg.includes('Patch One'), true)
  assert.equal(svg.includes('Patch Two'), true)
})

test('thumbnail svg escapes patch label XML characters', () => {
  const document = createHtmlArtboardDocument({
    fusionPatches: [
      createFusionPatchPlaceholder({
        name: `Patch & <bad> "quote" 'single'`,
        region: { x: 20, y: 30, w: 100, h: 70 }
      })
    ]
  })
  const overlay = createHtmlArtboardFusionPatchOverlaySvg(document)

  assert.equal(
    overlay.includes('Patch &amp; &lt;bad&gt; &quot;quote&quot; &apos;single&apos;'),
    true
  )
})

test('createHtmlArtboardFusionPatchOverlaySvg does not mutate input document', () => {
  const document = createHtmlArtboardDocument({
    fusionPatches: [
      createFusionPatchPlaceholder({
        name: 'Immutable Overlay Patch',
        region: { x: 20, y: 30, w: 100, h: 70 }
      })
    ]
  })
  const before = JSON.stringify(document)

  createHtmlArtboardFusionPatchOverlaySvg(document)

  assert.equal(JSON.stringify(document), before)
})

test('thumbnail data url includes encoded overlay', () => {
  const document = createHtmlArtboardDocument({
    fusionPatches: [
      createFusionPatchPlaceholder({
        name: 'Encoded Overlay Patch',
        region: { x: 20, y: 30, w: 100, h: 70 }
      })
    ]
  })
  const dataUrl = createHtmlArtboardThumbnailDataUrl(document)
  const decodedSvg = decodeURIComponent(dataUrl.split(',')[1])

  assert.equal(decodedSvg.includes('Encoded Overlay Patch'), true)
  assert.equal(decodedSvg.includes('cowart-html-artboard-fusion-patch-overlays'), true)
})

test('thumbnail svg can inline external fusion patch asset urls', () => {
  const document = createHtmlArtboardDocument({
    fusionPatches: [
      createFusionPatchPlaceholder({
        name: 'External Asset Patch',
        region: { x: 20, y: 30, w: 100, h: 70 },
        patchAssetUrl: '/page-assets/page/external-patch.png'
      })
    ]
  })
  const svg = createHtmlArtboardThumbnailSvg(document, {
    patchAssetUrlResolver: (url) =>
      url === '/page-assets/page/external-patch.png'
        ? 'data:image/png;base64,external-patch-data'
        : url
  })

  assert.equal(svg.includes('data:image/png;base64,external-patch-data'), true)
  assert.equal(svg.includes('href="/page-assets/page/external-patch.png"'), false)
})

test('attachExternalBackgroundImageToHtmlArtboard attaches background asset', () => {
  const document = createHtmlArtboardDocument()
  const updated = attachExternalBackgroundImageToHtmlArtboard(
    document,
    {
      backgroundAssetId: 'background:asset:test',
      backgroundAssetUrl: '/page-assets/page/background.png',
      fileName: 'background.png',
      relativePath: 'pages/page/assets/background.png',
      mimeType: 'image/png',
      fileSize: 128
    },
    { provider: 'codex-image-gen', prompt: 'No-text coffee poster background' }
  )

  assert.equal(updated.background.type, 'image')
  assert.equal(updated.background.backgroundAssetId, 'background:asset:test')
  assert.equal(updated.background.backgroundAssetUrl, '/page-assets/page/background.png')
  assert.equal(updated.background.provider, 'codex-image-gen')
  assert.equal(updated.background.status, 'generated')
})

test('attachExternalBackgroundImageToHtmlArtboard preserves html and css', () => {
  const document = createHtmlArtboardDocument({
    html: '<section>Keep HTML</section>',
    css: 'section { color: black; }'
  })
  const updated = attachExternalBackgroundImageToHtmlArtboard(document, {
    backgroundAssetId: 'background:asset:preserve',
    backgroundAssetUrl: '/page-assets/page/background.png'
  })

  assert.equal(updated.html, document.html)
  assert.equal(updated.css, document.css)
})

test('attachExternalBackgroundImageToHtmlArtboard records mutationLog', () => {
  const updated = attachExternalBackgroundImageToHtmlArtboard(createHtmlArtboardDocument(), {
    backgroundAssetId: 'background:asset:mutation',
    backgroundAssetUrl: '/page-assets/page/background.png'
  })
  const mutation = updated.mutationLog.at(-1)

  assert.equal(mutation.type, 'background_asset_attach')
  assert.equal(mutation.payload.backgroundAssetUrl, '/page-assets/page/background.png')
  assert.equal(mutation.meta.source, 'mcp-html-artboard-background-image-attach')
})

test('attachExternalBackgroundImageToHtmlArtboard can skip mutationLog', () => {
  const updated = attachExternalBackgroundImageToHtmlArtboard(
    createHtmlArtboardDocument(),
    {
      backgroundAssetId: 'background:asset:no-log',
      backgroundAssetUrl: '/page-assets/page/background.png'
    },
    {},
    { recordMutationLog: false }
  )

  assert.equal(updated.mutationLog.length, 0)
})

test('attachExternalBackgroundImageToHtmlArtboard recalculates renderFingerprint', () => {
  const document = withRenderFingerprint(createHtmlArtboardDocument())
  const updated = attachExternalBackgroundImageToHtmlArtboard(document, {
    backgroundAssetId: 'background:asset:fingerprint',
    backgroundAssetUrl: '/page-assets/page/background.png'
  })

  assert.notEqual(updated.renderFingerprint, document.renderFingerprint)
})

test('attachExternalBackgroundImageToHtmlArtboard does not mutate input', () => {
  const document = createHtmlArtboardDocument()
  const before = JSON.stringify(document)

  attachExternalBackgroundImageToHtmlArtboard(document, {
    backgroundAssetId: 'background:asset:immutable',
    backgroundAssetUrl: '/page-assets/page/background.png'
  })

  assert.equal(JSON.stringify(document), before)
})

test('createHtmlArtboardPreviewMeta returns cowartHtmlArtboardPreview true', () => {
  const meta = createHtmlArtboardPreviewMeta(createHtmlArtboardDocument())

  assert.equal(meta.cowartHtmlArtboardPreview, true)
})

test('preview meta includes sourceHtmlArtboardShapeId', () => {
  const meta = createHtmlArtboardPreviewMeta(createHtmlArtboardDocument(), {
    sourceHtmlArtboardShapeId: 'shape:html-artboard'
  })

  assert.equal(meta.sourceHtmlArtboardShapeId, 'shape:html-artboard')
})

test('preview meta includes sourceDocumentId', () => {
  const document = createHtmlArtboardDocument({ id: 'html-artboard:freshness-id' })
  const meta = createHtmlArtboardPreviewMeta(document)

  assert.equal(meta.sourceDocumentId, 'html-artboard:freshness-id')
})

test('preview meta includes sourceRenderFingerprint', () => {
  const document = withRenderFingerprint(createHtmlArtboardDocument())
  const meta = createHtmlArtboardPreviewMeta(document)

  assert.equal(meta.sourceRenderFingerprint, document.renderFingerprint)
})

test('preview meta includes sourceMutationCount', () => {
  const meta = createHtmlArtboardPreviewMeta(
    createHtmlArtboardDocument({
      mutationLog: [{ id: 'mutation:one' }, { id: 'mutation:two' }]
    })
  )

  assert.equal(meta.sourceMutationCount, 2)
})

test('preview meta includes sourceFusionPatchCount', () => {
  const meta = createHtmlArtboardPreviewMeta(
    createHtmlArtboardDocument({
      fusionPatches: [{ id: 'patch:one', type: 'fusion-patch' }]
    })
  )

  assert.equal(meta.sourceFusionPatchCount, 1)
})

test('preview meta does not mutate document', () => {
  const document = createHtmlArtboardDocument({
    id: 'html-artboard:freshness-immutable',
    mutationLog: [{ id: 'mutation:stable' }]
  })
  const before = JSON.stringify(document)

  createHtmlArtboardPreviewMeta(document)

  assert.equal(JSON.stringify(document), before)
})

test('getHtmlArtboardPreviewMeta returns meta for preview shape', () => {
  const meta = createHtmlArtboardPreviewMeta(createHtmlArtboardDocument())
  const shape = { type: 'image', meta }

  assert.equal(getHtmlArtboardPreviewMeta(shape), meta)
})

test('isHtmlArtboardPreviewShapeForArtboard returns true for matching shape', () => {
  const shape = {
    type: 'image',
    meta: createHtmlArtboardPreviewMeta(createHtmlArtboardDocument(), {
      sourceHtmlArtboardShapeId: 'shape:matching-artboard'
    })
  }

  assert.equal(isHtmlArtboardPreviewShapeForArtboard(shape, 'shape:matching-artboard'), true)
})

test('isHtmlArtboardPreviewShapeForArtboard returns false for normal image shape', () => {
  const shape = { type: 'image', meta: {} }

  assert.equal(isHtmlArtboardPreviewShapeForArtboard(shape, 'shape:normal'), false)
})

test('compareHtmlArtboardPreviewFreshness returns missing when no preview', () => {
  const result = compareHtmlArtboardPreviewFreshness(createHtmlArtboardDocument(), null)

  assert.equal(result.status, 'missing')
  assert.equal(result.isMissing, true)
})

test('compareHtmlArtboardPreviewFreshness returns current when meta matches', () => {
  const document = withRenderFingerprint(createHtmlArtboardDocument())
  const previewShape = {
    type: 'image',
    meta: createHtmlArtboardPreviewMeta(document)
  }
  const result = compareHtmlArtboardPreviewFreshness(document, previewShape)

  assert.equal(result.status, 'current')
  assert.equal(result.isCurrent, true)
})

test('compareHtmlArtboardPreviewFreshness returns stale when fingerprint changes', () => {
  const document = withRenderFingerprint(createHtmlArtboardDocument())
  const changedDocument = {
    ...document,
    html: `${document.html}<p>Changed</p>`,
    renderFingerprint: createRenderFingerprint({ ...document, html: `${document.html}<p>Changed</p>` })
  }
  const previewShape = {
    type: 'image',
    meta: createHtmlArtboardPreviewMeta(document)
  }
  const result = compareHtmlArtboardPreviewFreshness(changedDocument, previewShape)

  assert.equal(result.status, 'stale')
  assert.equal(result.isStale, true)
})

test('compareHtmlArtboardPreviewFreshness returns stale when mutation count changes', () => {
  const document = withRenderFingerprint(createHtmlArtboardDocument())
  const changedDocument = {
    ...document,
    mutationLog: [...document.mutationLog, { id: 'mutation:new' }]
  }
  const previewShape = {
    type: 'image',
    meta: createHtmlArtboardPreviewMeta(document)
  }
  const result = compareHtmlArtboardPreviewFreshness(changedDocument, previewShape)

  assert.equal(result.status, 'stale')
  assert.equal(result.reasons.includes('mutation count changed'), true)
})

test('compareHtmlArtboardPreviewFreshness returns stale when fusion patch count changes', () => {
  const document = withRenderFingerprint(createHtmlArtboardDocument())
  const changedDocument = {
    ...document,
    fusionPatches: [{ id: 'patch:new', type: 'fusion-patch' }]
  }
  const previewShape = {
    type: 'image',
    meta: createHtmlArtboardPreviewMeta(document)
  }
  const result = compareHtmlArtboardPreviewFreshness(changedDocument, previewShape)

  assert.equal(result.status, 'stale')
  assert.equal(result.reasons.includes('fusion patch count changed'), true)
})

test('summarizeHtmlArtboardPreviewFreshness handles missing/current/stale', () => {
  assert.equal(
    summarizeHtmlArtboardPreviewFreshness({ status: 'missing' }),
    'Missing preview'
  )
  assert.equal(
    summarizeHtmlArtboardPreviewFreshness({ status: 'current' }),
    'Preview up to date'
  )
  assert.equal(
    summarizeHtmlArtboardPreviewFreshness({ status: 'stale', reasons: ['render fingerprint changed'] }),
    'Preview stale: render fingerprint changed'
  )
})

test('preview srcdoc returns string', () => {
  const srcDoc = createHtmlArtboardPreviewSrcDoc(createHtmlArtboardDocument())

  assert.equal(typeof srcDoc, 'string')
})

test('preview srcdoc includes html', () => {
  const srcDoc = createHtmlArtboardPreviewSrcDoc({
    html: '<section><h1>Preview HTML</h1></section>'
  })

  assert.equal(srcDoc.includes('<section><h1>Preview HTML</h1></section>'), true)
})

test('preview srcdoc includes css', () => {
  const srcDoc = createHtmlArtboardPreviewSrcDoc({
    css: '.preview { color: rgb(1 2 3); }'
  })

  assert.equal(srcDoc.includes('.preview { color: rgb(1 2 3); }'), true)
})

test('preview srcdoc includes doctype/html/body', () => {
  const srcDoc = createHtmlArtboardPreviewSrcDoc(createHtmlArtboardDocument())

  assert.equal(srcDoc.includes('<!doctype html>'), true)
  assert.equal(srcDoc.includes('<html>'), true)
  assert.equal(srcDoc.includes('<body>'), true)
})

test('preview helper does not mutate input', () => {
  const document = {
    id: 'html-artboard:preview-mutation',
    html: '<section>Stable</section>',
    css: '.stable { color: black; }',
    fusionPatches: [{ id: 'patch:stable', value: 'Original' }]
  }
  const before = JSON.stringify(document)

  createHtmlArtboardPreviewSrcDoc(document)

  assert.equal(JSON.stringify(document), before)
})

test('preview helper works with partial document', () => {
  const srcDoc = createHtmlArtboardPreviewSrcDoc({
    html: '<main>Partial</main>'
  })

  assert.equal(srcDoc.includes('<main>Partial</main>'), true)
  assert.equal(srcDoc.includes('Cowart HTML Artboard'), false)
  assert.equal(srcDoc.includes('<style>'), true)
})

test('createHtmlArtboardSourceSnapshot returns html/css/json', () => {
  const snapshot = createHtmlArtboardSourceSnapshot(createHtmlArtboardDocument())

  assert.equal(typeof snapshot.html, 'string')
  assert.equal(typeof snapshot.css, 'string')
  assert.equal(typeof snapshot.json, 'string')
})

test('source snapshot preserves document html', () => {
  const snapshot = createHtmlArtboardSourceSnapshot({
    html: '<section><h1>Source HTML</h1></section>'
  })

  assert.equal(snapshot.html, '<section><h1>Source HTML</h1></section>')
})

test('source snapshot preserves document css', () => {
  const snapshot = createHtmlArtboardSourceSnapshot({
    css: '.source { color: rebeccapurple; }'
  })

  assert.equal(snapshot.css, '.source { color: rebeccapurple; }')
})

test('source snapshot json is valid JSON', () => {
  const snapshot = createHtmlArtboardSourceSnapshot(createHtmlArtboardDocument())

  assert.doesNotThrow(() => JSON.parse(snapshot.json))
})

test('parsed source snapshot json contains type cowart-html-artboard', () => {
  const snapshot = createHtmlArtboardSourceSnapshot(createHtmlArtboardDocument())
  const parsed = JSON.parse(snapshot.json)

  assert.equal(parsed.type, 'cowart-html-artboard')
})

test('parsed source snapshot json contains fusionPatches', () => {
  const fusionPatches = [{ id: 'patch:source', value: 'Source patch' }]
  const snapshot = createHtmlArtboardSourceSnapshot({ fusionPatches })
  const parsed = JSON.parse(snapshot.json)

  assert.equal(parsed.fusionPatches.length, 1)
  assert.equal(parsed.fusionPatches[0].id, 'patch:source')
  assert.equal(parsed.fusionPatches[0].type, 'fusion-patch')
  assert.equal(parsed.fusionPatches[0].value, 'Source patch')
})

test('source snapshot helper does not mutate input', () => {
  const document = {
    id: 'html-artboard:source-mutation',
    html: '<section>Stable source</section>',
    css: '.stable-source { color: black; }',
    fusionPatches: [{ id: 'patch:source-stable', value: 'Original' }]
  }
  const before = JSON.stringify(document)

  createHtmlArtboardSourceSnapshot(document)

  assert.equal(JSON.stringify(document), before)
})

test('source snapshot works with partial document through ensureHtmlArtboardDocument', () => {
  const snapshot = createHtmlArtboardSourceSnapshot({
    html: '<main>Partial source</main>'
  })
  const parsed = JSON.parse(snapshot.json)

  assert.equal(snapshot.html, '<main>Partial source</main>')
  assert.equal(parsed.html, '<main>Partial source</main>')
  assert.equal(parsed.type, 'cowart-html-artboard')
  assert.equal(parsed.meta.provider, 'mock')
})

test('createHtmlArtboardExportBundle returns html/css/json/standaloneHtml', () => {
  const bundle = createHtmlArtboardExportBundle(createHtmlArtboardDocument())

  assert.equal(typeof bundle.html, 'string')
  assert.equal(typeof bundle.css, 'string')
  assert.equal(typeof bundle.json, 'string')
  assert.equal(typeof bundle.standaloneHtml, 'string')
})

test('export bundle html preserves document.html', () => {
  const bundle = createHtmlArtboardExportBundle({
    html: '<section><h1>Export HTML</h1></section>'
  })

  assert.equal(bundle.html, '<section><h1>Export HTML</h1></section>')
})

test('export bundle css preserves document.css', () => {
  const bundle = createHtmlArtboardExportBundle({
    css: '.export { color: blue; }'
  })

  assert.equal(bundle.css, '.export { color: blue; }')
})

test('export bundle json is valid JSON', () => {
  const bundle = createHtmlArtboardExportBundle(createHtmlArtboardDocument())

  assert.doesNotThrow(() => JSON.parse(bundle.json))
})

test('export bundle json contains type cowart-html-artboard', () => {
  const bundle = createHtmlArtboardExportBundle(createHtmlArtboardDocument())
  const parsed = JSON.parse(bundle.json)

  assert.equal(parsed.type, 'cowart-html-artboard')
})

test('export bundle json contains fusionPatches', () => {
  const document = createHtmlArtboardDocument({
    fusionPatches: [createFusionPatchPlaceholder({ id: 'patch:export' })]
  })
  const parsed = JSON.parse(createHtmlArtboardExportBundle(document).json)

  assert.equal(Array.isArray(parsed.fusionPatches), true)
  assert.equal(parsed.fusionPatches.length, 1)
  assert.equal(parsed.fusionPatches[0].id, 'patch:export')
})

test('export bundle json contains mutationLog', () => {
  const mutation = createHtmlArtboardMutation('document_meta_update', { exported: true })
  const document = createHtmlArtboardDocument({ mutationLog: [mutation] })
  const parsed = JSON.parse(createHtmlArtboardExportBundle(document).json)

  assert.equal(Array.isArray(parsed.mutationLog), true)
  assert.equal(parsed.mutationLog.length, 1)
  assert.equal(parsed.mutationLog[0].type, 'document_meta_update')
})

test('createHtmlArtboardStandaloneHtml returns doctype/html/head/body', () => {
  const standaloneHtml = createHtmlArtboardStandaloneHtml(createHtmlArtboardDocument())

  assert.equal(standaloneHtml.includes('<!doctype html>'), true)
  assert.equal(standaloneHtml.includes('<html>'), true)
  assert.equal(standaloneHtml.includes('<head>'), true)
  assert.equal(standaloneHtml.includes('<body>'), true)
})

test('standaloneHtml includes document.html', () => {
  const standaloneHtml = createHtmlArtboardStandaloneHtml({
    html: '<section><h1>Standalone HTML</h1></section>'
  })

  assert.equal(standaloneHtml.includes('<section><h1>Standalone HTML</h1></section>'), true)
})

test('standaloneHtml includes document.css', () => {
  const standaloneHtml = createHtmlArtboardStandaloneHtml({
    css: '.standalone { color: green; }'
  })

  assert.equal(standaloneHtml.includes('.standalone { color: green; }'), true)
})

test('standaloneHtml includes CSP script-src none', () => {
  const standaloneHtml = createHtmlArtboardStandaloneHtml(createHtmlArtboardDocument())

  assert.equal(standaloneHtml.includes("script-src 'none'"), true)
})

test('standaloneHtml does not include generated script tags', () => {
  const standaloneHtml = createHtmlArtboardStandaloneHtml(createHtmlArtboardDocument())

  assert.equal(/<script\b/i.test(standaloneHtml), false)
})

test('export helpers do not mutate input', () => {
  const document = {
    html: '<section>Stable export</section>',
    css: '.stable-export { color: black; }',
    fusionPatches: [{ id: 'patch:export-stable', value: 'Original' }]
  }
  const before = JSON.stringify(document)

  createHtmlArtboardExportBundle(document)
  createHtmlArtboardStandaloneHtml(document)
  createHtmlArtboardExportFileName(document, 'json')

  assert.equal(JSON.stringify(document), before)
})

test('export helpers work with partial document through ensureHtmlArtboardDocument', () => {
  const bundle = createHtmlArtboardExportBundle({
    html: '<main>Partial export</main>'
  })
  const parsed = JSON.parse(bundle.json)

  assert.equal(bundle.html, '<main>Partial export</main>')
  assert.equal(parsed.type, 'cowart-html-artboard')
  assert.equal(bundle.standaloneHtml.includes('<main>Partial export</main>'), true)
})

test('createHtmlArtboardExportFileName returns safe filename', () => {
  const filename = createHtmlArtboardExportFileName(
    createHtmlArtboardDocument({
      meta: { exportName: 'Poster / Draft: 01?' }
    }),
    'json'
  )

  assert.equal(filename.includes('/'), false)
  assert.equal(filename.includes(':'), false)
  assert.equal(filename.includes('?'), false)
  assert.equal(filename, 'poster-draft-01.json')
})

test('createHtmlArtboardExportFileName applies extension', () => {
  assert.equal(createHtmlArtboardExportFileName({ meta: { exportName: 'Source' } }, 'html'), 'source.html')
  assert.equal(createHtmlArtboardExportFileName({ meta: { exportName: 'Styles' } }, 'css'), 'styles.css')
})

test('createHtmlArtboardMutation returns required fields', () => {
  const mutation = createHtmlArtboardMutation('document_meta_update', { label: 'Updated' })

  assert.equal(typeof mutation.id, 'string')
  assert.equal(mutation.type, 'document_meta_update')
  assert.equal(typeof mutation.timestamp, 'string')
  assert.equal(mutation.target, 'runtimeDocument')
  assert.deepEqual(mutation.payload, { label: 'Updated' })
  assert.equal(mutation.meta.source, 'html-artboard-editor')
})

test('createSourceUpdateMutations creates html_update when html changes', () => {
  const before = createHtmlArtboardDocument({ html: '<section>Before</section>' })
  const after = { ...before, html: '<section>After</section>' }
  const mutations = createSourceUpdateMutations(before, after)

  assert.equal(mutations.length, 1)
  assert.equal(mutations[0].type, 'html_update')
  assert.equal(mutations[0].payload.previousHtml, '<section>Before</section>')
  assert.equal(mutations[0].payload.nextHtml, '<section>After</section>')
})

test('createSourceUpdateMutations creates css_update when css changes', () => {
  const before = createHtmlArtboardDocument({ css: '.before { color: black; }' })
  const after = { ...before, css: '.after { color: blue; }' }
  const mutations = createSourceUpdateMutations(before, after)

  assert.equal(mutations.length, 1)
  assert.equal(mutations[0].type, 'css_update')
  assert.equal(mutations[0].payload.previousCss, '.before { color: black; }')
  assert.equal(mutations[0].payload.nextCss, '.after { color: blue; }')
})

test('createSourceUpdateMutations returns empty array when nothing changes', () => {
  const document = createHtmlArtboardDocument()
  const mutations = createSourceUpdateMutations(document, document)

  assert.deepEqual(mutations, [])
})

test('appendHtmlArtboardMutations appends without mutating input', () => {
  const document = createHtmlArtboardDocument({
    mutationLog: [createHtmlArtboardMutation('document_meta_update', { value: 'existing' })]
  })
  const before = JSON.stringify(document)
  const mutation = createHtmlArtboardMutation('html_update', {
    previousHtml: '<section>Before</section>',
    nextHtml: '<section>After</section>'
  })
  const updated = appendHtmlArtboardMutations(document, [mutation])

  assert.equal(updated.mutationLog.length, 2)
  assert.equal(updated.mutationLog[1].type, 'html_update')
  assert.equal(JSON.stringify(document), before)
})

test('updateHtmlArtboardSource updates html', () => {
  const document = createHtmlArtboardDocument({ html: '<section>Before</section>' })
  const updated = updateHtmlArtboardSource(document, { html: '<section>After</section>' })

  assert.equal(updated.html, '<section>After</section>')
})

test('updateHtmlArtboardSource updates css', () => {
  const document = createHtmlArtboardDocument({ css: '.before { color: black; }' })
  const updated = updateHtmlArtboardSource(document, { css: '.after { color: blue; }' })

  assert.equal(updated.css, '.after { color: blue; }')
})

test('updateHtmlArtboardSource preserves fusionPatches', () => {
  const fusionPatches = [
    createFusionPatchPlaceholder({
      id: 'patch:preserve',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      value: 'Original'
    })
  ]
  const document = createHtmlArtboardDocument({ fusionPatches })
  const updated = updateHtmlArtboardSource(document, { html: '<section>Changed</section>' })

  assert.deepEqual(updated.fusionPatches, fusionPatches)
})

test('updateHtmlArtboardSource preserves assets', () => {
  const assets = [{ id: 'asset:preserve', type: 'image', src: '/assets/example.png' }]
  const document = createHtmlArtboardDocument({ assets })
  const updated = updateHtmlArtboardSource(document, { css: '.changed { color: green; }' })

  assert.deepEqual(updated.assets, assets)
})

test('updateHtmlArtboardSource with recordMutationLog false does not append', () => {
  const mutationLog = [{ id: 'mutation:existing', type: 'html_update' }]
  const document = createHtmlArtboardDocument({ mutationLog })
  const updated = updateHtmlArtboardSource(
    document,
    { html: '<section>Changed</section>' },
    { recordMutationLog: false }
  )

  assert.deepEqual(updated.mutationLog, mutationLog)
  assert.equal(updated.mutationLog.length, mutationLog.length)
})

test('updateHtmlArtboardSource does not mutate input', () => {
  const document = createHtmlArtboardDocument({
    html: '<section>Original</section>',
    css: '.original { color: black; }',
    fusionPatches: [{ id: 'patch:not-mutated', value: 'Original' }]
  })
  const before = JSON.stringify(document)

  updateHtmlArtboardSource(document, {
    html: '<section>Changed</section>',
    css: '.changed { color: blue; }'
  })

  assert.equal(JSON.stringify(document), before)
})

test('updateHtmlArtboardSource recalculates renderFingerprint', () => {
  const document = withRenderFingerprint(createHtmlArtboardDocument())
  const updated = updateHtmlArtboardSource(document, { html: '<section>Fingerprint changed</section>' })

  assert.notEqual(updated.renderFingerprint, document.renderFingerprint)
  assert.equal(updated.renderFingerprint, createRenderFingerprint(updated))
})

test('updateHtmlArtboardSource works with partial document through ensureHtmlArtboardDocument', () => {
  const updated = updateHtmlArtboardSource(
    { html: '<section>Partial before</section>' },
    { css: '.partial { color: red; }' }
  )

  assert.equal(updated.type, 'cowart-html-artboard')
  assert.equal(updated.html, '<section>Partial before</section>')
  assert.equal(updated.css, '.partial { color: red; }')
  assert.equal(updated.meta.provider, 'mock')
})

test('updateHtmlArtboardSource can update only html', () => {
  const document = createHtmlArtboardDocument({
    html: '<section>Before</section>',
    css: '.same { color: black; }'
  })
  const updated = updateHtmlArtboardSource(document, { html: '<section>Only HTML</section>' })

  assert.equal(updated.html, '<section>Only HTML</section>')
  assert.equal(updated.css, '.same { color: black; }')
})

test('updateHtmlArtboardSource can update only css', () => {
  const document = createHtmlArtboardDocument({
    html: '<section>Same</section>',
    css: '.before { color: black; }'
  })
  const updated = updateHtmlArtboardSource(document, { css: '.only-css { color: purple; }' })

  assert.equal(updated.html, '<section>Same</section>')
  assert.equal(updated.css, '.only-css { color: purple; }')
})

test('updateHtmlArtboardSource appends html_update mutation when html changes', () => {
  const document = createHtmlArtboardDocument({ html: '<section>Before</section>' })
  const updated = updateHtmlArtboardSource(document, { html: '<section>After</section>' })

  assert.equal(updated.mutationLog.length, 1)
  assert.equal(updated.mutationLog[0].type, 'html_update')
})

test('updateHtmlArtboardSource appends css_update mutation when css changes', () => {
  const document = createHtmlArtboardDocument({ css: '.before { color: black; }' })
  const updated = updateHtmlArtboardSource(document, { css: '.after { color: blue; }' })

  assert.equal(updated.mutationLog.length, 1)
  assert.equal(updated.mutationLog[0].type, 'css_update')
})

test('updateHtmlArtboardSource appends two mutations when html and css both change', () => {
  const document = createHtmlArtboardDocument({
    html: '<section>Before</section>',
    css: '.before { color: black; }'
  })
  const updated = updateHtmlArtboardSource(document, {
    html: '<section>After</section>',
    css: '.after { color: blue; }'
  })

  assert.equal(updated.mutationLog.length, 2)
  assert.deepEqual(
    updated.mutationLog.map((mutation) => mutation.type),
    ['html_update', 'css_update']
  )
})

test('updateHtmlArtboardSource does not append mutation when value unchanged', () => {
  const document = createHtmlArtboardDocument({
    html: '<section>Same</section>',
    css: '.same { color: black; }'
  })
  const updated = updateHtmlArtboardSource(document, {
    html: '<section>Same</section>',
    css: '.same { color: black; }'
  })

  assert.deepEqual(updated.mutationLog, [])
})

test('updateHtmlArtboardSource preserves existing mutationLog', () => {
  const existingMutation = createHtmlArtboardMutation('document_meta_update', { value: 'existing' })
  const document = createHtmlArtboardDocument({
    html: '<section>Before</section>',
    mutationLog: [existingMutation]
  })
  const updated = updateHtmlArtboardSource(document, { html: '<section>After</section>' })

  assert.equal(updated.mutationLog.length, 2)
  assert.deepEqual(updated.mutationLog[0], existingMutation)
  assert.equal(updated.mutationLog[1].type, 'html_update')
})

test('updateHtmlArtboardSource recalculates renderFingerprint after mutations', () => {
  const document = withRenderFingerprint(createHtmlArtboardDocument())
  const updated = updateHtmlArtboardSource(document, { css: '.changed { color: blue; }' })

  assert.equal(updated.renderFingerprint, createRenderFingerprint(updated))
})

test('mutation payload includes previous and next values', () => {
  const document = createHtmlArtboardDocument({
    html: '<section>Before</section>',
    css: '.before { color: black; }'
  })
  const updated = updateHtmlArtboardSource(document, {
    html: '<section>After</section>',
    css: '.after { color: blue; }'
  })

  assert.equal(updated.mutationLog[0].payload.previousHtml, '<section>Before</section>')
  assert.equal(updated.mutationLog[0].payload.nextHtml, '<section>After</section>')
  assert.equal(updated.mutationLog[1].payload.previousCss, '.before { color: black; }')
  assert.equal(updated.mutationLog[1].payload.nextCss, '.after { color: blue; }')
})

test('mutation meta.source is html-artboard-editor', () => {
  const document = createHtmlArtboardDocument({ html: '<section>Before</section>' })
  const updated = updateHtmlArtboardSource(document, { html: '<section>After</section>' })

  assert.equal(updated.mutationLog[0].meta.source, 'html-artboard-editor')
})

test('addFusionPatchPlaceholderToHtmlArtboard appends patch', () => {
  const document = createHtmlArtboardDocument()
  const updated = addFusionPatchPlaceholderToHtmlArtboard(document, { id: 'patch:add' })

  assert.equal(updated.fusionPatches.length, 1)
  assert.equal(updated.fusionPatches[0].id, 'patch:add')
  assert.equal(updated.fusionPatches[0].type, 'fusion-patch')
})

test('addFusionPatchPlaceholderToHtmlArtboard does not mutate input', () => {
  const document = createHtmlArtboardDocument()
  const before = JSON.stringify(document)

  addFusionPatchPlaceholderToHtmlArtboard(document)

  assert.equal(JSON.stringify(document), before)
})

test('addFusionPatchPlaceholderToHtmlArtboard recalculates renderFingerprint', () => {
  const document = withRenderFingerprint(createHtmlArtboardDocument())
  const updated = addFusionPatchPlaceholderToHtmlArtboard(document)

  assert.notEqual(updated.renderFingerprint, document.renderFingerprint)
  assert.equal(updated.renderFingerprint, createRenderFingerprint(updated))
})

test('addFusionPatchPlaceholderToHtmlArtboard appends fusion_patch_create mutation by default', () => {
  const document = createHtmlArtboardDocument()
  const updated = addFusionPatchPlaceholderToHtmlArtboard(document)

  assert.equal(updated.mutationLog.length, 1)
  assert.equal(updated.mutationLog[0].type, 'fusion_patch_create')
})

test('addFusionPatchPlaceholderToHtmlArtboard with recordMutationLog false does not append mutation', () => {
  const existingMutation = createHtmlArtboardMutation('document_meta_update', { value: 'existing' })
  const document = createHtmlArtboardDocument({ mutationLog: [existingMutation] })
  const updated = addFusionPatchPlaceholderToHtmlArtboard(document, {
    id: 'patch:no-mutation',
    recordMutationLog: false
  })

  assert.equal(updated.fusionPatches.length, 1)
  assert.deepEqual(updated.mutationLog, [existingMutation])
})

test('fusion_patch_create mutation payload includes patchId and patch', () => {
  const updated = addFusionPatchPlaceholderToHtmlArtboard(createHtmlArtboardDocument(), {
    id: 'patch:payload'
  })
  const mutation = updated.mutationLog[0]

  assert.equal(mutation.payload.patchId, 'patch:payload')
  assert.equal(mutation.payload.patch.id, 'patch:payload')
  assert.equal(mutation.payload.patch.type, 'fusion-patch')
})

test('fusion_patch_create mutation meta.source is html-artboard-fusion-patch-panel', () => {
  const updated = addFusionPatchPlaceholderToHtmlArtboard(createHtmlArtboardDocument())

  assert.equal(updated.mutationLog[0].meta.source, 'html-artboard-fusion-patch-panel')
})

test('addFusionPatchPlaceholderToHtmlArtboard can create patch with selector', () => {
  const updated = addFusionPatchPlaceholderToHtmlArtboard(createHtmlArtboardDocument(), {
    selector: '[data-node="headline"]'
  })

  assert.equal(updated.fusionPatches[0].selector, '[data-node="headline"]')
  assert.equal(updated.fusionPatches[0].sourceSelector, '[data-node="headline"]')
})

test('addFusionPatchPlaceholderToHtmlArtboard can create patch with sourceText', () => {
  const updated = addFusionPatchPlaceholderToHtmlArtboard(createHtmlArtboardDocument(), {
    selector: '[data-node="subhead"]',
    sourceText: 'Helpful subheading'
  })

  assert.equal(updated.fusionPatches[0].sourceText, 'Helpful subheading')
})

test('added patch mutation payload includes selector/sourceText', () => {
  const updated = addFusionPatchPlaceholderToHtmlArtboard(createHtmlArtboardDocument(), {
    selector: '[data-node="cta"]',
    sourceText: 'Start now'
  })
  const patch = updated.mutationLog[0].payload.patch

  assert.equal(patch.selector, '[data-node="cta"]')
  assert.equal(patch.sourceSelector, '[data-node="cta"]')
  assert.equal(patch.sourceText, 'Start now')
})

test('adding targeted patch preserves existing fusionPatches', () => {
  const existingPatch = createFusionPatchPlaceholder({
    id: 'patch:existing',
    selector: '[data-node="existing"]',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  })
  const document = createHtmlArtboardDocument({ fusionPatches: [existingPatch] })
  const updated = addFusionPatchPlaceholderToHtmlArtboard(document, {
    selector: '[data-node="next"]',
    sourceText: 'Next'
  })

  assert.equal(updated.fusionPatches.length, 2)
  assert.deepEqual(updated.fusionPatches[0], existingPatch)
  assert.equal(updated.fusionPatches[1].selector, '[data-node="next"]')
})

test('adding targeted patch recalculates renderFingerprint', () => {
  const document = withRenderFingerprint(createHtmlArtboardDocument())
  const updated = addFusionPatchPlaceholderToHtmlArtboard(document, {
    selector: '[data-node="headline"]',
    sourceText: 'Headline'
  })

  assert.notEqual(updated.renderFingerprint, document.renderFingerprint)
  assert.equal(updated.renderFingerprint, createRenderFingerprint(updated))
})

test('updateFusionPatchInHtmlArtboard updates patch prompt', () => {
  const patch = createFusionPatchPlaceholder({ id: 'patch:update-prompt', prompt: 'Before' })
  const document = createHtmlArtboardDocument({ fusionPatches: [patch] })
  const updated = updateFusionPatchInHtmlArtboard(document, patch.id, { prompt: 'After' })

  assert.equal(updated.fusionPatches[0].prompt, 'After')
  assert.equal(updated.mutationLog[0].type, 'fusion_patch_update')
})

test('renameFusionPatchInHtmlArtboard renames patch', () => {
  const patch = createFusionPatchPlaceholder({ id: 'patch:rename', name: 'Before' })
  const document = createHtmlArtboardDocument({ fusionPatches: [patch] })
  const updated = renameFusionPatchInHtmlArtboard(document, patch.id, 'After')

  assert.equal(updated.fusionPatches[0].name, 'After')
  assert.equal(updated.mutationLog[0].type, 'fusion_patch_rename')
  assert.equal(updated.mutationLog[0].payload.previousName, 'Before')
  assert.equal(updated.mutationLog[0].payload.nextName, 'After')
})

test('updateFusionPatchRegionInHtmlArtboard updates patch region', () => {
  const patch = createFusionPatchPlaceholder({
    id: 'patch:region',
    region: { x: 1, y: 2, w: 3, h: 4 }
  })
  const document = createHtmlArtboardDocument({ fusionPatches: [patch] })
  const updated = updateFusionPatchRegionInHtmlArtboard(document, patch.id, {
    x: 10,
    y: 20,
    w: 120,
    h: 80
  })

  assert.deepEqual(updated.fusionPatches[0].region, { x: 10, y: 20, w: 120, h: 80 })
  assert.equal(updated.mutationLog[0].type, 'fusion_patch_region_update')
})

test('setFusionPatchVisibilityInHtmlArtboard hides patch', () => {
  const patch = createFusionPatchPlaceholder({ id: 'patch:hide', visible: true })
  const document = createHtmlArtboardDocument({ fusionPatches: [patch] })
  const updated = setFusionPatchVisibilityInHtmlArtboard(document, patch.id, false)

  assert.equal(updated.fusionPatches[0].visible, false)
  assert.equal(updated.mutationLog[0].type, 'fusion_patch_visibility_update')
  assert.equal(updated.mutationLog[0].payload.nextVisible, false)
})

test('setFusionPatchVisibilityInHtmlArtboard shows patch', () => {
  const patch = createFusionPatchPlaceholder({ id: 'patch:show', visible: false })
  const document = createHtmlArtboardDocument({ fusionPatches: [patch] })
  const updated = setFusionPatchVisibilityInHtmlArtboard(document, patch.id, true)

  assert.equal(updated.fusionPatches[0].visible, true)
  assert.equal(updated.mutationLog[0].type, 'fusion_patch_visibility_update')
  assert.equal(updated.mutationLog[0].payload.nextVisible, true)
})

test('deleteFusionPatchFromHtmlArtboard deletes patch', () => {
  const patch = createFusionPatchPlaceholder({ id: 'patch:delete' })
  const document = createHtmlArtboardDocument({ fusionPatches: [patch] })
  const updated = deleteFusionPatchFromHtmlArtboard(document, patch.id)

  assert.equal(updated.fusionPatches.length, 0)
  assert.equal(updated.mutationLog[0].type, 'fusion_patch_delete')
  assert.equal(updated.mutationLog[0].payload.patchId, patch.id)
})

test('fusion patch editing helpers support recordMutationLog false', () => {
  const patch = createFusionPatchPlaceholder({ id: 'patch:no-log', prompt: 'Before' })
  const document = createHtmlArtboardDocument({ fusionPatches: [patch] })
  const updated = updateFusionPatchInHtmlArtboard(
    document,
    patch.id,
    { prompt: 'After' },
    { recordMutationLog: false }
  )

  assert.equal(updated.fusionPatches[0].prompt, 'After')
  assert.equal(updated.mutationLog.length, 0)
})

test('fusion patch editing helpers recalculate renderFingerprint', () => {
  const patch = createFusionPatchPlaceholder({ id: 'patch:fingerprint', prompt: 'Before' })
  const document = withRenderFingerprint(createHtmlArtboardDocument({ fusionPatches: [patch] }))
  const updated = updateFusionPatchInHtmlArtboard(document, patch.id, { prompt: 'After' })

  assert.notEqual(updated.renderFingerprint, document.renderFingerprint)
  assert.equal(updated.renderFingerprint, createRenderFingerprint(updated))
})

test('fusion patch editing helpers do not mutate input document', () => {
  const patch = createFusionPatchPlaceholder({
    id: 'patch:not-mutated',
    prompt: 'Before',
    region: { x: 1, y: 2, w: 3, h: 4 }
  })
  const document = createHtmlArtboardDocument({ fusionPatches: [patch] })
  const before = JSON.stringify(document)

  updateFusionPatchInHtmlArtboard(document, patch.id, {
    prompt: 'After',
    region: { x: 10, y: 20, w: 120, h: 80 }
  })

  assert.equal(JSON.stringify(document), before)
})

test('deleteFusionPatchFromHtmlArtboard handles missing patch safely', () => {
  const patch = createFusionPatchPlaceholder({ id: 'patch:kept' })
  const document = createHtmlArtboardDocument({ fusionPatches: [patch] })
  const updated = deleteFusionPatchFromHtmlArtboard(document, 'patch:missing')

  assert.equal(updated.fusionPatches.length, 1)
  assert.equal(updated.fusionPatches[0].id, 'patch:kept')
  assert.equal(updated.mutationLog.length, 0)
})

test('visible false patch does not affect thumbnail overlay rendering', () => {
  const document = createHtmlArtboardDocument({
    fusionPatches: [
      createFusionPatchPlaceholder({
        name: 'Visible Overlay Patch',
        visible: true,
        region: { x: 10, y: 20, w: 120, h: 80 }
      }),
      createFusionPatchPlaceholder({
        name: 'Hidden Overlay Patch',
        visible: false,
        region: { x: 30, y: 40, w: 120, h: 80 }
      })
    ]
  })
  const overlay = createHtmlArtboardFusionPatchOverlaySvg(document)

  assert.equal(overlay.includes('Visible Overlay Patch'), true)
  assert.equal(overlay.includes('Hidden Overlay Patch'), false)
})

test('createMockFusionPatchAsset returns data URL', () => {
  const patch = createFusionPatchPlaceholder({ id: 'patch:mock-asset', prompt: 'Generate' })
  const asset = createMockFusionPatchAsset(patch, createHtmlArtboardDocument())

  assert.equal(asset.patchAssetUrl.startsWith('data:image/svg+xml;charset=utf-8,'), true)
})

test('generateMockFusionPatchAssetForHtmlArtboard writes patchAssetId and patchAssetUrl', () => {
  const patch = createFusionPatchPlaceholder({ id: 'patch:asset-fields' })
  const updated = generateMockFusionPatchAssetForHtmlArtboard(
    createHtmlArtboardDocument({ fusionPatches: [patch] }),
    patch.id
  )

  assert.equal(typeof updated.fusionPatches[0].patchAssetId, 'string')
  assert.equal(updated.fusionPatches[0].patchAssetUrl.startsWith('data:image/svg+xml'), true)
})

test('generateMockFusionPatchAssetForHtmlArtboard marks patch mock-generated', () => {
  const patch = createFusionPatchPlaceholder({ id: 'patch:asset-status' })
  const updated = generateMockFusionPatchAssetForHtmlArtboard(
    createHtmlArtboardDocument({ fusionPatches: [patch] }),
    patch.id
  )

  assert.equal(updated.fusionPatches[0].status, 'mock-generated')
  assert.equal(updated.fusionPatches[0].provider, 'mock')
})

test('generateMockFusionPatchAssetForHtmlArtboard appends mutationLog', () => {
  const patch = createFusionPatchPlaceholder({ id: 'patch:asset-mutation' })
  const updated = generateMockFusionPatchAssetForHtmlArtboard(
    createHtmlArtboardDocument({ fusionPatches: [patch] }),
    patch.id
  )

  assert.equal(updated.mutationLog.at(-1).type, 'fusion_patch_mock_asset_generate')
  assert.equal(updated.mutationLog.at(-1).payload.patchId, patch.id)
  assert.equal(updated.mutationLog.at(-1).payload.patchAssetId, updated.fusionPatches[0].patchAssetId)
})

test('generateMockFusionPatchAssetForHtmlArtboard recalculates renderFingerprint', () => {
  const patch = createFusionPatchPlaceholder({ id: 'patch:asset-fingerprint' })
  const document = withRenderFingerprint(createHtmlArtboardDocument({ fusionPatches: [patch] }))
  const updated = generateMockFusionPatchAssetForHtmlArtboard(document, patch.id)

  assert.notEqual(updated.renderFingerprint, document.renderFingerprint)
  assert.equal(updated.renderFingerprint, createRenderFingerprint(updated))
})

test('generateMockFusionPatchAssetForHtmlArtboard does not mutate input', () => {
  const patch = createFusionPatchPlaceholder({ id: 'patch:asset-immutable' })
  const document = createHtmlArtboardDocument({ fusionPatches: [patch] })
  const before = JSON.stringify(document)

  generateMockFusionPatchAssetForHtmlArtboard(document, patch.id)

  assert.equal(JSON.stringify(document), before)
})

test('generateMockFusionPatchAssetForHtmlArtboard supports recordMutationLog false', () => {
  const patch = createFusionPatchPlaceholder({ id: 'patch:asset-no-log' })
  const updated = generateMockFusionPatchAssetForHtmlArtboard(
    createHtmlArtboardDocument({ fusionPatches: [patch] }),
    patch.id,
    { recordMutationLog: false }
  )

  assert.equal(updated.fusionPatches[0].status, 'mock-generated')
  assert.equal(updated.mutationLog.length, 0)
})

test('generateMockFusionPatchAssetsForHtmlArtboard generates visible patch assets', () => {
  const visiblePatch = createFusionPatchPlaceholder({ id: 'patch:asset-visible' })
  const hiddenPatch = createFusionPatchPlaceholder({
    id: 'patch:asset-hidden',
    visible: false
  })
  const updated = generateMockFusionPatchAssetsForHtmlArtboard(
    createHtmlArtboardDocument({ fusionPatches: [visiblePatch, hiddenPatch] })
  )

  assert.equal(updated.fusionPatches[0].status, 'mock-generated')
  assert.equal(updated.fusionPatches[1].patchAssetUrl, null)
})

test('thumbnail includes generated patch indication', () => {
  const patch = createFusionPatchPlaceholder({
    id: 'patch:asset-thumbnail',
    region: { x: 10, y: 20, w: 160, h: 90 }
  })
  const updated = generateMockFusionPatchAssetForHtmlArtboard(
    createHtmlArtboardDocument({ fusionPatches: [patch] }),
    patch.id
  )
  const svg = createHtmlArtboardThumbnailSvg(updated)

  assert.equal(svg.includes('mock-generated'), true)
  assert.equal(svg.includes('data:image/svg+xml'), true)
})

test('createHtmlArtboardAiProviderRequest returns kind/version', () => {
  const patch = createFusionPatchPlaceholder({ id: 'patch:provider-request' })
  const request = createHtmlArtboardAiProviderRequest(createHtmlArtboardDocument(), patch)

  assert.equal(request.kind, 'html-artboard-ai-provider-request')
  assert.equal(request.version, 1)
})

test('createHtmlArtboardAiProviderRequest includes normalized document', () => {
  const request = createHtmlArtboardAiProviderRequest(
    { id: 'html-artboard:provider-document' },
    { id: 'patch:provider-document' }
  )

  assert.equal(request.document.type, 'cowart-html-artboard')
  assert.equal(request.document.id, 'html-artboard:provider-document')
})

test('createHtmlArtboardAiProviderRequest includes normalized patch', () => {
  const request = createHtmlArtboardAiProviderRequest(createHtmlArtboardDocument(), {
    id: 'patch:provider-normalized',
    type: 'ai-fusion-placeholder',
    prompt: 'Normalize patch'
  })

  assert.equal(request.patch.type, 'fusion-patch')
  assert.equal(request.patch.id, 'patch:provider-normalized')
})

test('createHtmlArtboardAiProviderRequest target includes selector/sourceText/region', () => {
  const patch = createFusionPatchPlaceholder({
    selector: '[data-node="headline"]',
    sourceText: 'Headline',
    region: { x: 10, y: 20, w: 120, h: 80 }
  })
  const request = createHtmlArtboardAiProviderRequest(createHtmlArtboardDocument(), patch)

  assert.equal(request.target.selector, '[data-node="headline"]')
  assert.equal(request.target.sourceText, 'Headline')
  assert.deepEqual(request.target.region, { x: 10, y: 20, w: 120, h: 80 })
})

test('createHtmlArtboardAiProviderRequest constraints preserve text editability', () => {
  const request = createHtmlArtboardAiProviderRequest(
    createHtmlArtboardDocument(),
    createFusionPatchPlaceholder()
  )

  assert.equal(request.constraints.preserveTextEditability, true)
})

test('createHtmlArtboardAiProviderRequest constraints doNotModifyHtml true', () => {
  const request = createHtmlArtboardAiProviderRequest(
    createHtmlArtboardDocument(),
    createFusionPatchPlaceholder()
  )

  assert.equal(request.constraints.doNotModifyHtml, true)
})

test('createHtmlArtboardAiProviderRequest constraints doNotModifyCss true', () => {
  const request = createHtmlArtboardAiProviderRequest(
    createHtmlArtboardDocument(),
    createFusionPatchPlaceholder()
  )

  assert.equal(request.constraints.doNotModifyCss, true)
})

test('createHtmlArtboardAiProviderRequest providerOptions provider defaults mock', () => {
  const request = createHtmlArtboardAiProviderRequest(
    createHtmlArtboardDocument(),
    createFusionPatchPlaceholder()
  )

  assert.equal(request.providerOptions.provider, 'mock')
})

test('createHtmlArtboardAiProviderRequest does not mutate input', () => {
  const document = createHtmlArtboardDocument()
  const patch = createFusionPatchPlaceholder({ id: 'patch:provider-immutable' })
  const before = JSON.stringify({ document, patch })

  createHtmlArtboardAiProviderRequest(document, patch)

  assert.equal(JSON.stringify({ document, patch }), before)
})

test('validateHtmlArtboardAiProviderRequest accepts valid request', () => {
  const request = createHtmlArtboardAiProviderRequest(
    createHtmlArtboardDocument(),
    createFusionPatchPlaceholder()
  )
  const result = validateHtmlArtboardAiProviderRequest(request)

  assert.equal(result.ok, true)
})

test('createHtmlArtboardAiProviderResult returns kind/version', () => {
  const result = createHtmlArtboardAiProviderResult({ ok: false })

  assert.equal(result.kind, 'html-artboard-ai-provider-result')
  assert.equal(result.version, 1)
})

test('validateHtmlArtboardAiProviderResult accepts ok mock result', () => {
  const result = createHtmlArtboardAiProviderResult({
    ok: true,
    provider: 'mock',
    model: 'mock-fusion-patch-v1',
    patchAssetId: 'mock-asset:test',
    patchAssetUrl: 'data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C%2Fsvg%3E',
    mimeType: 'image/svg+xml'
  })

  assert.equal(validateHtmlArtboardAiProviderResult(result).ok, true)
})

test('validateHtmlArtboardAiProviderResult rejects missing required fields when ok true', () => {
  const result = createHtmlArtboardAiProviderResult({
    ok: true,
    provider: 'mock',
    model: 'mock-fusion-patch-v1'
  })

  assert.equal(validateHtmlArtboardAiProviderResult(result).ok, false)
})

test('ok false provider result can omit patchAssetUrl', () => {
  const result = createHtmlArtboardAiProviderResult({
    ok: false,
    provider: 'mock',
    error: 'No asset created'
  })

  assert.equal(result.patchAssetUrl, null)
  assert.equal(validateHtmlArtboardAiProviderResult(result).ok, true)
})

test('createMockHtmlArtboardAiProvider returns name mock', () => {
  const provider = createMockHtmlArtboardAiProvider()

  assert.equal(provider.name, 'mock')
})

test('mock provider generateFusionPatchAsset returns ok true', () => {
  const provider = createMockHtmlArtboardAiProvider()
  const request = createHtmlArtboardAiProviderRequest(
    createHtmlArtboardDocument(),
    createFusionPatchPlaceholder()
  )
  const result = provider.generateFusionPatchAsset(request)

  assert.equal(result.ok, true)
})

test('mock provider result has patchAssetUrl', () => {
  const provider = createMockHtmlArtboardAiProvider()
  const request = createHtmlArtboardAiProviderRequest(
    createHtmlArtboardDocument(),
    createFusionPatchPlaceholder()
  )
  const result = provider.generateFusionPatchAsset(request)

  assert.equal(result.patchAssetUrl.startsWith('data:image/svg+xml'), true)
})

test('mock provider result has patchAssetId', () => {
  const provider = createMockHtmlArtboardAiProvider()
  const request = createHtmlArtboardAiProviderRequest(
    createHtmlArtboardDocument(),
    createFusionPatchPlaceholder()
  )
  const result = provider.generateFusionPatchAsset(request)

  assert.equal(typeof result.patchAssetId, 'string')
})

test('mock provider result has cost 0', () => {
  const provider = createMockHtmlArtboardAiProvider()
  const request = createHtmlArtboardAiProviderRequest(
    createHtmlArtboardDocument(),
    createFusionPatchPlaceholder()
  )
  const result = provider.generateFusionPatchAsset(request)

  assert.equal(result.cost, 0)
})

test('mock provider does not mutate request', () => {
  const provider = createMockHtmlArtboardAiProvider()
  const request = createHtmlArtboardAiProviderRequest(
    createHtmlArtboardDocument(),
    createFusionPatchPlaceholder()
  )
  const before = JSON.stringify(request)

  provider.generateFusionPatchAsset(request)

  assert.equal(JSON.stringify(request), before)
})

test('generateHtmlArtboardFusionPatchAssetWithProvider updates target patch', () => {
  const patch = createFusionPatchPlaceholder({ id: 'patch:provider-generate' })
  const updated = generateHtmlArtboardFusionPatchAssetWithProvider(
    createHtmlArtboardDocument({ fusionPatches: [patch] }),
    patch.id
  )

  assert.equal(updated.fusionPatches[0].id, patch.id)
  assert.equal(updated.fusionPatches[0].status, 'mock-generated')
})

test('generateHtmlArtboardFusionPatchAssetWithProvider generated patch has patchAssetUrl', () => {
  const patch = createFusionPatchPlaceholder({ id: 'patch:provider-url' })
  const updated = generateHtmlArtboardFusionPatchAssetWithProvider(
    createHtmlArtboardDocument({ fusionPatches: [patch] }),
    patch.id
  )

  assert.equal(updated.fusionPatches[0].patchAssetUrl.startsWith('data:image/svg+xml'), true)
})

test('generateHtmlArtboardFusionPatchAssetWithProvider generated patch has provider mock', () => {
  const patch = createFusionPatchPlaceholder({ id: 'patch:provider-name' })
  const updated = generateHtmlArtboardFusionPatchAssetWithProvider(
    createHtmlArtboardDocument({ fusionPatches: [patch] }),
    patch.id
  )

  assert.equal(updated.fusionPatches[0].provider, 'mock')
})

test('generateHtmlArtboardFusionPatchAssetWithProvider generated patch has status mock-generated', () => {
  const patch = createFusionPatchPlaceholder({ id: 'patch:provider-status' })
  const updated = generateHtmlArtboardFusionPatchAssetWithProvider(
    createHtmlArtboardDocument({ fusionPatches: [patch] }),
    patch.id
  )

  assert.equal(updated.fusionPatches[0].status, 'mock-generated')
})

test('generateHtmlArtboardFusionPatchAssetWithProvider records provider mutationLog', () => {
  const patch = createFusionPatchPlaceholder({ id: 'patch:provider-mutation' })
  const updated = generateHtmlArtboardFusionPatchAssetWithProvider(
    createHtmlArtboardDocument({ fusionPatches: [patch] }),
    patch.id
  )

  assert.equal(updated.mutationLog.at(-1).type, 'fusion_patch_provider_asset_generate')
  assert.equal(updated.mutationLog.at(-1).payload.provider, 'mock')
  assert.equal(updated.mutationLog.at(-1).payload.patchId, patch.id)
})

test('generateHtmlArtboardFusionPatchAssetWithProvider changes renderFingerprint', () => {
  const patch = createFusionPatchPlaceholder({ id: 'patch:provider-fingerprint' })
  const document = withRenderFingerprint(createHtmlArtboardDocument({ fusionPatches: [patch] }))
  const updated = generateHtmlArtboardFusionPatchAssetWithProvider(document, patch.id)

  assert.notEqual(updated.renderFingerprint, document.renderFingerprint)
  assert.equal(updated.renderFingerprint, createRenderFingerprint(updated))
})

test('generateHtmlArtboardFusionPatchAssetWithProvider does not mutate input document', () => {
  const patch = createFusionPatchPlaceholder({ id: 'patch:provider-immutable-doc' })
  const document = createHtmlArtboardDocument({ fusionPatches: [patch] })
  const before = JSON.stringify(document)

  generateHtmlArtboardFusionPatchAssetWithProvider(document, patch.id)

  assert.equal(JSON.stringify(document), before)
})

test('generateHtmlArtboardFusionPatchAssetWithProvider provider failure marks patch failed', () => {
  const patch = createFusionPatchPlaceholder({ id: 'patch:provider-failed' })
  const updated = generateHtmlArtboardFusionPatchAssetWithProvider(
    createHtmlArtboardDocument({ fusionPatches: [patch] }),
    patch.id,
    {
      provider: {
        name: 'mock',
        generateFusionPatchAsset() {
          return { ok: false, provider: 'mock', error: 'Provider failed' }
        }
      }
    }
  )

  assert.equal(updated.fusionPatches[0].status, 'failed')
  assert.equal(updated.fusionPatches[0].meta.providerError, 'Provider failed')
})

test('generateHtmlArtboardFusionPatchAssetWithProvider missing patchId throws', () => {
  assert.throws(() =>
    generateHtmlArtboardFusionPatchAssetWithProvider(
      createHtmlArtboardDocument({ fusionPatches: [] }),
      'patch:missing'
    )
  )
})

test('getDefaultHtmlArtboardAiProvider returns mock provider', () => {
  const provider = getDefaultHtmlArtboardAiProvider()

  assert.equal(provider.name, 'mock')
})

test('applyHtmlArtboardMutation applies html_update', () => {
  const document = createHtmlArtboardDocument({ html: '<section>Before</section>' })
  const updated = applyHtmlArtboardMutation(document, {
    type: 'html_update',
    payload: { nextHtml: '<section>After</section>' }
  })

  assert.equal(updated.html, '<section>After</section>')
  assert.deepEqual(updated.mutationLog, [])
})

test('applyHtmlArtboardMutation applies css_update', () => {
  const document = createHtmlArtboardDocument({ css: '.before { color: black; }' })
  const updated = applyHtmlArtboardMutation(document, {
    type: 'css_update',
    payload: { nextCss: '.after { color: blue; }' }
  })

  assert.equal(updated.css, '.after { color: blue; }')
})

test('applyHtmlArtboardMutation ignores unknown mutation by default', () => {
  const document = createHtmlArtboardDocument({ html: '<section>Stable</section>' })
  const updated = applyHtmlArtboardMutation(document, {
    type: 'unknown_mutation',
    payload: { nextHtml: '<section>Ignored</section>' }
  })

  assert.equal(updated.html, '<section>Stable</section>')
})

test('applyHtmlArtboardMutation throws unknown mutation in strict mode', () => {
  assert.throws(() =>
    applyHtmlArtboardMutation(
      createHtmlArtboardDocument(),
      { type: 'unknown_mutation', payload: {} },
      { strict: true }
    )
  )
})

test('applyHtmlArtboardMutation does not mutate input document', () => {
  const document = createHtmlArtboardDocument({
    html: '<section>Original</section>',
    fusionPatches: [{ id: 'patch:original', prompt: 'Original' }]
  })
  const before = JSON.stringify(document)

  applyHtmlArtboardMutation(document, {
    type: 'html_update',
    payload: { nextHtml: '<section>Changed</section>' }
  })

  assert.equal(JSON.stringify(document), before)
})

test('applyHtmlArtboardMutation recalculates renderFingerprint', () => {
  const document = withRenderFingerprint(createHtmlArtboardDocument())
  const updated = applyHtmlArtboardMutation(document, {
    type: 'html_update',
    payload: { nextHtml: '<section>Replay fingerprint</section>' }
  })

  assert.notEqual(updated.renderFingerprint, document.renderFingerprint)
  assert.equal(updated.renderFingerprint, createRenderFingerprint(updated))
})

test('applyHtmlArtboardMutation applies fusion_patch_create', () => {
  const patch = createFusionPatchPlaceholder({ id: 'patch:replay-add' })
  const updated = applyHtmlArtboardMutation(createHtmlArtboardDocument(), {
    type: 'fusion_patch_create',
    payload: { patch }
  })

  assert.equal(updated.fusionPatches.length, 1)
  assert.equal(updated.fusionPatches[0].id, 'patch:replay-add')
})

test('fusion_patch_create replay normalizes patch', () => {
  const updated = applyHtmlArtboardMutation(createHtmlArtboardDocument(), {
    type: 'fusion_patch_create',
    payload: {
      patch: {
        id: 'patch:legacy-replay',
        type: 'ai-fusion-placeholder',
        selector: '[data-node="headline"]',
        prompt: 'Legacy replay'
      }
    }
  })

  assert.equal(updated.fusionPatches[0].type, 'fusion-patch')
  assert.equal(updated.fusionPatches[0].selector, '[data-node="headline"]')
  assert.equal(updated.fusionPatches[0].prompt, 'Legacy replay')
})

test('fusion_patch_create does not duplicate same patch id on repeated replay', () => {
  const mutation = {
    type: 'fusion_patch_create',
    payload: { patch: { id: 'patch:dedupe', prompt: 'Dedupe' } }
  }
  const once = applyHtmlArtboardMutation(createHtmlArtboardDocument(), mutation)
  const twice = applyHtmlArtboardMutation(once, mutation)

  assert.equal(twice.fusionPatches.length, 1)
  assert.equal(twice.fusionPatches[0].id, 'patch:dedupe')
})

test('fusion_patch_create preserves existing fusionPatches', () => {
  const existingPatch = createFusionPatchPlaceholder({ id: 'patch:existing-replay' })
  const document = createHtmlArtboardDocument({ fusionPatches: [existingPatch] })
  const updated = applyHtmlArtboardMutation(document, {
    type: 'fusion_patch_create',
    payload: { patch: { id: 'patch:new-replay' } }
  })

  assert.equal(updated.fusionPatches.length, 2)
  assert.equal(updated.fusionPatches[0].id, 'patch:existing-replay')
  assert.equal(updated.fusionPatches[1].id, 'patch:new-replay')
})

test('applyHtmlArtboardMutation applies fusion_patch_mock_asset_generate', () => {
  const patch = createFusionPatchPlaceholder({ id: 'patch:replay-mock-asset' })
  const document = createHtmlArtboardDocument({ fusionPatches: [patch] })
  const nextPatch = {
    ...patch,
    patchAssetId: 'mock-fusion-patch-asset:replay',
    patchAssetUrl: 'data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C%2Fsvg%3E',
    status: 'mock-generated',
    provider: 'mock'
  }
  const updated = applyHtmlArtboardMutation(document, {
    type: 'fusion_patch_mock_asset_generate',
    payload: {
      patchId: patch.id,
      nextPatch
    }
  })

  assert.equal(updated.fusionPatches[0].patchAssetId, 'mock-fusion-patch-asset:replay')
  assert.equal(updated.fusionPatches[0].status, 'mock-generated')
})

test('applyHtmlArtboardMutation applies fusion_patch_external_asset_attach', () => {
  const patch = createFusionPatchPlaceholder({ id: 'patch:replay-external-asset' })
  const document = createHtmlArtboardDocument({ fusionPatches: [patch] })
  const nextPatch = {
    ...patch,
    patchAssetId: 'external-fusion-patch-asset:replay',
    patchAssetUrl: '/page-assets/page-1/replay.png',
    status: 'generated',
    provider: 'external-image-gen'
  }
  const updated = applyHtmlArtboardMutation(document, {
    type: 'fusion_patch_external_asset_attach',
    payload: {
      patchId: patch.id,
      nextPatch
    }
  })

  assert.equal(updated.fusionPatches[0].patchAssetId, 'external-fusion-patch-asset:replay')
  assert.equal(updated.fusionPatches[0].patchAssetUrl, '/page-assets/page-1/replay.png')
  assert.equal(updated.fusionPatches[0].status, 'generated')
})

test('applyHtmlArtboardMutation applies background_asset_attach', () => {
  const document = createHtmlArtboardDocument()
  const nextBackground = {
    type: 'image',
    identity: 'background:replay',
    backgroundAssetId: 'background:replay',
    backgroundAssetUrl: '/page-assets/page-1/background.png',
    status: 'generated',
    provider: 'external-image-gen'
  }
  const updated = applyHtmlArtboardMutation(document, {
    type: 'background_asset_attach',
    payload: {
      nextBackground
    }
  })

  assert.equal(updated.background.type, 'image')
  assert.equal(updated.background.backgroundAssetUrl, '/page-assets/page-1/background.png')
  assert.equal(updated.background.status, 'generated')
})

test('applyHtmlArtboardMutation applies text_layer_sync', () => {
  const document = createHtmlArtboardDocument({
    html: '<section><h1 data-node="headline">Before</h1></section>'
  })
  const nextTextLayers = [
    { id: 'layer:headline', dataNode: 'headline', text: 'After', x: 12, y: 24, w: 320, h: 64 }
  ]
  const updated = applyHtmlArtboardMutation(document, {
    type: 'text_layer_sync',
    payload: {
      nextHtml: '<section><h1 data-node="headline">After</h1></section>',
      nextTextLayers
    }
  })

  assert.equal(updated.html.includes('After'), true)
  assert.equal(updated.textLayers.length, 1)
  assert.equal(updated.textLayers[0].text, 'After')
})

test('applyHtmlArtboardMutation applies document_meta_update', () => {
  const document = createHtmlArtboardDocument({ meta: { provider: 'mock' } })
  const updated = applyHtmlArtboardMutation(document, {
    type: 'document_meta_update',
    payload: { meta: { title: 'Replay title' } }
  })

  assert.equal(updated.meta.title, 'Replay title')
})

test('document_meta_update preserves existing meta fields', () => {
  const document = createHtmlArtboardDocument({ meta: { provider: 'mock', title: 'Original' } })
  const updated = applyHtmlArtboardMutation(document, {
    type: 'document_meta_update',
    payload: { meta: { exportName: 'Replay export' } }
  })

  assert.equal(updated.meta.provider, 'mock')
  assert.equal(updated.meta.title, 'Original')
  assert.equal(updated.meta.exportName, 'Replay export')
})

test('replayHtmlArtboardMutations applies mutations in order', () => {
  const base = createHtmlArtboardDocument({ html: '<section>Base</section>', css: '.base {}' })
  const replayed = replayHtmlArtboardMutations(base, [
    { type: 'html_update', payload: { nextHtml: '<section>First</section>' } },
    { type: 'html_update', payload: { nextHtml: '<section>Second</section>' } },
    { type: 'css_update', payload: { nextCss: '.second { color: green; }' } }
  ])

  assert.equal(replayed.html, '<section>Second</section>')
  assert.equal(replayed.css, '.second { color: green; }')
})

test('replayHtmlArtboardMutations handles non-array mutations', () => {
  const document = createHtmlArtboardDocument({ html: '<section>Base</section>' })
  const replayed = replayHtmlArtboardMutations(document, null)

  assert.equal(replayed.html, '<section>Base</section>')
  assert.deepEqual(replayed.mutationLog, [])
})

test('replayHtmlArtboardMutations does not mutate input mutations', () => {
  const mutations = [
    {
      type: 'fusion_patch_create',
      payload: { patch: { id: 'patch:mutation-input', prompt: 'Original' } }
    }
  ]
  const before = JSON.stringify(mutations)

  replayHtmlArtboardMutations(createHtmlArtboardDocument(), mutations)

  assert.equal(JSON.stringify(mutations), before)
})

test('replayHtmlArtboardMutations can include mutationLog in output', () => {
  const mutations = [{ type: 'html_update', payload: { nextHtml: '<section>Logged</section>' } }]
  const replayed = replayHtmlArtboardMutations(createHtmlArtboardDocument(), mutations)

  assert.deepEqual(replayed.mutationLog, mutations)
  assert.notEqual(replayed.mutationLog, mutations)
})

test('replayHtmlArtboardMutations can omit mutationLog if options.includeMutationLog is false', () => {
  const replayed = replayHtmlArtboardMutations(
    createHtmlArtboardDocument(),
    [{ type: 'html_update', payload: { nextHtml: '<section>No log</section>' } }],
    { includeMutationLog: false }
  )

  assert.deepEqual(replayed.mutationLog, [])
})

test('createReplayBaseDocument returns normalized base', () => {
  const base = createReplayBaseDocument({ id: 'html-artboard:replay-base' })

  assert.equal(base.id, 'html-artboard:replay-base')
  assert.equal(base.type, 'cowart-html-artboard')
  assert.deepEqual(base.mutationLog, [])
  assert.equal(base.renderFingerprint, createRenderFingerprint(base))
})

test('createReplayBaseDocument uses options.initialHtml', () => {
  const document = createHtmlArtboardDocument({ html: '<section>Current</section>' })
  const base = createReplayBaseDocument(document, { initialHtml: '<section>Initial</section>' })

  assert.equal(base.html, '<section>Initial</section>')
})

test('createReplayBaseDocument uses options.initialCss', () => {
  const document = createHtmlArtboardDocument({ css: '.current { color: red; }' })
  const base = createReplayBaseDocument(document, { initialCss: '.initial { color: blue; }' })

  assert.equal(base.css, '.initial { color: blue; }')
})

test('createReplayBaseDocument uses options.initialFusionPatches', () => {
  const document = createHtmlArtboardDocument({
    fusionPatches: [{ id: 'patch:current' }]
  })
  const base = createReplayBaseDocument(document, {
    initialFusionPatches: [{ id: 'patch:initial', prompt: 'Initial' }]
  })

  assert.equal(base.fusionPatches.length, 1)
  assert.equal(base.fusionPatches[0].id, 'patch:initial')
  assert.equal(base.fusionPatches[0].type, 'fusion-patch')
})

test('replayHtmlArtboardMutationLog returns a document', () => {
  const replayed = replayHtmlArtboardMutationLog(
    createHtmlArtboardDocument({
      meta: { initialHtml: '<section>Initial</section>' },
      mutationLog: [{ type: 'html_update', payload: { nextHtml: '<section>Replay</section>' } }]
    })
  )

  assert.equal(replayed.type, 'cowart-html-artboard')
  assert.equal(replayed.html, '<section>Replay</section>')
})

test('replayHtmlArtboardMutationLog uses document.mutationLog', () => {
  const document = createHtmlArtboardDocument({
    meta: { initialHtml: '<section>Initial</section>' },
    html: '<section>Current</section>',
    mutationLog: [{ type: 'html_update', payload: { nextHtml: '<section>From log</section>' } }]
  })
  const replayed = replayHtmlArtboardMutationLog(document)

  assert.equal(replayed.html, '<section>From log</section>')
  assert.equal(replayed.mutationLog.length, 1)
})

test('replayHtmlArtboardMutationLog works with html_update/css_update/fusion_patch_create', () => {
  const replayed = replayHtmlArtboardMutationLog(
    createHtmlArtboardDocument({
      meta: {
        initialHtml: '<section>Initial</section>',
        initialCss: '.initial { color: black; }',
        initialFusionPatches: []
      },
      mutationLog: [
        { type: 'html_update', payload: { nextHtml: '<section>Replay HTML</section>' } },
        { type: 'css_update', payload: { nextCss: '.replay { color: purple; }' } },
        { type: 'fusion_patch_create', payload: { patch: { id: 'patch:replayed' } } }
      ]
    })
  )

  assert.equal(replayed.html, '<section>Replay HTML</section>')
  assert.equal(replayed.css, '.replay { color: purple; }')
  assert.equal(replayed.fusionPatches.length, 1)
  assert.equal(replayed.fusionPatches[0].id, 'patch:replayed')
})

test('replayHtmlArtboardMutationLog does not mutate input document', () => {
  const document = createHtmlArtboardDocument({
    html: '<section>Current</section>',
    mutationLog: [{ type: 'html_update', payload: { nextHtml: '<section>Replay</section>' } }]
  })
  const before = JSON.stringify(document)

  replayHtmlArtboardMutationLog(document)

  assert.equal(JSON.stringify(document), before)
})

test('isCowartHtmlArtboardShape returns true for meta.cowartHtmlArtboard', () => {
  assert.equal(isCowartHtmlArtboardShape({ meta: { cowartHtmlArtboard: true } }), true)
})

test('isCowartHtmlArtboardShape returns false for normal frame shape', () => {
  assert.equal(
    isCowartHtmlArtboardShape({
      typeName: 'shape',
      type: 'frame',
      meta: {}
    }),
    false
  )
})

test('htmlArtboardToCowartShape creates frame shape JSON', () => {
  const document = createHtmlArtboardDocument({ id: 'html-artboard:bridge' })
  const shape = htmlArtboardToCowartShape(document, {
    shapeId: 'shape:custom-html-artboard',
    x: 32,
    y: 64,
    parentId: 'page:1',
    index: 'a1',
    name: 'Poster Artboard'
  })

  assert.equal(shape.id, 'shape:custom-html-artboard')
  assert.equal(shape.typeName, 'shape')
  assert.equal(shape.type, 'frame')
  assert.equal(shape.x, 32)
  assert.equal(shape.y, 64)
  assert.equal(shape.rotation, 0)
  assert.equal(shape.isLocked, false)
  assert.equal(shape.opacity, 1)
  assert.equal(shape.parentId, 'page:1')
  assert.equal(shape.index, 'a1')
  assert.equal(shape.props.name, 'Poster Artboard')
  assert.equal(shape.props.color, 'blue')
  assert.equal(shape.meta.cowartHtmlArtboard, true)
  assert.equal(shape.meta.cowartHtmlArtboardVersion, 1)
  assert.equal(shape.meta.htmlArtboardId, document.id)
  assert.deepEqual(shape.meta.runtimeDocument, document)
  assert.notEqual(shape.meta.runtimeDocument, document)
})

test('htmlArtboardToCowartShape exposes fields for tldraw frame partial', () => {
  const shape = htmlArtboardToCowartShape(createHtmlArtboardDocument(), {
    shapeId: 'shape:html-artboard-partial',
    name: 'HTML Artboard'
  })
  const partial = {
    id: shape.id,
    type: shape.type,
    x: shape.x,
    y: shape.y,
    props: shape.props,
    meta: shape.meta
  }

  assert.equal(partial.type, 'frame')
  assert.equal(partial.meta.cowartHtmlArtboard, true)
  assert.equal(Boolean(partial.meta.runtimeDocument), true)
  assert.equal(typeof partial.props.w, 'number')
  assert.equal(typeof partial.props.h, 'number')
  assert.equal(partial.props.name, 'HTML Artboard')
})

test('frame props width/height maps from document', () => {
  const document = createHtmlArtboardDocument({
    id: 'html-artboard:size',
    width: 1080,
    height: 1920
  })
  const shape = htmlArtboardToCowartShape(document)

  assert.equal(shape.props.w, 1080)
  assert.equal(shape.props.h, 1920)
})

test('bridge round-trip preserves html/css/fusionPatches', () => {
  const fusionPatches = [
    createFusionPatchPlaceholder({
      id: 'patch:round-trip',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      selector: 'h1',
      prompt: 'Round Trip'
    })
  ]
  const document = createHtmlArtboardDocument({
    id: 'html-artboard:round-trip',
    html: '<section><h1>Round Trip</h1></section>',
    css: 'section { display: grid; }',
    fusionPatches
  })
  const restored = cowartShapeToHtmlArtboard(htmlArtboardToCowartShape(document))

  assert.equal(restored.html, document.html)
  assert.equal(restored.css, document.css)
  assert.deepEqual(restored.fusionPatches, fusionPatches)
})

test('cowartShapeToHtmlArtboard returns null for non-html-artboard shape', () => {
  assert.equal(
    cowartShapeToHtmlArtboard({
      typeName: 'shape',
      type: 'frame',
      meta: {}
    }),
    null
  )
})

test('cowartShapeToHtmlArtboard handles missing runtimeDocument safely', () => {
  assert.equal(
    cowartShapeToHtmlArtboard({
      typeName: 'shape',
      type: 'frame',
      meta: { cowartHtmlArtboard: true },
      props: {}
    }),
    null
  )
})

test('cowartShapeToHtmlArtboard supports props.document fallback', () => {
  const document = createHtmlArtboardDocument({
    id: 'html-artboard:fallback',
    html: '<section>Fallback</section>'
  })
  const restored = cowartShapeToHtmlArtboard({
    typeName: 'shape',
    type: 'frame',
    meta: { cowartHtmlArtboard: true },
    props: { document }
  })

  assert.equal(restored.id, document.id)
  assert.equal(restored.html, document.html)
  assert.notEqual(restored, document)
})

test('runtimeDocument is cloned, modifying restored value should not mutate original shape meta', () => {
  const shape = htmlArtboardToCowartShape(
    createHtmlArtboardDocument({
      id: 'html-artboard:restore-clone',
      fusionPatches: [{ id: 'patch:clone', value: 'Original' }]
    })
  )
  const restored = cowartShapeToHtmlArtboard(shape)

  restored.fusionPatches[0].value = 'Changed'

  assert.equal(shape.meta.runtimeDocument.fusionPatches[0].value, 'Original')
})

test('htmlArtboardToCowartShape clones input document, modifying original after conversion should not mutate shape meta', () => {
  const document = createHtmlArtboardDocument({
    id: 'html-artboard:input-clone',
    html: '<section>Original</section>',
    fusionPatches: [{ id: 'patch:input-clone', value: 'Original' }]
  })
  const shape = htmlArtboardToCowartShape(document)

  document.html = '<section>Changed</section>'
  document.fusionPatches[0].value = 'Changed'

  assert.equal(shape.meta.runtimeDocument.html, '<section>Original</section>')
  assert.equal(shape.meta.runtimeDocument.fusionPatches[0].value, 'Original')
})
