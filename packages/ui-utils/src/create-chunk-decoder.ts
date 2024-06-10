import { StreamPartType, parseStreamPart } from './stream-parts';

// simple decoder signatures:
function createChunkDecoder(): (chunk: Uint8Array | undefined) => string;
function createChunkDecoder(
  complex: false,
): (chunk: Uint8Array | undefined) => string;
// complex decoder signature:
function createChunkDecoder(
  complex: true,
): (chunk: Uint8Array | undefined) => StreamPartType[];
// combined signature for when the client calls this function with a boolean:
function createChunkDecoder(
  complex?: boolean,
): (chunk: Uint8Array | undefined) => StreamPartType[] | string;
function createChunkDecoder(complex?: boolean) {
  const decoder = new TextDecoder();

  if (!complex) {
    return function (chunk: Uint8Array | undefined): string {
      if (!chunk) return '';
      return decoder.decode(chunk, { stream: true });
    };
  }

  return function (chunk: Uint8Array | undefined) {
    const decoded = decoder
      .decode(chunk, { stream: true })
      .split('\n')
      .filter(line => line !== ''); // splitting leaves an empty string at the end

    return decoded.map(parseStreamPart).filter(Boolean);
  };
}

export { createChunkDecoder };
