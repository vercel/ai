import {
  LanguageModelV1Prompt,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import { convertUint8ArrayToBase64 } from '@ai-sdk/provider-utils';
import { MistralChatPrompt } from './mistral-chat-prompt';

export function convertToMistralChatMessages(
  prompt: LanguageModelV1Prompt,
): MistralChatPrompt {
  const messages: MistralChatPrompt = [];

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
                return { type: 'text', text: part.text };
              }
              case 'image': {
                return {
                  type: 'image_url',
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
                  functionality: 'File content parts in user messages',
                });
              }
            }
          }),
        });
        break;
      }

      case 'assistant': {
        let text = '';
        const toolCalls: Array<{
          id: string;
          type: 'function';
          function: { name: string; arguments: string };
        }> = [];

        for (const part of content) {
          switch (part.type) {
            case 'text': {
              text += part.text;
              break;
            }
            case 'tool-call': {
              toolCalls.push({
                id: part.toolCallId,
                type: 'function',
                function: {
                  name: part.toolName,
                  arguments: JSON.stringify(part.args),
                },
              });
              break;
            }
            default: {
              const _exhaustiveCheck: never = part;
              throw new Error(`Unsupported part: ${_exhaustiveCheck}`);
            }
          }
        }

        messages.push({
          role: 'assistant',
          content: text,
          tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
        });

        break;
      }
      case 'tool': {
        for (const toolResponse of content) {
          messages.push({
            role: 'tool',
            name: toolResponse.toolName,
            content: JSON.stringify(toolResponse.result),
            tool_call_id: toolResponse.toolCallId,
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
