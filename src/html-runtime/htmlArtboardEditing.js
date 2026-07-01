import { ensureHtmlArtboardDocument } from './htmlCanvasDocument.js'
import {
  appendHtmlArtboardMutations,
  createSourceUpdateMutations
} from './htmlArtboardMutations.js'
import { createRenderFingerprint } from './renderFingerprint.js'

export function updateHtmlArtboardSource(document, updates = {}, options = {}) {
  const beforeDocument = ensureHtmlArtboardDocument(document)
  let updatedDocument = ensureHtmlArtboardDocument(beforeDocument)

  if (typeof updates.html === 'string') {
    updatedDocument.html = updates.html
  }

  if (typeof updates.css === 'string') {
    updatedDocument.css = updates.css
  }

  if (options.recordMutationLog !== false) {
    const mutations = createSourceUpdateMutations(beforeDocument, updatedDocument, options.mutationOptions)
    updatedDocument = appendHtmlArtboardMutations(updatedDocument, mutations)
  }

  updatedDocument.renderFingerprint = createRenderFingerprint(updatedDocument)

  return updatedDocument
}
