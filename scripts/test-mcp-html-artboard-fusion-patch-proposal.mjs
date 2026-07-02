import assert from "node:assert/strict";

import { createFusionPatchPlaceholder } from "../src/html-runtime/fusionPatch.js";
import {
  createHtmlArtboardFusionPatchProposal,
  summarizeHtmlArtboardFusionPatchProposal,
} from "../mcp/htmlArtboardFusionPatchProposal.mjs";

function test(name, run) {
  run();
  console.log(`ok - ${name}`);
}

function createRuntimeDocument(overrides = {}) {
  const patch = createFusionPatchPlaceholder({
    id: "patch:proposal-existing",
    name: "Existing patch",
    prompt: "Existing prompt",
    region: { x: 10, y: 20, w: 120, h: 80 },
    visible: true,
  });

  return {
    id: "html-artboard:fusion-proposal-test",
    type: "cowart-html-artboard",
    version: 1,
    width: 720,
    height: 1280,
    background: {
      type: "gradient",
      identity: "proposal-background",
      colors: ["#ffffff", "#eeeeee"],
    },
    html: '<section data-node="headline"><h1>Original</h1></section>',
    css: "section { color: black; }",
    fusionPatches: [patch],
    assets: [],
    history: [],
    mutationLog: [{ id: "mutation:existing", type: "document_meta_update" }],
    executionGraph: null,
    renderFingerprint: "cowart-source-v1:original",
    meta: { provider: "mock" },
    ...overrides,
  };
}

function createHtmlArtboard(overrides = {}) {
  const runtimeDocument = createRuntimeDocument(overrides.runtimeDocument);

  return {
    shapeId: "shape:fusion-proposal-html-artboard",
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

test("fusion patch proposal create returns dryRun true", () => {
  const proposal = createHtmlArtboardFusionPatchProposal(createHtmlArtboard(), {
    operation: "create",
  });

  assert.equal(proposal.dryRun, true);
});

test("fusion patch proposal creates patch", () => {
  const proposal = createHtmlArtboardFusionPatchProposal(createHtmlArtboard(), {
    operation: "create",
    targetSelector: '[data-node="headline"]',
    targetSourceText: "Original",
    name: "Created patch",
    prompt: "Create prompt",
  });

  assert.equal(proposal.proposedMutations.length, 1);
  assert.equal(proposal.proposedMutations[0].type, "fusion_patch_create");
  assert.equal(proposal.proposedDocument.fusionPatches.length, 2);
  assert.equal(proposal.targetPatchAfter.selector, '[data-node="headline"]');
  assert.equal(proposal.targetPatchAfter.sourceText, "Original");
});

test("fusion patch proposal updates prompt", () => {
  const proposal = createHtmlArtboardFusionPatchProposal(createHtmlArtboard(), {
    operation: "update",
    patchId: "patch:proposal-existing",
    prompt: "Updated prompt",
  });

  assert.equal(proposal.proposedMutations.length, 1);
  assert.equal(proposal.proposedMutations[0].type, "fusion_patch_update");
  assert.equal(proposal.targetPatchAfter.prompt, "Updated prompt");
});

test("fusion patch proposal updates region", () => {
  const proposal = createHtmlArtboardFusionPatchProposal(createHtmlArtboard(), {
    operation: "update_region",
    patchId: "patch:proposal-existing",
    region: { x: 30, y: 40, w: 150, h: 90 },
  });

  assert.equal(proposal.proposedMutations.length, 1);
  assert.equal(proposal.proposedMutations[0].type, "fusion_patch_region_update");
  assert.deepEqual(proposal.targetPatchAfter.region, { x: 30, y: 40, w: 150, h: 90 });
});

test("fusion patch proposal hides patch", () => {
  const proposal = createHtmlArtboardFusionPatchProposal(createHtmlArtboard(), {
    operation: "hide",
    patchId: "patch:proposal-existing",
  });

  assert.equal(proposal.proposedMutations[0].type, "fusion_patch_visibility_update");
  assert.equal(proposal.targetPatchAfter.visible, false);
});

test("fusion patch proposal shows patch", () => {
  const document = createRuntimeDocument({
    fusionPatches: [
      createFusionPatchPlaceholder({
        id: "patch:proposal-existing",
        visible: false,
      }),
    ],
  });
  const proposal = createHtmlArtboardFusionPatchProposal(createHtmlArtboard({ runtimeDocument: document }), {
    operation: "show",
    patchId: "patch:proposal-existing",
  });

  assert.equal(proposal.proposedMutations[0].type, "fusion_patch_visibility_update");
  assert.equal(proposal.targetPatchAfter.visible, true);
});

test("fusion patch proposal renames patch", () => {
  const proposal = createHtmlArtboardFusionPatchProposal(createHtmlArtboard(), {
    operation: "rename",
    patchId: "patch:proposal-existing",
    name: "Renamed patch",
  });

  assert.equal(proposal.proposedMutations[0].type, "fusion_patch_rename");
  assert.equal(proposal.targetPatchAfter.name, "Renamed patch");
});

test("fusion patch proposal deletes patch", () => {
  const proposal = createHtmlArtboardFusionPatchProposal(createHtmlArtboard(), {
    operation: "delete",
    patchId: "patch:proposal-existing",
  });

  assert.equal(proposal.proposedMutations[0].type, "fusion_patch_delete");
  assert.equal(proposal.proposedDocument.fusionPatches.length, 0);
  assert.equal(proposal.targetPatchAfter, null);
});

test("fusion patch proposal does not mutate input htmlArtboard", () => {
  const artboard = createHtmlArtboard();
  const before = JSON.stringify(artboard);

  createHtmlArtboardFusionPatchProposal(artboard, {
    operation: "update",
    patchId: "patch:proposal-existing",
    prompt: "Mutate check",
  });

  assert.equal(JSON.stringify(artboard), before);
});

test("fusion patch proposal replayCheck ok for create", () => {
  const proposal = createHtmlArtboardFusionPatchProposal(createHtmlArtboard(), {
    operation: "create",
  });

  assert.equal(proposal.replayCheck.ok, true);
  assert.equal(proposal.replayCheck.fusionPatchCountMatches, true);
});

test("fusion patch proposal replayCheck ok for update", () => {
  const proposal = createHtmlArtboardFusionPatchProposal(createHtmlArtboard(), {
    operation: "update",
    patchId: "patch:proposal-existing",
    prompt: "Replay update",
  });

  assert.equal(proposal.replayCheck.ok, true);
  assert.equal(proposal.replayCheck.fusionPatchesMatch, true);
});

test("fusion patch proposal replayCheck ok for delete", () => {
  const proposal = createHtmlArtboardFusionPatchProposal(createHtmlArtboard(), {
    operation: "delete",
    patchId: "patch:proposal-existing",
  });

  assert.equal(proposal.replayCheck.ok, true);
  assert.equal(proposal.replayCheck.fusionPatchesMatch, true);
});

test("fusion patch proposal invalid patchId returns no-op safely", () => {
  const proposal = createHtmlArtboardFusionPatchProposal(createHtmlArtboard(), {
    operation: "update",
    patchId: "patch:missing",
    prompt: "Missing patch",
  });

  assert.equal(proposal.proposedMutations.length, 0);
  assert.equal(proposal.diffSummary.notes.some((note) => note.includes("Patch not found")), true);
});

test("summarize fusion patch proposal handles zero changes", () => {
  const proposal = createHtmlArtboardFusionPatchProposal(createHtmlArtboard(), {
    operation: "update",
    patchId: "patch:proposal-existing",
  });

  assert.equal(
    summarizeHtmlArtboardFusionPatchProposal(proposal),
    "No dry-run FusionPatch changes proposed for html-artboard:fusion-proposal-test."
  );
});

test("summarize fusion patch proposal handles mutation", () => {
  const proposal = createHtmlArtboardFusionPatchProposal(createHtmlArtboard(), {
    operation: "rename",
    patchId: "patch:proposal-existing",
    name: "Summary patch",
  });
  const summary = summarizeHtmlArtboardFusionPatchProposal(proposal);

  assert.equal(summary.includes("Dry-run FusionPatch rename proposal"), true);
  assert.equal(summary.includes("1 mutation"), true);
});
