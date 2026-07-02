import assert from "node:assert/strict";

import { createHtmlArtboardApplyPreconditions } from "../mcp/htmlArtboardApplyEdit.mjs";
import {
  applyHtmlArtboardMockFusionPatchAssetDocumentToShapeRecord,
  createHtmlArtboardMockFusionPatchAssetPlan,
  summarizeHtmlArtboardMockFusionPatchAssetResult,
} from "../mcp/htmlArtboardMockFusionPatchAssetGeneration.mjs";

function test(name, run) {
  run();
  console.log(`ok - ${name}`);
}

function createPatch(overrides = {}) {
  return {
    id: "patch:mock-asset-mcp",
    type: "fusion-patch",
    name: "MCP Mock Asset Patch",
    selector: "[data-node=\"headline\"]",
    sourceSelector: "[data-node=\"headline\"]",
    sourceText: "Headline",
    region: { x: 80, y: 80, w: 240, h: 120 },
    prompt: "Generate mock asset",
    maskAssetId: null,
    patchAssetId: null,
    patchAssetUrl: null,
    blendMode: "normal",
    opacity: 1,
    provider: "mock",
    seed: null,
    status: "placeholder",
    visible: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    meta: {},
    ...overrides,
  };
}

function createRuntimeDocument(overrides = {}) {
  return {
    id: "html-artboard:mock-asset-mcp-test",
    type: "cowart-html-artboard",
    version: 1,
    width: 720,
    height: 1280,
    background: {
      type: "gradient",
      identity: "mock-asset-background",
      colors: ["#ffffff", "#eeeeee"],
    },
    html: "<section data-node=\"headline\"><h1>Original</h1></section>",
    css: "section { color: black; }",
    fusionPatches: [createPatch()],
    assets: [],
    history: [],
    mutationLog: [],
    executionGraph: null,
    renderFingerprint: "cowart-source-v1:mock-asset-original",
    meta: { provider: "mock" },
    ...overrides,
  };
}

function createHtmlArtboard(overrides = {}) {
  const runtimeDocument = createRuntimeDocument(overrides.runtimeDocument);

  return {
    shapeId: "shape:mock-asset-html-artboard",
    shapeType: "frame",
    runtimeDocument,
    summary: {
      documentId: runtimeDocument.id,
      type: runtimeDocument.type,
      version: runtimeDocument.version,
      width: runtimeDocument.width,
      height: runtimeDocument.height,
      htmlLength: runtimeDocument.html.length,
      cssLength: runtimeDocument.css.length,
      fusionPatchCount: runtimeDocument.fusionPatches.length,
      mutationCount: runtimeDocument.mutationLog.length,
      renderFingerprint: runtimeDocument.renderFingerprint,
    },
    ...overrides,
  };
}

function createShapeRecord(overrides = {}) {
  return {
    id: "shape:mock-asset-html-artboard",
    typeName: "shape",
    type: "frame",
    x: 100,
    y: 200,
    rotation: 0,
    props: { w: 720, h: 1280, name: "HTML Artboard" },
    meta: {
      cowartHtmlArtboard: true,
      runtimeDocument: createRuntimeDocument(),
      keepMe: "yes",
    },
    ...overrides,
  };
}

test("mock asset plan without confirmApply returns dryRun true", () => {
  const plan = createHtmlArtboardMockFusionPatchAssetPlan(createHtmlArtboard(), {
    patchId: "patch:mock-asset-mcp",
  });

  assert.equal(plan.dryRun, true);
  assert.equal(plan.canApply, false);
});

test("mock asset plan with confirmApply true canApply true", () => {
  const plan = createHtmlArtboardMockFusionPatchAssetPlan(createHtmlArtboard(), {
    confirmApply: true,
    patchId: "patch:mock-asset-mcp",
  });

  assert.equal(plan.canApply, true);
  assert.equal(plan.proposedMutations[0].type, "fusion_patch_mock_asset_generate");
});

test("mock asset plan writes patchAssetUrl", () => {
  const plan = createHtmlArtboardMockFusionPatchAssetPlan(createHtmlArtboard(), {
    confirmApply: true,
    patchId: "patch:mock-asset-mcp",
  });

  assert.equal(plan.proposedDocument.fusionPatches[0].patchAssetUrl.startsWith("data:image/svg+xml"), true);
  assert.equal(plan.proposedDocument.fusionPatches[0].status, "mock-generated");
});

test("mock asset plan can generate all visible patches", () => {
  const plan = createHtmlArtboardMockFusionPatchAssetPlan(
    createHtmlArtboard({
      runtimeDocument: {
        fusionPatches: [
          createPatch({ id: "patch:visible-one" }),
          createPatch({ id: "patch:hidden-one", visible: false }),
        ],
      },
    }),
    {
      confirmApply: true,
    }
  );

  assert.equal(plan.proposedMutations.length, 1);
  assert.equal(plan.proposedDocument.fusionPatches[0].status, "mock-generated");
  assert.equal(plan.proposedDocument.fusionPatches[1].patchAssetUrl, null);
});

test("mock asset plan blocks stale expected fingerprint", () => {
  const plan = createHtmlArtboardMockFusionPatchAssetPlan(createHtmlArtboard(), {
    confirmApply: true,
    patchId: "patch:mock-asset-mcp",
    expectedRenderFingerprint: "stale-fingerprint",
  });

  assert.equal(plan.canApply, false);
  assert.equal(plan.preconditionFailed, true);
});

test("mock asset plan canApply true when expected values match", () => {
  const artboard = createHtmlArtboard();
  const expected = createHtmlArtboardApplyPreconditions(artboard.runtimeDocument);
  const plan = createHtmlArtboardMockFusionPatchAssetPlan(artboard, {
    confirmApply: true,
    patchId: "patch:mock-asset-mcp",
    expectedDocumentId: expected.documentId,
    expectedRenderFingerprint: expected.renderFingerprint,
    expectedMutationCount: expected.mutationCount,
    expectedFusionPatchCount: expected.fusionPatchCount,
  });

  assert.equal(plan.canApply, true);
  assert.equal(plan.preconditionFailed, false);
});

test("mock asset plan returns no-op for invalid patchId", () => {
  const plan = createHtmlArtboardMockFusionPatchAssetPlan(createHtmlArtboard(), {
    confirmApply: true,
    patchId: "patch:missing",
  });

  assert.equal(plan.canApply, false);
  assert.equal(plan.proposedMutations.length, 0);
});

test("mock asset plan does not mutate input htmlArtboard", () => {
  const artboard = createHtmlArtboard();
  const before = JSON.stringify(artboard);

  createHtmlArtboardMockFusionPatchAssetPlan(artboard, {
    confirmApply: true,
    patchId: "patch:mock-asset-mcp",
  });

  assert.equal(JSON.stringify(artboard), before);
});

test("mock asset plan replayCheck ok", () => {
  const plan = createHtmlArtboardMockFusionPatchAssetPlan(createHtmlArtboard(), {
    confirmApply: true,
    patchId: "patch:mock-asset-mcp",
  });

  assert.equal(plan.replayCheck.ok, true);
  assert.equal(plan.replayCheck.fusionPatchesMatch, true);
});

test("mock asset plan diffSummary reports generated patch", () => {
  const plan = createHtmlArtboardMockFusionPatchAssetPlan(createHtmlArtboard(), {
    confirmApply: true,
    patchId: "patch:mock-asset-mcp",
  });

  assert.equal(plan.diffSummary.generatedPatchCount, 1);
  assert.deepEqual(plan.diffSummary.generatedPatchIds, ["patch:mock-asset-mcp"]);
});

test("applyHtmlArtboardMockFusionPatchAssetDocumentToShapeRecord updates runtimeDocument", () => {
  const shape = createShapeRecord();
  const plan = createHtmlArtboardMockFusionPatchAssetPlan(
    { shapeId: shape.id, runtimeDocument: shape.meta.runtimeDocument },
    {
      confirmApply: true,
      patchId: "patch:mock-asset-mcp",
    }
  );
  const updated = applyHtmlArtboardMockFusionPatchAssetDocumentToShapeRecord(
    shape,
    plan.proposedDocument
  );

  assert.equal(updated.meta.runtimeDocument.fusionPatches[0].status, "mock-generated");
});

test("applyHtmlArtboardMockFusionPatchAssetDocumentToShapeRecord preserves shape meta", () => {
  const shape = createShapeRecord();
  const updated = applyHtmlArtboardMockFusionPatchAssetDocumentToShapeRecord(
    shape,
    shape.meta.runtimeDocument
  );

  assert.equal(updated.meta.keepMe, "yes");
  assert.equal(updated.meta.cowartHtmlArtboard, true);
});

test("applyHtmlArtboardMockFusionPatchAssetDocumentToShapeRecord rejects normal shape", () => {
  assert.throws(() =>
    applyHtmlArtboardMockFusionPatchAssetDocumentToShapeRecord(
      {
        id: "shape:normal",
        type: "frame",
        meta: {},
      },
      createRuntimeDocument()
    )
  );
});

test("summarizeHtmlArtboardMockFusionPatchAssetResult handles dry-run", () => {
  const plan = createHtmlArtboardMockFusionPatchAssetPlan(createHtmlArtboard(), {
    patchId: "patch:mock-asset-mcp",
  });

  assert.equal(
    summarizeHtmlArtboardMockFusionPatchAssetResult(plan),
    "Dry-run only for shape:mock-asset-html-artboard: confirmApply is required to write changes."
  );
});

test("summarizeHtmlArtboardMockFusionPatchAssetResult handles applied result", () => {
  const plan = createHtmlArtboardMockFusionPatchAssetPlan(createHtmlArtboard(), {
    confirmApply: true,
    patchId: "patch:mock-asset-mcp",
  });
  const summary = summarizeHtmlArtboardMockFusionPatchAssetResult({
    ...plan,
    applied: true,
  });

  assert.equal(summary.includes("Generated mock FusionPatch asset"), true);
  assert.equal(summary.includes("1 mutation"), true);
});
