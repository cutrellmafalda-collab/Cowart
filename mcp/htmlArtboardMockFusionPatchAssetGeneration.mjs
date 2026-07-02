import {
  applyHtmlArtboardDocumentToShapeRecord,
  createHtmlArtboardApplyPreconditions,
  validateHtmlArtboardApplyPreconditions,
} from "./htmlArtboardApplyEdit.mjs";
import { ensureHtmlArtboardDocument } from "../src/html-runtime/htmlCanvasDocument.js";
import {
  generateMockFusionPatchAssetForHtmlArtboard,
  generateMockFusionPatchAssetsForHtmlArtboard,
} from "../src/html-runtime/htmlArtboardMockFusionPatchAsset.js";
import { replayHtmlArtboardMutations } from "../src/html-runtime/htmlArtboardReplay.js";

const MCP_MOCK_ASSET_SOURCE = "mcp-html-artboard-mock-fusion-patch-asset";

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

function createMutationOptions() {
  return {
    mutationOptions: {
      meta: {
        source: MCP_MOCK_ASSET_SOURCE,
      },
    },
  };
}

function getProposedMutations(baseDocument, proposedDocument) {
  return proposedDocument.mutationLog.slice(baseDocument.mutationLog.length);
}

function createProposedDocument(baseDocument, request) {
  if (typeof request.patchId === "string" && request.patchId) {
    return generateMockFusionPatchAssetForHtmlArtboard(baseDocument, request.patchId, createMutationOptions());
  }

  return generateMockFusionPatchAssetsForHtmlArtboard(baseDocument, createMutationOptions());
}

function createReplayCheck(baseDocument, proposedDocument, proposedMutations) {
  const replayedDocument = replayHtmlArtboardMutations(baseDocument, proposedMutations, {
    includeMutationLog: false,
  });
  const fusionPatchesMatch =
    JSON.stringify(replayedDocument.fusionPatches) === JSON.stringify(proposedDocument.fusionPatches);

  return {
    ok: fusionPatchesMatch,
    checkedMutationCount: proposedMutations.length,
    fusionPatchesMatch,
    generatedPatchCountMatches:
      replayedDocument.fusionPatches.filter((patch) => patch.status === "mock-generated").length ===
      proposedDocument.fusionPatches.filter((patch) => patch.status === "mock-generated").length,
  };
}

function createDiffSummary(baseDocument, proposedDocument, proposedMutations, request) {
  const generatedPatchIds = proposedMutations
    .filter((mutation) => mutation.type === "fusion_patch_mock_asset_generate")
    .map((mutation) => mutation.payload?.patchId)
    .filter((patchId) => typeof patchId === "string");
  const notes =
    generatedPatchIds.length === 0
      ? ["No mock FusionPatch asset changes proposed."]
      : [`Mock FusionPatch asset generation proposed for ${generatedPatchIds.length} patch(es).`];

  return {
    patchId: typeof request.patchId === "string" ? request.patchId : null,
    generatedPatchIds,
    generatedPatchCount: generatedPatchIds.length,
    fusionPatchCountBefore: baseDocument.fusionPatches.length,
    fusionPatchCountAfter: proposedDocument.fusionPatches.length,
    mutationCount: proposedMutations.length,
    notes,
  };
}

function mutationCount(result) {
  return Array.isArray(result?.proposedMutations) ? result.proposedMutations.length : 0;
}

export function createHtmlArtboardMockFusionPatchAssetPlan(htmlArtboard, request = {}) {
  const sourceArtboard = isRecord(htmlArtboard) ? htmlArtboard : {};
  const sourceRequest = isRecord(request) ? request : {};
  const confirmApply = sourceRequest.confirmApply === true;
  const baseDocument = ensureHtmlArtboardDocument(sourceArtboard.runtimeDocument);
  const proposedDocument = createProposedDocument(baseDocument, sourceRequest);
  const proposedMutations = getProposedMutations(baseDocument, proposedDocument);
  const preconditions = createHtmlArtboardApplyPreconditions(sourceArtboard.runtimeDocument);
  const preconditionCheck = validateHtmlArtboardApplyPreconditions(
    sourceArtboard.runtimeDocument,
    sourceRequest
  );
  const preconditionFailed = preconditionCheck.failed === true;
  const replayCheck = createReplayCheck(baseDocument, proposedDocument, proposedMutations);
  let canApply = false;
  let reason = "";

  if (preconditionFailed) {
    reason = "Precondition check failed";
  } else if (!confirmApply) {
    reason = "confirmApply is required to write changes";
  } else if (proposedMutations.length === 0) {
    reason = "No mutations proposed";
  } else if (replayCheck.ok !== true) {
    reason = "Replay check failed";
  } else {
    canApply = true;
    reason = "Ready to apply";
  }

  return {
    shapeId: sourceArtboard.shapeId ?? null,
    documentId: baseDocument.id,
    patchId: typeof sourceRequest.patchId === "string" ? sourceRequest.patchId : null,
    dryRun: !confirmApply || preconditionFailed,
    confirmApply,
    canApply,
    reason,
    preconditions,
    preconditionCheck,
    preconditionFailed,
    proposedDocument,
    proposedMutations: deepClone(proposedMutations),
    diffSummary: createDiffSummary(baseDocument, proposedDocument, proposedMutations, sourceRequest),
    replayCheck,
  };
}

export function applyHtmlArtboardMockFusionPatchAssetDocumentToShapeRecord(
  shapeRecord,
  proposedDocument
) {
  return applyHtmlArtboardDocumentToShapeRecord(shapeRecord, proposedDocument);
}

export function summarizeHtmlArtboardMockFusionPatchAssetResult(result) {
  const source = isRecord(result) ? result : {};
  const shapeId = source.shapeId ?? "unknown shape";
  const count = mutationCount(source);

  if (source.applied === true) {
    return `Generated mock FusionPatch asset for ${shapeId}: ${count} mutation${
      count === 1 ? "" : "s"
    }.`;
  }

  if (source.preconditionFailed === true) {
    return `Mock FusionPatch asset was not generated for ${shapeId}: Precondition check failed.`;
  }

  if (source.confirmApply !== true || source.dryRun === true) {
    return `Dry-run only for ${shapeId}: confirmApply is required to write changes.`;
  }

  if (source.reason === "No mutations proposed" || count === 0) {
    return `No mock FusionPatch asset mutations proposed for ${shapeId}.`;
  }

  if (source.canApply === true) {
    return `Ready to generate mock FusionPatch asset for ${shapeId}: ${count} mutation${
      count === 1 ? "" : "s"
    }.`;
  }

  return `Mock FusionPatch asset was not generated for ${shapeId}: ${
    source.reason ?? "unknown reason"
  }.`;
}
