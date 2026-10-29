import { InvalidResponseDataError } from '@ai-sdk/provider';
import {
  extractResponseHeaders,
  lazySchema,
  safeParseJSON,
  zodSchema,
  type ResponseHandler,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export type ElevenLabsMusicTimestampsResponse = {
  audio: Uint8Array;
  wordTimestamps?: Array<{ word: string; startMs: number; endMs: number }>;
};

// /v1/music/detailed returns JSON metadata and binary audio as multipart/mixed.
export function createMusicTimestampsResponseHandler(): ResponseHandler<ElevenLabsMusicTimestampsResponse> {
  return async ({ response }) => {
    const contentType = response.headers.get('content-type') ?? '';
    const boundary = contentType.match(
      /(?:^|;)\s*boundary=(?:"([^"]+)"|([^;\s]+))/i,
    );
    if (!/^multipart\/mixed\b/i.test(contentType) || boundary == null) {
      throw new InvalidResponseDataError({
        data: contentType,
        message: 'ElevenLabs music response is missing a multipart boundary.',
      });
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    const delimiter = new TextEncoder().encode(
      `--${boundary[1] ?? boundary[2]}`,
    );
    const separator = new Uint8Array([13, 10, 13, 10]);
    const decoder = new TextDecoder();
    let audio: Uint8Array | undefined;
    let metadata: Awaited<ReturnType<typeof parseMetadata>> | undefined;
    let position = findBoundary(bytes, delimiter, 0);
    let closed = false;

    while (position !== -1) {
      const start = position + delimiter.length;
      if (bytes[start] === 45 && bytes[start + 1] === 45) {
        closed = true;
        break;
      }
      const next = findBoundary(bytes, delimiter, start + 2);
      if (next === -1) break;
      const end = next - 2; // Remove only the CRLF framing this part.
      const headersEnd = findBytes(bytes, separator, start + 2);
      if (headersEnd === -1 || headersEnd + separator.length > end) {
        throw new InvalidResponseDataError({
          data: contentType,
          message: 'ElevenLabs music response contains malformed part headers.',
        });
      }
      const headers = decoder.decode(bytes.subarray(start + 2, headersEnd));
      const partType = headers
        .match(/^content-type:\s*([^;\r\n]+)/im)?.[1]
        .trim()
        .toLowerCase();
      const body = bytes.subarray(headersEnd + separator.length, end);
      if (partType === 'application/json') {
        if (metadata != null) {
          throw new InvalidResponseDataError({
            data: contentType,
            message:
              'ElevenLabs music response contains multiple metadata parts.',
          });
        }
        metadata = await parseMetadata(decoder.decode(body));
      } else if (partType?.startsWith('audio/')) {
        if (audio != null) {
          throw new InvalidResponseDataError({
            data: contentType,
            message: 'ElevenLabs music response contains multiple audio parts.',
          });
        }
        audio = body.slice();
      }
      position = next;
    }

    if (!closed || audio == null || metadata == null) {
      throw new InvalidResponseDataError({
        data: contentType,
        message:
          'ElevenLabs music response must contain complete metadata and audio parts.',
      });
    }
    return {
      value: {
        audio,
        ...(metadata.value.words_timestamps != null && {
          wordTimestamps: metadata.value.words_timestamps.map(word => ({
            word: word.word,
            startMs: word.start_ms,
            endMs: word.end_ms,
          })),
        }),
      },
      rawValue: metadata.rawValue,
      responseHeaders: extractResponseHeaders(response),
    };
  };
}

const musicMetadataSchema = lazySchema(() =>
  zodSchema(
    z.object({
      words_timestamps: z
        .array(
          z.object({
            word: z.string(),
            start_ms: z.number(),
            end_ms: z.number(),
          }),
        )
        .nullish(),
    }),
  ),
);

async function parseMetadata(text: string) {
  const parsed = await safeParseJSON({ text, schema: musicMetadataSchema });
  if (!parsed.success) throw parsed.error;
  return parsed;
}

function findBytes(
  bytes: Uint8Array,
  pattern: Uint8Array,
  from: number,
): number {
  for (
    let i = bytes.indexOf(pattern[0], from);
    i !== -1 && i <= bytes.length - pattern.length;
    i = bytes.indexOf(pattern[0], i + 1)
  ) {
    if (pattern.every((value, index) => bytes[i + index] === value)) return i;
  }
  return -1;
}

function findBoundary(
  bytes: Uint8Array,
  pattern: Uint8Array,
  from: number,
): number {
  for (
    let i = findBytes(bytes, pattern, from);
    i !== -1;
    i = findBytes(bytes, pattern, i + 1)
  ) {
    const end = i + pattern.length;
    const lineStart = i === 0 || (bytes[i - 2] === 13 && bytes[i - 1] === 10);
    const lineEnd =
      (bytes[end] === 13 && bytes[end + 1] === 10) ||
      (bytes[end] === 45 && bytes[end + 1] === 45);
    if (lineStart && lineEnd) return i;
  }
  return -1;
}
