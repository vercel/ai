import type { SharedV4ProviderReference } from '@ai-sdk/provider';
import { isBuffer } from './is-buffer';
import { isRecord } from './is-record';

/**
 * Checks whether a value is a provider reference (a mapping of provider names
 * to provider-specific identifiers) as opposed to raw bytes, a URL, or a
 * tagged `{ type: ... }` object.
 */
export function isProviderReference(
  data: unknown,
): data is SharedV4ProviderReference {
  return (
    isRecord(data) &&
    !(data instanceof Uint8Array) &&
    !(data instanceof URL) &&
    !(data instanceof ArrayBuffer) &&
    !isBuffer(data) &&
    !('type' in data) &&
    Object.prototype.toString.call(data) === '[object Object]'
  );
}
