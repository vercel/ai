import { InvalidArgumentError } from '@ai-sdk/provider';
import { delay as originalDelay } from '@ai-sdk/provider-utils';
import { TextStreamPart } from './stream-text-result';
import { ToolSet } from './tool-set';
import { TextSplit, splitText } from './text-splitter';

const CHUNKING_REGEXPS = {
  character: /(?!\s)(?=.)/g,
  word: /[\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF]|\s+/gm,
  line: /\r\n|\r|\n/g,
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
  chunking?: 'character' |'word' | 'line' | { split: string } | RegExp;
  /**
   * Internal. For test use only. May change without notice.
   */
  _internal?: {
    delay?: (delayInMs: number | null) => Promise<void>;
  };
} = {}): (options: {
  tools: TOOLS;
}) => TransformStream<TextStreamPart<TOOLS>, TextStreamPart<TOOLS>> {
  const chunker =
    typeof chunking === 'object' && 'split' in chunking
      ? chunking.split
      : typeof chunking === 'string'
        ? CHUNKING_REGEXPS[chunking]
        : chunking;

  if (chunker == null) {
    throw new InvalidArgumentError({
      argument: 'chunking',
      message: `Chunking must be "word" or "line" or a RegExp. Received: ${chunking}`,
    });
  }

  return () => {
    let buffer = '';
    let lastSplits: TextSplit[] = [];
    let lastIndex = 0;

    return new TransformStream<TextStreamPart<TOOLS>, TextStreamPart<TOOLS>>({
      async transform(chunk, controller) {
        const lastSplit = lastSplits.at(-1);

        if (chunk.type !== 'text-delta') {
          if (lastSplits.length > 1 && delayInMs) {
            await delay(delayInMs);
          }

          if (lastSplit) {
            controller.enqueue({
              type: 'text-delta',
              textDelta: lastSplit.text,
            });
            lastSplits = [];
            buffer = '';
          }

          controller.enqueue(chunk);
          return;
        }

        buffer += chunk.textDelta;

        const splits = splitText(buffer, chunker);

        // If there's a new split with the start index greater than the last index,
        // push the new split(s) and delay.
        const newSplitIndex = splits.findIndex(
          split => !lastSplit || split.start >= lastIndex,
        );

        if (newSplitIndex !== -1) {
          for (let i = newSplitIndex; i < splits.length - 1; i++) {
            const split = splits[i];
            controller.enqueue({ type: 'text-delta', textDelta: split.text });
            lastIndex = split.end;
            await delay(delayInMs);
          }
        }

        lastSplits = splits;
      },
    });
  };
}
