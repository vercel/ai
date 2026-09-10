/**
 * Checks if the given model ID is a Mistral model.
 * Mistral models on Bedrock are prefixed with 'mistral.' or region-prefixed like 'us.mistral.'.
 */
export function isMistralModel(modelId: string): boolean {
  return modelId.includes('mistral.');
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
 * This function hashes incompatible IDs into 9 alphanumeric characters.
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

  if (/^[a-zA-Z0-9]{9}$/.test(toolCallId)) {
    return toolCallId;
  }

  return convertToBase62Hash(toolCallId);
}

const base62Characters =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const base62Length = BigInt(base62Characters.length);
const normalizedToolCallIdLength = 9;
const normalizedToolCallIdSpace =
  base62Length ** BigInt(normalizedToolCallIdLength);
const fnvOffsetBasis64 = BigInt('14695981039346656037');
const fnvPrime64 = BigInt('1099511628211');
const fnv64BitMask = BigInt('18446744073709551615');

function convertToBase62Hash(value: string): string {
  // FNV-1a 64-bit is deterministic across runtimes and gives the normalized ID
  // access to the full 9-character base62 space.
  let hash = fnvOffsetBasis64;

  for (let i = 0; i < value.length; i++) {
    hash ^= BigInt(value.charCodeAt(i));
    hash = (hash * fnvPrime64) & fnv64BitMask;
  }

  let base62Value = hash % normalizedToolCallIdSpace;
  let result = '';

  for (let i = 0; i < normalizedToolCallIdLength; i++) {
    result = base62Characters[Number(base62Value % base62Length)] + result;
    base62Value /= base62Length;
  }

  return result;
}
