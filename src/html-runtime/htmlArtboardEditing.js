import { ensureHtmlArtboardDocument } from './htmlCanvasDocument.js'
import { createRenderFingerprint } from './renderFingerprint.js'

export function updateHtmlArtboardSource(document, updates = {}) {
  const updatedDocument = ensureHtmlArtboardDocument(document)

  if (typeof updates.html === 'string') {
    updatedDocument.html = updates.html
  }

  if (typeof updates.css === 'string') {
    updatedDocument.css = updates.css
  }

  updatedDocument.renderFingerprint = createRenderFingerprint(updatedDocument)

  return updatedDocument
}
