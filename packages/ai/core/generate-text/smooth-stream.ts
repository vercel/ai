import { delay as originalDelay } from '../../util/delay';
import { CoreTool } from '../tool/tool';
import { TextStreamPart } from './stream-text-result';

/**
 * Smooths text streaming output.
 *
 * @param delayInMs - The delay in milliseconds between each chunk. Defaults to 10ms.
 * @returns A transform stream that smooths text streaming output.
 */
export function smoothStream<TOOLS extends Record<string, CoreTool>>({
  delayInMs = 10,
  _internal: { delay = originalDelay } = {},
}: {
  delayInMs?: number;

  /**
   * Internal. For test use only. May change without notice.
   */
  _internal?: {
    delay?: (delayInMs: number) => Promise<void>;
  };
} = {}): (options: {
  tools: TOOLS;
}) => TransformStream<TextStreamPart<TOOLS>, TextStreamPart<TOOLS>> {
  let buffer = '';

  return () =>
    new TransformStream<TextStreamPart<TOOLS>, TextStreamPart<TOOLS>>({
      async transform(chunk, controller) {
        if (chunk.type === 'step-finish') {
          if (buffer.length > 0) {
            controller.enqueue({ type: 'text-delta', textDelta: buffer });
            buffer = '';
          }

          controller.enqueue(chunk);
          return;
        }

        if (chunk.type !== 'text-delta') {
          controller.enqueue(chunk);
          return;
        }

        buffer += chunk.textDelta;

        // Stream out complete words when whitespace is found
        while (buffer.match(/\s/)) {
          const whitespaceIndex = buffer.search(/\s/);
          const word = buffer.slice(0, whitespaceIndex + 1);
          controller.enqueue({ type: 'text-delta', textDelta: word });
          buffer = buffer.slice(whitespaceIndex + 1);

          if (delayInMs > 0) {
            await delay(delayInMs);
          }
        }
      },
    });
}
