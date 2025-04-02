import { InvalidArgumentError } from '@ai-sdk/provider';
import { delay as originalDelay } from '@ai-sdk/provider-utils';
import { TextStreamPart } from './stream-text-result';
import { ToolSet } from './tool-set';

const CHUNKING_REGEXPS = {
  word: /\s*\S+\s+/m,
  line: /[^\n]*\n/m,
};

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
  chunking?: 'word' | 'line' | RegExp;
  /**
   * Internal. For test use only. May change without notice.
   */
  _internal?: {
    delay?: (delayInMs: number | null) => Promise<void>;
  };
} = {}): (options: {
  tools: TOOLS;
}) => TransformStream<TextStreamPart<TOOLS>, TextStreamPart<TOOLS>> {
  const chunkingRegexp =
    typeof chunking === 'string' ? CHUNKING_REGEXPS[chunking] : chunking;

  if (chunkingRegexp == null) {
    throw new InvalidArgumentError({
      argument: 'chunking',
      message: `Chunking must be "word" or "line" or a RegExp. Received: ${chunking}`,
    });
  }

  return () => {
    let buffer = ''

    const flushBuffer = (controller: TransformStreamDefaultController<TextStreamPart<TOOLS>>) => {
      if (buffer.length > 0) {
        controller.enqueue({ type: 'text-delta', textDelta: buffer })
        buffer = ''
      }
    }

    return new TransformStream<TextStreamPart<TOOLS>, TextStreamPart<TOOLS>>({
      async transform(chunk, controller) {
        if (chunk.type === 'step-finish') {
          if (buffer.length > 0) {
            controller.enqueue({ type: 'text-delta', textDelta: buffer })
            buffer = ''
          }

          controller.enqueue(chunk)
          return
        }

        if (chunk.type !== 'text-delta') {
          flushBuffer(controller)
          controller.enqueue(chunk)
          return
        }

        buffer += chunk.textDelta

        let match = chunkingRegexp.exec(buffer)
        while (match != null) {
          const chunk = match[0]
          controller.enqueue({ type: 'text-delta', textDelta: chunk })
          buffer = buffer.slice(chunk.length)

          await delay(delayInMs)
          match = chunkingRegexp.exec(buffer)
        }
      },
      flush(controller) {
        flushBuffer(controller)
      },
    })
  }
}
