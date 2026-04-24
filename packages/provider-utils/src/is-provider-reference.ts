import { SharedV4ProviderReference } from '@ai-sdk/provider';

/**
 * Checks whether a value is a provider reference (a mapping of provider names
 * to provider-specific identifiers) as opposed to raw bytes, a URL, or a
 * tagged `{ type: ... }` object.
 */
export function isProviderReference(
  data: unknown,
): data is SharedV4ProviderReference {
  return (
    typeof data === 'object' &&
    data !== null &&
    !(data instanceof Uint8Array) &&
    !(data instanceof URL) &&
    !(data instanceof ArrayBuffer) &&
    !(globalThis.Buffer?.isBuffer(data) ?? false) &&
    !('type' in data)
  );
}
