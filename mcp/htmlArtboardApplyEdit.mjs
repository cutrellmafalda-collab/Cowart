import { ensureHtmlArtboardDocument } from "../src/html-runtime/htmlCanvasDocument.js";
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

export function createHtmlArtboardApplyPlan(htmlArtboard, request = {}) {
  const sourceRequest = isRecord(request) ? request : {};
  const confirmApply = sourceRequest.confirmApply === true;
  const proposal = createHtmlArtboardEditProposal(htmlArtboard, sourceRequest);
  const proposedMutations = Array.isArray(proposal.proposedMutations) ? proposal.proposedMutations : [];
  let canApply = false;
  let reason = "";

  if (!confirmApply) {
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
    dryRun: !confirmApply,
    confirmApply,
    proposal,
    canApply,
    reason,
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
