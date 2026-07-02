import { createHtmlArtboardAiProviderRequest } from "../src/html-runtime/htmlArtboardAiProvider.js";
import { createOpenAiImageProviderPayload } from "../src/html-runtime/htmlArtboardOpenAiImageProvider.js";
import { ensureHtmlArtboardDocument } from "../src/html-runtime/htmlCanvasDocument.js";

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

function getProvider(request = {}) {
  return typeof request.provider === "string" && request.provider ? request.provider : "openai";
}

function getSelectablePatches(document) {
  return document.fusionPatches.map((patch) => ({
    id: patch.id,
    name: patch.name,
    prompt: patch.prompt,
    selector: patch.selector,
    sourceText: patch.sourceText,
    status: patch.status,
    visible: patch.visible,
  }));
}

function selectPatch(document, request = {}) {
  if (typeof request.patchId === "string" && request.patchId) {
    return {
      patch: document.fusionPatches.find((patch) => patch.id === request.patchId) ?? null,
      reason: null,
    };
  }

  if (document.fusionPatches.length === 1) {
    return {
      patch: document.fusionPatches[0],
      reason: "Selected the only FusionPatch because patchId was omitted.",
    };
  }

  if (document.fusionPatches.length === 0) {
    return {
      patch: null,
      reason: "No FusionPatch exists on the selected HTML Artboard.",
    };
  }

  return {
    patch: null,
    reason: "Multiple FusionPatches exist; pass patchId to choose one.",
  };
}

function createDocumentSummary(document) {
  return {
    documentId: document.id,
    type: document.type,
    version: document.version,
    width: document.width,
    height: document.height,
    htmlLength: document.html.length,
    cssLength: document.css.length,
    fusionPatchCount: document.fusionPatches.length,
    mutationCount: document.mutationLog.length,
    renderFingerprint: document.renderFingerprint,
  };
}

function createSafeProviderRequest(providerRequest, includeDocument) {
  if (!providerRequest) return null;
  if (includeDocument) return deepClone(providerRequest);

  const { document: _document, preview, ...rest } = providerRequest;
  return {
    ...deepClone(rest),
    documentSummary: createDocumentSummary(providerRequest.document),
    preview: {
      renderFingerprint: preview?.renderFingerprint ?? null,
      thumbnailDataUrlIncluded: typeof preview?.thumbnailDataUrl === "string" && preview.thumbnailDataUrl.length > 0,
    },
  };
}

function createSafetySummary(document, patch, provider) {
  return {
    documentId: document.id,
    renderFingerprint: document.renderFingerprint,
    mutationCount: document.mutationLog.length,
    fusionPatchCount: document.fusionPatches.length,
    patchId: patch?.id ?? null,
    provider,
    dryRun: true,
    willCallProvider: false,
    willWriteCanvas: false,
    requiresConfirmation: true,
    containsApiKey: false,
  };
}

function createRiskSummary(providerPayload, warnings) {
  return {
    level: providerPayload ? "medium" : "low",
    reasons: providerPayload
      ? [
          "Payload preview may include HTML Artboard source-derived prompt context.",
          "Real provider calls require explicit confirmation in a later tool.",
        ]
      : warnings,
  };
}

export function createHtmlArtboardAiGenerationProposal(htmlArtboard, request = {}) {
  const sourceArtboard = isRecord(htmlArtboard) ? htmlArtboard : {};
  const sourceRequest = isRecord(request) ? request : {};
  const document = ensureHtmlArtboardDocument(sourceArtboard.runtimeDocument);
  const provider = getProvider(sourceRequest);
  const includeDocument = sourceRequest.includeDocument === true;
  const includeProviderPayload = sourceRequest.includeProviderPayload !== false;
  const warnings = [];
  const selectedPatch = selectPatch(document, sourceRequest);

  if (selectedPatch.reason) warnings.push(selectedPatch.reason);
  if (provider !== "openai") warnings.push(`Unsupported AI provider for payload preview: ${provider}.`);

  let providerRequest = null;
  let providerPayload = null;

  if (selectedPatch.patch && provider === "openai") {
    providerRequest = createHtmlArtboardAiProviderRequest(document, selectedPatch.patch, {
      prompt: sourceRequest.promptOverride,
      providerOptions: {
        provider,
        model: sourceRequest.model ?? "gpt-image-2",
        quality: sourceRequest.quality,
        timeoutMs: sourceRequest.timeoutMs,
      },
    });
    providerPayload = createOpenAiImageProviderPayload(providerRequest, {
      model: sourceRequest.model,
      size: sourceRequest.size,
      quality: sourceRequest.quality,
      outputFormat: sourceRequest.outputFormat,
      background: sourceRequest.background,
      promptOverride: sourceRequest.promptOverride,
    });
  }

  return {
    shapeId: sourceArtboard.shapeId ?? null,
    documentId: document.id,
    patchId: selectedPatch.patch?.id ?? sourceRequest.patchId ?? null,
    provider,
    model: providerPayload?.model ?? sourceRequest.model ?? null,
    dryRun: true,
    providerRequest: createSafeProviderRequest(providerRequest, includeDocument),
    providerPayload: includeProviderPayload ? deepClone(providerPayload) : null,
    selectablePatches: getSelectablePatches(document),
    safetySummary: createSafetySummary(document, selectedPatch.patch, provider),
    estimatedRisk: createRiskSummary(providerPayload, warnings),
    warnings,
  };
}

export function summarizeHtmlArtboardAiGenerationProposal(proposal) {
  const source = isRecord(proposal) ? proposal : {};
  const documentId = source.documentId ?? source.shapeId ?? "unknown";

  if (!source.providerPayload) {
    return `No AI FusionPatch generation payload proposed for ${documentId}.`;
  }

  return `Dry-run AI FusionPatch generation payload for ${documentId} using ${source.provider ?? "unknown"}${
    source.patchId ? ` patch ${source.patchId}` : ""
  }.`;
}
