import assert from "node:assert/strict";

import {
  createHtmlArtboardBackgroundGenerationRequest,
  createHtmlArtboardBackgroundGenerationRequests,
  summarizeHtmlArtboardBackgroundGenerationRequests,
} from "../mcp/htmlArtboardBackgroundGenerationRequest.mjs";

function test(name, run) {
  run();
  console.log(`ok - ${name}`);
}

function createRuntimeDocument(overrides = {}) {
  return {
    id: "html-artboard:background-request-test",
    type: "cowart-html-artboard",
    version: 1,
    width: 720,
    height: 1280,
    background: {
      type: "gradient",
      identity: "background-request-gradient",
      prompt: "No-text premium coffee poster background",
      colors: ["#111827", "#f59e0b"],
    },
    html: '<section data-node="headline"><h1>Coffee Launch</h1></section>',
    css: "section { color: white; }",
    fusionPatches: [],
    assets: [],
    history: [],
    mutationLog: [{ id: "mutation:one", type: "html_update" }],
    executionGraph: null,
    renderFingerprint: "cowart-source-v1:background-request",
    meta: { provider: "mock" },
    ...overrides,
  };
}

function createHtmlArtboard(overrides = {}) {
  const runtimeDocument = createRuntimeDocument(overrides.runtimeDocument);

  return {
    shapeId: "shape:background-request-html-artboard",
    shapeType: "frame",
    runtimeDocument,
    summary: {
      documentId: runtimeDocument.id,
      type: runtimeDocument.type,
      version: runtimeDocument.version,
      width: runtimeDocument.width,
      height: runtimeDocument.height,
      mutationCount: runtimeDocument.mutationLog.length,
      fusionPatchCount: runtimeDocument.fusionPatches.length,
      renderFingerprint: runtimeDocument.renderFingerprint,
    },
    ...overrides,
  };
}

test("background generation request returns shape and document ids", () => {
  const request = createHtmlArtboardBackgroundGenerationRequest(createHtmlArtboard());

  assert.equal(request.shapeId, "shape:background-request-html-artboard");
  assert.equal(request.documentId, "html-artboard:background-request-test");
});

test("background generation request includes artboard summary and safety guards", () => {
  const request = createHtmlArtboardBackgroundGenerationRequest(createHtmlArtboard());

  assert.equal(request.artboard.width, 720);
  assert.equal(request.artboard.height, 1280);
  assert.equal(request.safetyGuards.expectedDocumentId, "html-artboard:background-request-test");
  assert.equal(request.safetyGuards.expectedRenderFingerprint, "cowart-source-v1:background-request");
  assert.equal(request.safetyGuards.expectedMutationCount, 1);
  assert.equal(request.safetyGuards.expectedFusionPatchCount, 0);
});

test("background generation request prompt asks for no text", () => {
  const request = createHtmlArtboardBackgroundGenerationRequest(createHtmlArtboard());

  assert.equal(request.suggestedImagePrompt.includes("No-text premium coffee"), true);
  assert.equal(request.suggestedImagePrompt.includes("Do not add text"), true);
  assert.equal(request.generationInstructions.some((item) => item.includes("no-text")), true);
});

test("background generation request output scales artboard size", () => {
  const request = createHtmlArtboardBackgroundGenerationRequest(createHtmlArtboard(), {
    outputScale: 0.5,
    preferredOutputFormat: "webp",
  });

  assert.equal(request.output.format, "webp");
  assert.equal(request.output.width, 360);
  assert.equal(request.output.height, 640);
});

test("background generation request can include standalone HTML and thumbnail", () => {
  const request = createHtmlArtboardBackgroundGenerationRequest(createHtmlArtboard(), {
    includeStandaloneHtml: true,
    includeThumbnail: true,
  });

  assert.equal(request.standaloneHtml.includes("<!doctype html>"), true);
  assert.equal(request.thumbnailDataUrl.startsWith("data:image/svg+xml"), true);
});

test("background generation request does not mutate input", () => {
  const artboard = createHtmlArtboard();
  const before = JSON.stringify(artboard);

  createHtmlArtboardBackgroundGenerationRequest(artboard, { prompt: "Different prompt" });

  assert.equal(JSON.stringify(artboard), before);
});

test("createHtmlArtboardBackgroundGenerationRequests handles multiple artboards", () => {
  const requests = createHtmlArtboardBackgroundGenerationRequests([
    createHtmlArtboard(),
    createHtmlArtboard({
      runtimeDocument: { id: "html-artboard:second-background-request" },
    }),
  ]);

  assert.equal(requests.length, 2);
  assert.equal(requests[1].documentId, "html-artboard:second-background-request");
});

test("summarize background generation requests handles zero and one", () => {
  assert.equal(
    summarizeHtmlArtboardBackgroundGenerationRequests([]),
    "No HTML Artboard background generation requests."
  );
  assert.equal(
    summarizeHtmlArtboardBackgroundGenerationRequests([
      createHtmlArtboardBackgroundGenerationRequest(createHtmlArtboard()),
    ]).includes("html-artboard:background-request-test"),
    true
  );
});
