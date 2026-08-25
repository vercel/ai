import {
  UnsupportedFunctionalityError,
  type LanguageModelV4Prompt,
} from '@ai-sdk/provider';
import {
  convertBase64ToUint8Array,
  convertToBase64,
  getTopLevelMediaType,
  resolveFullMediaType,
  resolveProviderReference,
} from '@ai-sdk/provider-utils';

import type { MoonshotAIMessages } from './moonshotai-chat-api-types';

const supportedImageMediaTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/bmp',
  'image/heic',
  'image/heif',
]);

const supportedVideoMediaTypes = new Set([
  'video/mp4',
  'video/mpeg',
  'video/mov',
  'video/avi',
  'video/x-flv',
  'video/mpg',
  'video/webm',
  'video/wmv',
  'video/3gpp',
]);

function validateReferenceMediaType({
  mediaType,
  topLevel,
  supportedMediaTypes,
}: {
  mediaType: string;
  topLevel: 'image' | 'video';
  supportedMediaTypes: Set<string>;
}) {
  if (
    mediaType === topLevel ||
    mediaType === `${topLevel}/*` ||
    supportedMediaTypes.has(mediaType)
  ) {
    return;
  }

  throw new UnsupportedFunctionalityError({
    functionality: `file part media type ${mediaType}`,
  });
}

// Moonshot AI chat completions accepts text, image_url, and video_url content
// parts only. Anything else (audio, PDF, other file types) throws here rather
// than being rejected by the API with a 400.
export function convertToMoonshotAIChatMessages(
  prompt: LanguageModelV4Prompt,
): MoonshotAIMessages {
  const messages: MoonshotAIMessages = [];
  for (const { role, content } of prompt) {
    switch (role) {
      case 'system': {
        messages.push({ role: 'system', content });
        break;
      }

      case 'user': {
        if (content.length === 1 && content[0].type === 'text') {
          messages.push({
            role: 'user',
            content: content[0].text,
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
                switch (part.data.type) {
                  case 'reference': {
                    const reference = resolveProviderReference({
                      reference: part.data.reference,
                      provider: 'moonshotai',
                    });
                    const url = reference.startsWith('ms://')
                      ? reference
                      : `ms://${reference}`;
                    const topLevel = getTopLevelMediaType(part.mediaType);

                    if (topLevel === 'image') {
                      validateReferenceMediaType({
                        mediaType: part.mediaType,
                        topLevel,
                        supportedMediaTypes: supportedImageMediaTypes,
                      });
                      return {
                        type: 'image_url' as const,
                        image_url: { url },
                      };
                    }

                    if (topLevel === 'video') {
                      validateReferenceMediaType({
                        mediaType: part.mediaType,
                        topLevel,
                        supportedMediaTypes: supportedVideoMediaTypes,
                      });
                      return {
                        type: 'video_url' as const,
                        video_url: { url },
                      };
                    }

                    throw new UnsupportedFunctionalityError({
                      functionality: `file part media type ${part.mediaType}`,
                    });
                  }
                  case 'text': {
                    return { type: 'text' as const, text: part.data.text };
                  }
                  case 'url':
                  case 'data': {
                    const topLevel = getTopLevelMediaType(part.mediaType);

                    if (topLevel === 'image') {
                      const mediaType =
                        part.data.type === 'url' && part.mediaType === 'image/*'
                          ? undefined
                          : resolveFullMediaType({ part });

                      if (
                        mediaType != null &&
                        !supportedImageMediaTypes.has(mediaType)
                      ) {
                        throw new UnsupportedFunctionalityError({
                          functionality: `file part media type ${mediaType}`,
                        });
                      }

                      return {
                        type: 'image_url' as const,
                        image_url: {
                          url:
                            part.data.type === 'url'
                              ? part.data.url.toString()
                              : `data:${mediaType};base64,${convertToBase64(part.data.data)}`,
                        },
                      };
                    }

                    if (topLevel === 'video') {
                      const mediaType =
                        part.data.type === 'url' && part.mediaType === 'video/*'
                          ? undefined
                          : resolveFullMediaType({ part });

                      if (
                        mediaType != null &&
                        !supportedVideoMediaTypes.has(mediaType)
                      ) {
                        throw new UnsupportedFunctionalityError({
                          functionality: `file part media type ${mediaType}`,
                        });
                      }

                      return {
                        type: 'video_url' as const,
                        video_url: {
                          url:
                            part.data.type === 'url'
                              ? part.data.url.toString()
                              : `data:${mediaType};base64,${convertToBase64(part.data.data)}`,
                        },
                      };
                    }

                    if (topLevel === 'text') {
                      const textContent =
                        part.data.type === 'url'
                          ? part.data.url.toString()
                          : typeof part.data.data === 'string'
                            ? new TextDecoder().decode(
                                convertBase64ToUint8Array(part.data.data),
                              )
                            : new TextDecoder().decode(part.data.data);

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
              }
            }
          }),
        });

        break;
      }

      case 'assistant': {
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
          ...(reasoning.length > 0 ? { reasoning_content: reasoning } : {}),
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

  return messages;
}
