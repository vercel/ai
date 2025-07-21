/**
 * Extracts JSON content from reasoning model responses by finding content after </think> tag
 * More robust implementation that handles markdown code fences and multiple think sections
 *
 * @see https://docs.perplexity.ai/guides/structured-outputs#structured-outputs-for-reasoning-models
 */
export function extractJSONFromReasoningResponse(text: string): string {
  // Find the index of the closing </think> tag.
  const marker = '</think>';
  const idx = text.lastIndexOf(marker);

  if (idx === -1) {
    // No </think> tag found, return original text as-is
    return text.trim();
  }

  // Extract the substring after the marker.
  let jsonStr = text.substring(idx + marker.length).trim();

  // Remove markdown code fence markers if present.
  if (jsonStr.startsWith('```json')) {
    jsonStr = jsonStr.substring('```json'.length).trim();
  }
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.substring(3).trim();
  }
  if (jsonStr.endsWith('```')) {
    jsonStr = jsonStr.substring(0, jsonStr.length - 3).trim();
  }

  return jsonStr;
}
