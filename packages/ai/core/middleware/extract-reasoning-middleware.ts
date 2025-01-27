import { LanguageModelV1StreamPart } from '@ai-sdk/provider';
import { Experimental_LanguageModelV1Middleware } from './language-model-v1-middleware';
import { getPotentialStartIndex } from '../util/get-potential-start-index';
import { read } from 'fs';

/**
 * Extract an XML-tagged reasoning section from the generated text and exposes it
 * as a `reasoning` property on the result.
 *
 * @param tagName - The name of the XML tag to extract reasoning from.
 * @param separator - The separator to use between reasoning and text sections.
 */
export function extractReasoningMiddleware({
  tagName,
  separator = '\n',
}: {
  tagName: string;
  separator?: string;
}): Experimental_LanguageModelV1Middleware {
  const openingTag = `<${tagName}>`;
  const closingTag = `<\/${tagName}>`;

  return {
    wrapGenerate: async ({ doGenerate }) => {
      const { text, ...rest } = await doGenerate();

      if (text == null) {
        return { text, ...rest };
      }

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

      return { text: textWithoutReasoning, reasoning, ...rest };
    },

    wrapStream: async ({ doStream }) => {
      const { stream, ...rest } = await doStream();

      let isReasoning: boolean = false;
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
                  controller.enqueue({
                    type: isReasoning ? 'reasoning' : 'text-delta',
                    textDelta: text,
                  });
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
