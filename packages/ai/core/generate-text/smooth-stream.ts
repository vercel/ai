import { delay as originalDelay } from '@ai-sdk/provider-utils';
import { TextStreamPart } from './stream-text-result';
import { ToolSet } from './tool-set';

const CHUNKING_REGEXPS = {
  word: /\s*\S+\s+/m,
  line: /[^\n]*\n/m,
};

/**
 * Detects the first chunk in a buffer.
 *
 * @param buffer - The buffer to detect the first chunk in.
 *
 * @returns The first detected chunk, or `undefined` if no chunk was detected.
 */
type ChunkDetector = (buffer: string) => string | undefined;

/**
 * Smooths text streaming output.
 *
 * @param delayInMs - The delay in milliseconds between each chunk. Defaults to 10ms. Can be set to `null` to skip the delay.
 * @param chunking - Controls how the text is chunked for streaming. Use "word" to stream word by word (default), "line" to stream line by line, or provide a custom RegExp pattern for custom chunking.
 *
 * @returns A transform stream that smooths text streaming output.
 */
export function smoothStream<TOOLS extends ToolSet>({
  delayInMs = 10,
  chunking = 'word',
  _internal: { delay = originalDelay } = {},
}: {
  delayInMs?: number | null;
  chunking?: 'word' | 'line' | RegExp | ChunkDetector;
  /**
   * Internal. For test use only. May change without notice.
   */
  _internal?: {
    delay?: (delayInMs: number | null) => Promise<void>;
  };
} = {}): (options: {
  tools: TOOLS;
}) => TransformStream<TextStreamPart<TOOLS>, TextStreamPart<TOOLS>> {
  const detectChunk: ChunkDetector =
    typeof chunking === 'function'
      ? chunking
      : typeof chunking === 'string'
        ? buffer => CHUNKING_REGEXPS[chunking].exec(buffer)?.[0]
        : buffer => chunking.exec(buffer)?.[0];

  return () => {
    let buffer = '';

    return new TransformStream<TextStreamPart<TOOLS>, TextStreamPart<TOOLS>>({
      async transform(chunk, controller) {
        if (chunk.type !== 'text-delta') {
          if (buffer.length > 0) {
            controller.enqueue({ type: 'text-delta', textDelta: buffer });
            buffer = '';
          }

          controller.enqueue(chunk);
          return;
        }

        buffer += chunk.textDelta;

        let match;
        while ((match = detectChunk(buffer)) != null) {
          controller.enqueue({ type: 'text-delta', textDelta: match });
          buffer = buffer.slice(match.length);

          await delay(delayInMs);
        }
      },
    });
  };
}
