# HTML Artboard Shape Strategy

## 1. Current State

Cowart currently represents an HTML Artboard as an ordinary tldraw frame shape. The HTML Artboard runtime document is stored on `shape.meta.runtimeDocument`, and the frame remains compatible with the existing Cowart canvas, selection, persistence, assets, and view-state flow.

The right side panel currently owns the HTML Artboard experience: read-only preview, source inspection, HTML/CSS editing, export helpers, FusionPatch list, Patch Targets, and Mutation Log. MCP can read the currently selected HTML Artboard runtime document through a read-only tool.

Current boundaries:

- No custom shape util.
- No real HTML rendering inside the canvas shape.
- No real AI provider.
- No real mask or patch image pipeline.
- No replay or executionGraph implementation.

## 2. Product Goal

Cowart should remain the infinite-canvas host product. HTML Artboard should become a visual runtime object inside Cowart, with editable HTML/CSS, replayable mutations, future FusionPatch composition, export, and agent access.

The long-term system should let AI and external agents read, edit, generate, fuse, and export HTML Artboards without breaking the underlying HTML/CSS source. FusionPatch should layer local visual changes without corrupting the base source document. Mutation Log and a future executionGraph should make edits replayable and inspectable. MCP should remain the agent entry point, but writes should eventually go through the runtime mutation model rather than raw document overwrite.

## 3. Strategy A: Frame + Side Panel

This is the current strategy. Cowart uses a normal tldraw frame, stores `runtimeDocument` in shape meta, and keeps preview/edit/export controls in the side panel. The canvas itself shows the frame shell.

Advantages:

- Simple implementation.
- Compatible with existing tldraw frame behavior.
- Low risk.
- No custom shape util needed.
- Does not disturb existing Cowart tools.
- Persistence already works.
- MCP can already read the selected runtime document.
- Good fit for MVP, schema validation, editing, mutation, export, and MCP verification.

Disadvantages:

- The canvas does not show real HTML content.
- Users must select a frame to see the preview.
- Multiple artboards are hard to compare visually.
- The experience does not yet feel like a final design product.

Recommended use: current and near-term work while the runtime model continues to stabilize.

## 4. Strategy B: Frame + Side Preview + Generated Thumbnail

This strategy keeps the ordinary frame and side panel, but generates a preview thumbnail after HTML/CSS changes. The frame would display a thumbnail image or lightweight placeholder while the runtime document remains in meta or a related document asset.

Advantages:

- More visual than the current frame-only shell.
- Avoids a full custom shape util.
- Allows multiple artboards to be browsed on the canvas.
- Can become a stepping stone toward PNG, SVG, thumbnail, or renderer pipelines.

Disadvantages:

- The thumbnail is not a live DOM.
- Edits require thumbnail regeneration.
- A screenshot or rendering pipeline increases complexity.
- Asset management becomes more important.
- It still does not allow direct DOM editing on the canvas.

Recommended use: medium-term experiment after replay and renderer boundaries are clearer.

## 5. Strategy C: iframe Overlay Preview

This strategy keeps the frame as the tldraw shape but places an iframe or HTML preview layer over the canvas for selected or visible HTML Artboards. The iframe is a React overlay, not necessarily a tldraw shape.

Advantages:

- The canvas can show real HTML output.
- It can reuse the existing preview `srcDoc` logic.
- It avoids immediate custom shape util work.
- It gives a truer CSS rendering experience.

Disadvantages:

- Synchronizing overlay position with tldraw camera, zoom, and selection is complex.
- Pointer events and selection behavior are easy to get wrong.
- Sandbox security must stay strict.
- Rendering many artboards at once may be expensive.
- Overlay layering may not match tldraw export or hit testing.

Recommended use: medium-term prototype only, after the runtime is stable enough to justify preview-on-canvas experiments.

## 6. Strategy D: Custom tldraw Shape Util

This strategy implements HTML Artboard as a first-class custom tldraw shape. The shape could render HTML/CSS preview internally and eventually support dedicated interactions, scaling, exports, and region selection.

Advantages:

- Best product experience.
- Makes HTML Artboard a first-class canvas object.
- Supports multiple artboards visible at once.
- Enables dedicated interactions.
- Closest to the long-term product shape.

Disadvantages:

- Highest technical risk.
- Tightly couples the runtime to tldraw shape lifecycle.
- HTML/CSS sandboxing becomes more complex.
- Preview, editing state, hit testing, persistence, migration, and export all need careful design.
- Can affect performance.
- Too early while runtime schema, replay, renderer, and asset strategy are still moving.

Recommended use: later phase, after schema, editing, mutation, MCP, export, preview, replay, and renderer boundaries are stable.

## 7. Strategy E: Separate Renderer / Export Pipeline

This strategy keeps a renderer separate from Cowart UI. It renders a runtime document for standalone HTML, thumbnails, future PNG export, and future AI patch/mask pipelines.

Advantages:

- Good fit for export.
- Good fit for thumbnails.
- Useful for future AI patch and mask generation.
- Can be tested separately from tldraw UI.
- Keeps renderer concerns out of Cowart's canvas shell.

Disadvantages:

- Requires renderer design and test coverage.
- Fonts, CSS, browser differences, and asset loading affect consistency.
- Pixel-level deterministic rendering is difficult.
- Requires a clearer asset strategy.

Recommended use: medium-to-long term. This should likely happen before real AI patch generation or PNG export.

## 8. Storage Strategy

### Option 1: `shape.meta.runtimeDocument`

Advantages:

- Already works.
- Simple.
- Saved with the tldraw snapshot.
- MCP selection can read it directly.

Disadvantages:

- Large documents make shape meta heavy.
- Snapshot size grows as HTML/CSS, assets, patches, and mutation history grow.
- It is not ideal for large projects or many generated assets.

### Option 2: `shape.meta.runtimeDocumentRef` + page-local document file

Advantages:

- Better for large projects.
- Runtime documents can be versioned and managed separately.
- Assets and patches can be organized more cleanly.
- Better foundation for future AI-generated assets.

Disadvantages:

- Requires filesystem and migration logic.
- UI and MCP need another read step.
- More initial complexity.

Recommendation: keep `shape.meta.runtimeDocument` in the short term. Introduce `runtimeDocumentRef` and page-local document files only after runtime behavior, replay, export, and asset handling are stable.

Phase 18 introduces pure `runtimeDocumentRef` helpers as a storage spike only. No migration is performed, no files are read or written, and inline `shape.meta.runtimeDocument` remains the current source of truth. The document ref is future-facing: a later migration should be explicit, reversible, and able to keep inline data until the new storage path has been proven safe.

Possible future file layout:

```text
canvas/pages/<page-id>/html-artboards/<document-id>.json
```

## 9. Security Strategy

HTML Artboard preview and export must continue to treat user HTML as untrusted source.

Required boundaries:

- iframe preview must remain sandboxed.
- Do not allow `allow-scripts`.
- Standalone HTML export should include CSP that blocks scripts.
- Do not execute JavaScript from user HTML.
- The editor should preserve source text, but preview and export must limit execution capability.
- External asset policy should be designed separately before opening broader resource access.

## 10. MCP Strategy

The current MCP read-only access is the right boundary. It lets agents inspect selected HTML Artboards without modifying canvas or runtime state.

Future MCP writing should wait until the mutation and replay model is stable. MCP writes should create runtime mutations instead of directly overwriting documents.

Possible future MCP tools:

- Read selected HTML Artboard.
- Propose source edit.
- Apply source mutation.
- Create FusionPatch placeholder.
- Later generate AI patch.

Recommendation after Phase 12: do not immediately open MCP writes. First define dry-run proposal and replay semantics.

## 11. AI/Fusion Strategy

Current FusionPatch is only schema plus mock placeholder. Real AI requires more foundation:

- Selector target.
- Region estimation.
- Preview or renderer screenshot.
- Mask asset.
- Patch image asset.
- Provider metadata.
- Fusion patch overlay rendering.

AI should not corrupt base HTML/CSS source. Real provider integration should come after renderer and asset strategy are clearer.

## 12. Recommended Roadmap

### Near-Term

1. Keep frame + side panel.
2. Strengthen source editing.
3. Strengthen mutationLog.
4. Strengthen FusionPatch schema.
5. Strengthen export helpers.
6. Keep MCP read-only.
7. Keep this shape strategy document current.

### Next

1. Runtime replay reducer.
2. MCP dry-run edit proposal.
3. Generated thumbnail experiment.
4. Standalone renderer hardening.
5. FusionPatch overlay preview.
6. `runtimeDocumentRef` storage experiment.

### Later

1. Custom shape util.
2. Real AI provider.
3. Mask and patch image pipeline.
4. Pixel/render export pipeline.
5. Batch variants.

## 13. Final Recommendation

Do not implement a custom tldraw shape util yet.

The recommended current strategy is:

- Ordinary tldraw frame.
- `shape.meta.runtimeDocument`.
- Side panel preview/editor/export.
- Read-only MCP access.

Recommended priority for upcoming work:

1. Runtime replay reducer.
2. MCP dry-run edit proposal.
3. Generated thumbnail experiment.
4. Custom shape util.
5. Real AI provider.

The next phase should not be real AI. The best next step is a runtime replay reducer, because it makes mutationLog meaningful, reduces the risk of future MCP writes, and gives FusionPatch and AI work a safer execution model.
