import assert from "node:assert/strict";

import {
  applyHtmlArtboardDocumentToShapeRecord,
  createHtmlArtboardApplyPreconditions,
  createHtmlArtboardApplyPlan,
  summarizeHtmlArtboardApplyResult,
  validateHtmlArtboardApplyPreconditions,
} from "../mcp/htmlArtboardApplyEdit.mjs";

function test(name, run) {
  run();
  console.log(`ok - ${name}`);
}

function createRuntimeDocument(overrides = {}) {
  return {
    id: "html-artboard:apply-test",
    type: "cowart-html-artboard",
    version: 1,
    width: 720,
    height: 1280,
    background: {
      type: "gradient",
      identity: "apply-background",
      colors: ["#ffffff", "#eeeeee"],
    },
    html: "<section><h1>Original</h1></section>",
    css: "section { color: black; }",
    fusionPatches: [],
    assets: [],
    history: [],
    mutationLog: [],
    executionGraph: null,
    renderFingerprint: "cowart-source-v1:original",
    meta: { provider: "mock" },
    ...overrides,
  };
}

function createHtmlArtboard(overrides = {}) {
  const runtimeDocument = createRuntimeDocument(overrides.runtimeDocument);

  return {
    shapeId: "shape:apply-html-artboard",
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

function createHtmlArtboardShape(overrides = {}) {
  return {
    id: "shape:apply-html-artboard",
    typeName: "shape",
    type: "frame",
    x: 32,
    y: 64,
    rotation: 0,
    props: { w: 720, h: 1280, name: "HTML Artboard" },
    meta: {
      cowartHtmlArtboard: true,
      cowartHtmlArtboardVersion: 1,
      runtimeDocument: createRuntimeDocument(),
      customMeta: "keep",
    },
    ...overrides,
  };
}

test("createHtmlArtboardApplyPreconditions returns documentId", () => {
  const preconditions = createHtmlArtboardApplyPreconditions(createRuntimeDocument());

  assert.equal(preconditions.documentId, "html-artboard:apply-test");
});

test("createHtmlArtboardApplyPreconditions returns renderFingerprint", () => {
  const preconditions = createHtmlArtboardApplyPreconditions(createRuntimeDocument());

  assert.equal(preconditions.renderFingerprint, "cowart-source-v1:original");
});

test("createHtmlArtboardApplyPreconditions returns mutationCount", () => {
  const preconditions = createHtmlArtboardApplyPreconditions(
    createRuntimeDocument({
      mutationLog: [{ id: "mutation-1" }, { id: "mutation-2" }],
    })
  );

  assert.equal(preconditions.mutationCount, 2);
});

test("createHtmlArtboardApplyPreconditions returns fusionPatchCount", () => {
  const preconditions = createHtmlArtboardApplyPreconditions(
    createRuntimeDocument({
      fusionPatches: [
        { id: "patch-1", type: "fusion-patch" },
        { id: "patch-2", type: "fusion-patch" },
      ],
    })
  );

  assert.equal(preconditions.fusionPatchCount, 2);
});

test("validate preconditions passes when expected values match", () => {
  const document = createRuntimeDocument({
    mutationLog: [{ id: "mutation-1" }],
    fusionPatches: [{ id: "patch-1", type: "fusion-patch" }],
  });
  const expected = createHtmlArtboardApplyPreconditions(document);
  const check = validateHtmlArtboardApplyPreconditions(document, {
    expectedDocumentId: expected.documentId,
    expectedRenderFingerprint: expected.renderFingerprint,
    expectedMutationCount: expected.mutationCount,
    expectedFusionPatchCount: expected.fusionPatchCount,
  });

  assert.equal(check.ok, true);
  assert.equal(check.failed, false);
});

test("validate preconditions ignores missing expected fields", () => {
  const check = validateHtmlArtboardApplyPreconditions(createRuntimeDocument(), {});

  assert.equal(check.ok, true);
  assert.equal(check.failed, false);
  assert.deepEqual(check.expected, {});
});

test("validate preconditions fails when expectedRenderFingerprint mismatches", () => {
  const check = validateHtmlArtboardApplyPreconditions(createRuntimeDocument(), {
    expectedRenderFingerprint: "stale-fingerprint",
  });

  assert.equal(check.ok, false);
  assert.equal(check.failed, true);
  assert.equal(check.reasons.some((reason) => reason.includes("expectedRenderFingerprint")), true);
});

test("validate preconditions fails when expectedMutationCount mismatches", () => {
  const check = validateHtmlArtboardApplyPreconditions(createRuntimeDocument(), {
    expectedMutationCount: 99,
  });

  assert.equal(check.ok, false);
  assert.equal(check.failed, true);
  assert.equal(check.reasons.some((reason) => reason.includes("expectedMutationCount")), true);
});

test("validate preconditions fails when expectedDocumentId mismatches", () => {
  const check = validateHtmlArtboardApplyPreconditions(createRuntimeDocument(), {
    expectedDocumentId: "html-artboard:stale",
  });

  assert.equal(check.ok, false);
  assert.equal(check.failed, true);
  assert.equal(check.reasons.some((reason) => reason.includes("expectedDocumentId")), true);
});

test("validate preconditions fails when expectedFusionPatchCount mismatches", () => {
  const check = validateHtmlArtboardApplyPreconditions(createRuntimeDocument(), {
    expectedFusionPatchCount: 99,
  });

  assert.equal(check.ok, false);
  assert.equal(check.failed, true);
  assert.equal(check.reasons.some((reason) => reason.includes("expectedFusionPatchCount")), true);
});

test("createHtmlArtboardApplyPlan without confirmApply returns dryRun true", () => {
  const plan = createHtmlArtboardApplyPlan(createHtmlArtboard(), {
    nextHtml: "<section>Next</section>",
  });

  assert.equal(plan.dryRun, true);
});

test("createHtmlArtboardApplyPlan without confirmApply canApply false", () => {
  const plan = createHtmlArtboardApplyPlan(createHtmlArtboard(), {
    nextHtml: "<section>Next</section>",
  });

  assert.equal(plan.canApply, false);
  assert.equal(plan.reason, "confirmApply is required to write changes");
});

test("createHtmlArtboardApplyPlan with confirmApply true and nextHtml canApply true", () => {
  const plan = createHtmlArtboardApplyPlan(createHtmlArtboard(), {
    confirmApply: true,
    nextHtml: "<section>Next</section>",
  });

  assert.equal(plan.canApply, true);
  assert.equal(plan.dryRun, false);
});

test("createHtmlArtboardApplyPlan with confirmApply true and no changes canApply false", () => {
  const plan = createHtmlArtboardApplyPlan(createHtmlArtboard(), {
    confirmApply: true,
  });

  assert.equal(plan.canApply, false);
  assert.equal(plan.reason, "No mutations proposed");
});

test("createHtmlArtboardApplyPlan includes preconditions", () => {
  const plan = createHtmlArtboardApplyPlan(createHtmlArtboard(), {
    nextHtml: "<section>Next</section>",
  });

  assert.equal(plan.preconditions.documentId, "html-artboard:apply-test");
  assert.equal(plan.preconditionCheck.ok, true);
  assert.equal(plan.preconditionFailed, false);
});

test("createHtmlArtboardApplyPlan blocks apply when precondition fails", () => {
  const plan = createHtmlArtboardApplyPlan(createHtmlArtboard(), {
    confirmApply: true,
    nextHtml: "<section>Blocked</section>",
    expectedRenderFingerprint: "stale-fingerprint",
  });

  assert.equal(plan.preconditionFailed, true);
  assert.equal(plan.canApply, false);
  assert.equal(plan.dryRun, true);
});

test("blocked apply plan has canApply false", () => {
  const plan = createHtmlArtboardApplyPlan(createHtmlArtboard(), {
    confirmApply: true,
    nextCss: "section { color: red; }",
    expectedMutationCount: 1,
  });

  assert.equal(plan.canApply, false);
});

test("blocked apply plan reason mentions precondition", () => {
  const plan = createHtmlArtboardApplyPlan(createHtmlArtboard(), {
    confirmApply: true,
    nextCss: "section { color: red; }",
    expectedDocumentId: "html-artboard:stale",
  });

  assert.equal(plan.reason.includes("Precondition"), true);
});

test("apply plan still dry-runs when confirmApply false", () => {
  const expected = createHtmlArtboardApplyPreconditions(createRuntimeDocument());
  const plan = createHtmlArtboardApplyPlan(createHtmlArtboard(), {
    nextHtml: "<section>Dry run</section>",
    expectedRenderFingerprint: expected.renderFingerprint,
  });

  assert.equal(plan.dryRun, true);
  assert.equal(plan.canApply, false);
  assert.equal(plan.reason, "confirmApply is required to write changes");
});

test("apply plan canApply true when confirmApply true and preconditions match", () => {
  const expected = createHtmlArtboardApplyPreconditions(createRuntimeDocument());
  const plan = createHtmlArtboardApplyPlan(createHtmlArtboard(), {
    confirmApply: true,
    nextCss: "section { color: green; }",
    expectedDocumentId: expected.documentId,
    expectedRenderFingerprint: expected.renderFingerprint,
    expectedMutationCount: expected.mutationCount,
    expectedFusionPatchCount: expected.fusionPatchCount,
  });

  assert.equal(plan.canApply, true);
  assert.equal(plan.preconditionFailed, false);
});

test("applyHtmlArtboardDocumentToShapeRecord updates runtimeDocument", () => {
  const shape = createHtmlArtboardShape();
  const updated = applyHtmlArtboardDocumentToShapeRecord(shape, {
    ...shape.meta.runtimeDocument,
    html: "<section>Applied</section>",
  });

  assert.equal(updated.meta.runtimeDocument.html, "<section>Applied</section>");
});

test("applyHtmlArtboardDocumentToShapeRecord preserves shape id/type/props", () => {
  const shape = createHtmlArtboardShape();
  const updated = applyHtmlArtboardDocumentToShapeRecord(shape, {
    ...shape.meta.runtimeDocument,
    css: "section { color: blue; }",
  });

  assert.equal(updated.id, shape.id);
  assert.equal(updated.type, shape.type);
  assert.equal(updated.typeName, shape.typeName);
  assert.deepEqual(updated.props, shape.props);
});

test("applyHtmlArtboardDocumentToShapeRecord preserves existing meta fields", () => {
  const shape = createHtmlArtboardShape();
  const updated = applyHtmlArtboardDocumentToShapeRecord(shape, shape.meta.runtimeDocument);

  assert.equal(updated.meta.customMeta, "keep");
  assert.equal(updated.meta.cowartHtmlArtboardVersion, 1);
});

test("applyHtmlArtboardDocumentToShapeRecord keeps cowartHtmlArtboard true", () => {
  const updated = applyHtmlArtboardDocumentToShapeRecord(
    createHtmlArtboardShape(),
    createRuntimeDocument()
  );

  assert.equal(updated.meta.cowartHtmlArtboard, true);
});

test("applyHtmlArtboardDocumentToShapeRecord does not mutate input shape", () => {
  const shape = createHtmlArtboardShape();
  const before = JSON.stringify(shape);

  applyHtmlArtboardDocumentToShapeRecord(shape, {
    ...shape.meta.runtimeDocument,
    html: "<section>Changed</section>",
  });

  assert.equal(JSON.stringify(shape), before);
});

test("applyHtmlArtboardDocumentToShapeRecord rejects normal shape", () => {
  assert.throws(() =>
    applyHtmlArtboardDocumentToShapeRecord(
      {
        id: "shape:normal",
        type: "frame",
        meta: {},
      },
      createRuntimeDocument()
    )
  );
});

test("summarizeHtmlArtboardApplyResult handles dry-run", () => {
  const plan = createHtmlArtboardApplyPlan(createHtmlArtboard(), {
    nextHtml: "<section>Dry run</section>",
  });

  assert.equal(
    summarizeHtmlArtboardApplyResult(plan),
    "Dry-run only for shape:apply-html-artboard: confirmApply is required to write changes."
  );
});

test("summarizeHtmlArtboardApplyResult handles applied result", () => {
  const plan = createHtmlArtboardApplyPlan(createHtmlArtboard(), {
    confirmApply: true,
    nextCss: "section { color: blue; }",
  });
  const summary = summarizeHtmlArtboardApplyResult({
    ...plan,
    applied: true,
  });

  assert.equal(summary.includes("Applied HTML Artboard edit to shape:apply-html-artboard"), true);
  assert.equal(summary.includes("1 mutation"), true);
});

test("apply plan includes proposedMutations", () => {
  const plan = createHtmlArtboardApplyPlan(createHtmlArtboard(), {
    confirmApply: true,
    nextHtml: "<section>Mutations</section>",
  });

  assert.equal(Array.isArray(plan.proposedMutations), true);
  assert.equal(plan.proposedMutations.length, 1);
});

test("apply plan replayCheck ok for html update", () => {
  const plan = createHtmlArtboardApplyPlan(createHtmlArtboard(), {
    confirmApply: true,
    nextHtml: "<section>Replay HTML</section>",
  });

  assert.equal(plan.replayCheck.ok, true);
  assert.equal(plan.replayCheck.htmlMatches, true);
});

test("apply plan replayCheck ok for css update", () => {
  const plan = createHtmlArtboardApplyPlan(createHtmlArtboard(), {
    confirmApply: true,
    nextCss: "section { color: purple; }",
  });

  assert.equal(plan.replayCheck.ok, true);
  assert.equal(plan.replayCheck.cssMatches, true);
});

test("apply plan replayCheck ok for fusion patch create", () => {
  const plan = createHtmlArtboardApplyPlan(createHtmlArtboard(), {
    confirmApply: true,
    createFusionPatch: true,
  });

  assert.equal(plan.replayCheck.ok, true);
  assert.equal(plan.replayCheck.fusionPatchCountMatches, true);
});
