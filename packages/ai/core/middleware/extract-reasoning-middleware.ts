import type { LanguageModelV1StreamPart } from '@ai-sdk/provider';
import { getPotentialStartIndex } from '../util/get-potential-start-index';
import type { LanguageModelV1Middleware } from './language-model-v1-middleware';

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
}): LanguageModelV1Middleware {
  const openingTag = `<${tagName}>`;
  const closingTag = `<\/${tagName}>`;

  return {
    middlewareVersion: 'v1',
    wrapGenerate: async ({ doGenerate }) => {
      const { text: rawText, ...rest } = await doGenerate();

      if (rawText == null) {
        return { text: rawText, ...rest };
      }

      const text = startWithReasoning ? openingTag + rawText : rawText;

      const regexp = new RegExp(`${openingTag}(.*?)${closingTag}`, 'gs');
      const matches = Array.from(text.matchAll(regexp));

      if (!matches.length) {
        return { text, ...rest };
      }

      const reasoning = matches.map(match => match[1]).join(separator);

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

      return { ...rest, text: textWithoutReasoning, reasoning };
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
            LanguageModelV1StreamPart,
            LanguageModelV1StreamPart
          >({
            transform: (chunk, controller) => {
              if (chunk.type !== 'text-delta') {
                controller.enqueue(chunk);
                return;
              }

              buffer += chunk.textDelta;

              function publish(text: string) {
                if (text.length > 0) {
                  const prefix =
                    afterSwitch &&
                    (isReasoning ? !isFirstReasoning : !isFirstText)
                      ? separator
                      : '';

                  controller.enqueue({
                    type: isReasoning ? 'reasoning' : 'text-delta',
                    textDelta: prefix + text,
                  });
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
