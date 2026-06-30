import assert from 'node:assert/strict'

import {
  cloneHtmlArtboardDocument,
  createHtmlArtboardDocument,
  ensureHtmlArtboardDocument
} from '../src/html-runtime/htmlCanvasDocument.js'
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
