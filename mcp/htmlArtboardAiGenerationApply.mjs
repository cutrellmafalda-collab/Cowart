import {
  createHtmlArtboardAiProviderRequest,
  createHtmlArtboardAiProviderResult,
  validateHtmlArtboardAiProviderResult,
} from "../src/html-runtime/htmlArtboardAiProvider.js";
import { createOpenAiImageProvider } from "../src/html-runtime/htmlArtboardOpenAiImageProvider.js";
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
import { createHtmlArtboardAiGenerationProposal } from "./htmlArtboardAiGenerationProposal.mjs";

const AI_GENERATION_MUTATION_SOURCE = "mcp-html-artboard-ai-fusion-patch-generation";
const AI_GENERATION_MUTATION_TYPE = "fusion_patch_ai_asset_generate";

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

function selectPatchId(document, request = {}) {
  if (typeof request.patchId === "string" && request.patchId) return request.patchId;
  return document.fusionPatches.length === 1 ? document.fusionPatches[0].id : null;
}

function getProvider(request = {}, options = {}) {
  if (isRecord(options.provider)) return options.provider;
  return createOpenAiImageProvider({
    model: request.model,
    size: request.size,
    quality: request.quality,
    outputFormat: request.outputFormat,
    background: request.background,
    apiKey: request.apiKey,
    endpoint: request.endpoint,
    fetch: options.fetch,
    env: options.env,
  });
}

function createMutationOptions() {
  return {
    mutationOptions: {
      meta: {
        source: AI_GENERATION_MUTATION_SOURCE,
      },
    },
  };
}

function updateDocumentFingerprint(document) {
  return {
    ...document,
    renderFingerprint: createRenderFingerprint(document),
  };
}

function createReplayCheck(baseDocument, proposedDocument, proposedMutations) {
  return {
    ok: proposedMutations.length === 1 && proposedDocument.fusionPatches.length === baseDocument.fusionPatches.length,
    checkedMutationCount: proposedMutations.length,
    fusionPatchCountMatches: proposedDocument.fusionPatches.length === baseDocument.fusionPatches.length,
    htmlMatches: proposedDocument.html === baseDocument.html,
    cssMatches: proposedDocument.css === baseDocument.css,
  };
}

function createDiffSummary(baseDocument, proposedDocument, mutation, providerResult) {
  const generatedPatch = proposedDocument.fusionPatches.find(
    (patch) => patch.id === mutation?.payload?.patchId
  );

  return {
    provider: providerResult.provider,
    model: providerResult.model,
    ok: providerResult.ok,
    patchId: generatedPatch?.id ?? null,
    patchStatus: generatedPatch?.status ?? null,
    patchAssetId: providerResult.patchAssetId,
    patchAssetUrlAdded: typeof providerResult.patchAssetUrl === "string" && providerResult.patchAssetUrl.length > 0,
    fusionPatchCountBefore: baseDocument.fusionPatches.length,
    fusionPatchCountAfter: proposedDocument.fusionPatches.length,
    mutationCount: mutation ? 1 : 0,
    notes:
      providerResult.ok === true
        ? ["AI FusionPatch asset generation proposed."]
        : ["AI FusionPatch generation failed safely."],
  };
}

function applyProviderResultToDocument(baseDocument, patchId, providerResult) {
  const patchIndex = getPatchIndex(baseDocument, patchId);
  if (patchIndex === -1) {
    return {
      document: baseDocument,
      mutation: null,
      reason: `Patch not found: ${patchId}`,
    };
  }

  const previousPatch = baseDocument.fusionPatches[patchIndex];
  const validation = validateHtmlArtboardAiProviderResult(providerResult);
  const isSuccessful = providerResult.ok === true && validation.ok === true;
  const providerError =
    isSuccessful || providerResult.error == null
      ? validation.ok
        ? null
        : validation.reasons.join("; ")
      : String(providerResult.error);
  const nextPatch = ensureFusionPatch({
    ...previousPatch,
    patchAssetId: isSuccessful ? providerResult.patchAssetId : previousPatch.patchAssetId,
    patchAssetUrl: isSuccessful ? providerResult.patchAssetUrl : previousPatch.patchAssetUrl,
    maskAssetId:
      isSuccessful && providerResult.maskAssetId
        ? providerResult.maskAssetId
        : previousPatch.maskAssetId,
    provider: providerResult.provider,
    seed: providerResult.seed ?? previousPatch.seed,
    status: isSuccessful ? "generated" : "failed",
    updatedAt: new Date().toISOString(),
    meta: {
      ...previousPatch.meta,
      providerResult: deepClone(providerResult),
      providerError,
    },
  });
  let proposedDocument = {
    ...baseDocument,
    fusionPatches: baseDocument.fusionPatches.map((patch, index) =>
      index === patchIndex ? nextPatch : patch
    ),
  };
  const mutation = createHtmlArtboardMutation(
    AI_GENERATION_MUTATION_TYPE,
    {
      patchId: nextPatch.id,
      provider: providerResult.provider,
      model: providerResult.model,
      ok: isSuccessful,
      patchAssetId: isSuccessful ? providerResult.patchAssetId : null,
      previousPatch: deepClone(previousPatch),
      nextPatch: deepClone(nextPatch),
      error: providerError,
    },
    createMutationOptions()
  );
  proposedDocument = appendHtmlArtboardMutations(proposedDocument, [mutation]);

  return {
    document: updateDocumentFingerprint(proposedDocument),
    mutation,
    reason: isSuccessful ? "Generated" : providerError ?? "Provider failed",
  };
}

export async function createHtmlArtboardAiGenerationApplyPlan(htmlArtboard, request = {}, options = {}) {
  const sourceArtboard = isRecord(htmlArtboard) ? htmlArtboard : {};
  const sourceRequest = isRecord(request) ? request : {};
  const confirmGenerate = sourceRequest.confirmGenerate === true;
  const dryRun = sourceRequest.dryRun === true || !confirmGenerate;
  const baseDocument = ensureHtmlArtboardDocument(sourceArtboard.runtimeDocument);
  const patchId = selectPatchId(baseDocument, sourceRequest);
  const proposal = createHtmlArtboardAiGenerationProposal(sourceArtboard, {
    ...sourceRequest,
    patchId: patchId ?? sourceRequest.patchId,
    includeProviderPayload: true,
  });
  const preconditions = createHtmlArtboardApplyPreconditions(sourceArtboard.runtimeDocument);
  const preconditionCheck = validateHtmlArtboardApplyPreconditions(
    sourceArtboard.runtimeDocument,
    sourceRequest
  );
  const preconditionFailed = preconditionCheck.failed === true;
  let providerResult = null;
  let proposedDocument = baseDocument;
  let proposedMutations = [];
  let diffSummary = {
    provider: sourceRequest.provider ?? "openai",
    model: sourceRequest.model ?? proposal.providerPayload?.model ?? null,
    ok: false,
    patchId,
    patchStatus: patchId ? baseDocument.fusionPatches.find((patch) => patch.id === patchId)?.status ?? null : null,
    patchAssetId: null,
    patchAssetUrlAdded: false,
    fusionPatchCountBefore: baseDocument.fusionPatches.length,
    fusionPatchCountAfter: baseDocument.fusionPatches.length,
    mutationCount: 0,
    notes: ["No AI generation has run."],
  };
  let replayCheck = createReplayCheck(baseDocument, proposedDocument, proposedMutations);
  let canApply = false;
  let reason = "";

  if (!patchId) {
    reason = "patchId is required unless exactly one FusionPatch exists";
  } else if (preconditionFailed) {
    reason = "Precondition check failed";
  } else if (dryRun) {
    reason = "confirmGenerate is required to call provider and write changes";
  } else if ((sourceRequest.provider ?? "openai") !== "openai") {
    reason = "Only provider=openai is supported for real AI generation";
  } else {
    const provider = getProvider(sourceRequest, options);
    const patch = baseDocument.fusionPatches.find((candidate) => candidate.id === patchId);
    const providerRequest = createHtmlArtboardAiProviderRequest(baseDocument, patch, {
      prompt: sourceRequest.promptOverride,
      providerOptions: {
        provider: "openai",
        model: sourceRequest.model ?? "gpt-image-2",
        quality: sourceRequest.quality,
        timeoutMs: sourceRequest.timeoutMs,
      },
    });
    const rawProviderResult =
      typeof provider.generateFusionPatchAsset === "function"
        ? await provider.generateFusionPatchAsset(providerRequest)
        : { ok: false, provider: "openai", error: "provider.generateFusionPatchAsset is not available" };
    providerResult = createHtmlArtboardAiProviderResult(rawProviderResult);

    if (providerResult.ok !== true && providerResult.error === "missing_api_key") {
      reason = "missing_api_key";
    } else {
      const applied = applyProviderResultToDocument(baseDocument, patchId, providerResult);
      proposedDocument = applied.document;
      proposedMutations = applied.mutation ? [deepClone(applied.mutation)] : [];
      diffSummary = createDiffSummary(baseDocument, proposedDocument, applied.mutation, providerResult);
      replayCheck = createReplayCheck(baseDocument, proposedDocument, proposedMutations);
      canApply = proposedMutations.length > 0 && replayCheck.ok === true;
      reason = canApply ? applied.reason : "No AI generation mutations proposed";
    }
  }

  return {
    shapeId: sourceArtboard.shapeId ?? null,
    documentId: baseDocument.id,
    patchId,
    dryRun,
    confirmGenerate,
    canApply,
    reason,
    proposal,
    providerResult: deepClone(providerResult),
    preconditions,
    preconditionCheck,
    preconditionFailed,
    proposedDocument,
    proposedMutations,
    diffSummary,
    replayCheck,
  };
}

export function applyHtmlArtboardAiGenerationDocumentToShapeRecord(shapeRecord, proposedDocument) {
  return applyHtmlArtboardDocumentToShapeRecord(shapeRecord, proposedDocument);
}

export function summarizeHtmlArtboardAiGenerationApplyResult(result) {
  const source = isRecord(result) ? result : {};
  const shapeId = source.shapeId ?? "unknown shape";
  const count = Array.isArray(source.proposedMutations) ? source.proposedMutations.length : 0;

  if (source.applied === true) {
    return `Generated AI FusionPatch asset for ${shapeId}: ${count} mutation${
      count === 1 ? "" : "s"
    }.`;
  }

  if (source.preconditionFailed === true) {
    return `AI FusionPatch asset was not generated for ${shapeId}: Precondition check failed.`;
  }

  if (source.reason === "missing_api_key") {
    return `AI FusionPatch asset was not generated for ${shapeId}: missing_api_key.`;
  }

  if (source.confirmGenerate !== true || source.dryRun === true) {
    return `Dry-run only for ${shapeId}: confirmGenerate is required to call provider and write changes.`;
  }

  if (source.canApply === true) {
    return `Ready to apply AI FusionPatch generation for ${shapeId}: ${count} mutation${
      count === 1 ? "" : "s"
    }.`;
  }

  return `AI FusionPatch asset was not generated for ${shapeId}: ${source.reason ?? "unknown reason"}.`;
}
