import type {
  LanguageModelV4Content,
  LanguageModelV4StreamPart,
} from '@ai-sdk/provider';
import type { LanguageModelMiddleware } from '../types/language-model-middleware';
import { InvalidArgumentError } from '../error/invalid-argument-error';
import { createIdMap } from '../util/create-id-map';
import { getPotentialStartIndex } from '../util/get-potential-start-index';

/**
 * Extracts a delimited reasoning section from the generated text and exposes it
 * as a `reasoning` property on the result.
 *
 * @param tagName - An XML tag name (without angle brackets), or literal opening
 * and closing delimiters for formats such as Gemma's thought channel.
 * @param separator - The separator to use between reasoning and text sections.
 * @param startWithReasoning - Whether to start with reasoning tokens.
 */
export function extractReasoningMiddleware({
  tagName,
  separator = '\n',
  startWithReasoning = false,
}: {
  tagName: string | { opening: string; closing: string };
  separator?: string;
  startWithReasoning?: boolean;
}): LanguageModelMiddleware {
  const openingTag =
    typeof tagName === 'string' ? `<${tagName}>` : tagName.opening;
  const closingTag =
    typeof tagName === 'string' ? `</${tagName}>` : tagName.closing;

  if (openingTag.length === 0 || closingTag.length === 0) {
    throw new InvalidArgumentError({
      parameter: 'tagName',
      value: tagName,
      message: 'Reasoning delimiters must not be empty.',
    });
  }

  // Delimiters are literal strings, including regex metacharacters such as `|`.
  const escapedOpeningTag = openingTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedClosingTag = closingTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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

        const text = startWithReasoning ? openingTag + part.text : part.text;

        const regexp = new RegExp(
          `${escapedOpeningTag}(.*?)${escapedClosingTag}`,
          'gs',
        );
        const matches = Array.from(text.matchAll(regexp));

        if (!matches.length) {
          transformedContent.push(part);
          continue;
        }

        const reasoningText = matches.map(match => match[1]).join(separator);

        let textWithoutReasoning = text;
        for (let i = matches.length - 1; i >= 0; i--) {
          const match = matches[i];

          const beforeMatch = textWithoutReasoning.slice(0, match.index);
          const afterMatch = textWithoutReasoning.slice(
            match.index! + match[0].length,
          );

          textWithoutReasoning =
            beforeMatch +
            (beforeMatch.length > 0 && afterMatch.length > 0 ? separator : '') +
            afterMatch;
        }

        transformedContent.push({
          type: 'reasoning',
          text: reasoningText,
        });

        transformedContent.push({
          type: 'text',
          text: textWithoutReasoning,
        });
      }

      return { content: transformedContent, ...rest };
    },

    wrapStream: async ({ doStream }) => {
      const { stream, ...rest } = await doStream();

      const reasoningExtractions: Record<
        string,
        {
          isFirstReasoning: boolean;
          isFirstText: boolean;
          afterSwitch: boolean;
          isReasoning: boolean;
          buffer: string;
          reasoningId: string | undefined;
          textId: string;
        }
      > = createIdMap();

      let reasoningIdCounter = 0;

      const delayedTextStarts: Record<
        string,
        Extract<LanguageModelV4StreamPart, { type: 'text-start' }>
      > = createIdMap();

      return {
        stream: stream.pipeThrough(
          new TransformStream<
            LanguageModelV4StreamPart,
            LanguageModelV4StreamPart
          >({
            transform: (chunk, controller) => {
              // do not send `text-start` before `reasoning-start`
              // https://github.com/vercel/ai/issues/7774
              if (chunk.type === 'text-start') {
                delayedTextStarts[chunk.id] = chunk;
                return;
              }

              if (chunk.type !== 'text-delta' && chunk.type !== 'text-end') {
                controller.enqueue(chunk);
                return;
              }

              if (
                chunk.type === 'text-delta' &&
                reasoningExtractions[chunk.id] == null
              ) {
                reasoningExtractions[chunk.id] = {
                  isFirstReasoning: true,
                  isFirstText: true,
                  afterSwitch: false,
                  isReasoning: startWithReasoning,
                  buffer: '',
                  reasoningId: undefined,
                  textId: chunk.id,
                };
              }

              const activeExtraction = reasoningExtractions[chunk.id];

              if (activeExtraction == null) {
                if (delayedTextStarts[chunk.id] != null) {
                  controller.enqueue(delayedTextStarts[chunk.id]);
                  delete delayedTextStarts[chunk.id];
                }
                controller.enqueue(chunk);
                return;
              }

              function getReasoningId() {
                return (activeExtraction.reasoningId ??= `reasoning-${reasoningIdCounter++}`);
              }

              function publish(text: string) {
                if (text.length > 0) {
                  const prefix =
                    activeExtraction.afterSwitch &&
                    (activeExtraction.isReasoning
                      ? !activeExtraction.isFirstReasoning
                      : !activeExtraction.isFirstText)
                      ? separator
                      : '';

                  if (
                    activeExtraction.isReasoning &&
                    (activeExtraction.afterSwitch ||
                      activeExtraction.isFirstReasoning)
                  ) {
                    controller.enqueue({
                      type: 'reasoning-start',
                      id: getReasoningId(),
                    });
                  }

                  if (activeExtraction.isReasoning) {
                    controller.enqueue({
                      type: 'reasoning-delta',
                      delta: prefix + text,
                      id: getReasoningId(),
                    });
                  } else {
                    if (delayedTextStarts[activeExtraction.textId] != null) {
                      controller.enqueue(
                        delayedTextStarts[activeExtraction.textId],
                      );
                      delete delayedTextStarts[activeExtraction.textId];
                    }
                    controller.enqueue({
                      type: 'text-delta',
                      delta: prefix + text,
                      id: activeExtraction.textId,
                    });
                  }
                  activeExtraction.afterSwitch = false;

                  if (activeExtraction.isReasoning) {
                    activeExtraction.isFirstReasoning = false;
                  } else {
                    activeExtraction.isFirstText = false;
                  }
                }
              }

              if (chunk.type === 'text-end') {
                publish(activeExtraction.buffer);
                activeExtraction.buffer = '';

                if (delayedTextStarts[chunk.id] != null) {
                  controller.enqueue(delayedTextStarts[chunk.id]);
                  delete delayedTextStarts[chunk.id];
                }
                controller.enqueue(chunk);
                return;
              }

              activeExtraction.buffer += chunk.delta;

              do {
                const nextTag = activeExtraction.isReasoning
                  ? closingTag
                  : openingTag;

                const startIndex = getPotentialStartIndex(
                  activeExtraction.buffer,
                  nextTag,
                );

                // no opening or closing tag found, publish the buffer
                if (startIndex == null) {
                  publish(activeExtraction.buffer);
                  activeExtraction.buffer = '';
                  break;
                }

                // publish text before the tag
                publish(activeExtraction.buffer.slice(0, startIndex));

                const foundFullMatch =
                  startIndex + nextTag.length <= activeExtraction.buffer.length;

                if (foundFullMatch) {
                  activeExtraction.buffer = activeExtraction.buffer.slice(
                    startIndex + nextTag.length,
                  );

                  if (activeExtraction.isReasoning) {
                    // Emit reasoning-start for empty reasoning blocks (no delta was published).
                    // This handles both cases:
                    // - startWithReasoning=false: <think></think> (afterSwitch=true)
                    // - startWithReasoning=true: immediate </think> (afterSwitch=false)
                    if (activeExtraction.isFirstReasoning) {
                      controller.enqueue({
                        type: 'reasoning-start',
                        id: getReasoningId(),
                      });
                    }

                    // reasoning part finished:
                    controller.enqueue({
                      type: 'reasoning-end',
                      id: getReasoningId(),
                    });
                    activeExtraction.reasoningId = undefined;
                  }

                  activeExtraction.isReasoning = !activeExtraction.isReasoning;
                  activeExtraction.afterSwitch = true;
                } else {
                  activeExtraction.buffer =
                    activeExtraction.buffer.slice(startIndex);
                  break;
                }
              } while (true);
            },
          }),
        ),
        ...rest,
      };
    },
  };
}
