import { StreamPartType } from './stream-parts';

export function createChunkDecoder(): (
  chunk: Uint8Array | undefined,
) => StreamPartType[] | string {
  const decoder = new TextDecoder();

  return function (chunk: Uint8Array | undefined): string {
    if (!chunk) return '';
    return decoder.decode(chunk, { stream: true });
  };
}
