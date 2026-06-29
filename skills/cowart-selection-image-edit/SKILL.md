---
name: cowart-selection-image-edit
description: Generate revised images from the currently selected Cowart source image or AI image frame plus selected annotation shapes. Use when the user says they selected the image and annotations on the Cowart canvas and wants Codex to apply those selected edits without the user providing a screenshot.
---

# Cowart Selection Image Edit

Use this skill when the user has selected the relevant Cowart canvas objects directly, such as:

- one source image or an `AI image` frame containing a generated image
- one or more selected annotation shapes, arrows, text notes, or marked regions
- a short chat request such as "apply my selected annotations", "edit the selected image", or "use what I selected"

This is the selection-driven alternative to screenshot-based annotation edits.

## Preconditions

The Cowart service should be running for the active project, usually at:

```text
http://127.0.0.1:43217
```

The selected Cowart objects are the authoritative edit brief. Do not ask the user for an annotation screenshot when the selected context contains a usable source image and readable annotation text.

## Workflow

1. Read the selected edit context.

   Prefer the Cowart MCP tool `get_cowart_selected_edit_context`:

   ```json
   {
     "projectDir": "/absolute/path/to/user/codex-project",
     "cowartUrl": "http://127.0.0.1:43217"
   }
   ```

   The tool returns:

   - `sourceAsset.localFilePath`: the clean page-local image file to use as the edit target
   - `sourceImageShape`: the selected image shape
   - `sourceFrameShape`: the containing AI image frame, when the source image is inside one
   - `anchorShapeId`: the preferred placement anchor for the revised image
   - `annotations`: selected annotation shapes, including readable text and arrow target points when available
   - `promptBrief`: a combined plain-text edit brief from the selected annotations
   - `warnings`: missing or ambiguous context

   If the tool is unavailable, fall back to `/api/selection` and `/api/canvas`, but keep the same behavior.

2. Validate the context.

   Continue without asking when there is exactly one usable source image and either:

   - selected annotations contain readable text, or
   - the user's chat message supplies the edit instruction.

   Ask a concise clarification only when:

   - no selected source image or AI image frame with an image can be found
   - multiple selected source images make the intended target ambiguous
   - the selected annotations have no readable text and the chat request does not say what to change
   - the source image is not a page-local Cowart asset and no clean local source file is available

3. Inspect the clean source image.

   Open `sourceAsset.localFilePath` with the local image viewer before generation so the clean image is visible as the image-edit target. Use the selected annotations only as edit instructions; do not include annotation arrows, labels, handles, or UI chrome in the output.

4. Record the source geometry before prompting.

   Derive and keep these values from the selected context and source image:

   - `sourcePixelWidth` and `sourcePixelHeight` from `sourceAsset.localFilePath`
   - `sourceAspectRatio = sourcePixelWidth / sourcePixelHeight`
   - `displayWidth` and `displayHeight` from `sourceFrameShape.bounds` when present, otherwise `sourceImageShape.bounds`
   - `displayAspectRatio = displayWidth / displayHeight`
   - each annotation target point as both page coordinates and relative percentages within the source image/frame

   The generated bitmap must preserve the source aspect ratio. Treat a mismatch over roughly 2% as a failed generation candidate unless the user explicitly requested a new size or format. Do not insert a mismatched bitmap by stretching it to the anchor size, because that changes the poster layout and can make annotated regions such as footer content appear smaller or displaced.

5. Build the generation prompt.

   The prompt should:

   - treat the clean source image as the visual base
   - apply `promptBrief` and any extra user chat instruction literally
   - use arrow `targetPoint` or annotation bounds to understand where each note applies
   - preserve the source image's overall subject, composition, exact aspect ratio, layout proportions, style, and important existing text unless an annotation asks to change it
   - explicitly include the source pixel dimensions, display dimensions, source aspect ratio, and relevant annotation target percentages
   - keep annotated localized edits at the same scale and position as the source unless the annotation says otherwise
   - output only the revised clean image
   - avoid red annotations, selection outlines, handles, toolbars, canvas background, and watermarks

6. Generate a new bitmap.

   Use the built-in image generation flow. Do not overwrite the source image file. Resolve the actual generated file carefully:

   - use the exact path returned by the image generation tool when available
   - otherwise use only a generated image whose timestamp proves it came from the current request
   - visually inspect the output and confirm it matches the selected edit brief
   - inspect the generated bitmap dimensions before insertion and compare its aspect ratio with `sourceAspectRatio`

   If the generated aspect ratio differs from the source by more than about 2%, regenerate once with stricter aspect-ratio instructions. If it still differs, either correct the canvas by cropping/padding to the source aspect ratio before insertion or report the mismatch instead of inserting a distorted candidate.

7. Insert the revised image beside the selected source.

   Prefer the Cowart MCP `insert_cowart_image` tool. Do not hand-write tldraw records unless the MCP tool is unavailable.

   Use:

   ```json
   {
     "imagePath": "/absolute/path/to/revised-image.png",
     "projectDir": "/absolute/path/to/user/codex-project",
     "cowartUrl": "http://127.0.0.1:43217",
     "anchorShapeId": "<context.anchorShapeId>",
     "placement": "right",
     "margin": 40,
     "matchAnchor": true,
     "fileName": "selection-edit-YYYYMMDD-HHMMSS.png",
     "shapeMeta": {
       "cowartGeneratedFromSelectionEdit": true
     },
     "altText": "Revised image generated from selected Cowart annotations"
   }
   ```

   If the source image is inside an AI image frame, `anchorShapeId` should be the frame so the new image is placed as a sibling beside the frame, not inside it.

8. Verify.

   Refresh the Cowart tab or let hot reload update it, then confirm:

   - the original image and selected annotations are still present
   - the revised image appears beside the selected source
   - the revised image does not include annotation arrows, labels, selection outlines, or UI chrome
   - the MCP insertion result includes a valid `shapeId`, `assetId`, saved asset path, page id, bounds, and fractional `index`
   - the inserted asset's natural aspect ratio matches the selected source image's aspect ratio closely enough that it does not need visible stretching to fit the anchor

## Guardrails

- Never replace, delete, move, hide, or reparent the selected source image or annotation shapes unless the user explicitly asks for replacement.
- Keep the selected canvas objects as the edit brief; do not scan unrelated canvas content for instructions.
- If selected annotations contradict each other, apply the most literal combined interpretation and mention the ambiguity.
- If the selected shapes only indicate a visual region but do not say what to change, ask for a short edit instruction instead of guessing.
