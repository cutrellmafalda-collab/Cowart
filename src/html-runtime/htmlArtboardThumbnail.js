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
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
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
  background: #fff;
}`
}

export function createHtmlArtboardThumbnailSvg(document) {
  const normalizedDocument = ensureHtmlArtboardDocument(document)
  const width = safeDimension(normalizedDocument.width, 720)
  const height = safeDimension(normalizedDocument.height, 1280)

  return `<svg xmlns="${SVG_XMLNS}" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeAttribute(createHtmlArtboardThumbnailAltText(normalizedDocument))}">
  <foreignObject x="0" y="0" width="${width}" height="${height}">
    <div xmlns="${XHTML_XMLNS}" class="cowart-html-artboard-thumbnail">
      <style>
${createThumbnailBaseStyle()}

${normalizedDocument.css}
      </style>
${normalizedDocument.html}
    </div>
  </foreignObject>
</svg>`
}

export function createHtmlArtboardThumbnailDataUrl(document) {
  return encodeSvgDataUrl(createHtmlArtboardThumbnailSvg(document))
}

export function createHtmlArtboardThumbnailAltText(document) {
  const normalizedDocument = ensureHtmlArtboardDocument(document)
  return `HTML Artboard preview thumbnail: ${normalizedDocument.id}`
}
