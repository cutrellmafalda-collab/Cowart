function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function deepClone(value) {
  if (Array.isArray(value)) {
    return value.map((item) => deepClone(item));
  }

  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, deepClone(item)]));
  }

  return value;
}

function createRuntimeDocumentSummary(runtimeDocument) {
  return {
    documentId: typeof runtimeDocument.id === "string" ? runtimeDocument.id : null,
    type: typeof runtimeDocument.type === "string" ? runtimeDocument.type : null,
    version: runtimeDocument.version ?? null,
    width: Number.isFinite(runtimeDocument.width) ? runtimeDocument.width : null,
    height: Number.isFinite(runtimeDocument.height) ? runtimeDocument.height : null,
    htmlLength: typeof runtimeDocument.html === "string" ? runtimeDocument.html.length : 0,
    cssLength: typeof runtimeDocument.css === "string" ? runtimeDocument.css.length : 0,
    fusionPatchCount: Array.isArray(runtimeDocument.fusionPatches) ? runtimeDocument.fusionPatches.length : 0,
    mutationCount: Array.isArray(runtimeDocument.mutationLog) ? runtimeDocument.mutationLog.length : 0,
    renderFingerprint:
      typeof runtimeDocument.renderFingerprint === "string" ? runtimeDocument.renderFingerprint : null,
  };
}

export function isSelectedHtmlArtboardShape(shape) {
  return shape?.meta?.cowartHtmlArtboard === true && isRecord(shape.meta.runtimeDocument);
}

export function extractSelectedHtmlArtboards(selection) {
  const selectedShapes = Array.isArray(selection?.selectedShapes) ? selection.selectedShapes : [];

  return selectedShapes.filter(isSelectedHtmlArtboardShape).map((shape) => {
    const runtimeDocument = deepClone(shape.meta.runtimeDocument);

    return {
      shapeId: shape.id ?? null,
      shapeType: shape.type ?? null,
      runtimeDocument,
      summary: createRuntimeDocumentSummary(runtimeDocument),
    };
  });
}

export function summarizeSelectedHtmlArtboards(htmlArtboards) {
  const artboards = Array.isArray(htmlArtboards) ? htmlArtboards : [];

  if (artboards.length === 0) {
    return "No selected HTML Artboard.";
  }

  if (artboards.length === 1) {
    const artboard = artboards[0];
    const summary = artboard.summary ?? {};
    const id = summary.documentId ?? artboard.shapeId ?? "unknown";
    const size =
      Number.isFinite(summary.width) && Number.isFinite(summary.height)
        ? `${summary.width}x${summary.height}`
        : "unknown size";

    return `Selected HTML Artboard: ${id} (${size}, ${summary.fusionPatchCount ?? 0} fusion patches, ${
      summary.mutationCount ?? 0
    } mutations).`;
  }

  return `Selected ${artboards.length} HTML Artboards.`;
}
