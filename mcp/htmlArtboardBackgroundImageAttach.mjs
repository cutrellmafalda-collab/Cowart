import { attachExternalBackgroundImageToHtmlArtboard } from "../src/html-runtime/htmlArtboardBackground.js";
import { ensureHtmlArtboardDocument } from "../src/html-runtime/htmlCanvasDocument.js";
import {
  applyHtmlArtboardDocumentToShapeRecord,
  createHtmlArtboardApplyPreconditions,
  validateHtmlArtboardApplyPreconditions,
} from "./htmlArtboardApplyEdit.mjs";

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function createDiffSummary(baseDocument, proposedDocument) {
  return {
    backgroundChanged:
      JSON.stringify(baseDocument.background) !== JSON.stringify(proposedDocument.background),
    backgroundAssetId: proposedDocument.background?.backgroundAssetId ?? null,
    backgroundAssetUrlAdded: typeof proposedDocument.background?.backgroundAssetUrl === "string",
    mutationCount: Math.max(0, proposedDocument.mutationLog.length - baseDocument.mutationLog.length),
    notes:
      JSON.stringify(baseDocument.background) !== JSON.stringify(proposedDocument.background)
        ? ["External generated background image attach proposed."]
        : ["No external generated background image attach proposed."],
  };
}

export function createHtmlArtboardBackgroundImageAttachPlan(
  htmlArtboard,
  request = {},
  options = {}
) {
  const sourceArtboard = isRecord(htmlArtboard) ? htmlArtboard : {};
  const sourceRequest = isRecord(request) ? request : {};
  const asset = isRecord(options.asset) ? options.asset : {};
  const confirmApply = sourceRequest.confirmApply === true;
  const baseDocument = ensureHtmlArtboardDocument(sourceArtboard.runtimeDocument);
  const preconditions = createHtmlArtboardApplyPreconditions(sourceArtboard.runtimeDocument);
  const preconditionCheck = validateHtmlArtboardApplyPreconditions(
    sourceArtboard.runtimeDocument,
    sourceRequest
  );
  const preconditionFailed = preconditionCheck.failed === true;
  const existingBackgroundUrl =
    typeof baseDocument.background?.backgroundAssetUrl === "string" &&
    baseDocument.background.backgroundAssetUrl.length > 0;
  const overwriteBlocked = existingBackgroundUrl && sourceRequest.allowOverwrite !== true;
  const hasAssetUrl = typeof asset.backgroundAssetUrl === "string" && asset.backgroundAssetUrl;
  const hasAssetId = typeof asset.backgroundAssetId === "string" && asset.backgroundAssetId;
  let proposedDocument = baseDocument;
  let proposedMutations = [];
  let canApply = false;
  let reason = "";

  if (preconditionFailed) {
    reason = "Precondition check failed";
  } else if (overwriteBlocked) {
    reason = "Background already has backgroundAssetUrl; pass allowOverwrite=true to replace it";
  } else if (!hasAssetUrl) {
    reason = "Generated background image asset URL is required";
  } else if (!hasAssetId) {
    reason = "Generated background image asset id is required";
  } else {
    proposedDocument = attachExternalBackgroundImageToHtmlArtboard(baseDocument, asset, sourceRequest);
    proposedMutations = proposedDocument.mutationLog.slice(baseDocument.mutationLog.length);
    canApply = confirmApply && proposedMutations.length > 0;
    reason = confirmApply
      ? canApply
        ? "Ready to attach external generated background image"
        : "No attach mutation proposed"
      : "confirmApply is required to attach an external background image";
  }

  return {
    shapeId: sourceArtboard.shapeId ?? null,
    documentId: baseDocument.id,
    dryRun: !confirmApply || preconditionFailed,
    confirmApply,
    canApply,
    reason,
    preconditions,
    preconditionCheck,
    preconditionFailed,
    proposedDocument,
    proposedMutations,
    diffSummary: createDiffSummary(baseDocument, proposedDocument),
  };
}

export function applyHtmlArtboardBackgroundImageAttachDocumentToShapeRecord(
  shapeRecord,
  proposedDocument
) {
  return applyHtmlArtboardDocumentToShapeRecord(shapeRecord, proposedDocument);
}

export function summarizeHtmlArtboardBackgroundImageAttachResult(result) {
  const source = isRecord(result) ? result : {};
  const shapeId = source.shapeId ?? "unknown shape";

  if (source.applied === true) {
    return `Attached external HTML Artboard background image to ${shapeId}.`;
  }

  if (source.preconditionFailed === true) {
    return `External HTML Artboard background image was not attached to ${shapeId}: Precondition check failed.`;
  }

  if (source.confirmApply !== true || source.dryRun === true) {
    return `Dry-run only for ${shapeId}: confirmApply is required to attach an external background image.`;
  }

  if (source.canApply === true) {
    return `Ready to attach external HTML Artboard background image to ${shapeId}.`;
  }

  return `External HTML Artboard background image was not attached to ${shapeId}: ${
    source.reason ?? "unknown reason"
  }.`;
}
