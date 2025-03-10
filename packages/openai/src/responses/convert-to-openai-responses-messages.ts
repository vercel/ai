import {
  LanguageModelV1Prompt,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import { convertUint8ArrayToBase64 } from '@ai-sdk/provider-utils';
import { OpenAIResponsesPrompt } from './openai-responses-api-types';

export function convertToOpenAIResponsesMessages({
  prompt,
}: {
  prompt: LanguageModelV1Prompt;
}): OpenAIResponsesPrompt {
  const messages: OpenAIResponsesPrompt = [];

  for (const { role, content } of prompt) {
    switch (role) {
      case 'system': {
        messages.push({ role: 'system', content });
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
        for (const part of content) {
          switch (part.type) {
            case 'text': {
              messages.push({
                role: 'assistant',
                content: [{ type: 'output_text', text: part.text }],
              });
              break;
            }

            case 'tool-call': {
              messages.push({
                type: 'function_call',
                call_id: part.toolCallId,
                name: part.toolName,
                arguments: JSON.stringify(part.args),
              });
              break;
            }
          }
        }

        break;
      }

      case 'tool': {
        for (const part of content) {
          messages.push({
            type: 'function_call_output',
            call_id: part.toolCallId,
            output: JSON.stringify(part.result),
          });
        }

        break;
      }

      default: {
        const _exhaustiveCheck: never = role;
        throw new Error(`Unsupported role: ${_exhaustiveCheck}`);
      }
    }
  }

  return messages;
}
