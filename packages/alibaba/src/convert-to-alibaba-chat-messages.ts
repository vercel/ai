import {
  type LanguageModelV3DataContent,
  type LanguageModelV3Prompt,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import { convertToBase64 } from '@ai-sdk/provider-utils';
import type { AlibabaChatPrompt } from './alibaba-chat-prompt';
import type { CacheControlValidator } from './get-cache-control';

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
    const messageCacheControl = cacheControlValidator?.getCacheControl(
      message.providerOptions,
    );

    switch (role) {
      case 'system': {
        if (messageCacheControl) {
          messages.push({
            role: 'system',
            content: [
              {
                type: 'text',
                text: content,
                cache_control: messageCacheControl,
              },
            ],
          });
        } else {
          messages.push({ role: 'system', content });
        }
        break;
      }

      case 'user': {
        const isSinglePart = content.length === 1;

        if (
          isSinglePart &&
          content[0].type === 'text' &&
          !messageCacheControl
        ) {
          messages.push({
            role: 'user',
            content: content[0].text,
          });
          break;
        }

        messages.push({
          role: 'user',
          content: content.map(part => {
            const partCacheControl = isSinglePart
              ? messageCacheControl
              : cacheControlValidator?.getCacheControl(part.providerOptions);

            switch (part.type) {
              case 'text': {
                return {
                  type: 'text',
                  text: part.text,
                  ...(partCacheControl
                    ? { cache_control: partCacheControl }
                    : {}),
                };
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
                    ...(partCacheControl
                      ? { cache_control: partCacheControl }
                      : {}),
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
          content: messageCacheControl
            ? [{ type: 'text', text, cache_control: messageCacheControl }]
            : text || null,
          tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
        });

        break;
      }

      case 'tool': {
        const toolResponses = content.filter(
          r => r.type !== 'tool-approval-response',
        );

        const isSinglePart = toolResponses.length === 1;

        for (let i = 0; i < toolResponses.length; i++) {
          const toolResponse = toolResponses[i];
          const output = toolResponse.output;

          const partCacheControl = isSinglePart
            ? messageCacheControl
            : cacheControlValidator?.getCacheControl(
                (toolResponse as any).providerOptions,
              );

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
            content: partCacheControl
              ? [
                  {
                    type: 'text',
                    text: contentValue,
                    cache_control: partCacheControl,
                  },
                ]
              : contentValue,
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
