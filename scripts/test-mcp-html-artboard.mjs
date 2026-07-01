import assert from "node:assert/strict";

import {
  extractSelectedHtmlArtboards,
  isSelectedHtmlArtboardShape,
  summarizeSelectedHtmlArtboards,
} from "../mcp/htmlArtboardSelection.mjs";

function test(name, run) {
  run();
  console.log(`ok - ${name}`);
}

function createRuntimeDocument(overrides = {}) {
  return {
    id: "html-artboard:test",
    type: "cowart-html-artboard",
    version: 1,
    width: 720,
    height: 1280,
    html: "<section><h1>Test</h1></section>",
    css: "section { color: black; }",
    fusionPatches: [{ id: "patch:1", type: "fusion-patch" }],
    mutationLog: [{ id: "mutation:1", type: "html_update" }],
    renderFingerprint: "cowart-source-v1:test",
    ...overrides,
  };
}

function createHtmlArtboardShape(overrides = {}) {
  return {
    id: "shape:html-artboard",
    type: "frame",
    meta: {
      cowartHtmlArtboard: true,
      runtimeDocument: createRuntimeDocument(),
    },
    ...overrides,
  };
}

test("isSelectedHtmlArtboardShape returns true for selected HTML Artboard shape", () => {
  assert.equal(isSelectedHtmlArtboardShape(createHtmlArtboardShape()), true);
});

test("isSelectedHtmlArtboardShape returns false for normal shape", () => {
  assert.equal(
    isSelectedHtmlArtboardShape({
      id: "shape:normal",
      type: "frame",
      meta: {},
    }),
    false
  );
});

test("extractSelectedHtmlArtboards returns [] for empty selection", () => {
  assert.deepEqual(extractSelectedHtmlArtboards({ selectedShapes: [] }), []);
  assert.deepEqual(extractSelectedHtmlArtboards(null), []);
});

test("extractSelectedHtmlArtboards extracts one HTML Artboard", () => {
  const artboards = extractSelectedHtmlArtboards({
    selectedShapes: [createHtmlArtboardShape()],
  });

  assert.equal(artboards.length, 1);
  assert.equal(artboards[0].shapeId, "shape:html-artboard");
  assert.equal(artboards[0].shapeType, "frame");
  assert.equal(artboards[0].runtimeDocument.id, "html-artboard:test");
});

test("extractSelectedHtmlArtboards extracts multiple HTML Artboards", () => {
  const artboards = extractSelectedHtmlArtboards({
    selectedShapes: [
      createHtmlArtboardShape({ id: "shape:first" }),
      { id: "shape:normal", type: "frame", meta: {} },
      createHtmlArtboardShape({
        id: "shape:second",
        meta: {
          cowartHtmlArtboard: true,
          runtimeDocument: createRuntimeDocument({ id: "html-artboard:second" }),
        },
      }),
    ],
  });

  assert.equal(artboards.length, 2);
  assert.deepEqual(
    artboards.map((artboard) => artboard.shapeId),
    ["shape:first", "shape:second"]
  );
});

test("extracted runtimeDocument is cloned", () => {
  const shape = createHtmlArtboardShape();
  const artboards = extractSelectedHtmlArtboards({ selectedShapes: [shape] });

  artboards[0].runtimeDocument.html = "<section>Changed</section>";
  artboards[0].runtimeDocument.fusionPatches[0].id = "patch:changed";

  assert.equal(shape.meta.runtimeDocument.html, "<section><h1>Test</h1></section>");
  assert.equal(shape.meta.runtimeDocument.fusionPatches[0].id, "patch:1");
});

test("summary includes document id/type/version/width/height", () => {
  const [artboard] = extractSelectedHtmlArtboards({ selectedShapes: [createHtmlArtboardShape()] });

  assert.equal(artboard.summary.documentId, "html-artboard:test");
  assert.equal(artboard.summary.type, "cowart-html-artboard");
  assert.equal(artboard.summary.version, 1);
  assert.equal(artboard.summary.width, 720);
  assert.equal(artboard.summary.height, 1280);
});

test("summary includes fusionPatchCount", () => {
  const [artboard] = extractSelectedHtmlArtboards({ selectedShapes: [createHtmlArtboardShape()] });

  assert.equal(artboard.summary.fusionPatchCount, 1);
});

test("summary includes mutationCount", () => {
  const [artboard] = extractSelectedHtmlArtboards({ selectedShapes: [createHtmlArtboardShape()] });

  assert.equal(artboard.summary.mutationCount, 1);
});

test("summarizeSelectedHtmlArtboards handles zero", () => {
  assert.equal(summarizeSelectedHtmlArtboards([]), "No selected HTML Artboard.");
});

test("summarizeSelectedHtmlArtboards handles one", () => {
  const artboards = extractSelectedHtmlArtboards({ selectedShapes: [createHtmlArtboardShape()] });
  const summary = summarizeSelectedHtmlArtboards(artboards);

  assert.equal(summary.includes("Selected HTML Artboard: html-artboard:test"), true);
  assert.equal(summary.includes("720x1280"), true);
});

test("summarizeSelectedHtmlArtboards handles multiple", () => {
  const artboards = extractSelectedHtmlArtboards({
    selectedShapes: [createHtmlArtboardShape({ id: "shape:first" }), createHtmlArtboardShape({ id: "shape:second" })],
  });

  assert.equal(summarizeSelectedHtmlArtboards(artboards), "Selected 2 HTML Artboards.");
});
