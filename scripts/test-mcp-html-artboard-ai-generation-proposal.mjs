import assert from "node:assert/strict";

import { createFusionPatchPlaceholder } from "../src/html-runtime/fusionPatch.js";
import {
  createHtmlArtboardAiGenerationProposal,
  summarizeHtmlArtboardAiGenerationProposal,
} from "../mcp/htmlArtboardAiGenerationProposal.mjs";

function test(name, run) {
  run();
  console.log(`ok - ${name}`);
}

function createRuntimeDocument(overrides = {}) {
  const patch = createFusionPatchPlaceholder({
    id: "patch:ai-generation-proposal",
    name: "AI proposal patch",
    prompt: "Generate a soft glowing badge",
    selector: '[data-node="headline"]',
    sourceText: "Headline",
    region: { x: 12, y: 24, w: 220, h: 120 },
  });

  return {
    id: "html-artboard:ai-generation-proposal-test",
    type: "cowart-html-artboard",
    version: 1,
    width: 720,
    height: 1280,
    background: {
      type: "gradient",
      identity: "ai-generation-proposal-background",
      colors: ["#ffffff", "#eeeeee"],
    },
    html: '<section data-node="headline"><h1>Headline</h1></section>',
    css: "h1 { color: black; }",
    fusionPatches: [patch],
    assets: [],
    history: [],
    mutationLog: [{ id: "mutation:existing", type: "document_meta_update" }],
    executionGraph: null,
    renderFingerprint: "cowart-source-v1:ai-generation-proposal",
    meta: { provider: "mock" },
    ...overrides,
  };
}

function createHtmlArtboard(overrides = {}) {
  const runtimeDocument = createRuntimeDocument(overrides.runtimeDocument);

  return {
    shapeId: "shape:ai-generation-proposal-html-artboard",
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

test("ai generation proposal returns dryRun true", () => {
  const proposal = createHtmlArtboardAiGenerationProposal(createHtmlArtboard(), {});

  assert.equal(proposal.dryRun, true);
});

test("ai generation proposal defaults provider openai", () => {
  const proposal = createHtmlArtboardAiGenerationProposal(createHtmlArtboard(), {});

  assert.equal(proposal.provider, "openai");
  assert.equal(proposal.providerPayload.model, "gpt-image-2");
});

test("ai generation proposal creates provider payload preview", () => {
  const proposal = createHtmlArtboardAiGenerationProposal(createHtmlArtboard(), {
    patchId: "patch:ai-generation-proposal",
  });

  assert.equal(proposal.providerPayload.prompt.includes("Generate a soft glowing badge"), true);
  assert.equal(proposal.providerPayload.prompt.includes('[data-node="headline"]'), true);
});

test("ai generation proposal does not include api key", () => {
  const proposal = createHtmlArtboardAiGenerationProposal(createHtmlArtboard(), {
    patchId: "patch:ai-generation-proposal",
  });

  assert.equal(JSON.stringify(proposal).includes("OPENAI_API_KEY"), false);
  assert.equal(JSON.stringify(proposal).includes("sk-"), false);
});

test("ai generation proposal does not mutate input artboard", () => {
  const artboard = createHtmlArtboard();
  const before = JSON.stringify(artboard);

  createHtmlArtboardAiGenerationProposal(artboard, { patchId: "patch:ai-generation-proposal" });

  assert.equal(JSON.stringify(artboard), before);
});

test("ai generation proposal auto-selects only patch when patchId omitted", () => {
  const proposal = createHtmlArtboardAiGenerationProposal(createHtmlArtboard(), {});

  assert.equal(proposal.patchId, "patch:ai-generation-proposal");
  assert.equal(proposal.providerPayload !== null, true);
});

test("ai generation proposal returns selectable patches when multiple patches exist", () => {
  const document = createRuntimeDocument({
    fusionPatches: [
      createFusionPatchPlaceholder({ id: "patch:first" }),
      createFusionPatchPlaceholder({ id: "patch:second" }),
    ],
  });
  const proposal = createHtmlArtboardAiGenerationProposal(createHtmlArtboard({ runtimeDocument: document }), {});

  assert.equal(proposal.providerPayload, null);
  assert.equal(proposal.selectablePatches.length, 2);
  assert.equal(proposal.warnings.some((warning) => warning.includes("Multiple FusionPatches")), true);
});

test("ai generation proposal can omit provider payload", () => {
  const proposal = createHtmlArtboardAiGenerationProposal(createHtmlArtboard(), {
    includeProviderPayload: false,
  });

  assert.equal(proposal.providerPayload, null);
  assert.equal(proposal.providerRequest !== null, true);
});

test("ai generation proposal omits full document by default", () => {
  const proposal = createHtmlArtboardAiGenerationProposal(createHtmlArtboard(), {});

  assert.equal(Object.hasOwn(proposal.providerRequest, "document"), false);
  assert.equal(proposal.providerRequest.documentSummary.documentId, "html-artboard:ai-generation-proposal-test");
});

test("ai generation proposal can include full document", () => {
  const proposal = createHtmlArtboardAiGenerationProposal(createHtmlArtboard(), {
    includeDocument: true,
  });

  assert.equal(proposal.providerRequest.document.id, "html-artboard:ai-generation-proposal-test");
});

test("summarize ai generation proposal handles payload", () => {
  const proposal = createHtmlArtboardAiGenerationProposal(createHtmlArtboard(), {});
  const summary = summarizeHtmlArtboardAiGenerationProposal(proposal);

  assert.equal(summary.includes("Dry-run AI FusionPatch generation payload"), true);
});

test("summarize ai generation proposal handles no payload", () => {
  const document = createRuntimeDocument({ fusionPatches: [] });
  const proposal = createHtmlArtboardAiGenerationProposal(createHtmlArtboard({ runtimeDocument: document }), {});
  const summary = summarizeHtmlArtboardAiGenerationProposal(proposal);

  assert.equal(summary.includes("No AI FusionPatch generation payload proposed"), true);
});
