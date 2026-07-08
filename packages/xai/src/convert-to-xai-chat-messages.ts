import {
  UnsupportedFunctionalityError,
  type SharedV3Warning,
  type LanguageModelV3Prompt,
} from '@ai-sdk/provider';
import { convertToBase64, parseProviderOptions } from '@ai-sdk/provider-utils';
import type { XaiChatPrompt, XaiUserMessageContent } from './xai-chat-prompt';
import { xaiFilePartProviderOptions } from './xai-file-part-options';

export async function convertToXaiChatMessages(
  prompt: LanguageModelV3Prompt,
): Promise<{
  messages: XaiChatPrompt;
  warnings: Array<SharedV3Warning>;
}> {
  const messages: XaiChatPrompt = [];
  const warnings: Array<SharedV3Warning> = [];

  for (const { role, content } of prompt) {
    switch (role) {
      case 'system': {
        messages.push({ role: 'system', content });
        break;
      }

      case 'user': {
        if (content.length === 1 && content[0].type === 'text') {
          messages.push({ role: 'user', content: content[0].text });
          break;
        }

        const userContent: Array<XaiUserMessageContent> = [];

        for (const part of content) {
          switch (part.type) {
            case 'text': {
              userContent.push({ type: 'text', text: part.text });
              break;
            }
            case 'file': {
              if (part.mediaType.startsWith('image/')) {
                const mediaType =
                  part.mediaType === 'image/*' ? 'image/jpeg' : part.mediaType;

                const filePartOptions = await parseProviderOptions({
                  provider: 'xai',
                  providerOptions: part.providerOptions,
                  schema: xaiFilePartProviderOptions,
                });

                userContent.push({
                  type: 'image_url',
                  image_url: {
                    url:
                      part.data instanceof URL
                        ? part.data.toString()
                        : `data:${mediaType};base64,${convertToBase64(part.data)}`,
                    ...(filePartOptions?.imageDetail != null && {
                      detail: filePartOptions.imageDetail,
                    }),
                  },
                });
              } else {
                throw new UnsupportedFunctionalityError({
                  functionality: `file part media type ${part.mediaType}`,
                });
              }
              break;
            }
          }
        }

        messages.push({ role: 'user', content: userContent });

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
                  arguments: JSON.stringify(part.input),
                },
              });
              break;
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
          if (toolResponse.type === 'tool-approval-response') {
            continue;
          }
          const output = toolResponse.output;

          let contentValue: string;
          switch (output.type) {
            case 'text':
            case 'error-text':
              contentValue = output.value;
              break;
            case 'execution-denied':
              contentValue = output.reason ?? 'Tool call execution denied.';
              break;
            case 'content':
            case 'json':
            case 'error-json':
              contentValue = JSON.stringify(output.value);
              break;
          }

          messages.push({
            role: 'tool',
            tool_call_id: toolResponse.toolCallId,
            content: contentValue,
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

  return { messages, warnings };
}
