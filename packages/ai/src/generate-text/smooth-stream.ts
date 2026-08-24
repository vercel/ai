import { delay as originalDelay, type ToolSet } from '@ai-sdk/provider-utils';
import {
  InvalidArgumentError,
  type SharedV4ProviderMetadata,
} from '@ai-sdk/provider';
import type { TextStreamPart } from './stream-text-result';

const CHUNKING_REGEXPS = {
  word: /\S+\s+/m,
  line: /\n+/m,
};

type TextChunking = 'word' | 'line' | RegExp | ChunkDetector | Intl.Segmenter;

/**
 * Detects the first chunk in a buffer.
 *
 * @param buffer - The buffer to detect the first chunk in.
 *
 * @returns The first detected chunk, or `undefined` if no chunk was detected.
 */
export type ChunkDetector = (buffer: string) => string | undefined | null;

function createChunkDetector({
  chunking,
  argument,
  validChunkingDescription,
}: {
  chunking: TextChunking;
  argument: string;
  validChunkingDescription: string;
}): ChunkDetector {
  // Check if chunking is an Intl.Segmenter (duck-typing for segment method)
  if (
    chunking != null &&
    typeof chunking === 'object' &&
    'segment' in chunking &&
    typeof chunking.segment === 'function'
  ) {
    const segmenter = chunking as Intl.Segmenter;
    return (buffer: string) => {
      if (buffer.length === 0) return null;
      const iterator = segmenter.segment(buffer)[Symbol.iterator]();
      const first = iterator.next().value;
      return first?.segment || null;
    };
  }

  if (typeof chunking === 'function') {
    return buffer => {
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
  }

  const chunkingRegex =
    typeof chunking === 'string'
      ? CHUNKING_REGEXPS[chunking]
      : chunking instanceof RegExp
        ? chunking
        : undefined;

  if (chunkingRegex == null) {
    throw new InvalidArgumentError({
      argument,
      message: `Chunking must be ${validChunkingDescription}. Received: ${chunking}`,
    });
  }

  return buffer => {
    const match = chunkingRegex.exec(buffer);

    if (!match) {
      return null;
    }

    const detectedChunk = buffer.slice(0, match.index) + match[0];
    if (detectedChunk.length === 0) {
      throw new Error(`Chunking pattern must match a non-empty string.`);
    }

    return detectedChunk;
  };
}

/**
 * Smooths text, reasoning, and optionally tool input streaming output.
 *
 * @param delayInMs - The delay in milliseconds between each chunk. Defaults to 10ms. Can be set to `null` to skip the delay.
 * @param chunking - Controls how the text is chunked for streaming. Use "word" to stream word by word (default), "line" to stream line by line, provide a custom RegExp pattern for custom chunking, provide an Intl.Segmenter for locale-aware word segmentation (recommended for CJK languages), or provide a custom ChunkDetector function.
 * @param toolInputSmoothing - Opt-in configuration for smoothing tool input deltas. Tool inputs are streamed character by character by default. Use `include` or `exclude` to control smoothing for individual tools.
 *
 * @returns A transform stream that smooths streaming output.
 */
export function smoothStream<TOOLS extends ToolSet>({
  delayInMs = 10,
  chunking = 'word',
  toolInputSmoothing,
  _internal: { delay = originalDelay } = {},
}: {
  delayInMs?: number | null;
  chunking?: TextChunking;
  toolInputSmoothing?: {
    /**
     * Controls how tool input JSON is chunked.
     *
     * @default 'character'
     */
    chunking?: 'character' | RegExp | ChunkDetector;
    /**
     * Only smooth tool inputs for these tools.
     */
    include?: ReadonlyArray<keyof TOOLS & string>;
    /**
     * Do not smooth tool inputs for these tools.
     *
     * `exclude` takes precedence over `include`.
     */
    exclude?: ReadonlyArray<keyof TOOLS & string>;
  };
  /**
   * Internal. For test use only. May change without notice.
   */
  _internal?: {
    delay?: (delayInMs: number | null) => Promise<void>;
  };
} = {}): (options: {
  tools: TOOLS;
}) => TransformStream<TextStreamPart<TOOLS>, TextStreamPart<TOOLS>> {
  const detectChunk = createChunkDetector({
    chunking,
    argument: 'chunking',
    validChunkingDescription:
      '"word", "line", a RegExp, an Intl.Segmenter, or a ChunkDetector function',
  });

  const toolInputChunking = toolInputSmoothing?.chunking;
  if (
    toolInputSmoothing != null &&
    toolInputChunking !== undefined &&
    toolInputChunking !== 'character' &&
    !(toolInputChunking instanceof RegExp) &&
    typeof toolInputChunking !== 'function'
  ) {
    throw new InvalidArgumentError({
      argument: 'toolInputSmoothing.chunking',
      message: `Chunking must be "character", a RegExp, or a ChunkDetector function. Received: ${toolInputChunking}`,
    });
  }

  const detectToolInputChunk =
    toolInputSmoothing == null
      ? undefined
      : toolInputChunking == null || toolInputChunking === 'character'
        ? (buffer: string) => {
            const codePoint = buffer.codePointAt(0);
            return codePoint == null ? null : String.fromCodePoint(codePoint);
          }
        : createChunkDetector({
            chunking: toolInputChunking,
            argument: 'toolInputSmoothing.chunking',
            validChunkingDescription:
              '"character", a RegExp, or a ChunkDetector function',
          });

  return () => {
    let buffer = '';
    let id = '';
    let type: 'text-delta' | 'reasoning-delta' | undefined = undefined;
    let providerMetadata: SharedV4ProviderMetadata | undefined = undefined;
    let activeToolInputId: string | undefined;
    const toolInputStates = new Map<
      string,
      {
        buffer: string;
        providerMetadata: SharedV4ProviderMetadata | undefined;
        smooth: boolean;
      }
    >();

    function flushBuffer(
      controller: TransformStreamDefaultController<TextStreamPart<TOOLS>>,
    ) {
      if (buffer.length > 0 && type !== undefined) {
        controller.enqueue({
          type,
          text: buffer,
          id,
          ...(providerMetadata != null ? { providerMetadata } : {}),
        });
        buffer = '';
        providerMetadata = undefined;
      }
    }

    function flushToolInputBuffer(
      id: string,
      controller: TransformStreamDefaultController<TextStreamPart<TOOLS>>,
    ) {
      const state = toolInputStates.get(id);

      if (state != null && state.buffer.length > 0) {
        controller.enqueue({
          type: 'tool-input-delta',
          id,
          delta: state.buffer,
          ...(state.providerMetadata != null
            ? { providerMetadata: state.providerMetadata }
            : {}),
        });
        state.buffer = '';
        state.providerMetadata = undefined;
      }
    }

    function flushActiveToolInputBuffer(
      controller: TransformStreamDefaultController<TextStreamPart<TOOLS>>,
    ) {
      if (activeToolInputId != null) {
        flushToolInputBuffer(activeToolInputId, controller);
        activeToolInputId = undefined;
      }
    }

    function flushAllBuffers(
      controller: TransformStreamDefaultController<TextStreamPart<TOOLS>>,
    ) {
      flushBuffer(controller);
      flushActiveToolInputBuffer(controller);

      // Normally only the active tool input has buffered content. Iterating
      // over all states also preserves input from malformed or truncated
      // interleaved streams.
      for (const toolInputId of toolInputStates.keys()) {
        flushToolInputBuffer(toolInputId, controller);
      }
    }

    return new TransformStream<TextStreamPart<TOOLS>, TextStreamPart<TOOLS>>({
      async transform(chunk, controller) {
        if (chunk.type === 'text-delta' || chunk.type === 'reasoning-delta') {
          flushActiveToolInputBuffer(controller);

          // Flush buffer when type or id changes
          if ((chunk.type !== type || chunk.id !== id) && buffer.length > 0) {
            flushBuffer(controller);
          }

          buffer += chunk.text;
          id = chunk.id;
          type = chunk.type;

          // Preserve providerMetadata (e.g., Anthropic thinking signatures)
          if (chunk.providerMetadata != null) {
            providerMetadata = chunk.providerMetadata;
          }

          let match;

          while ((match = detectChunk(buffer)) != null) {
            controller.enqueue({ type, text: match, id });
            buffer = buffer.slice(match.length);

            await delay(delayInMs);
          }
          return;
        }

        if (chunk.type === 'tool-input-start') {
          flushBuffer(controller);
          flushActiveToolInputBuffer(controller);

          const { include, exclude } = toolInputSmoothing ?? {};
          toolInputStates.set(chunk.id, {
            buffer: '',
            providerMetadata: undefined,
            smooth:
              detectToolInputChunk != null &&
              (include == null || include.includes(chunk.toolName)) &&
              (exclude == null || !exclude.includes(chunk.toolName)),
          });

          controller.enqueue(chunk);
          return;
        }

        if (chunk.type === 'tool-input-delta') {
          flushBuffer(controller);

          const state = toolInputStates.get(chunk.id);
          if (state == null || !state.smooth || detectToolInputChunk == null) {
            flushActiveToolInputBuffer(controller);
            controller.enqueue(chunk);
            return;
          }

          if (activeToolInputId != null && activeToolInputId !== chunk.id) {
            flushActiveToolInputBuffer(controller);
          }
          activeToolInputId = chunk.id;

          if (chunk.delta.length === 0) {
            flushToolInputBuffer(chunk.id, controller);
            activeToolInputId = undefined;
            controller.enqueue(chunk);
            return;
          }

          if (
            chunk.providerMetadata != null &&
            state.providerMetadata != null &&
            state.buffer.length > 0
          ) {
            // Keep metadata from separate provider deltas ordered and
            // observable instead of overwriting it while buffering.
            flushToolInputBuffer(chunk.id, controller);
          }

          state.buffer += chunk.delta;
          if (chunk.providerMetadata != null) {
            state.providerMetadata = chunk.providerMetadata;
          }

          let match;

          while ((match = detectToolInputChunk(state.buffer)) != null) {
            const isLastBufferedChunk = match.length === state.buffer.length;
            controller.enqueue({
              type: 'tool-input-delta',
              id: chunk.id,
              delta: match,
              ...(isLastBufferedChunk && state.providerMetadata != null
                ? { providerMetadata: state.providerMetadata }
                : {}),
            });
            state.buffer = state.buffer.slice(match.length);

            if (isLastBufferedChunk) {
              state.providerMetadata = undefined;
            }

            await delay(delayInMs);
          }
          return;
        }

        if (chunk.type === 'tool-input-end') {
          flushBuffer(controller);

          if (activeToolInputId != null && activeToolInputId !== chunk.id) {
            flushActiveToolInputBuffer(controller);
          }

          flushToolInputBuffer(chunk.id, controller);
          if (activeToolInputId === chunk.id) {
            activeToolInputId = undefined;
          }
          toolInputStates.delete(chunk.id);
          controller.enqueue(chunk);
          return;
        }

        // Handle non-smoothable chunks: flush buffers and pass through.
        flushAllBuffers(controller);
        controller.enqueue(chunk);
      },
      flush(controller) {
        flushAllBuffers(controller);
      },
    });
  };
}
