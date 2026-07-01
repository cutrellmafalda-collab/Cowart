import { ensureHtmlArtboardDocument } from './htmlCanvasDocument.js'
import {
  appendHtmlArtboardMutations,
  createHtmlArtboardMutation
} from './htmlArtboardMutations.js'
import { createRenderFingerprint } from './renderFingerprint.js'
import { createFusionPatchPlaceholder } from './fusionPatch.js'

function getFusionPatchMutationOptions(options = {}) {
  return {
    ...options.mutationOptions,
    meta: {
      ...options.mutationOptions?.meta,
      source: 'html-artboard-fusion-patch-panel'
    }
  }
}

export function addFusionPatchPlaceholderToHtmlArtboard(document, options = {}) {
  const runtimeDocument = ensureHtmlArtboardDocument(document)
  const { mutationOptions: _mutationOptions, recordMutationLog: _recordMutationLog, ...patchOptions } = options
  const patch = createFusionPatchPlaceholder(patchOptions)
  let updatedDocument = {
    ...runtimeDocument,
    fusionPatches: [...runtimeDocument.fusionPatches, patch]
  }

  if (options.recordMutationLog !== false) {
    updatedDocument = appendHtmlArtboardMutations(updatedDocument, [
      createHtmlArtboardMutation(
        'fusion_patch_create',
        {
          patchId: patch.id,
          patch
        },
        getFusionPatchMutationOptions(options)
      )
    ])
  }

  updatedDocument.renderFingerprint = createRenderFingerprint(updatedDocument)

  return updatedDocument
}
