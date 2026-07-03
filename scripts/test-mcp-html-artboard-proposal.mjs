import assert from "node:assert/strict";

import {
  createHtmlArtboardEditProposal,
  summarizeHtmlArtboardEditProposal,
} from "../mcp/htmlArtboardEditProposal.mjs";

function test(name, run) {
  run();
  console.log(`ok - ${name}`);
}

function createRuntimeDocument(overrides = {}) {
  return {
    id: "html-artboard:proposal-test",
    type: "cowart-html-artboard",
    version: 1,
    width: 720,
    height: 1280,
    background: {
      type: "gradient",
      identity: "proposal-background",
      colors: ["#ffffff", "#eeeeee"],
    },
    html: "<section><h1>Original</h1></section>",
    css: "section { color: black; }",
    textLayers: [],
    fusionPatches: [],
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
    shapeId: "shape:proposal-html-artboard",
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

test("createHtmlArtboardEditProposal returns dryRun true", () => {
  const proposal = createHtmlArtboardEditProposal(createHtmlArtboard(), {
    nextHtml: "<section>Next</section>",
  });

  assert.equal(proposal.dryRun, true);
});

test("proposal with nextHtml creates html_update mutation", () => {
  const proposal = createHtmlArtboardEditProposal(createHtmlArtboard(), {
    nextHtml: "<section><h1>Next HTML</h1></section>",
  });

  assert.equal(proposal.proposedMutations.length, 1);
  assert.equal(proposal.proposedMutations[0].type, "html_update");
  assert.equal(proposal.proposedDocument.html, "<section><h1>Next HTML</h1></section>");
});

test("proposal with nextCss creates css_update mutation", () => {
  const proposal = createHtmlArtboardEditProposal(createHtmlArtboard(), {
    nextCss: "section { color: blue; }",
  });

  assert.equal(proposal.proposedMutations.length, 1);
  assert.equal(proposal.proposedMutations[0].type, "css_update");
  assert.equal(proposal.proposedDocument.css, "section { color: blue; }");
});

test("proposal with both html/css creates two mutations", () => {
  const proposal = createHtmlArtboardEditProposal(createHtmlArtboard(), {
    nextHtml: "<section>Both</section>",
    nextCss: "section { color: green; }",
  });

  assert.deepEqual(
    proposal.proposedMutations.map((mutation) => mutation.type),
    ["html_update", "css_update"]
  );
});

test("proposal with createFusionPatch creates fusion_patch_create mutation", () => {
  const proposal = createHtmlArtboardEditProposal(createHtmlArtboard(), {
    createFusionPatch: true,
  });

  assert.equal(proposal.proposedMutations.length, 1);
  assert.equal(proposal.proposedMutations[0].type, "fusion_patch_create");
  assert.equal(proposal.proposedDocument.fusionPatches.length, 1);
});

test("targeted fusion patch proposal includes selector/sourceText", () => {
  const proposal = createHtmlArtboardEditProposal(createHtmlArtboard(), {
    createFusionPatch: true,
    targetSelector: '[data-node="headline"]',
    targetSourceText: "Original",
    fusionPatchPrompt: "Mock patch headline",
  });
  const patch = proposal.proposedMutations[0].payload.patch;

  assert.equal(patch.selector, '[data-node="headline"]');
  assert.equal(patch.sourceSelector, '[data-node="headline"]');
  assert.equal(patch.sourceText, "Original");
  assert.equal(patch.prompt, "Mock patch headline");
});

test("proposal with no changes returns zero mutations", () => {
  const artboard = createHtmlArtboard();
  const proposal = createHtmlArtboardEditProposal(artboard, {
    instruction: "Inspect only",
  });

  assert.equal(proposal.proposedMutations.length, 0);
  assert.deepEqual(proposal.proposedDocument, artboard.runtimeDocument);
});

test("proposal does not mutate input htmlArtboard", () => {
  const artboard = createHtmlArtboard();
  const before = JSON.stringify(artboard);

  createHtmlArtboardEditProposal(artboard, {
    nextHtml: "<section>Mutate check</section>",
    createFusionPatch: true,
  });

  assert.equal(JSON.stringify(artboard), before);
});

test("proposal replayCheck ok for html update", () => {
  const proposal = createHtmlArtboardEditProposal(createHtmlArtboard(), {
    nextHtml: "<section>Replay HTML</section>",
  });

  assert.equal(proposal.replayCheck.ok, true);
  assert.equal(proposal.replayCheck.htmlMatches, true);
});

test("proposal replayCheck ok for css update", () => {
  const proposal = createHtmlArtboardEditProposal(createHtmlArtboard(), {
    nextCss: "section { color: purple; }",
  });

  assert.equal(proposal.replayCheck.ok, true);
  assert.equal(proposal.replayCheck.cssMatches, true);
});

test("proposal replayCheck ok for fusion patch create", () => {
  const proposal = createHtmlArtboardEditProposal(createHtmlArtboard(), {
    createFusionPatch: true,
  });

  assert.equal(proposal.replayCheck.ok, true);
  assert.equal(proposal.replayCheck.fusionPatchCountMatches, true);
});

test("diffSummary reports htmlChanged", () => {
  const proposal = createHtmlArtboardEditProposal(createHtmlArtboard(), {
    nextHtml: "<section>Changed</section>",
  });

  assert.equal(proposal.diffSummary.htmlChanged, true);
});

test("diffSummary reports cssChanged", () => {
  const proposal = createHtmlArtboardEditProposal(createHtmlArtboard(), {
    nextCss: "section { color: red; }",
  });

  assert.equal(proposal.diffSummary.cssChanged, true);
});

test("diffSummary reports fusionPatchCreated", () => {
  const proposal = createHtmlArtboardEditProposal(createHtmlArtboard(), {
    createFusionPatch: true,
  });

  assert.equal(proposal.diffSummary.fusionPatchCreated, true);
});

test("summarizeHtmlArtboardEditProposal handles zero changes", () => {
  const proposal = createHtmlArtboardEditProposal(createHtmlArtboard());

  assert.equal(
    summarizeHtmlArtboardEditProposal(proposal),
    "No dry-run changes proposed for html-artboard:proposal-test."
  );
});

test("summarizeHtmlArtboardEditProposal handles multiple mutations", () => {
  const proposal = createHtmlArtboardEditProposal(createHtmlArtboard(), {
    nextHtml: "<section>Multiple</section>",
    nextCss: "section { color: orange; }",
    createFusionPatch: true,
  });
  const summary = summarizeHtmlArtboardEditProposal(proposal);

  assert.equal(summary.includes("3 mutations"), true);
  assert.equal(summary.includes("html_update"), true);
  assert.equal(summary.includes("css_update"), true);
  assert.equal(summary.includes("fusion_patch_create"), true);
});
