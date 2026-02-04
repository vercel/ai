import {
  LanguageModelV3DataContent,
  LanguageModelV3Prompt,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import { convertToBase64 } from '@ai-sdk/provider-utils';
import { AlibabaChatPrompt } from './alibaba-chat-prompt';
import { CacheControlValidator } from './get-cache-control';

function formatImageUrl({
  data,
  mediaType,
}: {
  data: LanguageModelV3DataContent;
  mediaType: string;
}): string {
  return data instanceof URL
    ? data.toString()
    : `data:${mediaType};base64,${convertToBase64(data as Uint8Array)}`;
}

export function convertToAlibabaChatMessages({
  prompt,
  cacheControlValidator,
}: {
  prompt: LanguageModelV3Prompt;
  cacheControlValidator?: CacheControlValidator;
}): AlibabaChatPrompt {
  const messages: AlibabaChatPrompt = [];

  for (const { role, content, ...message } of prompt) {
    switch (role) {
      case 'system': {
        const cacheControl = cacheControlValidator?.getCacheControl(
          message.providerOptions,
        );

        // If cache_control is present, convert to array format
        if (cacheControl) {
          messages.push({
            role: 'system',
            content: [
              {
                type: 'text',
                text: content,
                cache_control: cacheControl,
              },
            ],
          });
        } else {
          messages.push({ role: 'system', content });
        }
        break;
      }

      case 'user': {
        // Single text part -> use string content
        if (content.length === 1 && content[0].type === 'text') {
          messages.push({
            role: 'user',
            content: content[0].text,
          });
          break;
        }

        // Multi-part content
        messages.push({
          role: 'user',
          content: content.map(part => {
            switch (part.type) {
              case 'text': {
                return { type: 'text', text: part.text };
              }

              case 'file': {
                if (part.mediaType.startsWith('image/')) {
                  const mediaType =
                    part.mediaType === 'image/*'
                      ? 'image/jpeg'
                      : part.mediaType;

                  return {
                    type: 'image_url',
                    image_url: {
                      url: formatImageUrl({ data: part.data, mediaType }),
                    },
                  };
                } else {
                  throw new UnsupportedFunctionalityError({
                    functionality: 'Only image file parts are supported',
                  });
                }
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
                  arguments: JSON.stringify(part.input),
                },
              });
              break;
            }
            case 'reasoning': {
              // Reasoning content is handled separately in the response
              // but may appear in assistant messages during multi-turn conversations
              text += part.text;
              break;
            }
          }
        }

        messages.push({
          role: 'assistant',
          content: text || null,
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
              contentValue = output.reason ?? 'Tool execution denied.';
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

  return messages;
}
