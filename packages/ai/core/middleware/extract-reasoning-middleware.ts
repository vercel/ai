import type {
  LanguageModelV2Content,
  LanguageModelV2Middleware,
  LanguageModelV2StreamPart,
} from '@ai-sdk/provider';
import { getPotentialStartIndex } from '../../src/util/get-potential-start-index';

/**
 * Extract an XML-tagged reasoning section from the generated text and exposes it
 * as a `reasoning` property on the result.
 *
 * @param tagName - The name of the XML tag to extract reasoning from.
 * @param separator - The separator to use between reasoning and text sections.
 * @param startWithReasoning - Whether to start with reasoning tokens.
 */
export function extractReasoningMiddleware({
  tagName,
  separator = '\n',
  startWithReasoning = false,
}: {
  tagName: string;
  separator?: string;
  startWithReasoning?: boolean;
}): LanguageModelV2Middleware {
  const openingTag = `<${tagName}>`;
  const closingTag = `<\/${tagName}>`;

  return {
    middlewareVersion: 'v2',
    wrapGenerate: async ({ doGenerate }) => {
      const { content, ...rest } = await doGenerate();

      const transformedContent: LanguageModelV2Content[] = [];
      for (const part of content) {
        if (part.type !== 'text') {
          transformedContent.push(part);
          continue;
        }

        const text = startWithReasoning ? openingTag + part.text : part.text;

        const regexp = new RegExp(`${openingTag}(.*?)${closingTag}`, 'gs');
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

      let isFirstReasoning = true;
      let isFirstText = true;
      let afterSwitch = false;
      let isReasoning = startWithReasoning;
      let buffer = '';

      return {
        stream: stream.pipeThrough(
          new TransformStream<
            LanguageModelV2StreamPart,
            LanguageModelV2StreamPart
          >({
            transform: (chunk, controller) => {
              if (chunk.type !== 'text') {
                controller.enqueue(chunk);
                return;
              }

              buffer += chunk.text;

              function publish(text: string) {
                if (text.length > 0) {
                  const prefix =
                    afterSwitch &&
                    (isReasoning ? !isFirstReasoning : !isFirstText)
                      ? separator
                      : '';

                  controller.enqueue(
                    isReasoning
                      ? {
                          type: 'reasoning',
                          text: prefix + text,
                        }
                      : {
                          type: 'text',
                          text: prefix + text,
                        },
                  );
                  afterSwitch = false;

                  if (isReasoning) {
                    isFirstReasoning = false;
                  } else {
                    isFirstText = false;
                  }
                }
              }

              do {
                const nextTag = isReasoning ? closingTag : openingTag;
                const startIndex = getPotentialStartIndex(buffer, nextTag);

                // no opening or closing tag found, publish the buffer
                if (startIndex == null) {
                  publish(buffer);
                  buffer = '';
                  break;
                }

                // publish text before the tag
                publish(buffer.slice(0, startIndex));

                const foundFullMatch =
                  startIndex + nextTag.length <= buffer.length;

                if (foundFullMatch) {
                  buffer = buffer.slice(startIndex + nextTag.length);

                  // reasoning part finished:
                  if (isReasoning) {
                    controller.enqueue({ type: 'reasoning-part-finish' });
                  }

                  isReasoning = !isReasoning;
                  afterSwitch = true;
                } else {
                  buffer = buffer.slice(startIndex);
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
