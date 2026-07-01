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
import { updateHtmlArtboardSource } from '../src/html-runtime/htmlArtboardEditing.js'
import {
  appendHtmlArtboardMutations,
  createHtmlArtboardMutation,
  createSourceUpdateMutations
} from '../src/html-runtime/htmlArtboardMutations.js'
import { createHtmlArtboardPreviewSrcDoc } from '../src/html-runtime/htmlArtboardPreview.js'
import { createHtmlArtboardSourceSnapshot } from '../src/html-runtime/htmlArtboardSource.js'
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

  assert.deepEqual(parsed.fusionPatches, fusionPatches)
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
  const fusionPatches = [{ id: 'patch:preserve', value: 'Original' }]
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
