import { ensureHtmlArtboardDocument } from './htmlCanvasDocument.js'

export function createHtmlArtboardSourceSnapshot(document) {
  const runtimeDocument = ensureHtmlArtboardDocument(document)

  return {
    html: runtimeDocument.html,
    css: runtimeDocument.css,
    json: JSON.stringify(runtimeDocument, null, 2)
  }
}
