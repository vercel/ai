import { customAlphabet } from 'nanoid/non-secure';
import {
  StreamPartType,
  StreamStringPrefixes,
  parseStreamPart,
} from './stream-parts';

// 7-character random string
export const nanoid = customAlphabet(
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
  7,
);

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

export const isStreamStringEqualToType = (
  type: keyof typeof StreamStringPrefixes,
  value: string,
): value is StreamString =>
  value.startsWith(`${StreamStringPrefixes[type]}:`) && value.endsWith('\n');

export type StreamString =
  `${(typeof StreamStringPrefixes)[keyof typeof StreamStringPrefixes]}:${string}\n`;

/**
 * A header sent to the client so it knows how to handle parsing the stream (as a deprecated text response or using the new prefixed protocol)
 */
export const COMPLEX_HEADER = 'X-Experimental-Stream-Data';
