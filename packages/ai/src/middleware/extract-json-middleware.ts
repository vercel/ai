import type {
  LanguageModelV4Citation,
  LanguageModelV4Content,
  LanguageModelV4StreamPart,
} from '@ai-sdk/provider';
import type { LanguageModelMiddleware } from '../types/language-model-middleware';
import { createIdMap } from '../util/create-id-map';

type CitationMapping = {
  originalStartIndex: number;
  transformedLength: number;
};

/**
 * Default transform function that strips markdown code fences from text.
 */
function defaultTransform(text: string): {
  text: string;
  originalStartIndex: number;
} {
  let transformed = text;
  let originalStartIndex = 0;

  const prefixMatch = transformed.match(/^```(?:json)?\s*\n?/);
  if (prefixMatch) {
    transformed = transformed.slice(prefixMatch[0].length);
    originalStartIndex += prefixMatch[0].length;
  }

  transformed = transformed.replace(/\n?```\s*$/, '');

  const trimmedStart = transformed.trimStart();
  originalStartIndex += transformed.length - trimmedStart.length;

  return {
    text: trimmedStart.trimEnd(),
    originalStartIndex,
  };
}

function stripMarkdownCodeFenceSuffix(text: string): string {
  return text.replace(/\n?```\s*$/, '').trimEnd();
}

function remapCitations(
  citations: Array<LanguageModelV4Citation>,
  mapping: CitationMapping | undefined,
): Array<LanguageModelV4Citation> {
  return citations.map(citation => {
    const { startIndex, endIndex } = citation;

    if (startIndex == null && endIndex == null) {
      return citation;
    }

    if (mapping == null) {
      const {
        startIndex: _startIndex,
        endIndex: _endIndex,
        ...citationWithoutOffsets
      } = citation;
      return citationWithoutOffsets;
    }

    const originalEndIndex =
      mapping.originalStartIndex + mapping.transformedLength;

    if (
      startIndex != null &&
      endIndex != null &&
      (endIndex <= mapping.originalStartIndex || startIndex >= originalEndIndex)
    ) {
      const {
        startIndex: _startIndex,
        endIndex: _endIndex,
        ...citationWithoutOffsets
      } = citation;
      return citationWithoutOffsets;
    }

    const remapIndex = (index: number) =>
      Math.min(
        Math.max(index - mapping.originalStartIndex, 0),
        mapping.transformedLength,
      );

    return {
      ...citation,
      ...(startIndex != null ? { startIndex: remapIndex(startIndex) } : {}),
      ...(endIndex != null ? { endIndex: remapIndex(endIndex) } : {}),
    };
  });
}

function getPotentialSuffixStart(text: string): number {
  let index = text.length;

  while (index > 0 && /\s/.test(text[index - 1])) {
    index--;
  }

  let backtickCount = 0;
  while (index > 0 && backtickCount < 3 && text[index - 1] === '`') {
    index--;
    backtickCount++;
  }

  if (backtickCount > 0) {
    while (index > 0 && /\s/.test(text[index - 1])) {
      index--;
    }
  }

  return index;
}

/**
 * Middleware that extracts JSON from text content by stripping
 * markdown code fences and other formatting.
 *
 * This is useful when using Output.object() with models that wrap
 * JSON responses in markdown code blocks.
 *
 * @param options - Configuration options for the middleware.
 * @param options.transform - Custom transform function. If provided, this will be
 * used instead of the default markdown fence stripping.
 */
export function extractJsonMiddleware(options?: {
  /**
   * Custom transform function to apply to text content.
   * Receives the raw text and should return the transformed text.
   * If not provided, the default transform strips markdown code fences.
   */
  transform?: (text: string) => string;
}): LanguageModelMiddleware {
  const transform = options?.transform;
  const hasCustomTransform = options?.transform !== undefined;

  return {
    specificationVersion: 'v4',

    wrapGenerate: async ({ doGenerate }) => {
      const { content, ...rest } = await doGenerate();

      const transformedContent: LanguageModelV4Content[] = [];
      for (const part of content) {
        if (part.type !== 'text') {
          transformedContent.push(part);
          continue;
        }

        const transformed = hasCustomTransform
          ? {
              text: transform!(part.text),
              originalStartIndex: undefined,
            }
          : defaultTransform(part.text);
        const citationMapping =
          transformed.text === part.text
            ? { originalStartIndex: 0, transformedLength: part.text.length }
            : transformed.originalStartIndex != null
              ? {
                  originalStartIndex: transformed.originalStartIndex,
                  transformedLength: transformed.text.length,
                }
              : undefined;

        transformedContent.push({
          ...part,
          text: transformed.text,
          ...(part.citations != null
            ? {
                citations: remapCitations(part.citations, citationMapping),
              }
            : {}),
        });
      }

      return { content: transformedContent, ...rest };
    },
    wrapStream: async ({ doStream }) => {
      const { stream, ...rest } = await doStream();

      const textBlocks: Record<
        string,
        {
          startEvent: LanguageModelV4StreamPart;
          phase: 'prefix' | 'streaming' | 'buffering';
          buffer: string;
          prefixStripped: boolean;
          originalStartIndex: number;
          transformedTextLength: number;
        }
      > = createIdMap();

      return {
        stream: stream.pipeThrough(
          new TransformStream<
            LanguageModelV4StreamPart,
            LanguageModelV4StreamPart
          >({
            transform: (chunk, controller) => {
              if (chunk.type === 'text-start') {
                textBlocks[chunk.id] = {
                  startEvent: chunk,
                  // Custom transforms need to buffer all content
                  phase: hasCustomTransform ? 'buffering' : 'prefix',
                  buffer: '',
                  prefixStripped: false,
                  originalStartIndex: 0,
                  transformedTextLength: 0,
                };
                return;
              }

              if (chunk.type === 'text-delta') {
                const block = textBlocks[chunk.id];
                if (!block) {
                  controller.enqueue(chunk);
                  return;
                }

                block.buffer += chunk.delta;

                // Custom transform: buffer everything, transform at end
                if (block.phase === 'buffering') {
                  return;
                }

                if (block.phase === 'prefix') {
                  // Check if we can determine prefix status
                  if (
                    block.buffer.length > 0 &&
                    !block.buffer.startsWith('`')
                  ) {
                    block.phase = 'streaming';
                    controller.enqueue(block.startEvent);
                  } else if (block.buffer.startsWith('```')) {
                    // Only strip prefix when we have a newline (fence is complete)
                    if (block.buffer.includes('\n')) {
                      const prefixMatch =
                        block.buffer.match(/^```(?:json)?\s*\n/);
                      if (prefixMatch) {
                        block.buffer = block.buffer.slice(
                          prefixMatch[0].length,
                        );
                        block.originalStartIndex = prefixMatch[0].length;
                        block.prefixStripped = true;
                        block.phase = 'streaming';
                        controller.enqueue(block.startEvent);
                      } else {
                        // Has newline but doesn't match fence pattern
                        block.phase = 'streaming';
                        controller.enqueue(block.startEvent);
                      }
                    }
                    // else keep buffering until we see a newline
                  } else if (
                    block.buffer.length >= 3 &&
                    !block.buffer.startsWith('```')
                  ) {
                    block.phase = 'streaming';
                    controller.enqueue(block.startEvent);
                  }
                }

                // Stream content while retaining anything that could still
                // become trailing whitespace or a markdown fence suffix.
                if (block.phase === 'streaming') {
                  const potentialSuffixStart = getPotentialSuffixStart(
                    block.buffer,
                  );
                  const toStream = block.buffer.slice(0, potentialSuffixStart);
                  block.buffer = block.buffer.slice(potentialSuffixStart);

                  if (toStream.length === 0) {
                    return;
                  }

                  block.transformedTextLength += toStream.length;
                  controller.enqueue({
                    type: 'text-delta',
                    id: chunk.id,
                    delta: toStream,
                  });
                }
                return;
              }

              if (chunk.type === 'text-end') {
                const block = textBlocks[chunk.id];
                if (block) {
                  if (block.phase === 'prefix' || block.phase === 'buffering') {
                    controller.enqueue(block.startEvent);
                  }

                  let remaining = block.buffer;
                  let citationMapping: CitationMapping | undefined;
                  if (block.phase === 'buffering') {
                    const originalText = remaining;
                    remaining = transform!(remaining);
                    citationMapping =
                      remaining === originalText
                        ? {
                            originalStartIndex: 0,
                            transformedLength: originalText.length,
                          }
                        : undefined;
                  } else if (block.prefixStripped) {
                    // strip suffix since prefix already handled
                    remaining = stripMarkdownCodeFenceSuffix(remaining);
                    block.transformedTextLength += remaining.length;
                    citationMapping = {
                      originalStartIndex: block.originalStartIndex,
                      transformedLength: block.transformedTextLength,
                    };
                  } else if (block.phase === 'prefix') {
                    // No text has streamed yet, so the full transform is safe.
                    const transformed = defaultTransform(remaining);
                    remaining = transformed.text;
                    citationMapping = {
                      originalStartIndex: transformed.originalStartIndex,
                      transformedLength: transformed.text.length,
                    };
                  } else {
                    // Only strip the suffix. Since earlier text may already have
                    // streamed, trimming the remaining suffix would remove valid
                    // leading whitespace at the stream boundary.
                    remaining = stripMarkdownCodeFenceSuffix(remaining);
                    block.transformedTextLength += remaining.length;
                    citationMapping = {
                      originalStartIndex: block.originalStartIndex,
                      transformedLength: block.transformedTextLength,
                    };
                  }

                  if (remaining.length > 0) {
                    controller.enqueue({
                      type: 'text-delta',
                      id: chunk.id,
                      delta: remaining,
                    });
                  }
                  controller.enqueue({
                    ...chunk,
                    ...(chunk.citations != null
                      ? {
                          citations: remapCitations(
                            chunk.citations,
                            citationMapping,
                          ),
                        }
                      : {}),
                  });
                  delete textBlocks[chunk.id];
                  return;
                }
              }
              controller.enqueue(chunk);
            },
          }),
        ),
        ...rest,
      };
    },
  };
}
