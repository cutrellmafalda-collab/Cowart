import { addFusionPatchPlaceholderToHtmlArtboard } from "../src/html-runtime/htmlArtboardFusionPatches.js";
import {
  deleteFusionPatchFromHtmlArtboard,
  renameFusionPatchInHtmlArtboard,
  setFusionPatchVisibilityInHtmlArtboard,
  updateFusionPatchInHtmlArtboard,
  updateFusionPatchRegionInHtmlArtboard,
} from "../src/html-runtime/htmlArtboardFusionPatchEditing.js";
import { ensureHtmlArtboardDocument } from "../src/html-runtime/htmlCanvasDocument.js";
import { replayHtmlArtboardMutations } from "../src/html-runtime/htmlArtboardReplay.js";

const DRY_RUN_MUTATION_SOURCE = "mcp-html-artboard-fusion-patch-dry-run";

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
        source: DRY_RUN_MUTATION_SOURCE,
      },
    },
  };
}

function getOperation(request) {
  return typeof request.operation === "string" ? request.operation : "";
}

function createPatchOptions(request) {
  const options = createMutationOptions();

  if (typeof request.targetSelector === "string" && request.targetSelector) {
    options.selector = request.targetSelector;
    options.sourceSelector = request.targetSelector;
  }

  if (typeof request.targetSourceText === "string") {
    options.sourceText = request.targetSourceText;
  }

  if (typeof request.name === "string" && request.name) {
    options.name = request.name;
  }

  if (typeof request.prompt === "string" && request.prompt) {
    options.prompt = request.prompt;
  }

  if (isRecord(request.region)) {
    options.region = request.region;
  }

  return options;
}

function getProposedMutations(baseDocument, proposedDocument) {
  return proposedDocument.mutationLog.slice(baseDocument.mutationLog.length);
}

function findPatch(document, patchId) {
  if (typeof patchId !== "string" || !patchId) return null;
  return document.fusionPatches.find((patch) => patch.id === patchId) ?? null;
}

function createReplayCheck(baseDocument, proposedDocument, proposedMutations) {
  const replayedDocument = replayHtmlArtboardMutations(baseDocument, proposedMutations, {
    includeMutationLog: false,
  });
  const htmlMatches = replayedDocument.html === proposedDocument.html;
  const cssMatches = replayedDocument.css === proposedDocument.css;
  const fusionPatchCountMatches =
    replayedDocument.fusionPatches.length === proposedDocument.fusionPatches.length;
  const fusionPatchesMatch =
    JSON.stringify(replayedDocument.fusionPatches) === JSON.stringify(proposedDocument.fusionPatches);

  return {
    ok: htmlMatches && cssMatches && fusionPatchCountMatches && fusionPatchesMatch,
    checkedMutationCount: proposedMutations.length,
    htmlMatches,
    cssMatches,
    fusionPatchCountMatches,
    fusionPatchesMatch,
  };
}

function createDiffSummary(baseDocument, proposedDocument, proposedMutations, operation, notes = []) {
  const patchCreated = proposedMutations.some((mutation) => mutation.type === "fusion_patch_create");
  const patchUpdated = proposedMutations.some((mutation) => mutation.type === "fusion_patch_update");
  const patchDeleted = proposedMutations.some((mutation) => mutation.type === "fusion_patch_delete");
  const patchVisibilityChanged = proposedMutations.some(
    (mutation) => mutation.type === "fusion_patch_visibility_update"
  );
  const patchRenamed = proposedMutations.some((mutation) => mutation.type === "fusion_patch_rename");
  const patchRegionChanged = proposedMutations.some(
    (mutation) => mutation.type === "fusion_patch_region_update"
  );
  const nextNotes = [...notes];

  if (patchCreated) nextNotes.push("Fusion patch creation proposed.");
  if (patchUpdated) nextNotes.push("Fusion patch update proposed.");
  if (patchDeleted) nextNotes.push("Fusion patch deletion proposed.");
  if (patchVisibilityChanged) nextNotes.push("Fusion patch visibility change proposed.");
  if (patchRenamed) nextNotes.push("Fusion patch rename proposed.");
  if (patchRegionChanged) nextNotes.push("Fusion patch region update proposed.");
  if (nextNotes.length === 0) nextNotes.push("No fusion patch changes proposed.");

  return {
    operation,
    patchCreated,
    patchUpdated,
    patchDeleted,
    patchVisibilityChanged,
    patchRenamed,
    patchRegionChanged,
    fusionPatchCountBefore: baseDocument.fusionPatches.length,
    fusionPatchCountAfter: proposedDocument.fusionPatches.length,
    mutationCount: proposedMutations.length,
    notes: nextNotes,
  };
}

function createNoChangeDocument(baseDocument) {
  return {
    ...deepClone(baseDocument),
    mutationLog: deepClone(baseDocument.mutationLog),
  };
}

function createUpdatedDocument(baseDocument, request, operation) {
  const patchId = typeof request.patchId === "string" ? request.patchId : "";

  if (operation === "create") {
    return addFusionPatchPlaceholderToHtmlArtboard(baseDocument, createPatchOptions(request));
  }

  if (!patchId) return createNoChangeDocument(baseDocument);

  if (operation === "delete") {
    return deleteFusionPatchFromHtmlArtboard(baseDocument, patchId, createMutationOptions());
  }

  if (operation === "hide") {
    return setFusionPatchVisibilityInHtmlArtboard(baseDocument, patchId, false, createMutationOptions());
  }

  if (operation === "show") {
    return setFusionPatchVisibilityInHtmlArtboard(baseDocument, patchId, true, createMutationOptions());
  }

  if (operation === "rename") {
    if (typeof request.name !== "string") return createNoChangeDocument(baseDocument);
    return renameFusionPatchInHtmlArtboard(baseDocument, patchId, request.name, createMutationOptions());
  }

  if (operation === "update_region") {
    if (!isRecord(request.region)) return createNoChangeDocument(baseDocument);
    return updateFusionPatchRegionInHtmlArtboard(
      baseDocument,
      patchId,
      request.region,
      createMutationOptions()
    );
  }

  if (operation === "update") {
    const updates = {};
    if (typeof request.prompt === "string") updates.prompt = request.prompt;
    if (typeof request.name === "string") updates.name = request.name;
    if (isRecord(request.region)) updates.region = request.region;

    return Object.keys(updates).length === 0
      ? createNoChangeDocument(baseDocument)
      : updateFusionPatchInHtmlArtboard(baseDocument, patchId, updates, createMutationOptions());
  }

  return createNoChangeDocument(baseDocument);
}

export function createHtmlArtboardFusionPatchProposal(htmlArtboard, request = {}) {
  const sourceArtboard = isRecord(htmlArtboard) ? htmlArtboard : {};
  const sourceRequest = isRecord(request) ? request : {};
  const baseDocument = ensureHtmlArtboardDocument(sourceArtboard.runtimeDocument);
  const operation = getOperation(sourceRequest);
  const targetPatchBefore = findPatch(baseDocument, sourceRequest.patchId);
  const notes = [];

  if (operation !== "create" && typeof sourceRequest.patchId === "string" && !targetPatchBefore) {
    notes.push(`Patch not found: ${sourceRequest.patchId}.`);
  }

  const proposedDocument = createUpdatedDocument(baseDocument, sourceRequest, operation);
  const proposedMutations = getProposedMutations(baseDocument, proposedDocument);
  const targetPatchAfter =
    operation === "create"
      ? proposedDocument.fusionPatches.at(-1) ?? null
      : findPatch(proposedDocument, sourceRequest.patchId);
  const diffSummary = createDiffSummary(
    baseDocument,
    proposedDocument,
    proposedMutations,
    operation,
    notes
  );

  return {
    shapeId: sourceArtboard.shapeId ?? null,
    documentId: baseDocument.id,
    operation,
    targetPatchId: targetPatchAfter?.id ?? targetPatchBefore?.id ?? sourceRequest.patchId ?? null,
    targetPatchBefore: deepClone(targetPatchBefore),
    targetPatchAfter: deepClone(targetPatchAfter),
    baseSummary: deepClone(sourceArtboard.summary ?? {}),
    proposedDocument,
    proposedMutations: deepClone(proposedMutations),
    diffSummary,
    replayCheck: createReplayCheck(baseDocument, proposedDocument, proposedMutations),
    dryRun: true,
  };
}

export function summarizeHtmlArtboardFusionPatchProposal(proposal) {
  const source = isRecord(proposal) ? proposal : {};
  const diffSummary = isRecord(source.diffSummary) ? source.diffSummary : {};
  const mutationCount = Number.isFinite(diffSummary.mutationCount) ? diffSummary.mutationCount : 0;
  const operation = source.operation || "unknown";
  const documentId = source.documentId ?? source.shapeId ?? "unknown";

  if (mutationCount === 0) {
    return `No dry-run FusionPatch changes proposed for ${documentId}.`;
  }

  return `Dry-run FusionPatch ${operation} proposal for ${documentId}: ${mutationCount} mutation${
    mutationCount === 1 ? "" : "s"
  }.`;
}
