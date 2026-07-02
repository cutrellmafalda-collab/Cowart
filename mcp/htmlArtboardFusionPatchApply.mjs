import {
  applyHtmlArtboardDocumentToShapeRecord,
  createHtmlArtboardApplyPreconditions,
  validateHtmlArtboardApplyPreconditions,
} from "./htmlArtboardApplyEdit.mjs";
import { createHtmlArtboardFusionPatchProposal } from "./htmlArtboardFusionPatchProposal.mjs";

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

function mutationCount(result) {
  return Array.isArray(result?.proposedMutations) ? result.proposedMutations.length : 0;
}

export function createHtmlArtboardFusionPatchApplyPlan(htmlArtboard, request = {}) {
  const sourceRequest = isRecord(request) ? request : {};
  const confirmApply = sourceRequest.confirmApply === true;
  const proposal = createHtmlArtboardFusionPatchProposal(htmlArtboard, sourceRequest);
  const preconditions = createHtmlArtboardApplyPreconditions(htmlArtboard?.runtimeDocument);
  const preconditionCheck = validateHtmlArtboardApplyPreconditions(
    htmlArtboard?.runtimeDocument,
    sourceRequest
  );
  const preconditionFailed = preconditionCheck.failed === true;
  const proposedMutations = Array.isArray(proposal.proposedMutations) ? proposal.proposedMutations : [];
  let canApply = false;
  let reason = "";

  if (preconditionFailed) {
    reason = "Precondition check failed";
  } else if (!confirmApply) {
    reason = "confirmApply is required to write changes";
  } else if (proposedMutations.length === 0) {
    reason = "No mutations proposed";
  } else if (proposal.replayCheck?.ok !== true) {
    reason = "Replay check failed";
  } else {
    canApply = true;
    reason = "Ready to apply";
  }

  return {
    shapeId: proposal.shapeId,
    documentId: proposal.documentId,
    operation: proposal.operation,
    targetPatchId: proposal.targetPatchId,
    dryRun: !confirmApply || preconditionFailed,
    confirmApply,
    proposal,
    canApply,
    reason,
    preconditions,
    preconditionCheck,
    preconditionFailed,
    proposedDocument: deepClone(proposal.proposedDocument),
    proposedMutations: deepClone(proposedMutations),
    diffSummary: deepClone(proposal.diffSummary),
    replayCheck: deepClone(proposal.replayCheck),
    targetPatchBefore: deepClone(proposal.targetPatchBefore),
    targetPatchAfter: deepClone(proposal.targetPatchAfter),
  };
}

export function applyHtmlArtboardFusionPatchDocumentToShapeRecord(shapeRecord, proposedDocument) {
  return applyHtmlArtboardDocumentToShapeRecord(shapeRecord, proposedDocument);
}

export function summarizeHtmlArtboardFusionPatchApplyResult(result) {
  const source = isRecord(result) ? result : {};
  const shapeId = source.shapeId ?? "unknown shape";
  const count = mutationCount(source);
  const operation = source.operation || "unknown";

  if (source.applied === true) {
    return `Applied FusionPatch ${operation} to ${shapeId}: ${count} mutation${
      count === 1 ? "" : "s"
    }.`;
  }

  if (source.preconditionFailed === true) {
    return `FusionPatch ${operation} was not applied to ${shapeId}: Precondition check failed.`;
  }

  if (source.confirmApply !== true || source.dryRun === true) {
    return `Dry-run only for ${shapeId}: confirmApply is required to write changes.`;
  }

  if (source.reason === "No mutations proposed" || count === 0) {
    return `No FusionPatch mutations proposed for ${shapeId}.`;
  }

  if (source.canApply === true) {
    return `Ready to apply FusionPatch ${operation} to ${shapeId}: ${count} mutation${
      count === 1 ? "" : "s"
    }.`;
  }

  return `FusionPatch ${operation} was not applied to ${shapeId}: ${
    source.reason ?? "unknown reason"
  }.`;
}
