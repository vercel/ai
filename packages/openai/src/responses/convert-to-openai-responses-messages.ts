import {
  LanguageModelV1Prompt,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import { OpenAIResponsesPrompt } from './openai-responses-prompt';
import { convertUint8ArrayToBase64 } from '@ai-sdk/provider-utils';

export function convertToOpenAIResponsesMessages({
  prompt,
}: {
  prompt: LanguageModelV1Prompt;
}): OpenAIResponsesPrompt {
  const messages: OpenAIResponsesPrompt = [];

  for (const { role, content } of prompt) {
    switch (role) {
      case 'system': {
        break;
      }

      case 'user': {
        messages.push({
          role: 'user',
          content: content.map(part => {
            switch (part.type) {
              case 'text': {
                return { type: 'input_text', text: part.text };
              }

              case 'image': {
                return {
                  type: 'input_image',
                  image_url:
                    part.image instanceof URL
                      ? part.image.toString()
                      : `data:${
                          part.mimeType ?? 'image/jpeg'
                        };base64,${convertUint8ArrayToBase64(part.image)}`,
                };
              }

              case 'file': {
                throw new UnsupportedFunctionalityError({
                  functionality: 'Image content parts in user messages',
                });
              }
            }
          }),
        });

        break;
      }

      case 'assistant': {
        messages.push({
          role: 'assistant',
          content: content.map(part => {
            switch (part.type) {
              case 'text': {
                return { type: 'output_text', text: part.text };
              }

              default: {
                throw new UnsupportedFunctionalityError({
                  functionality:
                    'Unsupported content part type in assistant messages',
                });
              }
            }
          }),
        });

        break;
      }

      case 'tool': {
        throw new UnsupportedFunctionalityError({
          functionality: 'Tool messages',
        });
      }

      default: {
        const _exhaustiveCheck: never = role;
        throw new Error(`Unsupported role: ${_exhaustiveCheck}`);
      }
    }
  }

  return messages;
}
