/**
 * Checks if the given model ID is a Mistral model.
 * Mistral models on Bedrock are prefixed with 'mistral.' or region-prefixed like 'us.mistral.'.
 */
export function isMistralModel(modelId: string): boolean {
  return modelId.includes('mistral.');
}

const TOOL_CALL_ID_CHARSET =
  '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Deterministically maps an arbitrary string to exactly 9 alphanumeric
 * characters: a 53-bit hash (cyrb53) encoded as base62.
 *
 * 62^9 exceeds the 2^53 hash range, so each hash maps to a distinct 9-character
 * string, preserving all ~53 bits of entropy.
 */
function hashToNineAlphanumericChars(input: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 =
    Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 =
    Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  let value = 4294967296 * (2097151 & h2) + (h1 >>> 0);

  let result = '';
  for (let i = 0; i < 9; i++) {
    result = TOOL_CALL_ID_CHARSET[value % 62] + result;
    value = Math.floor(value / 62);
  }
  return result;
}

/**
 * Normalizes a tool call ID for Mistral models.
 *
 * Mistral models require tool call IDs to match the regex `^[a-zA-Z0-9]{9}$`:
 * - Exactly 9 characters
 * - Alphanumeric only (no underscores, hyphens, or other characters)
 *
 * Bedrock generates tool call IDs in formats like `tooluse_bpe71yCfRu2b5i-nKGDr5g`,
 * which are incompatible with Mistral's requirements.
 *
 * The full ID is hashed into 9 characters rather than truncated: truncation
 * keeps only the long constant prefix, so distinct IDs collide into duplicate
 * tool IDs that Bedrock rejects. The hash must be deterministic — the normalized
 * ID is returned to the caller, persisted, and re-normalized when the request is
 * rebuilt, so a tool call and its result always map to the same value.
 *
 * @param toolCallId - The original tool call ID from Bedrock
 * @param isMistral - Whether the model is a Mistral model
 * @returns The normalized tool call ID (9 alphanumeric chars) if Mistral, otherwise the original ID
 */
export function normalizeToolCallId(
  toolCallId: string,
  isMistral: boolean,
): string {
  if (!isMistral) {
    return toolCallId;
  }

  const alphanumericChars = toolCallId.replace(/[^a-zA-Z0-9]/g, '');

  // An ID that is already exactly 9 alphanumeric characters is a previously
  // normalized ID being round-tripped; return it unchanged so a tool call and
  // its matching tool result keep the same ID across turns.
  if (alphanumericChars.length === 9) {
    return alphanumericChars;
  }

  return hashToNineAlphanumericChars(toolCallId);
}
