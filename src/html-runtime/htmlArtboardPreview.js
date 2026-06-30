import { ensureHtmlArtboardDocument } from './htmlCanvasDocument.js'

function escapeStyleContent(css) {
  return String(css).replace(/<\/style/gi, '<\\/style')
}

export function createHtmlArtboardPreviewSrcDoc(document) {
  const runtimeDocument = ensureHtmlArtboardDocument(document)
  const css = escapeStyleContent(runtimeDocument.css)

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; img-src data: blob: http: https:; style-src 'unsafe-inline'; font-src data: http: https:; script-src 'none';"
    >
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
html,
body {
  min-height: 100%;
  margin: 0;
}

* {
  box-sizing: border-box;
}

${css}
    </style>
  </head>
  <body>
${runtimeDocument.html}
  </body>
</html>`
}
