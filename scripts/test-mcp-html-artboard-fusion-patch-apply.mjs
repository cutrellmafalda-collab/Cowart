import assert from "node:assert/strict";

import { createHtmlArtboardApplyPreconditions } from "../mcp/htmlArtboardApplyEdit.mjs";
import {
  applyHtmlArtboardFusionPatchDocumentToShapeRecord,
  createHtmlArtboardFusionPatchApplyPlan,
  summarizeHtmlArtboardFusionPatchApplyResult,
} from "../mcp/htmlArtboardFusionPatchApply.mjs";

function test(name, run) {
  run();
  console.log(`ok - ${name}`);
}

function createPatch(overrides = {}) {
  return {
    id: "patch:apply-test",
    type: "fusion-patch",
    name: "Apply Test Patch",
    selector: "[data-node=\"headline\"]",
    sourceSelector: "[data-node=\"headline\"]",
    sourceText: "Headline",
    region: { x: 80, y: 80, w: 240, h: 120 },
    prompt: "Original prompt",
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
    id: "html-artboard:fusion-apply-test",
    type: "cowart-html-artboard",
    version: 1,
    width: 720,
    height: 1280,
    background: {
      type: "gradient",
      identity: "fusion-apply-background",
      colors: ["#ffffff", "#eeeeee"],
    },
    html: "<section data-node=\"headline\"><h1>Original</h1></section>",
    css: "section { color: black; }",
    fusionPatches: [createPatch()],
    assets: [],
    history: [],
    mutationLog: [],
    executionGraph: null,
    renderFingerprint: "cowart-source-v1:fusion-apply-original",
    meta: { provider: "mock" },
    ...overrides,
  };
}

function createHtmlArtboard(overrides = {}) {
  const runtimeDocument = createRuntimeDocument(overrides.runtimeDocument);

  return {
    shapeId: "shape:fusion-apply-html-artboard",
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
    id: "shape:fusion-apply-html-artboard",
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

test("createHtmlArtboardFusionPatchApplyPlan without confirmApply returns dryRun true", () => {
  const plan = createHtmlArtboardFusionPatchApplyPlan(createHtmlArtboard(), {
    operation: "hide",
    patchId: "patch:apply-test",
  });

  assert.equal(plan.dryRun, true);
  assert.equal(plan.canApply, false);
});

test("createHtmlArtboardFusionPatchApplyPlan with confirmApply true create canApply true", () => {
  const plan = createHtmlArtboardFusionPatchApplyPlan(createHtmlArtboard(), {
    confirmApply: true,
    operation: "create",
    name: "New patch",
    prompt: "Create a new patch",
  });

  assert.equal(plan.canApply, true);
  assert.equal(plan.proposedMutations[0].type, "fusion_patch_create");
});

test("createHtmlArtboardFusionPatchApplyPlan with confirmApply true no-op canApply false", () => {
  const plan = createHtmlArtboardFusionPatchApplyPlan(createHtmlArtboard(), {
    confirmApply: true,
    operation: "update",
    patchId: "patch:apply-test",
  });

  assert.equal(plan.canApply, false);
  assert.equal(plan.reason, "No mutations proposed");
});

test("createHtmlArtboardFusionPatchApplyPlan with matching expected fingerprint canApply true", () => {
  const artboard = createHtmlArtboard();
  const expected = createHtmlArtboardApplyPreconditions(artboard.runtimeDocument);
  const plan = createHtmlArtboardFusionPatchApplyPlan(artboard, {
    confirmApply: true,
    operation: "rename",
    patchId: "patch:apply-test",
    name: "Renamed patch",
    expectedDocumentId: expected.documentId,
    expectedRenderFingerprint: expected.renderFingerprint,
    expectedMutationCount: expected.mutationCount,
    expectedFusionPatchCount: expected.fusionPatchCount,
  });

  assert.equal(plan.canApply, true);
  assert.equal(plan.preconditionFailed, false);
});

test("createHtmlArtboardFusionPatchApplyPlan blocks stale expected fingerprint", () => {
  const plan = createHtmlArtboardFusionPatchApplyPlan(createHtmlArtboard(), {
    confirmApply: true,
    operation: "rename",
    patchId: "patch:apply-test",
    name: "Blocked rename",
    expectedRenderFingerprint: "stale-fingerprint",
  });

  assert.equal(plan.canApply, false);
  assert.equal(plan.preconditionFailed, true);
  assert.equal(plan.reason, "Precondition check failed");
});

test("createHtmlArtboardFusionPatchApplyPlan can apply hide", () => {
  const plan = createHtmlArtboardFusionPatchApplyPlan(createHtmlArtboard(), {
    confirmApply: true,
    operation: "hide",
    patchId: "patch:apply-test",
  });

  assert.equal(plan.canApply, true);
  assert.equal(plan.proposedDocument.fusionPatches[0].visible, false);
  assert.equal(plan.proposedMutations[0].type, "fusion_patch_visibility_update");
});

test("createHtmlArtboardFusionPatchApplyPlan can apply show", () => {
  const plan = createHtmlArtboardFusionPatchApplyPlan(
    createHtmlArtboard({
      runtimeDocument: {
        fusionPatches: [createPatch({ visible: false })],
      },
    }),
    {
      confirmApply: true,
      operation: "show",
      patchId: "patch:apply-test",
    }
  );

  assert.equal(plan.canApply, true);
  assert.equal(plan.proposedDocument.fusionPatches[0].visible, true);
});

test("createHtmlArtboardFusionPatchApplyPlan can apply update region", () => {
  const nextRegion = { x: 12, y: 24, w: 120, h: 80 };
  const plan = createHtmlArtboardFusionPatchApplyPlan(createHtmlArtboard(), {
    confirmApply: true,
    operation: "update_region",
    patchId: "patch:apply-test",
    region: nextRegion,
  });

  assert.equal(plan.canApply, true);
  assert.deepEqual(plan.proposedDocument.fusionPatches[0].region, nextRegion);
  assert.equal(plan.proposedMutations[0].type, "fusion_patch_region_update");
});

test("createHtmlArtboardFusionPatchApplyPlan can apply rename", () => {
  const plan = createHtmlArtboardFusionPatchApplyPlan(createHtmlArtboard(), {
    confirmApply: true,
    operation: "rename",
    patchId: "patch:apply-test",
    name: "Renamed patch",
  });

  assert.equal(plan.canApply, true);
  assert.equal(plan.proposedDocument.fusionPatches[0].name, "Renamed patch");
  assert.equal(plan.proposedMutations[0].type, "fusion_patch_rename");
});

test("createHtmlArtboardFusionPatchApplyPlan can apply delete", () => {
  const plan = createHtmlArtboardFusionPatchApplyPlan(createHtmlArtboard(), {
    confirmApply: true,
    operation: "delete",
    patchId: "patch:apply-test",
  });

  assert.equal(plan.canApply, true);
  assert.equal(plan.proposedDocument.fusionPatches.length, 0);
  assert.equal(plan.proposedMutations[0].type, "fusion_patch_delete");
});

test("createHtmlArtboardFusionPatchApplyPlan does not mutate input", () => {
  const artboard = createHtmlArtboard();
  const before = JSON.stringify(artboard);

  createHtmlArtboardFusionPatchApplyPlan(artboard, {
    confirmApply: true,
    operation: "update",
    patchId: "patch:apply-test",
    prompt: "Updated prompt",
  });

  assert.equal(JSON.stringify(artboard), before);
});

test("applyHtmlArtboardFusionPatchDocumentToShapeRecord updates runtimeDocument", () => {
  const shape = createShapeRecord();
  const nextDocument = {
    ...shape.meta.runtimeDocument,
    fusionPatches: [createPatch({ name: "Applied patch" })],
  };
  const updated = applyHtmlArtboardFusionPatchDocumentToShapeRecord(shape, nextDocument);

  assert.equal(updated.meta.runtimeDocument.fusionPatches[0].name, "Applied patch");
});

test("applyHtmlArtboardFusionPatchDocumentToShapeRecord preserves shape fields", () => {
  const shape = createShapeRecord();
  const updated = applyHtmlArtboardFusionPatchDocumentToShapeRecord(shape, shape.meta.runtimeDocument);

  assert.equal(updated.id, shape.id);
  assert.equal(updated.type, shape.type);
  assert.deepEqual(updated.props, shape.props);
});

test("applyHtmlArtboardFusionPatchDocumentToShapeRecord preserves existing meta fields", () => {
  const shape = createShapeRecord();
  const updated = applyHtmlArtboardFusionPatchDocumentToShapeRecord(shape, shape.meta.runtimeDocument);

  assert.equal(updated.meta.keepMe, "yes");
  assert.equal(updated.meta.cowartHtmlArtboard, true);
});

test("applyHtmlArtboardFusionPatchDocumentToShapeRecord does not mutate input shape", () => {
  const shape = createShapeRecord();
  const before = JSON.stringify(shape);

  applyHtmlArtboardFusionPatchDocumentToShapeRecord(shape, {
    ...shape.meta.runtimeDocument,
    fusionPatches: [createPatch({ name: "Changed" })],
  });

  assert.equal(JSON.stringify(shape), before);
});

test("applyHtmlArtboardFusionPatchDocumentToShapeRecord rejects normal shape", () => {
  assert.throws(() =>
    applyHtmlArtboardFusionPatchDocumentToShapeRecord(
      {
        id: "shape:normal",
        type: "frame",
        meta: {},
      },
      createRuntimeDocument()
    )
  );
});

test("summarizeHtmlArtboardFusionPatchApplyResult handles dry-run", () => {
  const plan = createHtmlArtboardFusionPatchApplyPlan(createHtmlArtboard(), {
    operation: "hide",
    patchId: "patch:apply-test",
  });

  assert.equal(
    summarizeHtmlArtboardFusionPatchApplyResult(plan),
    "Dry-run only for shape:fusion-apply-html-artboard: confirmApply is required to write changes."
  );
});

test("summarizeHtmlArtboardFusionPatchApplyResult handles applied result", () => {
  const plan = createHtmlArtboardFusionPatchApplyPlan(createHtmlArtboard(), {
    confirmApply: true,
    operation: "hide",
    patchId: "patch:apply-test",
  });
  const summary = summarizeHtmlArtboardFusionPatchApplyResult({
    ...plan,
    applied: true,
  });

  assert.equal(summary.includes("Applied FusionPatch hide to shape:fusion-apply-html-artboard"), true);
  assert.equal(summary.includes("1 mutation"), true);
});

test("apply plan replayCheck ok for create", () => {
  const plan = createHtmlArtboardFusionPatchApplyPlan(createHtmlArtboard(), {
    confirmApply: true,
    operation: "create",
  });

  assert.equal(plan.replayCheck.ok, true);
});

test("apply plan replayCheck ok for hide", () => {
  const plan = createHtmlArtboardFusionPatchApplyPlan(createHtmlArtboard(), {
    confirmApply: true,
    operation: "hide",
    patchId: "patch:apply-test",
  });

  assert.equal(plan.replayCheck.ok, true);
});

test("apply plan replayCheck ok for update region", () => {
  const plan = createHtmlArtboardFusionPatchApplyPlan(createHtmlArtboard(), {
    confirmApply: true,
    operation: "update_region",
    patchId: "patch:apply-test",
    region: { x: 30, y: 40, w: 140, h: 90 },
  });

  assert.equal(plan.replayCheck.ok, true);
});
