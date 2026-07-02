import {
  createHtmlArtboardAiProviderResult,
  validateHtmlArtboardAiProviderRequest
} from './htmlArtboardAiProvider.js'

const OPENAI_PROVIDER_NAME = 'openai'
const DEFAULT_OPENAI_IMAGE_ENDPOINT = 'https://api.openai.com/v1/images/generations'
const DEFAULT_OPENAI_IMAGE_MODEL = 'gpt-image-2'
const DEFAULT_OPENAI_IMAGE_SIZE = '1024x1024'
const DEFAULT_OPENAI_IMAGE_QUALITY = 'auto'
const DEFAULT_OPENAI_OUTPUT_FORMAT = 'png'
const DEFAULT_OPENAI_BACKGROUND = 'transparent'

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function deepClone(value) {
  if (Array.isArray(value)) {
    return value.map((item) => deepClone(item))
  }

  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, deepClone(item)]))
  }

  return value
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`
  }

  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`
  }

  return JSON.stringify(value)
}

function hashString(value) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return (hash >>> 0).toString(36)
}

function getSafeEnv(options = {}) {
  if (isRecord(options.env)) return options.env
  if (typeof process !== 'undefined' && isRecord(process.env)) return process.env
  return {}
}

function getOpenAiApiKey(options = {}) {
  if (typeof options.apiKey === 'string' && options.apiKey) return options.apiKey
  const env = getSafeEnv(options)
  return typeof env.OPENAI_API_KEY === 'string' && env.OPENAI_API_KEY
    ? env.OPENAI_API_KEY
    : null
}

function getFetchImplementation(options = {}) {
  if (typeof options.fetch === 'function') return options.fetch
  if (typeof globalThis !== 'undefined' && typeof globalThis.fetch === 'function') {
    return globalThis.fetch.bind(globalThis)
  }
  return null
}

function getOpenAiModel(options = {}, request) {
  return (
    options.model ??
    request?.providerOptions?.model ??
    DEFAULT_OPENAI_IMAGE_MODEL
  )
}

function getOpenAiSize(options = {}) {
  return typeof options.size === 'string' && options.size ? options.size : DEFAULT_OPENAI_IMAGE_SIZE
}

function getOpenAiQuality(options = {}) {
  return typeof options.quality === 'string' && options.quality
    ? options.quality
    : DEFAULT_OPENAI_IMAGE_QUALITY
}

function getOpenAiOutputFormat(options = {}) {
  return typeof options.outputFormat === 'string' && options.outputFormat
    ? options.outputFormat
    : DEFAULT_OPENAI_OUTPUT_FORMAT
}

function getOpenAiBackground(options = {}) {
  return typeof options.background === 'string' && options.background
    ? options.background
    : DEFAULT_OPENAI_BACKGROUND
}

function getPromptValue(value, fallback = '') {
  return typeof value === 'string' && value.length > 0 ? value : fallback
}

function createOpenAiPatchPrompt(request, options = {}) {
  const patchPrompt = getPromptValue(options.promptOverride, request.prompt)
  const sourceText = getPromptValue(request.target?.sourceText, '(empty source text)')
  const selector = getPromptValue(request.target?.selector, '(no selector)')
  const region = isRecord(request.target?.region)
    ? `x=${request.target.region.x}, y=${request.target.region.y}, w=${request.target.region.w}, h=${request.target.region.h}`
    : '(no region)'

  return [
    'Generate only a patch image asset for a Cowart HTML Artboard FusionPatch.',
    'Do not modify HTML or CSS. doNotModifyHtml=true. doNotModifyCss=true.',
    'Preserve text editability in the source document; the image patch is an overlay asset only.',
    'Use transparent background when possible.',
    `Patch prompt: ${patchPrompt}`,
    `Target selector: ${selector}`,
    `Target source text: ${sourceText}`,
    `Target region: ${region}`,
    'Return only the visual patch asset. Do not include local paths, secrets, or canvas store data.'
  ].join('\n')
}

function getResponseError(response, body) {
  if (typeof body?.error?.message === 'string') return body.error.message
  if (typeof body?.error === 'string') return body.error
  if (typeof response?.statusText === 'string' && response.statusText) return response.statusText
  if (Number.isFinite(response?.status)) return `OpenAI request failed with status ${response.status}`
  return 'OpenAI request failed'
}

function getImageData(response) {
  return Array.isArray(response?.data) ? response.data[0] : null
}

export function validateOpenAiImageProviderConfig(options = {}) {
  const reasons = []
  const apiKey = getOpenAiApiKey(options)
  const fetchImpl = getFetchImplementation(options)

  if (!apiKey) reasons.push('missing_api_key')
  if (typeof fetchImpl !== 'function') reasons.push('missing_fetch')

  return {
    ok: reasons.length === 0,
    provider: OPENAI_PROVIDER_NAME,
    endpoint:
      typeof options.endpoint === 'string' && options.endpoint
        ? options.endpoint
        : DEFAULT_OPENAI_IMAGE_ENDPOINT,
    model: typeof options.model === 'string' && options.model ? options.model : DEFAULT_OPENAI_IMAGE_MODEL,
    hasApiKey: Boolean(apiKey),
    hasFetch: typeof fetchImpl === 'function',
    reasons
  }
}

export function createOpenAiImageProviderPayload(request, options = {}) {
  return {
    model: getOpenAiModel(options, request),
    prompt: createOpenAiPatchPrompt(request, options),
    size: getOpenAiSize(options),
    quality: getOpenAiQuality(options),
    output_format: getOpenAiOutputFormat(options),
    background: getOpenAiBackground(options),
    n: 1
  }
}

export function parseOpenAiImageProviderResponse(response, request, options = {}) {
  const outputFormat = getOpenAiOutputFormat(options)
  const image = getImageData(response)
  const b64Json = typeof image?.b64_json === 'string' && image.b64_json ? image.b64_json : null

  if (!b64Json) {
    return createHtmlArtboardAiProviderResult({
      ok: false,
      provider: OPENAI_PROVIDER_NAME,
      model: getOpenAiModel(options, request),
      error: 'missing_b64_json',
      durationMs: options.durationMs
    })
  }

  const patchId = request?.patch?.id ?? 'patch'
  const model = getOpenAiModel(options, request)
  const patchAssetId =
    typeof options.patchAssetId === 'string' && options.patchAssetId
      ? options.patchAssetId
      : `openai-fusion-patch-asset:${hashString(
          stableStringify({
            patchId,
            model,
            outputFormat,
            b64Prefix: b64Json.slice(0, 96),
            created: response?.created ?? null
          })
        )}`

  return createHtmlArtboardAiProviderResult({
    ok: true,
    provider: OPENAI_PROVIDER_NAME,
    model,
    seed: request?.providerOptions?.seed ?? null,
    patchAssetId,
    patchAssetUrl: `data:image/${outputFormat};base64,${b64Json}`,
    maskAssetId: null,
    width: request?.constraints?.width ?? null,
    height: request?.constraints?.height ?? null,
    mimeType: `image/${outputFormat}`,
    promptUsed: image?.revised_prompt ?? request?.prompt ?? '',
    cost: null,
    durationMs: options.durationMs,
    warnings: Array.isArray(response?.warnings) ? deepClone(response.warnings) : [],
    meta: {
      endpoint: options.endpoint ?? DEFAULT_OPENAI_IMAGE_ENDPOINT,
      outputFormat,
      background: response?.background ?? getOpenAiBackground(options),
      quality: response?.quality ?? getOpenAiQuality(options),
      created: response?.created ?? null
    }
  })
}

export function createOpenAiImageProvider(options = {}) {
  return {
    name: OPENAI_PROVIDER_NAME,
    async generateFusionPatchAsset(request) {
      const startedAt = Date.now()
      const requestValidation = validateHtmlArtboardAiProviderRequest(request)
      if (!requestValidation.ok) {
        return createHtmlArtboardAiProviderResult({
          ok: false,
          provider: OPENAI_PROVIDER_NAME,
          model: getOpenAiModel(options, request),
          error: requestValidation.reasons.join('; '),
          durationMs: Date.now() - startedAt
        })
      }

      const config = validateOpenAiImageProviderConfig(options)
      if (!config.ok) {
        return createHtmlArtboardAiProviderResult({
          ok: false,
          provider: OPENAI_PROVIDER_NAME,
          model: getOpenAiModel(options, request),
          error: config.reasons[0] ?? 'invalid_openai_provider_config',
          durationMs: Date.now() - startedAt
        })
      }

      const apiKey = getOpenAiApiKey(options)
      const fetchImpl = getFetchImplementation(options)
      const payload = createOpenAiImageProviderPayload(request, options)

      try {
        const response = await fetchImpl(config.endpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        })
        const body = typeof response?.json === 'function' ? await response.json() : response

        if (response?.ok === false) {
          return createHtmlArtboardAiProviderResult({
            ok: false,
            provider: OPENAI_PROVIDER_NAME,
            model: payload.model,
            error: getResponseError(response, body),
            durationMs: Date.now() - startedAt
          })
        }

        return parseOpenAiImageProviderResponse(body, request, {
          ...options,
          model: payload.model,
          outputFormat: payload.output_format,
          background: payload.background,
          quality: payload.quality,
          endpoint: config.endpoint,
          durationMs: Date.now() - startedAt
        })
      } catch (error) {
        return createHtmlArtboardAiProviderResult({
          ok: false,
          provider: OPENAI_PROVIDER_NAME,
          model: payload.model,
          error: error instanceof Error ? error.message : 'openai_request_failed',
          durationMs: Date.now() - startedAt
        })
      }
    }
  }
}
