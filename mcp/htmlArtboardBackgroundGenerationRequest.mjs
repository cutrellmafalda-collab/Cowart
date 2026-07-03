import { createHtmlArtboardStandaloneHtml } from "../src/html-runtime/htmlArtboardExport.js";
import { createHtmlArtboardThumbnailDataUrl } from "../src/html-runtime/htmlArtboardThumbnail.js";
import { ensureHtmlArtboardDocument } from "../src/html-runtime/htmlCanvasDocument.js";

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function finiteNumber(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
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

function getOutputFormat(value) {
  return ["png", "webp", "jpg", "jpeg"].includes(value) ? value : "png";
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

function createOutput(document, request = {}) {
  const scale = Math.max(0.1, finiteNumber(request.outputScale, 1));

  return {
    format: getOutputFormat(request.preferredOutputFormat),
    transparentBackground: request.transparentBackground === true,
    width: Math.max(1, Math.round(document.width * scale)),
    height: Math.max(1, Math.round(document.height * scale)),
  };
}

function createGenerationInstructions(output) {
  return [
    "Generate only a no-text background image for a Cowart HTML Artboard.",
    "Do not include readable typography, logos, UI chrome, browser chrome, or unrelated canvas content.",
    "Leave clear visual space for the existing HTML/CSS text and UI layer.",
    "Do not modify the HTML or CSS.",
    "The result will be attached as the artboard background asset.",
    output.transparentBackground
      ? "Transparent background is acceptable if the prompt requires a cutout or texture."
      : "Use a full-bleed background image.",
  ];
}

function createSuggestedImagePrompt({ document, request, output }) {
  const prompt =
    typeof request.prompt === "string" && request.prompt
      ? request.prompt
      : typeof document.background?.prompt === "string" && document.background.prompt
        ? document.background.prompt
        : "Create a polished no-text visual background for this HTML artboard.";

  return [
    prompt,
    "",
    "Generate a no-text background image for a Cowart HTML Artboard.",
    `Artboard size: ${document.width}x${document.height}.`,
    `Desired output: ${output.width}x${output.height} ${output.format}.`,
    "Do not add text, labels, price tags, logos, captions, signatures, or UI controls.",
    "Leave room for the existing editable HTML/CSS layer.",
    "Do not modify HTML/CSS; Cowart will attach this image as the background layer.",
  ].join("\n");
}

export function createHtmlArtboardBackgroundGenerationRequest(htmlArtboard, request = {}) {
  const sourceArtboard = isRecord(htmlArtboard) ? htmlArtboard : {};
  const sourceRequest = isRecord(request) ? request : {};
  const document = ensureHtmlArtboardDocument(sourceArtboard.runtimeDocument);
  const output = createOutput(document, sourceRequest);
  const payload = {
    shapeId: sourceArtboard.shapeId ?? null,
    documentId: document.id,
    artboard: createArtboardSummary(document),
    existingBackground: deepClone(document.background),
    generationInstructions: createGenerationInstructions(output),
    suggestedImagePrompt: createSuggestedImagePrompt({
      document,
      request: sourceRequest,
      output,
    }),
    negativeInstructions: [
      "No text.",
      "No logos.",
      "No screenshots.",
      "No local paths, secrets, API keys, or Cowart canvas store data.",
      "No HTML/CSS changes.",
    ],
    output,
    safetyGuards: createSafetyGuards(document),
  };

  if (sourceRequest.includeThumbnail === true) {
    payload.thumbnailDataUrl = createHtmlArtboardThumbnailDataUrl(document);
  }

  if (sourceRequest.includeStandaloneHtml === true) {
    payload.standaloneHtml = createHtmlArtboardStandaloneHtml(document);
  }

  return payload;
}

export function createHtmlArtboardBackgroundGenerationRequests(htmlArtboards, request = {}) {
  const items = Array.isArray(htmlArtboards) ? htmlArtboards : [];

  return items.map((artboard) => createHtmlArtboardBackgroundGenerationRequest(artboard, request));
}

export function summarizeHtmlArtboardBackgroundGenerationRequests(requests) {
  const items = Array.isArray(requests) ? requests : [];

  if (items.length === 0) {
    return "No HTML Artboard background generation requests.";
  }

  if (items.length === 1) {
    return `HTML Artboard background generation request for ${items[0].documentId}.`;
  }

  return `Generated ${items.length} HTML Artboard background generation requests.`;
}
