import {
  appendHtmlArtboardMutations,
  createHtmlArtboardMutation,
} from "../src/html-runtime/htmlArtboardMutations.js";
import { ensureFusionPatch } from "../src/html-runtime/fusionPatch.js";
import { ensureHtmlArtboardDocument } from "../src/html-runtime/htmlCanvasDocument.js";
import { createRenderFingerprint } from "../src/html-runtime/renderFingerprint.js";
import {
  applyHtmlArtboardDocumentToShapeRecord,
  createHtmlArtboardApplyPreconditions,
  validateHtmlArtboardApplyPreconditions,
} from "./htmlArtboardApplyEdit.mjs";

const EXTERNAL_ATTACH_SOURCE = "mcp-html-artboard-fusion-patch-image-attach";
const EXTERNAL_ATTACH_MUTATION_TYPE = "fusion_patch_external_asset_attach";

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function deepClone(value) {
  if (Array.isArray(value)) {
    return value.map((item) => deepClone(item));
  }

  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, deepClone(item)]));
  }

  return value;
}

function getPatchIndex(document, patchId) {
  return document.fusionPatches.findIndex((patch) => patch.id === patchId);
}

function updateDocumentFingerprint(document) {
  return {
    ...document,
    renderFingerprint: createRenderFingerprint(document),
  };
}

function createMutationOptions() {
  return {
    meta: {
      source: EXTERNAL_ATTACH_SOURCE,
    },
  };
}

function createExternalImageMetadata(asset = {}) {
  return {
    fileName: asset.fileName ?? null,
    relativePath: asset.relativePath ?? null,
    mimeType: asset.mimeType ?? null,
    fileSize: Number.isFinite(asset.fileSize) ? asset.fileSize : null,
  };
}

function createAttachedDocument(baseDocument, patchId, request = {}, asset = {}) {
  const patchIndex = getPatchIndex(baseDocument, patchId);
  if (patchIndex === -1) return { document: baseDocument, mutation: null };

  const previousPatch = baseDocument.fusionPatches[patchIndex];
  const provider =
    typeof request.provider === "string" && request.provider
      ? request.provider
      : "external-image-gen";
  const externalImage = createExternalImageMetadata(asset);
  const nextPatch = ensureFusionPatch({
    ...previousPatch,
    patchAssetId: asset.patchAssetId,
    patchAssetUrl: asset.patchAssetUrl,
    provider,
    status: "generated",
    updatedAt: new Date().toISOString(),
    meta: {
      ...previousPatch.meta,
      externalImage,
      sourceImageFile: externalImage,
      generationRequest: isRecord(request.generationRequest)
        ? deepClone(request.generationRequest)
        : null,
    },
  });
  let proposedDocument = {
    ...baseDocument,
    fusionPatches: baseDocument.fusionPatches.map((patch, index) =>
      index === patchIndex ? nextPatch : patch
    ),
  };
  const mutation = createHtmlArtboardMutation(
    EXTERNAL_ATTACH_MUTATION_TYPE,
    {
      patchId,
      provider,
      patchAssetId: nextPatch.patchAssetId,
      patchAssetUrl: nextPatch.patchAssetUrl,
      previousPatch: deepClone(previousPatch),
      nextPatch: deepClone(nextPatch),
      generationRequest: isRecord(request.generationRequest)
        ? deepClone(request.generationRequest)
        : null,
    },
    createMutationOptions()
  );

  proposedDocument = appendHtmlArtboardMutations(proposedDocument, [mutation]);

  return {
    document: updateDocumentFingerprint(proposedDocument),
    mutation,
  };
}

function createDiffSummary(baseDocument, proposedDocument, mutation) {
  return {
    patchId: mutation?.payload?.patchId ?? null,
    provider: mutation?.payload?.provider ?? null,
    patchAssetId: mutation?.payload?.patchAssetId ?? null,
    patchAssetUrlAdded: typeof mutation?.payload?.patchAssetUrl === "string",
    fusionPatchCountBefore: baseDocument.fusionPatches.length,
    fusionPatchCountAfter: proposedDocument.fusionPatches.length,
    mutationCount: mutation ? 1 : 0,
    notes: mutation
      ? ["External generated image attach proposed."]
      : ["No external generated image attach proposed."],
  };
}

export function createHtmlArtboardFusionPatchImageAttachPlan(
  htmlArtboard,
  request = {},
  options = {}
) {
  const sourceArtboard = isRecord(htmlArtboard) ? htmlArtboard : {};
  const sourceRequest = isRecord(request) ? request : {};
  const asset = isRecord(options.asset) ? options.asset : {};
  const confirmApply = sourceRequest.confirmApply === true;
  const baseDocument = ensureHtmlArtboardDocument(sourceArtboard.runtimeDocument);
  const patchId = typeof sourceRequest.patchId === "string" ? sourceRequest.patchId : "";
  const patch = patchId
    ? baseDocument.fusionPatches.find((candidate) => candidate.id === patchId) ?? null
    : null;
  const preconditions = createHtmlArtboardApplyPreconditions(sourceArtboard.runtimeDocument);
  const preconditionCheck = validateHtmlArtboardApplyPreconditions(
    sourceArtboard.runtimeDocument,
    sourceRequest
  );
  const preconditionFailed = preconditionCheck.failed === true;
  const overwriteBlocked = patch?.patchAssetUrl && sourceRequest.allowOverwrite !== true;
  const hasAssetUrl = typeof asset.patchAssetUrl === "string" && asset.patchAssetUrl;
  const hasAssetId = typeof asset.patchAssetId === "string" && asset.patchAssetId;
  let proposedDocument = baseDocument;
  let proposedMutations = [];
  let canApply = false;
  let reason = "";

  if (!patchId) {
    reason = "patchId is required";
  } else if (!patch) {
    reason = `Patch not found: ${patchId}`;
  } else if (preconditionFailed) {
    reason = "Precondition check failed";
  } else if (overwriteBlocked) {
    reason = "Patch already has patchAssetUrl; pass allowOverwrite=true to replace it";
  } else if (!hasAssetUrl) {
    reason = "Generated image asset URL is required";
  } else if (!hasAssetId) {
    reason = "Generated image asset id is required";
  } else {
    const attached = createAttachedDocument(baseDocument, patchId, sourceRequest, asset);
    proposedDocument = attached.document;
    proposedMutations = attached.mutation ? [deepClone(attached.mutation)] : [];
    canApply = confirmApply && proposedMutations.length > 0;
    if (!confirmApply) {
      reason = "confirmApply is required to attach an external image";
    } else {
      reason = canApply ? "Ready to attach external generated image" : "No attach mutation proposed";
    }
  }

  return {
    shapeId: sourceArtboard.shapeId ?? null,
    documentId: baseDocument.id,
    patchId,
    dryRun: !confirmApply || preconditionFailed,
    confirmApply,
    canApply,
    reason,
    preconditions,
    preconditionCheck,
    preconditionFailed,
    proposedDocument,
    proposedMutations,
    diffSummary: createDiffSummary(baseDocument, proposedDocument, proposedMutations[0]),
  };
}

export function applyHtmlArtboardFusionPatchImageAttachDocumentToShapeRecord(
  shapeRecord,
  proposedDocument
) {
  return applyHtmlArtboardDocumentToShapeRecord(shapeRecord, proposedDocument);
}

export function summarizeHtmlArtboardFusionPatchImageAttachResult(result) {
  const source = isRecord(result) ? result : {};
  const shapeId = source.shapeId ?? "unknown shape";

  if (source.applied === true) {
    return `Attached external FusionPatch image to ${shapeId}.`;
  }

  if (source.preconditionFailed === true) {
    return `External FusionPatch image was not attached to ${shapeId}: Precondition check failed.`;
  }

  if (source.confirmApply !== true || source.dryRun === true) {
    return `Dry-run only for ${shapeId}: confirmApply is required to attach an external image.`;
  }

  if (source.canApply === true) {
    return `Ready to attach external FusionPatch image to ${shapeId}.`;
  }

  return `External FusionPatch image was not attached to ${shapeId}: ${
    source.reason ?? "unknown reason"
  }.`;
}
