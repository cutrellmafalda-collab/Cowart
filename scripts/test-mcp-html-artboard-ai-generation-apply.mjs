import assert from "node:assert/strict";

import { createHtmlArtboardAiProviderResult } from "../src/html-runtime/htmlArtboardAiProvider.js";
import { createOpenAiImageProvider } from "../src/html-runtime/htmlArtboardOpenAiImageProvider.js";
import { createFusionPatchPlaceholder } from "../src/html-runtime/fusionPatch.js";
import {
  applyHtmlArtboardAiGenerationDocumentToShapeRecord,
  createHtmlArtboardAiGenerationApplyPlan,
  summarizeHtmlArtboardAiGenerationApplyResult,
} from "../mcp/htmlArtboardAiGenerationApply.mjs";

async function test(name, run) {
  await run();
  console.log(`ok - ${name}`);
}

function createRuntimeDocument(overrides = {}) {
  const patch = createFusionPatchPlaceholder({
    id: "patch:ai-generation-apply",
    name: "AI apply patch",
    prompt: "Generate a vivid glass label",
    selector: '[data-node="headline"]',
    sourceText: "Headline",
    region: { x: 12, y: 24, w: 220, h: 120 },
  });

  return {
    id: "html-artboard:ai-generation-apply-test",
    type: "cowart-html-artboard",
    version: 1,
    width: 720,
    height: 1280,
    background: {
      type: "gradient",
      identity: "ai-generation-apply-background",
      colors: ["#ffffff", "#eeeeee"],
    },
    html: '<section data-node="headline"><h1>Headline</h1></section>',
    css: "h1 { color: black; }",
    fusionPatches: [patch],
    assets: [],
    history: [],
    mutationLog: [{ id: "mutation:existing", type: "document_meta_update" }],
    executionGraph: null,
    renderFingerprint: "cowart-source-v1:ai-generation-apply",
    meta: { provider: "mock" },
    ...overrides,
  };
}

function createHtmlArtboard(overrides = {}) {
  const runtimeDocument = createRuntimeDocument(overrides.runtimeDocument);

  return {
    shapeId: "shape:ai-generation-apply-html-artboard",
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

function createShapeRecord(runtimeDocument = createRuntimeDocument()) {
  return {
    id: "shape:ai-generation-apply-html-artboard",
    typeName: "shape",
    type: "frame",
    x: 10,
    y: 20,
    props: { w: 720, h: 1280, name: "HTML Artboard" },
    meta: {
      cowartHtmlArtboard: true,
      keepMe: "yes",
      runtimeDocument,
    },
  };
}

function createSuccessfulProvider() {
  let called = 0;
  return {
    name: "openai",
    get called() {
      return called;
    },
    generateFusionPatchAsset() {
      called += 1;
      return createHtmlArtboardAiProviderResult({
        ok: true,
        provider: "openai",
        model: "gpt-image-2",
        patchAssetId: "openai-fusion-patch-asset:test",
        patchAssetUrl: "data:image/png;base64,ZmFrZQ==",
        mimeType: "image/png",
        promptUsed: "Generated",
        cost: null,
      });
    },
  };
}

await test("ai generation apply without confirmGenerate does not call provider", async () => {
  const provider = createSuccessfulProvider();
  const plan = await createHtmlArtboardAiGenerationApplyPlan(
    createHtmlArtboard(),
    { patchId: "patch:ai-generation-apply", confirmGenerate: false },
    { provider }
  );

  assert.equal(provider.called, 0);
  assert.equal(plan.dryRun, true);
  assert.equal(plan.canApply, false);
});

await test("ai generation apply missing key returns canApply false", async () => {
  const provider = createOpenAiImageProvider({
    env: {},
    fetch: async () => ({ ok: true }),
  });
  const plan = await createHtmlArtboardAiGenerationApplyPlan(
    createHtmlArtboard(),
    { patchId: "patch:ai-generation-apply", confirmGenerate: true },
    { provider }
  );

  assert.equal(plan.canApply, false);
  assert.equal(plan.reason, "missing_api_key");
});

await test("ai generation apply stale expected fingerprint refuses before provider call", async () => {
  const provider = createSuccessfulProvider();
  const plan = await createHtmlArtboardAiGenerationApplyPlan(
    createHtmlArtboard(),
    {
      patchId: "patch:ai-generation-apply",
      confirmGenerate: true,
      expectedRenderFingerprint: "stale",
    },
    { provider }
  );

  assert.equal(plan.preconditionFailed, true);
  assert.equal(plan.canApply, false);
  assert.equal(provider.called, 0);
});

await test("ai generation apply fake provider success writes patchAssetUrl", async () => {
  const provider = createSuccessfulProvider();
  const plan = await createHtmlArtboardAiGenerationApplyPlan(
    createHtmlArtboard(),
    { patchId: "patch:ai-generation-apply", confirmGenerate: true },
    { provider }
  );

  assert.equal(plan.canApply, true);
  assert.equal(plan.proposedDocument.fusionPatches[0].patchAssetUrl, "data:image/png;base64,ZmFrZQ==");
  assert.equal(plan.proposedDocument.fusionPatches[0].status, "generated");
});

await test("ai generation apply mutationLog includes fusion_patch_ai_asset_generate", async () => {
  const plan = await createHtmlArtboardAiGenerationApplyPlan(
    createHtmlArtboard(),
    { patchId: "patch:ai-generation-apply", confirmGenerate: true },
    { provider: createSuccessfulProvider() }
  );

  assert.equal(plan.proposedMutations[0].type, "fusion_patch_ai_asset_generate");
  assert.equal(plan.proposedMutations[0].payload.patchId, "patch:ai-generation-apply");
});

await test("ai generation apply fake provider failure marks failed", async () => {
  const plan = await createHtmlArtboardAiGenerationApplyPlan(
    createHtmlArtboard(),
    { patchId: "patch:ai-generation-apply", confirmGenerate: true },
    {
      provider: {
        name: "openai",
        generateFusionPatchAsset() {
          return { ok: false, provider: "openai", model: "gpt-image-2", error: "provider_failed" };
        },
      },
    }
  );

  assert.equal(plan.canApply, true);
  assert.equal(plan.proposedDocument.fusionPatches[0].status, "failed");
  assert.equal(plan.proposedDocument.fusionPatches[0].meta.providerError, "provider_failed");
});

await test("ai generation apply structured result does not expose api key", async () => {
  const plan = await createHtmlArtboardAiGenerationApplyPlan(
    createHtmlArtboard(),
    {
      patchId: "patch:ai-generation-apply",
      confirmGenerate: true,
      apiKey: "sk-secret-that-must-not-appear",
    },
    { provider: createSuccessfulProvider() }
  );

  assert.equal(JSON.stringify(plan).includes("sk-secret-that-must-not-appear"), false);
});

await test("ai generation apply document can be written to shape record", async () => {
  const plan = await createHtmlArtboardAiGenerationApplyPlan(
    createHtmlArtboard(),
    { patchId: "patch:ai-generation-apply", confirmGenerate: true },
    { provider: createSuccessfulProvider() }
  );
  const shape = createShapeRecord();
  const updated = applyHtmlArtboardAiGenerationDocumentToShapeRecord(shape, plan.proposedDocument);

  assert.equal(updated.id, shape.id);
  assert.equal(updated.type, shape.type);
  assert.deepEqual(updated.props, shape.props);
  assert.equal(updated.meta.keepMe, "yes");
  assert.equal(updated.meta.cowartHtmlArtboard, true);
  assert.equal(updated.meta.runtimeDocument.fusionPatches[0].patchAssetUrl, "data:image/png;base64,ZmFrZQ==");
});

await test("ai generation apply summary handles dry-run", async () => {
  const plan = await createHtmlArtboardAiGenerationApplyPlan(createHtmlArtboard(), {
    patchId: "patch:ai-generation-apply",
  });

  assert.equal(summarizeHtmlArtboardAiGenerationApplyResult(plan).includes("Dry-run only"), true);
});

await test("ai generation apply summary handles applied result", async () => {
  const plan = await createHtmlArtboardAiGenerationApplyPlan(
    createHtmlArtboard(),
    { patchId: "patch:ai-generation-apply", confirmGenerate: true },
    { provider: createSuccessfulProvider() }
  );
  const summary = summarizeHtmlArtboardAiGenerationApplyResult({ ...plan, applied: true });

  assert.equal(summary.includes("Generated AI FusionPatch asset"), true);
});
