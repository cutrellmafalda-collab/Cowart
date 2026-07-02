import { ensureHtmlArtboardDocument } from "../src/html-runtime/htmlCanvasDocument.js";
import { createRenderFingerprint } from "../src/html-runtime/renderFingerprint.js";
import { createHtmlArtboardEditProposal } from "./htmlArtboardEditProposal.mjs";

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

export function createHtmlArtboardApplyPreconditions(runtimeDocument) {
  const sourceDocument = isRecord(runtimeDocument) ? runtimeDocument : {};
  const document = ensureHtmlArtboardDocument(sourceDocument);

  return {
    documentId: document.id,
    renderFingerprint:
      typeof sourceDocument.renderFingerprint === "string"
        ? sourceDocument.renderFingerprint
        : createRenderFingerprint(document),
    mutationCount: Array.isArray(document.mutationLog) ? document.mutationLog.length : 0,
    fusionPatchCount: Array.isArray(document.fusionPatches) ? document.fusionPatches.length : 0,
  };
}

export function validateHtmlArtboardApplyPreconditions(runtimeDocument, request = {}) {
  const sourceRequest = isRecord(request) ? request : {};
  const actual = createHtmlArtboardApplyPreconditions(runtimeDocument);
  const expected = {};
  const reasons = [];

  if (typeof sourceRequest.expectedDocumentId === "string") {
    expected.documentId = sourceRequest.expectedDocumentId;
    if (expected.documentId !== actual.documentId) {
      reasons.push("expectedDocumentId does not match current documentId");
    }
  }

  if (typeof sourceRequest.expectedRenderFingerprint === "string") {
    expected.renderFingerprint = sourceRequest.expectedRenderFingerprint;
    if (expected.renderFingerprint !== actual.renderFingerprint) {
      reasons.push("expectedRenderFingerprint does not match current renderFingerprint");
    }
  }

  if (Number.isFinite(sourceRequest.expectedMutationCount)) {
    expected.mutationCount = sourceRequest.expectedMutationCount;
    if (expected.mutationCount !== actual.mutationCount) {
      reasons.push("expectedMutationCount does not match current mutationCount");
    }
  }

  if (Number.isFinite(sourceRequest.expectedFusionPatchCount)) {
    expected.fusionPatchCount = sourceRequest.expectedFusionPatchCount;
    if (expected.fusionPatchCount !== actual.fusionPatchCount) {
      reasons.push("expectedFusionPatchCount does not match current fusionPatchCount");
    }
  }

  return {
    ok: reasons.length === 0,
    failed: reasons.length > 0,
    expected,
    actual,
    reasons,
  };
}

export function createHtmlArtboardApplyPlan(htmlArtboard, request = {}) {
  const sourceRequest = isRecord(request) ? request : {};
  const confirmApply = sourceRequest.confirmApply === true;
  const proposal = createHtmlArtboardEditProposal(htmlArtboard, sourceRequest);
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
  };
}

export function applyHtmlArtboardDocumentToShapeRecord(shapeRecord, proposedDocument) {
  if (shapeRecord?.meta?.cowartHtmlArtboard !== true) {
    throw new Error("Cannot apply HTML Artboard document to a non-HTML Artboard shape.");
  }

  return {
    ...deepClone(shapeRecord),
    meta: {
      ...deepClone(shapeRecord.meta),
      cowartHtmlArtboard: true,
      runtimeDocument: ensureHtmlArtboardDocument(proposedDocument),
    },
  };
}

export function summarizeHtmlArtboardApplyResult(result) {
  const source = isRecord(result) ? result : {};
  const shapeId = source.shapeId ?? "unknown shape";
  const count = mutationCount(source);

  if (source.applied === true) {
    return `Applied HTML Artboard edit to ${shapeId}: ${count} mutation${count === 1 ? "" : "s"}.`;
  }

  if (source.preconditionFailed === true) {
    return `HTML Artboard edit was not applied to ${shapeId}: Precondition check failed.`;
  }

  if (source.confirmApply !== true || source.dryRun === true) {
    return `Dry-run only for ${shapeId}: confirmApply is required to write changes.`;
  }

  if (source.reason === "No mutations proposed" || count === 0) {
    return `No mutations proposed for ${shapeId}.`;
  }

  if (source.canApply === true) {
    return `Ready to apply HTML Artboard edit to ${shapeId}: ${count} mutation${count === 1 ? "" : "s"}.`;
  }

  return `HTML Artboard edit was not applied to ${shapeId}: ${source.reason ?? "unknown reason"}.`;
}
