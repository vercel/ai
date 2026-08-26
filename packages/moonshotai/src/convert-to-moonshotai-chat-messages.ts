import {
  InvalidArgumentError,
  InvalidPromptError,
  UnsupportedFunctionalityError,
  type LanguageModelV3Prompt,
  type SharedV3Warning,
} from '@ai-sdk/provider';
import {
  convertBase64ToUint8Array,
  convertToBase64,
} from '@ai-sdk/provider-utils';

import type { MoonshotAIMessages } from './moonshotai-chat-api-types';
import { moonshotaiAssistantMessageProviderOptions } from './moonshotai-chat-options';

function parseMoonshotAIMessageProviderOptions({
  providerOptions,
  providerOptionsName,
}: {
  providerOptions: Record<string, unknown> | undefined;
  providerOptionsName: string;
}) {
  const value = providerOptions?.[providerOptionsName];
  if (value == null) {
    return undefined;
  }

  const result = moonshotaiAssistantMessageProviderOptions.safeParse(value);
  if (!result.success) {
    throw new InvalidArgumentError({
      argument: 'providerOptions',
      message: `invalid ${providerOptionsName} provider options`,
      cause: result.error,
    });
  }

  return result.data;
}

const supportedImageMediaTypes = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/bmp',
  'image/heic',
  'image/heif',
] as const;

const supportedVideoMediaTypes = [
  'video/mp4',
  'video/mpeg',
  'video/mov',
  'video/avi',
  'video/x-flv',
  'video/mpg',
  'video/webm',
  'video/wmv',
  'video/3gpp',
] as const;

function validateMediaType({
  mediaType,
  supportedMediaTypes,
  topLevelMediaType,
}: {
  mediaType: string;
  supportedMediaTypes: readonly string[];
  topLevelMediaType: 'image' | 'video';
}): string {
  const normalizedMediaType =
    mediaType === `${topLevelMediaType}/*`
      ? topLevelMediaType === 'image'
        ? 'image/jpeg'
        : 'video/mp4'
      : mediaType;

  if (!supportedMediaTypes.includes(normalizedMediaType)) {
    throw new UnsupportedFunctionalityError({
      functionality: `file part media type ${normalizedMediaType}`,
    });
  }

  return normalizedMediaType;
}

// Moonshot AI chat completions accepts text, image_url, and video_url content
// parts only. Anything else (audio, PDF, other file types) throws here rather
// than being rejected by the API with a 400.
export function convertToMoonshotAIChatMessages({
  prompt,
  providerOptionsName = 'moonshotai',
  responseFormat,
}: {
  prompt: LanguageModelV3Prompt;
  providerOptionsName?: string;
  responseFormat?: Record<string, unknown>;
}): {
  messages: MoonshotAIMessages;
  warnings: Array<SharedV3Warning>;
} {
  const messages: MoonshotAIMessages = [];
  const warnings: Array<SharedV3Warning> = [];

  for (const [index, { role, content, providerOptions }] of prompt.entries()) {
    const moonshotMessageOptions = parseMoonshotAIMessageProviderOptions({
      providerOptions,
      providerOptionsName,
    });

    if (moonshotMessageOptions?.partial === true && role !== 'assistant') {
      throw new InvalidPromptError({
        prompt,
        message:
          'Moonshot AI Partial Mode requires `partial: true` on an assistant message.',
      });
    }

    switch (role) {
      case 'system': {
        messages.push({
          role: 'system',
          content,
          ...(moonshotMessageOptions?.name != null && {
            name: moonshotMessageOptions.name,
          }),
        });
        break;
      }

      case 'user': {
        if (content.length === 1 && content[0].type === 'text') {
          messages.push({
            role: 'user',
            content: content[0].text,
            ...(moonshotMessageOptions?.name != null && {
              name: moonshotMessageOptions.name,
            }),
          });
          break;
        }

        messages.push({
          role: 'user',
          content: content.map(part => {
            switch (part.type) {
              case 'text': {
                return { type: 'text', text: part.text };
              }
              case 'file': {
                if (part.mediaType.startsWith('image/')) {
                  const mediaType = validateMediaType({
                    mediaType: part.mediaType,
                    supportedMediaTypes: supportedImageMediaTypes,
                    topLevelMediaType: 'image',
                  });

                  return {
                    type: 'image_url' as const,
                    image_url: {
                      url:
                        part.data instanceof URL
                          ? part.data.toString()
                          : `data:${mediaType};base64,${convertToBase64(part.data)}`,
                    },
                  };
                }

                if (part.mediaType.startsWith('video/')) {
                  const mediaType = validateMediaType({
                    mediaType: part.mediaType,
                    supportedMediaTypes: supportedVideoMediaTypes,
                    topLevelMediaType: 'video',
                  });

                  return {
                    type: 'video_url' as const,
                    video_url: {
                      url:
                        part.data instanceof URL
                          ? part.data.toString()
                          : `data:${mediaType};base64,${convertToBase64(part.data)}`,
                    },
                  };
                }

                if (part.mediaType.startsWith('text/')) {
                  const textContent =
                    part.data instanceof URL
                      ? part.data.toString()
                      : typeof part.data === 'string'
                        ? new TextDecoder().decode(
                            convertBase64ToUint8Array(part.data),
                          )
                        : new TextDecoder().decode(part.data);

                  return {
                    type: 'text' as const,
                    text: textContent,
                  };
                }

                throw new UnsupportedFunctionalityError({
                  functionality: `file part media type ${part.mediaType}`,
                });
              }
            }
          }),
          ...(moonshotMessageOptions?.name != null && {
            name: moonshotMessageOptions.name,
          }),
        });

        break;
      }

      case 'assistant': {
        if (moonshotMessageOptions?.partial === true) {
          if (index !== prompt.length - 1) {
            throw new InvalidPromptError({
              prompt,
              message:
                'Moonshot AI Partial Mode requires the partial assistant message to be the final message.',
            });
          }

          if (responseFormat?.type === 'json_object') {
            throw new InvalidPromptError({
              prompt,
              message:
                'Moonshot AI Partial Mode cannot be combined with JSON object response format.',
            });
          }
        }

        let text = '';
        let reasoning = '';
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
            case 'reasoning': {
              reasoning += part.text;
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
          content: toolCalls.length > 0 ? text || null : text,
          ...(moonshotMessageOptions?.name != null && {
            name: moonshotMessageOptions.name,
          }),
          ...(moonshotMessageOptions?.partial === true && {
            partial: true,
          }),
          ...(reasoning.length > 0 ? { reasoning_content: reasoning } : {}),
          tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
        });

        break;
      }

      case 'tool': {
        if (moonshotMessageOptions?.name != null) {
          warnings.push({
            type: 'unsupported',
            feature: 'message name on tool messages',
          });
        }

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
