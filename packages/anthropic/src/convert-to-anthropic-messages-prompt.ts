import {
  LanguageModelV1Prompt,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import { convertUint8ArrayToBase64, download } from '@ai-sdk/provider-utils';
import {
  AnthropicMessage,
  AnthropicMessagesPrompt,
  AnthropicUserMessage,
} from './anthropic-messages-prompt';

export async function convertToAnthropicMessagesPrompt(
  prompt: LanguageModelV1Prompt,
): Promise<AnthropicMessagesPrompt> {
  let system: string | undefined = undefined;
  const messages: AnthropicMessage[] = [];

  for (const { role, content } of prompt) {
    switch (role) {
      case 'system': {
        if (system != null) {
          throw new UnsupportedFunctionalityError({
            functionality: 'Multiple system messages',
          });
        }

        system = content;
        break;
      }

      case 'user': {
        const anthropicContent: AnthropicUserMessage['content'] = [];

        for (const part of content) {
          switch (part.type) {
            case 'text': {
              anthropicContent.push({ type: 'text', text: part.text });
              break;
            }
            case 'image': {
              if (part.image instanceof URL) {
                const { data, mimeType } = await download({
                  url: part.image,
                });

                anthropicContent.push({
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: mimeType ?? 'image/jpeg',
                    data: convertUint8ArrayToBase64(data),
                  },
                });
              } else {
                anthropicContent.push({
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: part.mimeType ?? 'image/jpeg',
                    data: convertUint8ArrayToBase64(part.image),
                  },
                });
              }
            }
          }
        }

        messages.push({ role: 'user', content: anthropicContent });
        break;
      }

      case 'assistant': {
        messages.push({
          role: 'assistant',
          content: content.map(part => {
            switch (part.type) {
              case 'text': {
                return { type: 'text', text: part.text };
              }
              case 'tool-call': {
                return {
                  type: 'tool_use',
                  id: part.toolCallId,
                  name: part.toolName,
                  input: part.args,
                };
              }
            }
          }),
        });

        break;
      }
      case 'tool': {
        messages.push({
          role: 'user',
          content: content.map(part => ({
            type: 'tool_result',
            tool_use_id: part.toolCallId,
            content: JSON.stringify(part.result),
            is_error: part.isError,
          })),
        });

        break;
      }
      default: {
        const _exhaustiveCheck: never = role;
        throw new Error(`Unsupported role: ${_exhaustiveCheck}`);
      }
    }
  }

  return {
    system,
    messages,
  };
}
