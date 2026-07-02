import assert from "node:assert/strict";

import { createFusionPatchPlaceholder } from "../src/html-runtime/fusionPatch.js";
import {
  createHtmlArtboardFusionPatchGenerationRequests,
  summarizeHtmlArtboardFusionPatchGenerationRequests,
} from "../mcp/htmlArtboardFusionPatchGenerationRequest.mjs";

function test(name, run) {
  run();
  console.log(`ok - ${name}`);
}

function createRuntimeDocument(overrides = {}) {
  const patch = createFusionPatchPlaceholder({
    id: "patch:generation-request",
    name: "Generation request patch",
    prompt: "Turn this headline into transparent blue ice 3D text",
    selector: '[data-node="headline"]',
    sourceSelector: '[data-node="headline"]',
    sourceText: "Summer Sale",
    region: { x: 24, y: 36, w: 320, h: 140 },
  });

  return {
    id: "html-artboard:generation-request-test",
    type: "cowart-html-artboard",
    version: 1,
    width: 720,
    height: 1280,
    background: {
      type: "gradient",
      identity: "generation-request-background",
      colors: ["#ffffff", "#eeeeee"],
    },
    html: '<section data-node="headline"><h1>Summer Sale</h1></section>',
    css: "h1 { color: black; }",
    fusionPatches: [patch],
    assets: [],
    history: [],
    mutationLog: [{ id: "mutation:existing", type: "document_meta_update" }],
    executionGraph: null,
    renderFingerprint: "cowart-source-v1:generation-request",
    meta: { provider: "mock" },
    ...overrides,
  };
}

function createHtmlArtboard(overrides = {}) {
  const runtimeDocument = createRuntimeDocument(overrides.runtimeDocument);

  return {
    shapeId: "shape:generation-request-html-artboard",
    shapeType: "frame",
    runtimeDocument,
    summary: {
      documentId: runtimeDocument.id,
      type: runtimeDocument.type,
      version: runtimeDocument.version,
      width: runtimeDocument.width,
      height: runtimeDocument.height,
      fusionPatchCount: runtimeDocument.fusionPatches.length,
      mutationCount: runtimeDocument.mutationLog.length,
      renderFingerprint: runtimeDocument.renderFingerprint,
    },
    ...overrides,
  };
}

test("generation request returns one request for patchId", () => {
  const requests = createHtmlArtboardFusionPatchGenerationRequests(createHtmlArtboard(), {
    patchId: "patch:generation-request",
  });

  assert.equal(requests.length, 1);
  assert.equal(requests[0].patchId, "patch:generation-request");
});

test("generation request includes selector sourceText region prompt", () => {
  const [request] = createHtmlArtboardFusionPatchGenerationRequests(createHtmlArtboard());

  assert.equal(request.selector, '[data-node="headline"]');
  assert.equal(request.sourceSelector, '[data-node="headline"]');
  assert.equal(request.sourceText, "Summer Sale");
  assert.deepEqual(request.region, { x: 24, y: 36, w: 320, h: 140 });
  assert.equal(request.prompt.includes("transparent blue ice"), true);
});

test("generation request includes artboard summary", () => {
  const [request] = createHtmlArtboardFusionPatchGenerationRequests(createHtmlArtboard());

  assert.deepEqual(request.artboard, {
    width: 720,
    height: 1280,
    renderFingerprint: "cowart-source-v1:generation-request",
    mutationCount: 1,
    fusionPatchCount: 1,
  });
});

test("generation request includes output defaults", () => {
  const [request] = createHtmlArtboardFusionPatchGenerationRequests(createHtmlArtboard());

  assert.equal(request.output.format, "png");
  assert.equal(request.output.transparentBackground, true);
  assert.equal(request.output.width, 320);
  assert.equal(request.output.height, 140);
});

test("generation request applies output scale and format", () => {
  const [request] = createHtmlArtboardFusionPatchGenerationRequests(createHtmlArtboard(), {
    preferredOutputFormat: "webp",
    outputScale: 2,
    transparentBackground: false,
  });

  assert.equal(request.output.format, "webp");
  assert.equal(request.output.transparentBackground, false);
  assert.equal(request.output.width, 640);
  assert.equal(request.output.height, 280);
});

test("generation request includes safety guards", () => {
  const [request] = createHtmlArtboardFusionPatchGenerationRequests(createHtmlArtboard());

  assert.deepEqual(request.safetyGuards, {
    expectedDocumentId: "html-artboard:generation-request-test",
    expectedRenderFingerprint: "cowart-source-v1:generation-request",
    expectedMutationCount: 1,
    expectedFusionPatchCount: 1,
  });
});

test("generation request suggested prompt includes required safety instructions", () => {
  const [request] = createHtmlArtboardFusionPatchGenerationRequests(createHtmlArtboard());

  assert.equal(request.suggestedImagePrompt.includes("Generate only a patch asset"), true);
  assert.equal(request.suggestedImagePrompt.includes("Do not modify HTML/CSS"), true);
  assert.equal(request.suggestedImagePrompt.includes("Transparent background preferred"), true);
  assert.equal(request.suggestedImagePrompt.includes("Summer Sale"), true);
});

test("generation request can include thumbnail and standalone html", () => {
  const [request] = createHtmlArtboardFusionPatchGenerationRequests(createHtmlArtboard(), {
    includeThumbnail: true,
    includeStandaloneHtml: true,
  });

  assert.equal(request.thumbnailDataUrl.startsWith("data:image/svg+xml"), true);
  assert.equal(request.standaloneHtml.includes("<!doctype html>"), true);
});

test("generation request does not mutate input htmlArtboard", () => {
  const artboard = createHtmlArtboard();
  const before = JSON.stringify(artboard);

  createHtmlArtboardFusionPatchGenerationRequests(artboard, {
    includeThumbnail: true,
    includeStandaloneHtml: true,
  });

  assert.equal(JSON.stringify(artboard), before);
});

test("generation request returns all patches when patchId omitted", () => {
  const document = createRuntimeDocument({
    fusionPatches: [
      createFusionPatchPlaceholder({ id: "patch:first" }),
      createFusionPatchPlaceholder({ id: "patch:second" }),
    ],
  });
  const requests = createHtmlArtboardFusionPatchGenerationRequests(
    createHtmlArtboard({ runtimeDocument: document })
  );

  assert.equal(requests.length, 2);
  assert.deepEqual(
    requests.map((request) => request.patchId),
    ["patch:first", "patch:second"]
  );
});

test("generation request returns empty array for missing patchId", () => {
  const requests = createHtmlArtboardFusionPatchGenerationRequests(createHtmlArtboard(), {
    patchId: "patch:missing",
  });

  assert.deepEqual(requests, []);
});

test("summarize generation requests handles empty one and many", () => {
  assert.equal(
    summarizeHtmlArtboardFusionPatchGenerationRequests([]),
    "No FusionPatch image generation requests."
  );

  const one = createHtmlArtboardFusionPatchGenerationRequests(createHtmlArtboard());
  assert.equal(
    summarizeHtmlArtboardFusionPatchGenerationRequests(one),
    "FusionPatch image generation request for html-artboard:generation-request-test patch patch:generation-request."
  );

  const many = createHtmlArtboardFusionPatchGenerationRequests(
    createHtmlArtboard({
      runtimeDocument: createRuntimeDocument({
        fusionPatches: [
          createFusionPatchPlaceholder({ id: "patch:first" }),
          createFusionPatchPlaceholder({ id: "patch:second" }),
        ],
      }),
    })
  );
  assert.equal(
    summarizeHtmlArtboardFusionPatchGenerationRequests(many),
    "Generated 2 FusionPatch image generation requests."
  );
});
