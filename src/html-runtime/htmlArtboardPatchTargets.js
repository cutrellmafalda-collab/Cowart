import { ensureHtmlArtboardDocument } from './htmlCanvasDocument.js'

const DATA_NODE_OPEN_TAG_PATTERN =
  /<([a-zA-Z][\w:-]*)([^>]*\sdata-node\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))[^>]*)>/g

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function stripHtmlTags(value) {
  return value
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
}

function decodeBasicEntities(value) {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function normalizeText(value) {
  return decodeBasicEntities(stripHtmlTags(value)).replace(/\s+/g, ' ').trim()
}

function createTargetLabel(dataNode, text) {
  if (!text) return dataNode

  const summary = text.length > 48 ? `${text.slice(0, 45)}...` : text
  return `${dataNode} - ${summary}`
}

function getElementContent(html, tagName, openTag, contentStartIndex) {
  if (openTag.endsWith('/>')) return ''

  const closePattern = new RegExp(`</${escapeRegExp(tagName)}\\s*>`, 'i')
  const remainingHtml = html.slice(contentStartIndex)
  const closeMatch = remainingHtml.match(closePattern)

  return closeMatch ? remainingHtml.slice(0, closeMatch.index) : ''
}

export function createSelectorForDataNode(dataNode) {
  if (typeof dataNode !== 'string') return null

  const value = dataNode.trim()
  if (!value) return null

  return `[data-node="${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`
}

export function extractHtmlArtboardPatchTargets(document) {
  const runtimeDocument = ensureHtmlArtboardDocument(document)
  const targets = []

  for (const match of runtimeDocument.html.matchAll(DATA_NODE_OPEN_TAG_PATTERN)) {
    const [openTag, tagName, , doubleQuotedDataNode, singleQuotedDataNode, unquotedDataNode] = match
    const dataNode = doubleQuotedDataNode ?? singleQuotedDataNode ?? unquotedDataNode ?? ''
    const normalizedDataNode = dataNode.trim()
    const selector = createSelectorForDataNode(normalizedDataNode)
    if (!selector) continue

    const content = getElementContent(
      runtimeDocument.html,
      tagName,
      openTag,
      match.index + openTag.length
    )
    const text = normalizeText(content)

    targets.push({
      id: selector,
      dataNode: normalizedDataNode,
      selector,
      tagName: tagName.toLowerCase(),
      text,
      sourceText: text,
      label: createTargetLabel(dataNode, text)
    })
  }

  return targets
}
