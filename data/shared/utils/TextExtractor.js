/**
 * Extract text content from Claude API message.content
 * Deduplicates logic previously in compactionUtils.js:20-26, categoryUtils.js:69-76, tokenBreakdownUtils.js:58-73
 *
 * @param {string|Array} content - Message content (string or array of content blocks)
 * @returns {string} Extracted text
 *
 * @example
 * extractTextContent('Simple string') // Returns 'Simple string'
 * extractTextContent([
 *   { type: 'text', text: 'Block 1' },
 *   { type: 'text', text: 'Block 2' }
 * ]) // Returns 'Block 1 Block 2'
 */
function extractTextContent(content) {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .filter(c => c && c.type === 'text')
      .map(c => c.text || '')
      .join(' ');
  }

  return '';
}

module.exports = { extractTextContent };
