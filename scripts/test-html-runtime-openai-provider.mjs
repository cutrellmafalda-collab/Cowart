import assert from 'node:assert/strict'

import {
  createHtmlArtboardAiProviderRequest
} from '../src/html-runtime/htmlArtboardAiProvider.js'
import {
  createOpenAiImageProvider,
  createOpenAiImageProviderPayload,
  parseOpenAiImageProviderResponse,
  validateOpenAiImageProviderConfig
} from '../src/html-runtime/htmlArtboardOpenAiImageProvider.js'
import { createFusionPatchPlaceholder } from '../src/html-runtime/fusionPatch.js'
import { createHtmlArtboardDocument } from '../src/html-runtime/htmlCanvasDocument.js'

function createProviderRequest(options = {}) {
  const document = createHtmlArtboardDocument({
    id: 'html-artboard:openai-provider-test',
    html: '<section data-node="headline"><h1>Headline</h1></section>',
    css: 'h1 { color: red; }'
  })
  const patch = createFusionPatchPlaceholder({
    id: 'patch:openai-provider-test',
    selector: '[data-node="headline"]',
    sourceText: 'Headline',
    prompt: 'Make the headline area feel cinematic',
    region: { x: 10, y: 20, w: 320, h: 160 }
  })

  return createHtmlArtboardAiProviderRequest(document, patch, {
    providerOptions: { provider: 'openai', model: 'gpt-image-2' },
    ...options
  })
}

async function test(name, run) {
  await run()
  console.log(`ok - ${name}`)
}

await test('missing api key returns ok false', async () => {
  const provider = createOpenAiImageProvider({ env: {}, fetch: async () => ({ ok: true }) })
  const result = await provider.generateFusionPatchAsset(createProviderRequest())

  assert.equal(result.ok, false)
  assert.equal(result.error, 'missing_api_key')
})

await test('payload includes model and prompt', async () => {
  const request = createProviderRequest()
  const payload = createOpenAiImageProviderPayload(request, { model: 'gpt-image-2' })

  assert.equal(payload.model, 'gpt-image-2')
  assert.equal(payload.prompt.includes('Make the headline area feel cinematic'), true)
})

await test('payload does not include api key', async () => {
  const request = createProviderRequest()
  const payload = createOpenAiImageProviderPayload(request, {
    apiKey: 'sk-test-secret-that-must-not-appear'
  })

  assert.equal(JSON.stringify(payload).includes('sk-test-secret-that-must-not-appear'), false)
})

await test('fake successful response returns patchAssetUrl', async () => {
  const provider = createOpenAiImageProvider({
    apiKey: 'sk-test-fake',
    fetch: async () => ({
      ok: true,
      json: async () => ({
        created: 123,
        data: [{ b64_json: 'ZmFrZS1pbWFnZS1ieXRlcw==' }],
        output_format: 'png'
      })
    })
  })
  const result = await provider.generateFusionPatchAsset(createProviderRequest())

  assert.equal(result.ok, true)
  assert.equal(result.patchAssetUrl, 'data:image/png;base64,ZmFrZS1pbWFnZS1ieXRlcw==')
  assert.equal(result.patchAssetId.startsWith('openai-fusion-patch-asset:'), true)
})

await test('fake failed response returns ok false', async () => {
  const provider = createOpenAiImageProvider({
    apiKey: 'sk-test-fake',
    fetch: async () => ({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: 'Bad request' } })
    })
  })
  const result = await provider.generateFusionPatchAsset(createProviderRequest())

  assert.equal(result.ok, false)
  assert.equal(result.error, 'Bad request')
})

await test('request prompt includes doNotModifyHtml and doNotModifyCss instruction', async () => {
  const payload = createOpenAiImageProviderPayload(createProviderRequest())

  assert.equal(payload.prompt.includes('doNotModifyHtml=true'), true)
  assert.equal(payload.prompt.includes('doNotModifyCss=true'), true)
})

await test('parse response handles b64_json', async () => {
  const result = parseOpenAiImageProviderResponse(
    { data: [{ b64_json: 'YWJj' }] },
    createProviderRequest(),
    { outputFormat: 'webp', model: 'gpt-image-2' }
  )

  assert.equal(result.ok, true)
  assert.equal(result.patchAssetUrl, 'data:image/webp;base64,YWJj')
  assert.equal(result.mimeType, 'image/webp')
})

await test('no network when api key missing', async () => {
  let fetchCalled = false
  const provider = createOpenAiImageProvider({
    env: {},
    fetch: async () => {
      fetchCalled = true
      return { ok: true }
    }
  })

  await provider.generateFusionPatchAsset(createProviderRequest())

  assert.equal(fetchCalled, false)
})

await test('openai provider does not mutate input request', async () => {
  const request = createProviderRequest()
  const before = JSON.stringify(request)
  const provider = createOpenAiImageProvider({
    apiKey: 'sk-test-fake',
    fetch: async () => ({
      ok: true,
      json: async () => ({ data: [{ b64_json: 'YWJj' }] })
    })
  })

  await provider.generateFusionPatchAsset(request)

  assert.equal(JSON.stringify(request), before)
})

await test('validate config does not expose api key', async () => {
  const config = validateOpenAiImageProviderConfig({
    apiKey: 'sk-test-secret-that-must-not-appear',
    fetch: async () => ({ ok: true })
  })

  assert.equal(config.ok, true)
  assert.equal(JSON.stringify(config).includes('sk-test-secret-that-must-not-appear'), false)
})
