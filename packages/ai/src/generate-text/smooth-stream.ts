import { delay as originalDelay } from '@ai-sdk/provider-utils';
import type { TextStreamPart } from './stream-text-result';
import type { ToolSet } from './tool-set';
import { InvalidArgumentError } from '@ai-sdk/provider';
import type { ProviderMetadata } from '../types';

const CHUNKING_REGEXPS = {
  word: /\S+\s+/m,
  line: /\n+/m,
};

// Browsers heavily throttle timers in hidden documents (e.g. background tabs),
// which would stall the smoothing delay and, through backpressure, the entire
// stream. Smoothing has no visual purpose there, so the delay is skipped.
function isDocumentHidden(): boolean {
  return (
    typeof document !== 'undefined' && document.visibilityState === 'hidden'
  );
}

/**
 * Detects the first chunk in a buffer.
 *
 * @param buffer - The buffer to detect the first chunk in.
 *
 * @returns The first detected chunk, or `undefined` if no chunk was detected.
 */
export type ChunkDetector = (buffer: string) => string | undefined | null;

/**
 * Smooths text streaming output.
 *
 * @param delayInMs - The delay in milliseconds between each chunk. Defaults to 10ms. Can be set to `null` to skip the delay. The delay is skipped while the document is hidden (e.g. browser background tabs), where timer throttling would otherwise stall the stream.
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
  let detectChunk: ChunkDetector;

  if (typeof chunking === 'function') {
    detectChunk = buffer => {
      const match = chunking(buffer);

      if (match == null) {
        return null;
      }

      if (!match.length) {
        throw new Error(`Chunking function must return a non-empty string.`);
      }

      if (!buffer.startsWith(match)) {
        throw new Error(
          `Chunking function must return a match that is a prefix of the buffer. Received: "${match}" expected to start with "${buffer}"`,
        );
      }

      return match;
    };
  } else {
    const chunkingRegex =
      typeof chunking === 'string' ? CHUNKING_REGEXPS[chunking] : chunking;

    if (chunkingRegex == null) {
      throw new InvalidArgumentError({
        argument: 'chunking',
        message: `Chunking must be "word" or "line" or a RegExp. Received: ${chunking}`,
      });
    }

    detectChunk = buffer => {
      const match = chunkingRegex.exec(buffer);

      if (!match) {
        return null;
      }

      return buffer.slice(0, match.index) + match?.[0];
    };
  }

  return () => {
    let buffer = '';
    let id = '';
    let providerMetadata: ProviderMetadata | undefined;

    function flushBuffer(
      controller: TransformStreamDefaultController<TextStreamPart<TOOLS>>,
    ) {
      if (buffer.length > 0 || providerMetadata != null) {
        controller.enqueue({
          type: 'text-delta',
          text: buffer,
          id,
          ...(providerMetadata != null ? { providerMetadata } : {}),
        });
        buffer = '';
        providerMetadata = undefined;
      }
    }

    return new TransformStream<TextStreamPart<TOOLS>, TextStreamPart<TOOLS>>({
      async transform(chunk, controller) {
        if (chunk.type !== 'text-delta') {
          flushBuffer(controller);
          controller.enqueue(chunk);
          return;
        }

        if (chunk.text.length === 0 && chunk.providerMetadata != null) {
          flushBuffer(controller);
          controller.enqueue(chunk);
          return;
        }

        // Flush at metadata boundaries because one output part cannot preserve
        // metadata from multiple input deltas.
        if (
          buffer.length > 0 &&
          (chunk.id !== id ||
            providerMetadata != null ||
            chunk.providerMetadata != null)
        ) {
          flushBuffer(controller);
        }

        buffer += chunk.text;
        id = chunk.id;
        providerMetadata = chunk.providerMetadata;

        let match;

        while ((match = detectChunk(buffer)) != null) {
          controller.enqueue({
            type: 'text-delta',
            text: match,
            id,
            ...(providerMetadata != null ? { providerMetadata } : {}),
          });
          buffer = buffer.slice(match.length);

          await delay(isDocumentHidden() ? null : delayInMs);
        }

        if (buffer.length === 0) {
          providerMetadata = undefined;
        }
      },
    });
  };
}
