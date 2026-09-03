import {
  InvalidPromptError,
  UnsupportedFunctionalityError,
  type LanguageModelV4FilePart,
  type LanguageModelV4Prompt,
  type SharedV4Warning,
} from '@ai-sdk/provider';
import {
  convertBase64ToUint8Array,
  convertToBase64,
  getTopLevelMediaType,
  parseProviderOptions,
  resolveProviderReference,
  resolveFullMediaType,
} from '@ai-sdk/provider-utils';

import type { MoonshotAIMessages } from './moonshotai-chat-api-types';
import {
  getMoonshotAIModelFamily,
  moonshotaiAllMessageProviderOptions,
  type MoonshotAIChatModelId,
} from './moonshotai-chat-options';
import { prepareTools } from './moonshotai-prepare-tools';

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

function formatMediaUrl({
  part,
  supportedMediaTypes,
  topLevelMediaType,
}: {
  part: LanguageModelV4FilePart;
  supportedMediaTypes: readonly string[];
  topLevelMediaType: 'image' | 'video';
}): string {
  if (part.data.type !== 'url' && part.data.type !== 'data') {
    throw new UnsupportedFunctionalityError({
      functionality: `file part data type ${part.data.type}`,
    });
  }

  const mediaType =
    part.data.type === 'url' ? part.mediaType : resolveFullMediaType({ part });

  if (
    !supportedMediaTypes.includes(mediaType) &&
    !(
      part.data.type === 'url' &&
      (mediaType === topLevelMediaType ||
        mediaType === `${topLevelMediaType}/*`)
    )
  ) {
    throw new UnsupportedFunctionalityError({
      functionality: `file part media type ${mediaType}`,
    });
  }

  return part.data.type === 'url'
    ? part.data.url.toString()
    : `data:${mediaType};base64,${convertToBase64(part.data.data)}`;
}

// Moonshot AI chat completions accepts text, image_url, and video_url content
// parts only. Anything else (audio, PDF, other file types) throws here rather
// than being rejected by the API with a 400.
export async function convertToMoonshotAIChatMessages({
  modelId,
  prompt,
  providerOptionsName = 'moonshotai',
  responseFormat,
}: {
  modelId?: MoonshotAIChatModelId;
  prompt: LanguageModelV4Prompt;
  providerOptionsName?: string;
  responseFormat?: Record<string, unknown>;
}): Promise<{
  messages: MoonshotAIMessages;
  warnings: Array<SharedV4Warning>;
}> {
  const messages: MoonshotAIMessages = [];
  const warnings: Array<SharedV4Warning> = [];
  const modelFamily =
    modelId == null ? 'unknown' : getMoonshotAIModelFamily(modelId);

  for (const [index, { role, content, providerOptions }] of prompt.entries()) {
    const moonshotMessageOptions = await parseProviderOptions({
      provider: providerOptionsName,
      providerOptions,
      schema: moonshotaiAllMessageProviderOptions,
    });

    if (moonshotMessageOptions?.partial === true && role !== 'assistant') {
      throw new InvalidPromptError({
        prompt,
        message:
          'Moonshot AI Partial Mode requires `partial: true` on an assistant message.',
      });
    }

    if (moonshotMessageOptions?.tools != null && role !== 'system') {
      throw new InvalidPromptError({
        prompt,
        message:
          'Moonshot dynamic tools must be configured on a system message.',
      });
    }

    switch (role) {
      case 'system': {
        if (moonshotMessageOptions?.tools?.length) {
          if (content.length > 0) {
            throw new InvalidPromptError({
              prompt,
              message:
                'A Moonshot dynamic-tool system message must use empty content because the API forbids content alongside tools.',
            });
          }

          if (modelFamily !== 'kimi-k3' && modelFamily !== 'unknown') {
            warnings.push({
              type: 'unsupported',
              feature: `dynamic tool loading for model "${modelId}"`,
              details:
                'Moonshot documents dynamic tool loading only for Kimi K3. The dynamic system message has been omitted.',
            });
            break;
          }

          const { tools, toolWarnings } = prepareTools({
            modelId: modelId ?? 'custom-model',
            tools: moonshotMessageOptions.tools,
          });
          warnings.push(...toolWarnings);
          messages.push({ role: 'system', tools: tools ?? [] });
          break;
        }

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
                const topLevel = getTopLevelMediaType(part.mediaType);

                switch (part.data.type) {
                  case 'reference': {
                    if (topLevel !== 'image' && topLevel !== 'video') {
                      throw new UnsupportedFunctionalityError({
                        functionality: `file part media type ${part.mediaType}`,
                      });
                    }

                    const reference = resolveProviderReference({
                      reference: part.data.reference,
                      provider: 'moonshotai',
                    });

                    if (!reference.startsWith('ms://')) {
                      throw new UnsupportedFunctionalityError({
                        functionality:
                          'Moonshot file provider references without an ms:// URL',
                      });
                    }

                    return topLevel === 'image'
                      ? {
                          type: 'image_url' as const,
                          image_url: { url: reference },
                        }
                      : {
                          type: 'video_url' as const,
                          video_url: { url: reference },
                        };
                  }
                  case 'text': {
                    if (topLevel === 'text') {
                      return {
                        type: 'text' as const,
                        text: part.data.text,
                      };
                    }

                    throw new UnsupportedFunctionalityError({
                      functionality: `file part media type ${part.mediaType}`,
                    });
                  }
                  case 'url':
                  case 'data': {
                    if (topLevel === 'image') {
                      return {
                        type: 'image_url' as const,
                        image_url: {
                          url: formatMediaUrl({
                            part,
                            supportedMediaTypes: supportedImageMediaTypes,
                            topLevelMediaType: 'image',
                          }),
                        },
                      };
                    }

                    if (topLevel === 'video') {
                      return {
                        type: 'video_url' as const,
                        video_url: {
                          url: formatMediaUrl({
                            part,
                            supportedMediaTypes: supportedVideoMediaTypes,
                            topLevelMediaType: 'video',
                          }),
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
