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

Real image generation MCP tools should not call providers directly from Cowart.

Recommended tool sequence:

1. `get_cowart_html_artboard_fusion_patch_generation_request`
   - read-only
   - does not call a provider
   - returns a standard task package for Codex, ChatGPT, or an image generation skill

2. `generate_cowart_html_artboard_mock_fusion_patch_asset`
   - already exists
   - remains the safe local baseline

3. external image generation by Codex, ChatGPT, or a skill
   - happens outside Cowart
   - may produce a local image file or data URL
   - Cowart does not store provider keys or call provider APIs

4. `attach_cowart_html_artboard_fusion_patch_image`
   - requires `confirmApply=true`
   - requires expected safety guards
   - attaches an already-generated image to a FusionPatch
   - records mutationLog

All writes need safety guards. Stale fingerprints must refuse writes. Cowart should remain provider-agnostic.

## 12. Minimum Real AI Spike

The smallest external image-generation spike should only:

- select one existing FusionPatch
- use `patch.prompt`
- use `patch.region`
- use canvas thumbnail or standalone HTML preview as reference
- ask Codex, ChatGPT, or a skill to generate one PNG/WebP patch asset outside Cowart
- attach the resulting image with MCP
- write `patchAssetUrl`
- set `patch.status = "generated"`
- record `fusion_patch_external_asset_attach` in mutationLog
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

External image generation:

- may be networked
- paid or rate-limited
- higher latency
- can fail
- has safety/privacy concerns
- can produce large files
- needs asset storage rules

Migration steps:

1. Define generation request package.
2. Keep mock provider as local baseline.
3. Let external Codex, ChatGPT, or skill generate images.
4. Attach local image files through MCP with safety guards.
5. First external result writes only `patchAssetUrl` and metadata.
6. Do not auto-apply broader source edits.
7. Require full browser and MCP smoke tests.

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

## 16. Codex / Skill Image Generation Bridge

The OpenAI provider adapter direction has been superseded by the Codex / Skill Image Generation Bridge.

- Cowart creates image generation request packages.
- Codex, ChatGPT, or a skill performs image generation outside Cowart.
- Cowart receives a local image file or data URL and attaches it to a FusionPatch.
- Cowart does not store API keys.
- Cowart does not call OpenAI, Gemini, or image provider APIs directly.
- Cowart remains responsible for safety guards, mutationLog, asset attachment, and preview freshness.

This keeps provider credentials and provider execution outside the Cowart runtime.

## 17. Recommendation

Do not connect real AI yet.

Before real AI, do:

1. generation request package
2. external image attach tool
3. asset size limit / storage strategy
4. region strategy spike
5. failure-state UI for external attach
6. keep mock provider as local baseline

Recommended Phase 28:

**Image Generation Request Package**

Goal:

- return prompt, target, region, preview, output, and safety guards
- do not call real APIs
- let Codex, ChatGPT, or skills generate images externally
- keep Cowart provider-agnostic

## 18. Final Decision

- Cowart should not directly call real AI providers.
- Image generation should happen through Codex, ChatGPT, or skills outside Cowart.
- Cowart should accept generated assets through guarded MCP attach tools.
- Real provider credentials must stay outside Cowart.
- Mock provider remains the default.

## 19. HTML Compositor Direction

The external image bridge now applies to both FusionPatch assets and full-artboard backgrounds.

- Background image requests are read-only MCP packages.
- Background images are produced by Codex, ChatGPT, or a skill outside Cowart.
- Background attach writes only `runtimeDocument.background` and `background_asset_attach`.
- HTML and CSS remain editable source layers.
- FusionPatch assets remain local overlay layers.
- Canvas preview composes background + HTML/CSS + FusionPatch overlays.

This supports the Cowart HTML Compositor direction without putting provider credentials or direct provider calls inside Cowart.
