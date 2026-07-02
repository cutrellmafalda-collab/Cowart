# Real AI Smoke Test Guide

This guide describes an optional, manual smoke test for real HTML Artboard FusionPatch generation.
It must not run automatically.

## 1. Safety Rules

- Do not commit API keys.
- Do not put API keys in `.env` unless the file is ignored locally.
- Do not paste API keys into Cowart browser UI.
- Do not upload sensitive canvas content unless the user has explicitly approved it.
- Do not upload `.codex/config.toml`, local paths, secrets, or the full Cowart canvas store.
- Real AI generation must use explicit confirmation.
- Stale `expectedRenderFingerprint`, `expectedMutationCount`, or `expectedFusionPatchCount` must refuse writes.

## 2. Configure A Key Locally

Set `OPENAI_API_KEY` only in your local shell environment.

PowerShell example:

```powershell
$env:OPENAI_API_KEY = "sk-..."
```

Before committing, confirm no key-bearing files are tracked:

```powershell
git status --short --untracked-files=all
```

Do not print the key back to the terminal.

## 3. Prepare Cowart

1. Run `npm run dev`.
2. Open Cowart.
3. Create or select an HTML Artboard frame.
4. Confirm the selected frame has `shape.meta.cowartHtmlArtboard === true`.
5. Confirm `shape.meta.runtimeDocument` exists.
6. Add at least one FusionPatch.
7. Set a clear FusionPatch prompt.
8. Refresh Canvas Preview once so the thumbnail and current fingerprint are easy to inspect.

## 4. Dry-Run Provider Payload Preview

First call the dry-run MCP tool:

```json
{
  "name": "propose_cowart_html_artboard_ai_fusion_patch_generation",
  "arguments": {
    "patchId": "patch-id-here",
    "provider": "openai",
    "model": "gpt-image-2",
    "size": "1024x1024",
    "quality": "auto",
    "includeProviderPayload": true
  }
}
```

Check:

- `dryRun` is `true`.
- `providerPayload` exists.
- `providerPayload` does not contain an API key.
- `providerPayload.prompt` references only the selected patch context.
- No canvas file is written.

## 5. Capture Safety Guards

Call `get_cowart_selected_html_artboard` and record:

- `runtimeDocument.id`
- `runtimeDocument.renderFingerprint`
- `runtimeDocument.mutationLog.length`
- `runtimeDocument.fusionPatches.length`

Use these as:

- `expectedDocumentId`
- `expectedRenderFingerprint`
- `expectedMutationCount`
- `expectedFusionPatchCount`

## 6. Optional Real Generation

Real API smoke testing is opt-in only.

Set:

```powershell
$env:COWART_ALLOW_REAL_AI_SMOKE_TEST = "true"
```

Then call:

```json
{
  "name": "generate_cowart_html_artboard_ai_fusion_patch_asset",
  "arguments": {
    "patchId": "patch-id-here",
    "provider": "openai",
    "model": "gpt-image-2",
    "size": "1024x1024",
    "quality": "auto",
    "outputFormat": "png",
    "confirmGenerate": true,
    "expectedDocumentId": "runtime-document-id-here",
    "expectedRenderFingerprint": "fingerprint-here",
    "expectedMutationCount": 0,
    "expectedFusionPatchCount": 1
  }
}
```

Do not run this unless you understand it can create provider cost.

## 7. Expected Success Result

On success:

- `saved` is `true`.
- `appliedCount` is at least `1`.
- The target patch has `patchAssetUrl`.
- The target patch has `patchAssetId`.
- The target patch has `status: "generated"`.
- The target patch has `provider: "openai"`.
- `mutationLog` includes `fusion_patch_ai_asset_generate`.
- HTML source is unchanged.
- CSS source is unchanged.
- Preview freshness becomes stale until refreshed.

After the call:

1. Select the HTML Artboard.
2. Inspect Runtime JSON.
3. Confirm `patchAssetUrl` exists.
4. Click `Refresh Canvas Preview`.
5. Confirm the canvas thumbnail shows generated patch indication.

## 8. Expected Failure Result

If `OPENAI_API_KEY` is missing:

- The tool returns `missing_api_key`.
- `saved` is `false`.
- `appliedCount` is `0`.
- No canvas snapshot is written.

If safety guards are stale:

- The tool refuses the write.
- `saved` is `false`.
- `appliedCount` is `0`.
- Refresh selection and retry only after reviewing the current runtime document.

If the provider fails after confirmation:

- The patch may be marked `failed`.
- The error is stored as provider diagnostics without exposing secrets.
- HTML/CSS must remain unchanged.

## 9. Rollback And Cleanup

If a generated patch is not useful:

1. Hide the patch from the FusionPatch UI, or
2. Delete the patch from the FusionPatch UI, or
3. Restore using git only for code changes, not local canvas data.

Do not reset or delete local canvas data as part of a smoke test.

## 10. Cost And Privacy Notes

- Real generation can cost money.
- Do not run batch tests accidentally.
- Do not upload sensitive artboards.
- Do not upload the entire Cowart canvas store.
- Current first real provider path is text-to-image patch generation.
- Region accuracy still depends on placeholder/manual region data.
- This is not a mask or image-edit pipeline yet.

## 11. Default Automation Policy

Automated test runs must skip real provider calls unless:

```text
COWART_ALLOW_REAL_AI_SMOKE_TEST=true
```

is explicitly set by the user.

Fake provider and fake transport tests remain the normal CI-safe path.
