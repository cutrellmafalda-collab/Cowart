import assert from "node:assert/strict";

import { createHtmlArtboardApplyPreconditions } from "../mcp/htmlArtboardApplyEdit.mjs";
import {
  applyHtmlArtboardFusionPatchImageAttachDocumentToShapeRecord,
  createHtmlArtboardFusionPatchImageAttachPlan,
  summarizeHtmlArtboardFusionPatchImageAttachResult,
} from "../mcp/htmlArtboardFusionPatchImageAttach.mjs";

function test(name, run) {
  run();
  console.log(`ok - ${name}`);
}

function createPatch(overrides = {}) {
  return {
    id: "patch:external-attach-test",
    type: "fusion-patch",
    name: "External Attach Test Patch",
    selector: '[data-node="headline"]',
    sourceSelector: '[data-node="headline"]',
    sourceText: "Headline",
    region: { x: 80, y: 80, w: 240, h: 120 },
    prompt: "Generate an icy blue headline patch",
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
    id: "html-artboard:external-attach-test",
    type: "cowart-html-artboard",
    version: 1,
    width: 720,
    height: 1280,
    background: {
      type: "gradient",
      identity: "external-attach-background",
      colors: ["#ffffff", "#eeeeee"],
    },
    html: '<section data-node="headline"><h1>Original</h1></section>',
    css: "section { color: black; }",
    fusionPatches: [createPatch()],
    assets: [],
    history: [],
    mutationLog: [],
    executionGraph: null,
    renderFingerprint: "cowart-source-v1:external-attach-original",
    meta: { provider: "mock" },
    ...overrides,
  };
}

function createHtmlArtboard(overrides = {}) {
  const runtimeDocument = createRuntimeDocument(overrides.runtimeDocument);

  return {
    shapeId: "shape:external-attach-html-artboard",
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

function createAsset(overrides = {}) {
  return {
    patchAssetId: "external-fusion-patch-asset:external-attach-test",
    patchAssetUrl: "/page-assets/page-1/external-attach-test.png",
    fileName: "external-attach-test.png",
    relativePath: "pages/page-1/assets/external-attach-test.png",
    mimeType: "image/png",
    fileSize: 68,
    ...overrides,
  };
}

function createShapeRecord(overrides = {}) {
  return {
    id: "shape:external-attach-html-artboard",
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

test("createHtmlArtboardFusionPatchImageAttachPlan without confirmApply returns dryRun true", () => {
  const plan = createHtmlArtboardFusionPatchImageAttachPlan(
    createHtmlArtboard(),
    { patchId: "patch:external-attach-test" },
    { asset: createAsset() }
  );

  assert.equal(plan.dryRun, true);
  assert.equal(plan.canApply, false);
  assert.equal(plan.proposedMutations.length, 1);
});

test("createHtmlArtboardFusionPatchImageAttachPlan with confirmApply true canApply true", () => {
  const plan = createHtmlArtboardFusionPatchImageAttachPlan(
    createHtmlArtboard(),
    { confirmApply: true, patchId: "patch:external-attach-test" },
    { asset: createAsset() }
  );

  assert.equal(plan.canApply, true);
  assert.equal(plan.proposedMutations[0].type, "fusion_patch_external_asset_attach");
});

test("attach plan updates patch asset fields and status", () => {
  const plan = createHtmlArtboardFusionPatchImageAttachPlan(
    createHtmlArtboard(),
    { confirmApply: true, patchId: "patch:external-attach-test", provider: "codex-image-gen" },
    { asset: createAsset() }
  );
  const patch = plan.proposedDocument.fusionPatches[0];

  assert.equal(patch.patchAssetId, "external-fusion-patch-asset:external-attach-test");
  assert.equal(patch.patchAssetUrl, "/page-assets/page-1/external-attach-test.png");
  assert.equal(patch.status, "generated");
  assert.equal(patch.provider, "codex-image-gen");
});

test("attach plan preserves HTML and CSS", () => {
  const artboard = createHtmlArtboard();
  const plan = createHtmlArtboardFusionPatchImageAttachPlan(
    artboard,
    { confirmApply: true, patchId: "patch:external-attach-test" },
    { asset: createAsset() }
  );

  assert.equal(plan.proposedDocument.html, artboard.runtimeDocument.html);
  assert.equal(plan.proposedDocument.css, artboard.runtimeDocument.css);
});

test("attach plan stores generationRequest and sanitized source image metadata", () => {
  const generationRequest = { patchId: "patch:external-attach-test", prompt: "External prompt" };
  const plan = createHtmlArtboardFusionPatchImageAttachPlan(
    createHtmlArtboard(),
    {
      confirmApply: true,
      patchId: "patch:external-attach-test",
      generationRequest,
    },
    { asset: createAsset() }
  );
  const patch = plan.proposedDocument.fusionPatches[0];

  assert.deepEqual(patch.meta.generationRequest, generationRequest);
  assert.deepEqual(patch.meta.externalImage, {
    fileName: "external-attach-test.png",
    relativePath: "pages/page-1/assets/external-attach-test.png",
    mimeType: "image/png",
    fileSize: 68,
  });
  assert.equal(JSON.stringify(patch.meta).includes("C:\\"), false);
  assert.equal(JSON.stringify(patch.meta).includes("/tmp/"), false);
});

test("attach plan records mutationLog", () => {
  const plan = createHtmlArtboardFusionPatchImageAttachPlan(
    createHtmlArtboard(),
    { confirmApply: true, patchId: "patch:external-attach-test" },
    { asset: createAsset() }
  );
  const mutation = plan.proposedDocument.mutationLog.at(-1);

  assert.equal(mutation.type, "fusion_patch_external_asset_attach");
  assert.equal(mutation.payload.patchId, "patch:external-attach-test");
  assert.equal(mutation.payload.patchAssetUrl, "/page-assets/page-1/external-attach-test.png");
  assert.equal(mutation.meta.source, "mcp-html-artboard-fusion-patch-image-attach");
});

test("attach plan recalculates renderFingerprint", () => {
  const artboard = createHtmlArtboard();
  const plan = createHtmlArtboardFusionPatchImageAttachPlan(
    artboard,
    { confirmApply: true, patchId: "patch:external-attach-test" },
    { asset: createAsset() }
  );

  assert.notEqual(plan.proposedDocument.renderFingerprint, artboard.runtimeDocument.renderFingerprint);
});

test("attach plan does not mutate input htmlArtboard", () => {
  const artboard = createHtmlArtboard();
  const before = JSON.stringify(artboard);

  createHtmlArtboardFusionPatchImageAttachPlan(
    artboard,
    { confirmApply: true, patchId: "patch:external-attach-test" },
    { asset: createAsset() }
  );

  assert.equal(JSON.stringify(artboard), before);
});

test("attach plan blocks stale expected fingerprint", () => {
  const plan = createHtmlArtboardFusionPatchImageAttachPlan(
    createHtmlArtboard(),
    {
      confirmApply: true,
      patchId: "patch:external-attach-test",
      expectedRenderFingerprint: "stale-fingerprint",
    },
    { asset: createAsset() }
  );

  assert.equal(plan.canApply, false);
  assert.equal(plan.preconditionFailed, true);
  assert.equal(plan.reason, "Precondition check failed");
});

test("attach plan can apply with matching safety guards", () => {
  const artboard = createHtmlArtboard();
  const expected = createHtmlArtboardApplyPreconditions(artboard.runtimeDocument);
  const plan = createHtmlArtboardFusionPatchImageAttachPlan(
    artboard,
    {
      confirmApply: true,
      patchId: "patch:external-attach-test",
      expectedDocumentId: expected.documentId,
      expectedRenderFingerprint: expected.renderFingerprint,
      expectedMutationCount: expected.mutationCount,
      expectedFusionPatchCount: expected.fusionPatchCount,
    },
    { asset: createAsset() }
  );

  assert.equal(plan.canApply, true);
  assert.equal(plan.preconditionFailed, false);
});

test("attach plan blocks existing patchAssetUrl unless allowOverwrite true", () => {
  const artboard = createHtmlArtboard({
    runtimeDocument: {
      fusionPatches: [createPatch({ patchAssetUrl: "/page-assets/page-1/existing.png" })],
    },
  });
  const blocked = createHtmlArtboardFusionPatchImageAttachPlan(
    artboard,
    { confirmApply: true, patchId: "patch:external-attach-test" },
    { asset: createAsset() }
  );
  const allowed = createHtmlArtboardFusionPatchImageAttachPlan(
    artboard,
    { confirmApply: true, patchId: "patch:external-attach-test", allowOverwrite: true },
    { asset: createAsset() }
  );

  assert.equal(blocked.canApply, false);
  assert.equal(blocked.reason.includes("allowOverwrite=true"), true);
  assert.equal(allowed.canApply, true);
});

test("attach plan handles missing patchId and missing patch safely", () => {
  const missingPatchId = createHtmlArtboardFusionPatchImageAttachPlan(
    createHtmlArtboard(),
    { confirmApply: true },
    { asset: createAsset() }
  );
  const missingPatch = createHtmlArtboardFusionPatchImageAttachPlan(
    createHtmlArtboard(),
    { confirmApply: true, patchId: "patch:missing" },
    { asset: createAsset() }
  );

  assert.equal(missingPatchId.canApply, false);
  assert.equal(missingPatchId.reason, "patchId is required");
  assert.equal(missingPatch.canApply, false);
  assert.equal(missingPatch.reason, "Patch not found: patch:missing");
});

test("applyHtmlArtboardFusionPatchImageAttachDocumentToShapeRecord updates runtimeDocument", () => {
  const shape = createShapeRecord();
  const nextDocument = {
    ...shape.meta.runtimeDocument,
    fusionPatches: [
      createPatch({
        patchAssetUrl: "/page-assets/page-1/external-attach-test.png",
        status: "generated",
      }),
    ],
  };
  const updated = applyHtmlArtboardFusionPatchImageAttachDocumentToShapeRecord(shape, nextDocument);

  assert.equal(updated.meta.runtimeDocument.fusionPatches[0].status, "generated");
  assert.equal(updated.meta.runtimeDocument.fusionPatches[0].patchAssetUrl, "/page-assets/page-1/external-attach-test.png");
});

test("applyHtmlArtboardFusionPatchImageAttachDocumentToShapeRecord preserves shape fields", () => {
  const shape = createShapeRecord();
  const updated = applyHtmlArtboardFusionPatchImageAttachDocumentToShapeRecord(shape, {
    ...shape.meta.runtimeDocument,
    fusionPatches: [createPatch({ status: "generated" })],
  });

  assert.equal(updated.id, shape.id);
  assert.equal(updated.type, shape.type);
  assert.deepEqual(updated.props, shape.props);
  assert.equal(updated.meta.keepMe, "yes");
  assert.equal(updated.meta.cowartHtmlArtboard, true);
});

test("applyHtmlArtboardFusionPatchImageAttachDocumentToShapeRecord does not mutate input shape", () => {
  const shape = createShapeRecord();
  const before = JSON.stringify(shape);

  applyHtmlArtboardFusionPatchImageAttachDocumentToShapeRecord(shape, {
    ...shape.meta.runtimeDocument,
    fusionPatches: [createPatch({ status: "generated" })],
  });

  assert.equal(JSON.stringify(shape), before);
});

test("applyHtmlArtboardFusionPatchImageAttachDocumentToShapeRecord rejects normal shape", () => {
  assert.throws(
    () =>
      applyHtmlArtboardFusionPatchImageAttachDocumentToShapeRecord(
        {
          id: "shape:normal",
          typeName: "shape",
          type: "geo",
          props: {},
          meta: {},
        },
        createRuntimeDocument()
      ),
    /HTML Artboard/
  );
});

test("summarize attach result handles dry-run and applied", () => {
  const dryRun = summarizeHtmlArtboardFusionPatchImageAttachResult({
    shapeId: "shape:external-attach-html-artboard",
    dryRun: true,
  });
  const applied = summarizeHtmlArtboardFusionPatchImageAttachResult({
    shapeId: "shape:external-attach-html-artboard",
    applied: true,
  });

  assert.equal(dryRun.includes("confirmApply is required"), true);
  assert.equal(applied.includes("Attached external FusionPatch image"), true);
});
