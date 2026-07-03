# Codex Image Generation Workflow

This document describes the HTML Artboard FusionPatch image-generation bridge.

Cowart does not call OpenAI, Gemini, or any image provider API directly. Cowart prepares a generation request package, an external executor such as Codex, ChatGPT, or an image-generation skill creates the image, and Cowart attaches the generated local image back to the selected FusionPatch through MCP.

The same bridge also supports full-artboard background images. Cowart can prepare a no-text background generation request, an external executor creates the background, and Cowart attaches the local image as `runtimeDocument.background` without changing HTML or CSS.

## Workflow

1. Open Cowart and select an HTML Artboard frame.
2. Create or select a FusionPatch target from a `data-node` patch target.
3. Call MCP tool `get_cowart_html_artboard_fusion_patch_generation_request`.
4. Codex, ChatGPT, or an image-generation skill reads the request package.
5. The external executor generates the patch image.
6. Save the generated image to a local file, for example `/tmp/cowart-generated/patch-headline.png`.
7. Call MCP tool `attach_cowart_html_artboard_fusion_patch_image`.
8. Pass `confirmApply=true` plus the expected safety guards from the request package.
9. Refresh Canvas Preview in Cowart.
10. Confirm the FusionPatch has `patchAssetUrl`, `status: "generated"`, and the canvas thumbnail shows the attached image or generated indication.

## No API Key In Cowart

- Cowart does not save API keys.
- Cowart does not directly call OpenAI, Gemini, or image provider APIs.
- Provider credentials stay outside Cowart, in the external executor that generates the image.
- Cowart only receives a finished local image file and attaches it to a FusionPatch.
- Runtime documents must not store local absolute paths or secrets.

## Safety

All write operations use explicit confirmation and optimistic guards.

- `confirmApply=true` is required before Cowart copies an image file or saves a canvas snapshot.
- `expectedDocumentId` must match when provided.
- `expectedRenderFingerprint` must match when provided.
- `expectedMutationCount` must match when provided.
- `expectedFusionPatchCount` must match when provided.
- A stale expected value rejects the attach and saves nothing.
- Existing `patchAssetUrl` is not overwritten unless `allowOverwrite=true`.
- HTML and CSS are never silently modified by image generation.
- The attach operation records `fusion_patch_external_asset_attach` in `mutationLog`.

## Prompt Format

Use the `suggestedImagePrompt` returned by `get_cowart_html_artboard_fusion_patch_generation_request` as the base prompt. A good prompt keeps the generated image scoped to the patch region and avoids rewriting the artboard source.

Template:

```text
Generate only a patch asset for a Cowart HTML Artboard FusionPatch.

Patch prompt:
<patch.prompt>

Target:
- selector: <selector>
- source text: <sourceText>
- region: x=<x>, y=<y>, w=<w>, h=<h>
- artboard size: <width>x<height>

Requirements:
- The image should fit the provided region.
- Transparent background preferred: <true|false>.
- Do not modify HTML/CSS.
- Do not produce a full poster or full page replacement.
- Keep the result usable as an overlay patch asset.
```

## Manual Test

1. Run `npm run dev`.
2. Open Cowart.
3. Select an HTML Artboard frame.
4. Create or select a FusionPatch with a region and prompt.
5. Call `get_cowart_html_artboard_fusion_patch_generation_request`.
6. Copy the returned `suggestedImagePrompt`.
7. Generate an image externally with Codex, ChatGPT, or an image-generation skill.
8. Save the generated image as a local PNG, JPEG, or WebP.
9. Call `attach_cowart_html_artboard_fusion_patch_image` with:
   - `patchId`
   - `imagePath`
   - `provider`, for example `codex-image-gen`
   - `generationRequest`
   - `confirmApply: true`
   - `expectedDocumentId`
   - `expectedRenderFingerprint`
   - `expectedMutationCount`
   - `expectedFusionPatchCount`
10. Confirm the MCP result has `saved: true` and `appliedCount >= 1`.
11. Call `get_cowart_selected_html_artboard`.
12. Confirm the target FusionPatch has:
   - `patchAssetId`
   - `patchAssetUrl`
   - `status: "generated"`
   - `provider`
   - `meta.generationRequest`
   - `meta.externalImage`
13. Confirm `runtimeDocument.html` and `runtimeDocument.css` are unchanged.
14. Confirm `mutationLog` contains `fusion_patch_external_asset_attach`.
15. In Cowart, verify Canvas Preview Status is stale.
16. Click Refresh Canvas Preview.
17. Confirm the canvas thumbnail updates.

## Background Image Workflow

Use this flow when the artboard needs a visual background layer but the HTML/CSS text must stay editable.

1. Select an HTML Artboard frame.
2. Call `get_cowart_html_artboard_background_generation_request`.
3. Use the returned `suggestedImagePrompt` to generate a no-text background externally.
4. Save the generated image as a local PNG, JPEG, or WebP.
5. Call `attach_cowart_html_artboard_background_image` with:
   - `imagePath`
   - `provider`, for example `codex-image-gen`
   - `generationRequest`
   - `confirmApply: true`
   - `expectedDocumentId`
   - `expectedRenderFingerprint`
   - `expectedMutationCount`
   - `expectedFusionPatchCount`
6. Confirm the MCP result has `saved: true` and `appliedCount >= 1`.
7. Confirm `runtimeDocument.background` has:
   - `type: "image"`
   - `backgroundAssetId`
   - `backgroundAssetUrl`
   - `status: "generated"`
   - `provider`
8. Confirm `runtimeDocument.html` and `runtimeDocument.css` are unchanged.
9. Confirm `mutationLog` contains `background_asset_attach`.
10. Refresh Canvas Preview to see the background behind the HTML layer and FusionPatch overlays.

This creates the compositor stack:

```text
background image
+ editable HTML/CSS layer
+ FusionPatch image/overlay layer
```

## Failure Handling

- If no HTML Artboard is selected, the MCP tools return no requests or no applied changes.
- If `patchId` does not exist, attach is rejected.
- If `imagePath` is not a local file, attach is rejected.
- If the file is not PNG, JPEG, or WebP, attach is rejected.
- If an expected safety guard is stale, attach is rejected.
- If the patch already has `patchAssetUrl`, attach is rejected unless `allowOverwrite=true`.
- Failed attach attempts must not modify HTML, CSS, unrelated shapes, or unselected HTML Artboards.

## Current Limitations

- Cowart does not generate images by itself.
- The external executor is responsible for any provider-specific cost, latency, and safety policy.
- SVG external image attach is intentionally not allowed in the first version.
- Region coordinates are still manual or placeholder data; Cowart does not perform DOM measurement for generation.
- The canvas thumbnail remains a preview, not a pixel-perfect renderer.
