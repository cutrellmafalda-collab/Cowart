import assert from "node:assert/strict";

import { createHtmlArtboardApplyPreconditions } from "../mcp/htmlArtboardApplyEdit.mjs";
import {
  applyHtmlArtboardBackgroundImageAttachDocumentToShapeRecord,
  createHtmlArtboardBackgroundImageAttachPlan,
  summarizeHtmlArtboardBackgroundImageAttachResult,
} from "../mcp/htmlArtboardBackgroundImageAttach.mjs";

function test(name, run) {
  run();
  console.log(`ok - ${name}`);
}

function createRuntimeDocument(overrides = {}) {
  return {
    id: "html-artboard:background-attach-test",
    type: "cowart-html-artboard",
    version: 1,
    width: 720,
    height: 1280,
    background: {
      type: "gradient",
      identity: "background-attach-gradient",
      prompt: "No-text starter background",
      colors: ["#ffffff", "#eeeeee"],
    },
    html: '<section data-node="headline"><h1>Original</h1></section>',
    css: "section { color: black; }",
    fusionPatches: [],
    assets: [],
    history: [],
    mutationLog: [],
    executionGraph: null,
    renderFingerprint: "cowart-source-v1:background-attach-original",
    meta: { provider: "mock" },
    ...overrides,
  };
}

function createHtmlArtboard(overrides = {}) {
  const runtimeDocument = createRuntimeDocument(overrides.runtimeDocument);

  return {
    shapeId: "shape:background-attach-html-artboard",
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
    backgroundAssetId: "external-html-artboard-background-asset:background-attach-test",
    backgroundAssetUrl: "/page-assets/page-1/background-attach-test.png",
    fileName: "background-attach-test.png",
    relativePath: "pages/page-1/assets/background-attach-test.png",
    mimeType: "image/png",
    fileSize: 256,
    ...overrides,
  };
}

function createShapeRecord(overrides = {}) {
  return {
    id: "shape:background-attach-html-artboard",
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

test("background attach plan without confirmApply returns dryRun true", () => {
  const plan = createHtmlArtboardBackgroundImageAttachPlan(
    createHtmlArtboard(),
    {},
    { asset: createAsset() }
  );

  assert.equal(plan.dryRun, true);
  assert.equal(plan.canApply, false);
  assert.equal(plan.proposedMutations.length, 1);
});

test("background attach plan with confirmApply true canApply true", () => {
  const plan = createHtmlArtboardBackgroundImageAttachPlan(
    createHtmlArtboard(),
    { confirmApply: true },
    { asset: createAsset() }
  );

  assert.equal(plan.canApply, true);
  assert.equal(plan.proposedMutations[0].type, "background_asset_attach");
});

test("background attach plan updates background asset fields and status", () => {
  const plan = createHtmlArtboardBackgroundImageAttachPlan(
    createHtmlArtboard(),
    { confirmApply: true, provider: "codex-image-gen", prompt: "No-text launch background" },
    { asset: createAsset() }
  );

  assert.equal(plan.proposedDocument.background.type, "image");
  assert.equal(
    plan.proposedDocument.background.backgroundAssetId,
    "external-html-artboard-background-asset:background-attach-test"
  );
  assert.equal(plan.proposedDocument.background.provider, "codex-image-gen");
  assert.equal(plan.proposedDocument.background.status, "generated");
  assert.equal(plan.proposedDocument.background.prompt, "No-text launch background");
});

test("background attach plan preserves HTML and CSS", () => {
  const artboard = createHtmlArtboard();
  const plan = createHtmlArtboardBackgroundImageAttachPlan(
    artboard,
    { confirmApply: true },
    { asset: createAsset() }
  );

  assert.equal(plan.proposedDocument.html, artboard.runtimeDocument.html);
  assert.equal(plan.proposedDocument.css, artboard.runtimeDocument.css);
});

test("background attach plan stores generationRequest and sanitized source image metadata", () => {
  const generationRequest = { prompt: "No-text background" };
  const plan = createHtmlArtboardBackgroundImageAttachPlan(
    createHtmlArtboard(),
    { confirmApply: true, generationRequest },
    { asset: createAsset() }
  );

  assert.deepEqual(plan.proposedDocument.background.meta.generationRequest, generationRequest);
  assert.deepEqual(plan.proposedDocument.background.meta.externalImage, {
    fileName: "background-attach-test.png",
    relativePath: "pages/page-1/assets/background-attach-test.png",
    mimeType: "image/png",
    fileSize: 256,
  });
  assert.equal(JSON.stringify(plan.proposedDocument.background.meta).includes("C:\\"), false);
});

test("background attach plan records mutationLog", () => {
  const plan = createHtmlArtboardBackgroundImageAttachPlan(
    createHtmlArtboard(),
    { confirmApply: true },
    { asset: createAsset() }
  );
  const mutation = plan.proposedDocument.mutationLog.at(-1);

  assert.equal(mutation.type, "background_asset_attach");
  assert.equal(mutation.payload.backgroundAssetUrl, "/page-assets/page-1/background-attach-test.png");
  assert.equal(mutation.meta.source, "mcp-html-artboard-background-image-attach");
});

test("background attach plan recalculates renderFingerprint", () => {
  const artboard = createHtmlArtboard();
  const plan = createHtmlArtboardBackgroundImageAttachPlan(
    artboard,
    { confirmApply: true },
    { asset: createAsset() }
  );

  assert.notEqual(plan.proposedDocument.renderFingerprint, artboard.runtimeDocument.renderFingerprint);
});

test("background attach plan does not mutate input htmlArtboard", () => {
  const artboard = createHtmlArtboard();
  const before = JSON.stringify(artboard);

  createHtmlArtboardBackgroundImageAttachPlan(
    artboard,
    { confirmApply: true },
    { asset: createAsset() }
  );

  assert.equal(JSON.stringify(artboard), before);
});

test("background attach plan blocks stale expected fingerprint", () => {
  const plan = createHtmlArtboardBackgroundImageAttachPlan(
    createHtmlArtboard(),
    { confirmApply: true, expectedRenderFingerprint: "stale-fingerprint" },
    { asset: createAsset() }
  );

  assert.equal(plan.canApply, false);
  assert.equal(plan.preconditionFailed, true);
  assert.equal(plan.reason, "Precondition check failed");
});

test("background attach plan can apply with matching safety guards", () => {
  const artboard = createHtmlArtboard();
  const expected = createHtmlArtboardApplyPreconditions(artboard.runtimeDocument);
  const plan = createHtmlArtboardBackgroundImageAttachPlan(
    artboard,
    {
      confirmApply: true,
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

test("background attach plan blocks existing background unless allowOverwrite true", () => {
  const artboard = createHtmlArtboard({
    runtimeDocument: {
      background: {
        type: "image",
        backgroundAssetUrl: "/page-assets/page-1/existing-background.png",
      },
    },
  });
  const blocked = createHtmlArtboardBackgroundImageAttachPlan(
    artboard,
    { confirmApply: true },
    { asset: createAsset() }
  );
  const allowed = createHtmlArtboardBackgroundImageAttachPlan(
    artboard,
    { confirmApply: true, allowOverwrite: true },
    { asset: createAsset() }
  );

  assert.equal(blocked.canApply, false);
  assert.equal(blocked.reason.includes("allowOverwrite=true"), true);
  assert.equal(allowed.canApply, true);
});

test("applyHtmlArtboardBackgroundImageAttachDocumentToShapeRecord updates runtimeDocument", () => {
  const shape = createShapeRecord();
  const updated = applyHtmlArtboardBackgroundImageAttachDocumentToShapeRecord(shape, {
    ...shape.meta.runtimeDocument,
    background: {
      type: "image",
      backgroundAssetUrl: "/page-assets/page-1/background-attach-test.png",
      status: "generated",
    },
  });

  assert.equal(updated.meta.runtimeDocument.background.status, "generated");
  assert.equal(
    updated.meta.runtimeDocument.background.backgroundAssetUrl,
    "/page-assets/page-1/background-attach-test.png"
  );
});

test("applyHtmlArtboardBackgroundImageAttachDocumentToShapeRecord preserves shape fields", () => {
  const shape = createShapeRecord();
  const updated = applyHtmlArtboardBackgroundImageAttachDocumentToShapeRecord(shape, {
    ...shape.meta.runtimeDocument,
    background: { type: "image", status: "generated" },
  });

  assert.equal(updated.id, shape.id);
  assert.equal(updated.type, shape.type);
  assert.deepEqual(updated.props, shape.props);
  assert.equal(updated.meta.keepMe, "yes");
  assert.equal(updated.meta.cowartHtmlArtboard, true);
});

test("applyHtmlArtboardBackgroundImageAttachDocumentToShapeRecord rejects normal shape", () => {
  assert.throws(
    () =>
      applyHtmlArtboardBackgroundImageAttachDocumentToShapeRecord(
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

test("summarize background attach result handles dry-run and applied", () => {
  const dryRun = summarizeHtmlArtboardBackgroundImageAttachResult({
    shapeId: "shape:background-attach-html-artboard",
    dryRun: true,
  });
  const applied = summarizeHtmlArtboardBackgroundImageAttachResult({
    shapeId: "shape:background-attach-html-artboard",
    applied: true,
  });

  assert.equal(dryRun.includes("confirmApply is required"), true);
  assert.equal(applied.includes("Attached external HTML Artboard background image"), true);
});
