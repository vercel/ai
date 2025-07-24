import { delay as originalDelay } from '@ai-sdk/provider-utils';
import { TextStreamPart } from './stream-text-result';
import { ToolSet } from './tool-set';
import { InvalidArgumentError } from '@ai-sdk/provider';

const CHUNKING_REGEXPS = {
  word: /\S+\s+/m,
  line: /\n+/m,
};

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
 * @param delayInMs - The delay in milliseconds between each chunk. Defaults to 10ms. Can be set to `null` to skip the delay.
 * @param chunking - Controls how the text is chunked for streaming. Use "word" to stream word by word (default), "line" to stream line by line, "grapheme" for character-level using Intl.Segmenter, "word-intl" for word-level using Intl.Segmenter, "sentence" for sentence-level using Intl.Segmenter, or provide a custom RegExp pattern or ChunkDetector function for custom chunking.
 * @param segmenterOptions - Options for Intl.Segmenter when using "grapheme", "word-intl", or "sentence" chunking. Includes locale and localeMatcher settings.
 *
 * @returns A transform stream that smooths text streaming output.
 */
export function smoothStream<TOOLS extends ToolSet>({
  delayInMs = 10,
  chunking = 'word',
  segmenterOptions = {},
  _internal: { delay = originalDelay } = {},
}: {
  delayInMs?: number | null;
  chunking?:
    | 'word'
    | 'line'
    | 'grapheme'
    | 'word-intl'
    | 'sentence'
    | RegExp
    | ChunkDetector;
  segmenterOptions?: {
    locale?: Intl.LocalesArgument;
    localeMatcher?: Intl.SegmenterOptions['localeMatcher'];
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
  } else if (
    chunking === 'grapheme' ||
    chunking === 'word-intl' ||
    chunking === 'sentence'
  ) {
    const granularity =
      chunking === 'grapheme'
        ? 'grapheme'
        : chunking === 'word-intl'
          ? 'word'
          : 'sentence';

    let segmenter: Intl.Segmenter;
    try {
      segmenter = new Intl.Segmenter(segmenterOptions.locale, {
        granularity,
        localeMatcher: segmenterOptions.localeMatcher,
      });
    } catch (error) {
      throw new InvalidArgumentError({
        argument: 'segmenterOptions',
        message: `Failed to create Intl.Segmenter: ${error}`,
      });
    }

    detectChunk = buffer => {
      const segments = segmenter.segment(buffer);
      const segmentArray = Array.from(segments);

      if (segmentArray.length === 0) {
        return null;
      }

      // For word-intl granularity, find the first word-like segment plus any following non-word segments
      if (chunking === 'word-intl') {
        let endIndex = 0;
        let foundWord = false;

        for (const segment of segmentArray) {
          endIndex = segment.index + segment.segment.length;

          if (segment.isWordLike) {
            foundWord = true;
          } else if (foundWord) {
            // Found a word, now include trailing non-word segments (spaces, punctuation)
            // but stop at the next word-like segment
            break;
          }
        }

        if (!foundWord) {
          // If no word-like segments, return the first segment
          return segmentArray[0].segment;
        }

        return buffer.slice(0, endIndex);
      } else {
        // For grapheme and sentence, return the first segment
        return segmentArray[0].segment;
      }
    };
  } else {
    const chunkingRegex =
      typeof chunking === 'string' ? CHUNKING_REGEXPS[chunking] : chunking;

    if (chunkingRegex == null) {
      throw new InvalidArgumentError({
        argument: 'chunking',
        message: `Chunking must be "word", "line", "grapheme", "word-intl", "sentence", or a RegExp. Received: ${chunking}`,
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

    return new TransformStream<TextStreamPart<TOOLS>, TextStreamPart<TOOLS>>({
      async transform(chunk, controller) {
        if (chunk.type !== 'text') {
          if (buffer.length > 0) {
            controller.enqueue({ type: 'text', text: buffer, id });
            buffer = '';
          }

          controller.enqueue(chunk);
          return;
        }

        if (chunk.id !== id && buffer.length > 0) {
          controller.enqueue({ type: 'text', text: buffer, id });
          buffer = '';
        }

        buffer += chunk.text;
        id = chunk.id;

        let match;

        while ((match = detectChunk(buffer)) != null) {
          controller.enqueue({ type: 'text', text: match, id });
          buffer = buffer.slice(match.length);

          await delay(delayInMs);
        }
      },
    });
  };
}
