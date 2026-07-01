import { ensureHtmlArtboardDocument } from './htmlCanvasDocument.js'
import { createHtmlArtboardSourceSnapshot } from './htmlArtboardSource.js'

const SAFE_EXTENSION_PATTERN = /^(json|html|css)$/

function escapeStyleContent(css) {
  return String(css).replace(/<\/style/gi, '<\\/style')
}

function createBackgroundStyle(background) {
  if (!background || typeof background !== 'object') return '#fff'

  if (Array.isArray(background.colors) && background.colors.length > 0) {
    return `linear-gradient(135deg, ${background.colors.map((color) => String(color)).join(', ')})`
  }

  return '#fff'
}

function sanitizeFileNamePart(value) {
  return String(value)
    .trim()
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
}

function getDocumentFileBaseName(document) {
  const meta = document?.meta && typeof document.meta === 'object' ? document.meta : {}
  const candidate = meta.exportName ?? meta.name ?? meta.title
  const safeCandidate = candidate ? sanitizeFileNamePart(candidate) : ''

  return safeCandidate || 'html-artboard'
}

export function createHtmlArtboardStandaloneHtml(document) {
  const runtimeDocument = ensureHtmlArtboardDocument(document)
  const css = escapeStyleContent(runtimeDocument.css)
  const backgroundStyle = escapeStyleContent(createBackgroundStyle(runtimeDocument.background))

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; font-src data:; script-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"
    >
    <meta name="viewport" content="width=${runtimeDocument.width}, initial-scale=1">
    <title>HTML Artboard Preview</title>
    <style>
html,
body {
  margin: 0;
  min-height: 100%;
}

*,
*::before,
*::after {
  box-sizing: border-box;
}

body {
  width: ${runtimeDocument.width}px;
  min-height: ${runtimeDocument.height}px;
  overflow: auto;
  background: ${backgroundStyle};
}

${css}
    </style>
  </head>
  <body>
${runtimeDocument.html}
  </body>
</html>`
}

export function createHtmlArtboardExportBundle(document) {
  const runtimeDocument = ensureHtmlArtboardDocument(document)
  const sourceSnapshot = createHtmlArtboardSourceSnapshot(runtimeDocument)

  return {
    html: sourceSnapshot.html,
    css: sourceSnapshot.css,
    json: sourceSnapshot.json,
    standaloneHtml: createHtmlArtboardStandaloneHtml(runtimeDocument)
  }
}

export function createHtmlArtboardExportFileName(document, extension) {
  const safeExtension = SAFE_EXTENSION_PATTERN.test(String(extension)) ? String(extension) : 'json'

  return `${getDocumentFileBaseName(ensureHtmlArtboardDocument(document))}.${safeExtension}`
}
