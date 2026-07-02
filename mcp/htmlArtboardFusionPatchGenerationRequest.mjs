import { createHtmlArtboardStandaloneHtml } from "../src/html-runtime/htmlArtboardExport.js";
import { createHtmlArtboardThumbnailDataUrl } from "../src/html-runtime/htmlArtboardThumbnail.js";
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

function finiteNumber(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function getOutputFormat(value) {
  return ["png", "webp", "svg"].includes(value) ? value : "png";
}

function normalizeRegion(region) {
  if (!isRecord(region)) return null;
  const nextRegion = {
    x: Number(region.x),
    y: Number(region.y),
    w: Number(region.w),
    h: Number(region.h),
  };

  if (![nextRegion.x, nextRegion.y, nextRegion.w, nextRegion.h].every(Number.isFinite)) {
    return null;
  }

  if (nextRegion.w <= 0 || nextRegion.h <= 0) return null;

  return nextRegion;
}

function getPatches(document, request = {}) {
  if (typeof request.patchId === "string" && request.patchId) {
    return document.fusionPatches.filter((patch) => patch.id === request.patchId);
  }

  return document.fusionPatches;
}

function createOutput(region, request = {}) {
  const scale = Math.max(0.1, finiteNumber(request.outputScale, 1));
  const fallbackWidth = 1024;
  const fallbackHeight = 1024;

  return {
    format: getOutputFormat(request.preferredOutputFormat),
    transparentBackground: request.transparentBackground !== false,
    width: Math.max(1, Math.round((region?.w ?? fallbackWidth) * scale)),
    height: Math.max(1, Math.round((region?.h ?? fallbackHeight) * scale)),
  };
}

function createGenerationInstructions(output) {
  return [
    "Generate only a FusionPatch image asset for Cowart.",
    "Do not modify HTML or CSS.",
    "Do not include UI chrome, browser chrome, or unrelated canvas content.",
    "Fit the image to the provided region.",
    output.transparentBackground
      ? "Use a transparent background when possible."
      : "Use the requested background style from the prompt.",
  ];
}

function createSuggestedImagePrompt({ document, patch, region, output }) {
  const regionText = region
    ? `x=${region.x}, y=${region.y}, w=${region.w}, h=${region.h}`
    : "no explicit region";
  const sourceText = patch.sourceText || "(empty source text)";
  const selector = patch.selector || patch.sourceSelector || "(no selector)";

  return [
    "Generate only a patch asset for a Cowart HTML Artboard FusionPatch.",
    `Patch prompt: ${patch.prompt || "No prompt provided."}`,
    `Target selector: ${selector}`,
    `Target source text: ${sourceText}`,
    `Target region: ${regionText}`,
    `Artboard size: ${document.width}x${document.height}`,
    `Desired output: ${output.width}x${output.height} ${output.format}`,
    output.transparentBackground ? "Transparent background preferred." : "Transparent background not required.",
    "Do not modify HTML/CSS.",
    "The result should fit the provided region and work as an overlay asset.",
  ].join("\n");
}

function createNegativeInstructions() {
  return [
    "Do not rewrite the artboard HTML.",
    "Do not rewrite the artboard CSS.",
    "Do not generate a full poster unless the patch prompt asks for a full-region visual.",
    "Do not include local paths, secrets, API keys, or Cowart canvas store data.",
    "Do not include unrelated surrounding UI.",
  ];
}

function createArtboardSummary(document) {
  return {
    width: document.width,
    height: document.height,
    renderFingerprint: document.renderFingerprint,
    mutationCount: document.mutationLog.length,
    fusionPatchCount: document.fusionPatches.length,
  };
}

function createSafetyGuards(document) {
  return {
    expectedDocumentId: document.id,
    expectedRenderFingerprint: document.renderFingerprint,
    expectedMutationCount: document.mutationLog.length,
    expectedFusionPatchCount: document.fusionPatches.length,
  };
}

function createRequestForPatch(htmlArtboard, document, patch, request = {}) {
  const region = normalizeRegion(patch.region);
  const output = createOutput(region, request);
  const payload = {
    shapeId: htmlArtboard.shapeId ?? null,
    documentId: document.id,
    patchId: patch.id,
    selector: patch.selector,
    sourceSelector: patch.sourceSelector,
    sourceText: patch.sourceText,
    region,
    prompt: patch.prompt,
    artboard: createArtboardSummary(document),
    generationInstructions: createGenerationInstructions(output),
    suggestedImagePrompt: createSuggestedImagePrompt({ document, patch, region, output }),
    negativeInstructions: createNegativeInstructions(),
    output,
    safetyGuards: createSafetyGuards(document),
  };

  if (request.includeThumbnail === true) {
    payload.thumbnailDataUrl = createHtmlArtboardThumbnailDataUrl(document);
  }

  if (request.includeStandaloneHtml === true) {
    payload.standaloneHtml = createHtmlArtboardStandaloneHtml(document);
  }

  return payload;
}

export function createHtmlArtboardFusionPatchGenerationRequests(htmlArtboard, request = {}) {
  const sourceArtboard = isRecord(htmlArtboard) ? htmlArtboard : {};
  const sourceRequest = isRecord(request) ? request : {};
  const document = ensureHtmlArtboardDocument(sourceArtboard.runtimeDocument);
  const patches = getPatches(document, sourceRequest);

  return patches.map((patch) =>
    createRequestForPatch(sourceArtboard, document, patch, sourceRequest)
  );
}

export function summarizeHtmlArtboardFusionPatchGenerationRequests(requests) {
  const items = Array.isArray(requests) ? requests : [];

  if (items.length === 0) {
    return "No FusionPatch image generation requests.";
  }

  if (items.length === 1) {
    const request = items[0];
    return `FusionPatch image generation request for ${request.documentId} patch ${request.patchId}.`;
  }

  return `Generated ${items.length} FusionPatch image generation requests.`;
}

export function cloneHtmlArtboardFusionPatchGenerationRequest(request) {
  return deepClone(request);
}
