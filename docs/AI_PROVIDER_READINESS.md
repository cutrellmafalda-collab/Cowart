# AI Provider Readiness Assessment

## 1. Current Runtime Capability

Cowart now has the core HTML Artboard runtime pieces needed for a mock AI pipeline:

- HTML Artboard frame on the tldraw canvas
- `shape.meta.runtimeDocument` as the current runtime document source
- HTML/CSS source viewing, copying, and textarea editing
- right-side preview plus canvas preview thumbnail
- preview freshness tracking
- FusionPatch v1 schema
- FusionPatch management UI for create, show/hide, rename, prompt, region, and delete
- mock FusionPatch overlay in the canvas thumbnail
- deterministic mock patch asset pipeline
- mutationLog recording for source edits, patch edits, mock asset generation, and related actions
- pure runtime replay reducer
- MCP read, dry-run proposal, apply, FusionPatch proposal/apply, and mock asset generation tools
- optimistic safety guards for MCP writes

This means Cowart already has most prerequisites for a mock AI pipeline: target selection, patch records, mutation logging, dry-run/apply split, canvas preview feedback, and MCP control. It does not yet have a real AI provider.

## 2. What Real AI Should Do

Real AI should not directly overwrite HTML/CSS source. It should operate through FusionPatch records.

Real AI should:

- generate a patch image from selector, sourceText, region, and prompt
- output `patchAssetUrl` and `patchAssetId`
- optionally output `maskAssetId`
- write results into the target FusionPatch
- record mutationLog entries
- update preview freshness state
- preserve the original HTML/CSS source

Real AI should not:

- silently overwrite `runtimeDocument.html`
- silently overwrite `runtimeDocument.css`
- bypass mutationLog
- bypass safety guards
- bypass dry-run / `confirmApply`
- write the canvas snapshot directly instead of going through runtime helpers

## 3. Provider Input Contract

Recommended provider input:

```json
{
  "document": {},
  "patch": {},
  "target": {
    "selector": "[data-node=\"headline\"]",
    "sourceText": "Headline text",
    "region": { "x": 80, "y": 80, "w": 240, "h": 120 }
  },
  "prompt": "Make this region feel brighter.",
  "preview": {
    "thumbnailDataUrl": "data:image/svg+xml...",
    "renderFingerprint": "cowart-source-v1:..."
  },
  "constraints": {
    "width": 240,
    "height": 120,
    "transparentBackground": true,
    "preserveTextEditability": true,
    "doNotModifyHtml": true,
    "doNotModifyCss": true
  },
  "providerOptions": {
    "model": "provider-model-name",
    "seed": null,
    "quality": "standard",
    "timeoutMs": 60000
  }
}
```

- `document` is the HTML Artboard runtimeDocument.
- `patch` is the target FusionPatch.
- `region` currently comes from placeholder/manual data; later it can come from DOM measurement.
- The preview thumbnail can be a reference image, but it is not pixel-perfect truth.
- `preserveTextEditability` is a core constraint: AI output should layer onto a patch asset, not destroy editable source.

## 4. Provider Output Contract

Recommended provider output:

```json
{
  "ok": true,
  "provider": "mock-or-real-provider",
  "model": "model-name",
  "seed": null,
  "patchAssetId": "asset-id",
  "patchAssetUrl": "data:image/png;base64,...",
  "maskAssetId": null,
  "width": 240,
  "height": 120,
  "mimeType": "image/png",
  "promptUsed": "Make this region feel brighter.",
  "cost": null,
  "durationMs": 1200,
  "warnings": [],
  "error": null
}
```

- If `ok` is false, the runtime must not write `patchAssetUrl`.
- On success, `patch.status` should become `"generated"`.
- On failure, `patch.status` should become `"failed"`.
- Provider metadata must be preserved.
- Provider output must never directly replace HTML/CSS.

## 5. Asset Storage Strategy

Short term:

- `patchAssetUrl` can be a data URL.
- This is suitable for MVP and mirrors the current mock asset pipeline.
- The drawback is that `runtimeDocument` can become large.

Medium term:

- Store provider outputs as page-local asset files.
- Candidate layout:
  `canvas/pages/<page-id>/html-artboards/<document-id>/patches/<patch-id>.png`
- `runtimeDocument` should store only `assetId` and a relative URL.

Long term:

- Add an asset manifest.
- Add patch asset cache metadata.
- Preserve provider result metadata.
- Add cleanup / garbage collection for unused patch assets.

Recommendation: before real AI, Cowart should either support a page-local asset adapter or define a strict data URL size limit.

## 6. Mask Strategy

Cowart does not yet have a real mask pipeline.

Possible mask sources:

A. Region rectangle mask

- Uses `patch.region` as a rectangular mask.
- Simple and easy to reason about.
- Not precise.

B. DOM element raster mask

- Uses selector rendering to identify the element region.
- Closer to local visual editing.
- Requires DOM measurement and screenshot/render infrastructure.

C. User painted mask

- Lets users manually paint a mask.
- Better for advanced use, but not needed for the first version.

D. AI generated mask

- Lets the provider infer segmentation.
- Higher risk and not appropriate for the first version.

Recommendation for v1: rectangle mask based on `patch.region`, transparent PNG/WebP patch output, no complex segmentation.

## 7. Region Strategy

Current regions come from placeholder/manual input.

Future region sources can include:

- manual `patch.region`
- data-node estimated region
- preview iframe DOM measurement
- canvas thumbnail coordinate mapping
- a custom renderer
- a future custom tldraw shape util

Recommended route:

1. Keep manual region first.
2. Spike preview iframe DOM measurement.
3. Add region-to-thumbnail mapping.
4. Consider custom shape util only after the rendering and asset strategy are stable.

## 8. Security Strategy

- iframe preview must remain sandboxed.
- iframe preview must not allow scripts.
- standalone HTML should keep CSP that blocks scripts.
- AI providers should not receive sensitive local files unless the user explicitly agrees.
- Provider payloads should be minimized.
- Do not upload the full Cowart canvas store.
- Upload only the necessary runtimeDocument, preview, region, and prompt.
- Do not upload `.codex/config.toml`.
- Do not upload secrets.
- Do not upload local paths.
- Provider results must be validated for MIME type and size.
- `patchAssetUrl` must not execute scripts.
- SVG provider output is risky; real AI output should prefer PNG/WebP.

## 9. Cost / Timeout / Failure Strategy

- Provider calls must have timeouts.
- Provider calls must be cancellable.
- Expensive generation should show a cost warning.
- Failure must not corrupt `runtimeDocument`.
- Failure should set `patch.status = "failed"`.
- Failure may write a mutationLog diagnostic.
- Do not retry forever.
- Preserve provider error messages and diagnostics.
- Dry-run stages must not incur cost.
- `confirmApply` or a similarly explicit confirmation should be required before paid provider calls.

## 10. UX Strategy

The first real AI UI should be conservative:

- user selects a FusionPatch
- user edits prompt
- user clicks Generate AI Patch
- patch shows pending status
- on success, patch preview appears
- user refreshes canvas preview
- user can hide, delete, or regenerate
- HTML/CSS are not automatically replaced
- mock patches are not automatically deleted
- existing `patchAssetUrl` is not overwritten unless the user confirms regenerate

## 11. MCP Strategy

Real AI MCP tools should not start with broad write permission.

Recommended tool sequence:

1. `propose_cowart_html_artboard_ai_fusion_patch`
   - dry-run
   - does not call provider
   - returns provider payload preview

2. `generate_cowart_html_artboard_mock_fusion_patch_asset`
   - already exists
   - remains the safe local baseline

3. `generate_cowart_html_artboard_ai_fusion_patch_asset`
   - requires `confirmGenerate=true`
   - requires expected safety guards
   - includes cost warning
   - includes timeout
   - requires explicit provider

4. `apply_cowart_html_artboard_ai_fusion_patch_asset`
   - useful if generation and application are separated
   - must require explicit confirmation

All writes need safety guards. All provider calls need explicit confirmation. Stale fingerprints must refuse writes.

## 12. Minimum Real AI Spike

The smallest real AI spike should only:

- select one existing FusionPatch
- use `patch.prompt`
- use `patch.region`
- use canvas thumbnail or standalone HTML preview as reference
- call a provider to generate one PNG/WebP patch asset
- write `patchAssetUrl`
- set `patch.status = "generated"`
- record `fusion_patch_ai_asset_generate` in mutationLog
- let the preview thumbnail show generated patch indication

The first spike should not do:

- automatic region detection
- automatic mask generation
- automatic selector detection
- automatic HTML/CSS modification
- batch variants
- custom shape util
- pixel-perfect export
- OCR
- complex compositing

## 13. Mock-to-Real Migration Plan

Current mock provider:

- deterministic SVG
- no cost
- local only
- instant

Real provider:

- networked
- paid or rate-limited
- higher latency
- can fail
- has safety/privacy concerns
- can produce large files
- needs asset storage rules

Migration steps:

1. Define provider interface.
2. Validate provider payloads.
3. Add dry-run provider request preview.
4. Keep mock provider as default.
5. Hide real provider behind an explicit flag.
6. First real generation writes only `patchAssetUrl`.
7. Do not auto-apply broader source edits.
8. Require full browser and MCP smoke tests.

## 14. Risks

- Real AI output quality is unpredictable.
- Text inside generated images may deform.
- Patch visuals may not match HTML/CSS source.
- Data URLs can become too large.
- Provider calls can fail.
- Cost can become hard to predict.
- Provider payloads can leak private content if not minimized.
- SVG/script output can create security risks.
- Stale documents can overwrite newer user work if guards are skipped.
- Region data may be inaccurate.
- SVG `foreignObject` rendering differs by environment.
- Patch overlay and final export may diverge.

## 15. Phase 28 Provider Interface

Phase 28 introduces a provider interface layer for HTML Artboard FusionPatch generation.

- Provider request and result structures exist.
- The default provider is still `"mock"`.
- The mock provider adapts the existing deterministic mock FusionPatch asset pipeline.
- No real AI provider is called.
- No API keys are read.
- No network requests are made.
- Real providers remain future explicit opt-in work.

This phase is a preparation step only. It makes the future provider boundary clearer without changing Cowart's current safety posture.

## 16. Recommendation

Do not connect real AI yet.

Before real AI, do:

1. provider interface abstraction
2. AI provider dry-run payload preview
3. asset size limit / storage strategy
4. region strategy spike
5. failure-state UI
6. cost / timeout / cancellation policy
7. keep mock provider as default

Recommended Phase 28:

**AI Provider Interface + Mock Provider Adapter**

Goal:

- define provider interface
- continue using only mock provider
- do not call real APIs
- make future real providers pluggable

## 17. Final Decision

- Cowart can now enter AI provider interface design.
- Cowart should not directly call real AI yet.
- Real AI provider integration must come after provider interface, asset strategy, safety strategy, and failure handling.
- Mock provider remains the default.
- Real provider must be explicit opt-in.
