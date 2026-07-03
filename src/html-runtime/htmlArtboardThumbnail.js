import { ensureHtmlArtboardDocument } from './htmlCanvasDocument.js'

const SVG_XMLNS = 'http://www.w3.org/2000/svg'
const XHTML_XMLNS = 'http://www.w3.org/1999/xhtml'

function safeDimension(value, fallback) {
  return Number.isFinite(value) && value > 0 ? Math.round(value) : fallback
}

function encodeSvgDataUrl(svg) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function escapeAttribute(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function normalizeOverlayRegion(region) {
  if (!isRecord(region)) return null

  const { x, y, w, h } = region
  if (![x, y, w, h].every((value) => Number.isFinite(value))) return null
  if (w <= 0 || h <= 0) return null

  return { x, y, w, h }
}

function normalizeOverlayOpacity(value) {
  if (!Number.isFinite(value)) return 1
  return Math.min(Math.max(value, 0), 1)
}

function createFusionPatchOverlayLabel(patch) {
  return (
    [patch?.name, patch?.sourceText, patch?.prompt, patch?.id].find(
      (value) => typeof value === 'string' && value.length > 0
    ) ?? 'Fusion Patch'
  )
}

function resolvePatchAssetUrl(patchAssetUrl, options) {
  if (typeof patchAssetUrl !== 'string' || patchAssetUrl.length === 0) return ''

  if (typeof options.patchAssetUrlResolver === 'function') {
    const resolvedUrl = options.patchAssetUrlResolver(patchAssetUrl)
    if (typeof resolvedUrl === 'string' && resolvedUrl.length > 0) return resolvedUrl
  }

  return patchAssetUrl
}

function resolveBackgroundAssetUrl(backgroundAssetUrl, options) {
  if (typeof backgroundAssetUrl !== 'string' || backgroundAssetUrl.length === 0) return ''

  if (typeof options.backgroundAssetUrlResolver === 'function') {
    const resolvedUrl = options.backgroundAssetUrlResolver(backgroundAssetUrl)
    if (typeof resolvedUrl === 'string' && resolvedUrl.length > 0) return resolvedUrl
  }

  return backgroundAssetUrl
}

function getBackgroundAssetUrl(background) {
  if (!isRecord(background)) return ''

  return (
    [background.backgroundAssetUrl, background.assetUrl, background.url, background.src].find(
      (value) => typeof value === 'string' && value.length > 0
    ) ?? ''
  )
}

function createBackgroundGradientSvg(background, width, height) {
  if (!Array.isArray(background?.colors) || background.colors.length === 0) {
    return `  <rect x="0" y="0" width="${width}" height="${height}" fill="#fff" />`
  }

  const colors = background.colors
    .filter((color) => typeof color === 'string' && color.length > 0)
    .slice(0, 8)

  if (colors.length === 0) {
    return `  <rect x="0" y="0" width="${width}" height="${height}" fill="#fff" />`
  }

  const stops = colors
    .map((color, index) => {
      const offset = colors.length === 1 ? 0 : Math.round((index / (colors.length - 1)) * 100)
      return `      <stop offset="${offset}%" stop-color="${escapeAttribute(color)}" />`
    })
    .join('\n')

  return `  <defs>
    <linearGradient id="cowart-html-artboard-thumbnail-background" x1="0%" y1="0%" x2="100%" y2="100%">
${stops}
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="${width}" height="${height}" fill="url(#cowart-html-artboard-thumbnail-background)" />`
}

function createThumbnailBackgroundSvg(document, width, height, options) {
  const background = isRecord(document.background) ? document.background : {}
  const backgroundAssetUrl = getBackgroundAssetUrl(background)

  if (backgroundAssetUrl) {
    const href = escapeAttribute(resolveBackgroundAssetUrl(backgroundAssetUrl, options))
    const preserveAspectRatio = background.fit === 'contain' ? 'xMidYMid meet' : 'xMidYMid slice'

    return `  <rect x="0" y="0" width="${width}" height="${height}" fill="#fff" />
  <image href="${href}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="${preserveAspectRatio}" />`
  }

  return createBackgroundGradientSvg(background, width, height)
}

function createGeneratedPatchAssetOverlay(patch, region, options) {
  if (typeof patch.patchAssetUrl !== 'string' || patch.patchAssetUrl.length === 0) {
    return ''
  }

  const href = escapeAttribute(resolvePatchAssetUrl(patch.patchAssetUrl, options))
  const badgeY = region.y + 8
  const textY = region.y + 24

  return `      <image href="${href}" x="${region.x}" y="${region.y}" width="${region.w}" height="${region.h}" preserveAspectRatio="none" opacity="0.82" />
      <rect x="${region.x + 8}" y="${badgeY}" width="126" height="24" fill="#064e3b" fill-opacity="0.88" rx="6" ry="6" />
      <text x="${region.x + 16}" y="${textY}" fill="#d1fae5" font-family="Inter, ui-sans-serif, system-ui, sans-serif" font-size="12" font-weight="800">mock-generated</text>`
}

function createThumbnailBaseStyle() {
  return `html,
body,
.cowart-html-artboard-thumbnail {
  box-sizing: border-box;
  width: 100%;
  min-height: 100%;
  margin: 0;
}

*,
*::before,
*::after {
  box-sizing: inherit;
}

.cowart-html-artboard-thumbnail {
  overflow: hidden;
  background: transparent;
}`
}

export function createHtmlArtboardFusionPatchOverlaySvg(document, options = {}) {
  const normalizedDocument = ensureHtmlArtboardDocument(document)
  const sourcePatches = Array.isArray(document?.fusionPatches)
    ? document.fusionPatches
    : normalizedDocument.fusionPatches
  const overlays = normalizedDocument.fusionPatches
    .map((patch, index) => {
      if (patch.visible === false) return null

      const region = normalizeOverlayRegion(sourcePatches[index]?.region)
      if (!region) return null

      const opacity = normalizeOverlayOpacity(patch.opacity)
      const label = escapeAttribute(createFusionPatchOverlayLabel(patch))
      const labelY = Math.max(16, region.y - 10)
      const labelBackgroundY = Math.max(0, region.y - 30)
      const labelBackgroundWidth = Math.max(120, Math.min(region.w, 360))
      const generatedPatchAssetOverlay = createGeneratedPatchAssetOverlay(patch, region, options)

      return `    <g class="cowart-html-artboard-fusion-patch-overlay" opacity="${opacity}">
${generatedPatchAssetOverlay}
      <rect x="${region.x}" y="${region.y}" width="${region.w}" height="${region.h}" fill="#facc15" fill-opacity="0.12" stroke="#facc15" stroke-width="3" stroke-dasharray="10 8" rx="8" ry="8" />
      <rect x="${region.x}" y="${labelBackgroundY}" width="${labelBackgroundWidth}" height="24" fill="#111827" fill-opacity="0.84" rx="6" ry="6" />
      <text x="${region.x + 8}" y="${labelY}" fill="#fff" font-family="Inter, ui-sans-serif, system-ui, sans-serif" font-size="13" font-weight="700">${label}</text>
    </g>`
    })
    .filter(Boolean)

  if (overlays.length === 0) return ''

  return `  <g class="cowart-html-artboard-fusion-patch-overlays" aria-label="FusionPatch mock overlays">
${overlays.join('\n')}
  </g>`
}

export function createHtmlArtboardThumbnailSvg(document, options = {}) {
  const normalizedDocument = ensureHtmlArtboardDocument(document)
  const width = safeDimension(normalizedDocument.width, 720)
  const height = safeDimension(normalizedDocument.height, 1280)
  const backgroundSvg = createThumbnailBackgroundSvg(normalizedDocument, width, height, options)
  const fusionPatchOverlaySvg = createHtmlArtboardFusionPatchOverlaySvg(document, options)

  return `<svg xmlns="${SVG_XMLNS}" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeAttribute(createHtmlArtboardThumbnailAltText(normalizedDocument))}">
${backgroundSvg}
  <foreignObject x="0" y="0" width="${width}" height="${height}">
    <div xmlns="${XHTML_XMLNS}" class="cowart-html-artboard-thumbnail">
      <style>
${createThumbnailBaseStyle()}

${normalizedDocument.css}
      </style>
${normalizedDocument.html}
    </div>
  </foreignObject>
${fusionPatchOverlaySvg}
</svg>`
}

export function createHtmlArtboardThumbnailDataUrl(document, options = {}) {
  return encodeSvgDataUrl(createHtmlArtboardThumbnailSvg(document, options))
}

export function createHtmlArtboardThumbnailAltText(document) {
  const normalizedDocument = ensureHtmlArtboardDocument(document)
  return `HTML Artboard preview thumbnail: ${normalizedDocument.id}`
}
