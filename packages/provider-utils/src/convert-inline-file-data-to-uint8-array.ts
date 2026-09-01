import { UnsupportedFunctionalityError } from '@ai-sdk/provider';
import type { FilePart } from './types/content-part';
import { convertBase64ToUint8Array } from './uint8-utils';

type InlineFileData = Extract<
  FilePart['data'],
  { type: 'data' } | { type: 'text' }
>;

/**
 * Converts inline file data (a tagged `data` or `text` shape) into raw bytes.
 *
 * - `{ type: 'text', text }` → UTF-8 encoded bytes
 * - `{ type: 'data', data: Uint8Array | Buffer }` → returned as-is
 * - `{ type: 'data', data: ArrayBuffer }` → wrapped in a `Uint8Array`
 * - `{ type: 'data', data: string }` → decoded as base64
 *
 * `{ type: 'stream' }` data is rejected: providers without streaming upload
 * support funnel here and surface a clear `UnsupportedFunctionalityError`.
 */
export function convertInlineFileDataToUint8Array(
  data: InlineFileData | { type: 'stream'; stream: ReadableStream<Uint8Array> },
): Uint8Array {
  if (data.type === 'stream') {
    const error = new UnsupportedFunctionalityError({
      functionality: 'streaming file upload',
    });
    // the caller's stream is never consumed on this path — release it
    void data.stream.cancel(error).catch(() => {});
    throw error;
  }
  if (data.type === 'text') {
    return new TextEncoder().encode(data.text);
  }
  if (data.data instanceof Uint8Array) {
    return data.data;
  }
  if (data.data instanceof ArrayBuffer) {
    return new Uint8Array(data.data);
  }
  return convertBase64ToUint8Array(data.data);
}
