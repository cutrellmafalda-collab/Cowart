import assert from 'node:assert/strict'

import {
  cloneHtmlArtboardDocument,
  createHtmlArtboardDocument,
  ensureHtmlArtboardDocument
} from '../src/html-runtime/htmlCanvasDocument.js'
import {
  cowartShapeToHtmlArtboard,
  htmlArtboardToCowartShape,
  isCowartHtmlArtboardShape
} from '../src/html-runtime/cowartHtmlBridge.js'
import { createHtmlArtboardPreviewSrcDoc } from '../src/html-runtime/htmlArtboardPreview.js'
import {
  createRenderFingerprint,
  validateRenderFingerprint,
  withRenderFingerprint
} from '../src/html-runtime/renderFingerprint.js'

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
  assert.deepEqual(document.fusionPatches, fusionPatches)
  assert.notEqual(document.fusionPatches, fusionPatches)
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

test('createRenderFingerprint returns stable string', () => {
  const first = createHtmlArtboardDocument({
    background: { type: 'gradient', identity: 'background:stable', colors: ['#fff', '#111'] },
    fusionPatches: [{ b: 2, a: 1 }]
  })
  const second = createHtmlArtboardDocument({
    id: first.id,
    background: { colors: ['#fff', '#111'], identity: 'background:stable', type: 'gradient' },
    fusionPatches: [{ a: 1, b: 2 }]
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
  const document = createHtmlArtboardDocument({ fusionPatches: [{ id: 'patch:1', value: 'A' }] })
  const before = createRenderFingerprint(document)
  const after = createRenderFingerprint({
    ...document,
    fusionPatches: [{ id: 'patch:1', value: 'B' }]
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
    {
      id: 'patch:round-trip',
      target: 'h1',
      operation: 'replaceText',
      value: 'Round Trip'
    }
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
