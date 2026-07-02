import { ensureHtmlArtboardDocument } from "../src/html-runtime/htmlCanvasDocument.js";
import { createFusionPatchPlaceholder } from "../src/html-runtime/fusionPatch.js";
import {
  createHtmlArtboardMutation,
  createSourceUpdateMutations,
} from "../src/html-runtime/htmlArtboardMutations.js";
import { replayHtmlArtboardMutations } from "../src/html-runtime/htmlArtboardReplay.js";

const DRY_RUN_MUTATION_SOURCE = "mcp-html-artboard-dry-run";

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
    meta: {
      source: DRY_RUN_MUTATION_SOURCE,
    },
  };
}

function getInstruction(request) {
  return typeof request.instruction === "string" ? request.instruction : "";
}

function getPatchOptions(request) {
  const patchOptions = {};

  if (typeof request.targetSelector === "string" && request.targetSelector) {
    patchOptions.selector = request.targetSelector;
    patchOptions.sourceSelector = request.targetSelector;
  }

  if (typeof request.targetSourceText === "string") {
    patchOptions.sourceText = request.targetSourceText;
  }

  if (typeof request.fusionPatchPrompt === "string" && request.fusionPatchPrompt) {
    patchOptions.prompt = request.fusionPatchPrompt;
  }

  return patchOptions;
}

function appendProposedMutationLog(baseDocument, proposedDocument, proposedMutations) {
  return {
    ...proposedDocument,
    mutationLog: [...baseDocument.mutationLog, ...deepClone(proposedMutations)],
  };
}

function createReplayCheck(baseDocument, proposedDocument, proposedMutations) {
  const replayedDocument = replayHtmlArtboardMutations(baseDocument, proposedMutations, {
    includeMutationLog: false,
  });
  const htmlMatches = replayedDocument.html === proposedDocument.html;
  const cssMatches = replayedDocument.css === proposedDocument.css;
  const fusionPatchCountMatches =
    replayedDocument.fusionPatches.length === proposedDocument.fusionPatches.length;

  return {
    ok: htmlMatches && cssMatches && fusionPatchCountMatches,
    checkedMutationCount: proposedMutations.length,
    htmlMatches,
    cssMatches,
    fusionPatchCountMatches,
  };
}

function createDiffSummary(baseDocument, proposedDocument, proposedMutations) {
  const htmlChanged = baseDocument.html !== proposedDocument.html;
  const cssChanged = baseDocument.css !== proposedDocument.css;
  const fusionPatchCreated = proposedMutations.some((mutation) => mutation.type === "fusion_patch_create");
  const notes = [];

  if (htmlChanged) notes.push("HTML source change proposed.");
  if (cssChanged) notes.push("CSS source change proposed.");
  if (fusionPatchCreated) notes.push("Fusion patch placeholder proposed.");
  if (notes.length === 0) notes.push("No changes proposed.");

  return {
    htmlChanged,
    cssChanged,
    fusionPatchCreated,
    mutationCount: proposedMutations.length,
    notes,
  };
}

export function createHtmlArtboardEditProposal(htmlArtboard, request = {}) {
  const sourceArtboard = isRecord(htmlArtboard) ? htmlArtboard : {};
  const sourceRequest = isRecord(request) ? request : {};
  const baseDocument = ensureHtmlArtboardDocument(sourceArtboard.runtimeDocument);
  const nextDocument = {
    ...baseDocument,
    html: typeof sourceRequest.nextHtml === "string" ? sourceRequest.nextHtml : baseDocument.html,
    css: typeof sourceRequest.nextCss === "string" ? sourceRequest.nextCss : baseDocument.css,
  };
  const proposedMutations = createSourceUpdateMutations(baseDocument, nextDocument, createMutationOptions());

  if (sourceRequest.createFusionPatch === true) {
    const patch = createFusionPatchPlaceholder(getPatchOptions(sourceRequest));
    proposedMutations.push(
      createHtmlArtboardMutation(
        "fusion_patch_create",
        {
          patchId: patch.id,
          patch,
        },
        createMutationOptions()
      )
    );
  }

  const replayedDocument = replayHtmlArtboardMutations(baseDocument, proposedMutations, {
    includeMutationLog: false,
  });
  const proposedDocument =
    proposedMutations.length === 0
      ? deepClone(baseDocument)
      : appendProposedMutationLog(baseDocument, replayedDocument, proposedMutations);
  const diffSummary = createDiffSummary(baseDocument, proposedDocument, proposedMutations);

  return {
    shapeId: sourceArtboard.shapeId ?? null,
    documentId: baseDocument.id,
    instruction: getInstruction(sourceRequest),
    baseSummary: deepClone(sourceArtboard.summary ?? {}),
    proposedDocument,
    proposedMutations: deepClone(proposedMutations),
    diffSummary,
    replayCheck: createReplayCheck(baseDocument, proposedDocument, proposedMutations),
    dryRun: true,
  };
}

export function summarizeHtmlArtboardEditProposal(proposal) {
  const source = isRecord(proposal) ? proposal : {};
  const diffSummary = isRecord(source.diffSummary) ? source.diffSummary : {};
  const mutationCount = Number.isFinite(diffSummary.mutationCount) ? diffSummary.mutationCount : 0;
  const documentId = source.documentId ?? source.shapeId ?? "unknown";

  if (mutationCount === 0) {
    return `No dry-run changes proposed for ${documentId}.`;
  }

  const mutationTypes = Array.isArray(source.proposedMutations)
    ? source.proposedMutations.map((mutation) => mutation.type).filter(Boolean)
    : [];
  const typeSummary = mutationTypes.length > 0 ? `: ${mutationTypes.join(", ")}` : "";

  return `Dry-run proposal for ${documentId}: ${mutationCount} mutation${
    mutationCount === 1 ? "" : "s"
  }${typeSummary}.`;
}
