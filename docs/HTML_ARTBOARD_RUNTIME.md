# HTML Artboard Runtime

Cowart is the host product and infinite canvas shell. It owns the product frame that lets a user work with local creative documents on a tldraw canvas.

## Cowart Responsibilities

Cowart remains responsible for:

- The tldraw canvas and shape store.
- Local canvas files.
- Selection state.
- View-state persistence.
- MCP integration.
- Local and canvas assets.

## Runtime Responsibilities

The HTML Artboard Runtime is a source document layer for future HTML/CSS visual artboards inside Cowart. Its document schema owns:

- `html`
- `css`
- `background`
- `fusionPatches`
- `assets`
- `mutationLog`
- `executionGraph`
- `renderFingerprint`

The runtime document is source-level data. It does not own Cowart UI state such as zoom, active tabs, selected selectors, or workspace layout.

## Phase 1 Scope

This phase only adds the runtime schema and source-level fingerprint helpers.

Current phase limits:

- No real AI connection.
- No MCP changes.
- No custom tldraw shape.
- No HTML preview.
- No `App.jsx` changes.
- No Cowart main UI integration.

## Document Shape

An HTML artboard document uses `type: "cowart-html-artboard"` and `version: 1`.

Required fields:

```js
{
  id,
  type,
  version,
  width,
  height,
  background,
  html,
  css,
  fusionPatches,
  assets,
  history,
  mutationLog,
  executionGraph,
  renderFingerprint,
  meta
}
```

The default provider metadata is `provider: "mock"` because this phase does not call a real AI provider.

## Render Fingerprint

`renderFingerprint` is a source-level fingerprint. It is not a pixel-level guarantee and does not assert browser rendering equivalence.

The fingerprint input includes:

- Background identity and background source metadata.
- HTML source.
- CSS source.
- Fusion patches.
- Width and height.
- Asset source metadata.

The existing `document.renderFingerprint` value is excluded from the fingerprint input so the hash does not depend on itself.
