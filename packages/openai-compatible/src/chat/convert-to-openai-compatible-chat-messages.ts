import {
  UnsupportedFunctionalityError,
  type LanguageModelV3Prompt,
  type SharedV3ProviderMetadata,
} from '@ai-sdk/provider';
import type { OpenAICompatibleChatPrompt } from './openai-compatible-api-types';
import {
  convertBase64ToUint8Array,
  convertToBase64,
<<<<<<< HEAD
=======
  getTopLevelMediaType,
  resolveFullMediaType,
  resolveProviderReference,
>>>>>>> 2c6996ec62 (feat(openai-compatible): support uploaded file references via file_id (#22466))
} from '@ai-sdk/provider-utils';

function getOpenAIMetadata(message: {
  providerOptions?: SharedV3ProviderMetadata;
}) {
  return message?.providerOptions?.openaiCompatible ?? {};
}

function getAudioFormat(mediaType: string): 'wav' | 'mp3' | null {
  switch (mediaType) {
    case 'audio/wav':
      return 'wav';
    case 'audio/mp3':
    case 'audio/mpeg':
      return 'mp3';
    default:
      return null;
  }
}

<<<<<<< HEAD
export function convertToOpenAICompatibleChatMessages(
  prompt: LanguageModelV3Prompt,
=======
function convertToOpenAICompatibleContentPart(
  part: LanguageModelV4TextPart | LanguageModelV4FilePart,
  provider: string,
): OpenAICompatibleContentPart {
  const partMetadata = getOpenAIMetadata(part);

  switch (part.type) {
    case 'text': {
      return { type: 'text', text: part.text, ...partMetadata };
    }
    case 'file': {
      switch (part.data.type) {
        case 'reference': {
          return {
            type: 'file',
            file: {
              file_id: resolveProviderReference({
                reference: part.data.reference,
                provider,
              }),
            },
            ...partMetadata,
          };
        }
        case 'text': {
          throw new UnsupportedFunctionalityError({
            functionality: 'text file parts',
          });
        }
        case 'url':
        case 'data': {
          const topLevel = getTopLevelMediaType(part.mediaType);

          if (topLevel === 'image') {
            return {
              type: 'image_url',
              image_url: {
                url:
                  part.data.type === 'url'
                    ? part.data.url.toString()
                    : `data:${resolveFullMediaType({ part })};base64,${convertToBase64(part.data.data)}`,
              },
              ...partMetadata,
            };
          }

          if (topLevel === 'video') {
            return {
              type: 'video_url',
              video_url: {
                url:
                  part.data.type === 'url'
                    ? part.data.url.toString()
                    : `data:${resolveFullMediaType({ part })};base64,${convertToBase64(part.data.data)}`,
              },
              ...partMetadata,
            };
          }

          if (topLevel === 'audio') {
            if (part.data.type === 'url') {
              throw new UnsupportedFunctionalityError({
                functionality: 'audio file parts with URLs',
              });
            }

            const fullMediaType = resolveFullMediaType({ part });
            const format = getAudioFormat(fullMediaType);
            if (format === null) {
              throw new UnsupportedFunctionalityError({
                functionality: `audio media type ${fullMediaType}`,
              });
            }

            return {
              type: 'input_audio',
              input_audio: {
                data: convertToBase64(part.data.data),
                format,
              },
              ...partMetadata,
            };
          }

          if (topLevel === 'application') {
            if (part.data.type === 'url') {
              throw new UnsupportedFunctionalityError({
                functionality: 'PDF file parts with URLs',
              });
            }

            const fullMediaType = resolveFullMediaType({ part });
            if (fullMediaType !== 'application/pdf') {
              throw new UnsupportedFunctionalityError({
                functionality: `file part media type ${fullMediaType}`,
              });
            }

            return {
              type: 'file',
              file: {
                filename: part.filename ?? 'document.pdf',
                file_data: `data:application/pdf;base64,${convertToBase64(part.data.data)}`,
              },
              ...partMetadata,
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
              type: 'text',
              text: textContent,
              ...partMetadata,
            };
          }

          throw new UnsupportedFunctionalityError({
            functionality: `file part media type ${part.mediaType}`,
          });
        }
      }
    }
  }
}

function convertToolContentPart(
  part: Extract<
    LanguageModelV4ToolResultOutput,
    { type: 'content' }
  >['value'][number],
  provider: string,
): OpenAICompatibleContentPart {
  if (part.type === 'custom') {
    throw new UnsupportedFunctionalityError({
      functionality: 'custom tool content parts',
    });
  }

  return convertToOpenAICompatibleContentPart(part, provider);
}

export function convertToOpenAICompatibleChatMessages(
  prompt: LanguageModelV4Prompt,
  {
    provider = 'openaiCompatible',
    providerOptionsKey = 'google',
    supportsMultiPartToolContent = false,
  }: {
    provider?: string;
    providerOptionsKey?: string;
    supportsMultiPartToolContent?: boolean;
  } = {},
>>>>>>> 2c6996ec62 (feat(openai-compatible): support uploaded file references via file_id (#22466))
): OpenAICompatibleChatPrompt {
  const messages: OpenAICompatibleChatPrompt = [];
  for (const { role, content, ...message } of prompt) {
    const metadata = getOpenAIMetadata({ ...message });
    switch (role) {
      case 'system': {
        messages.push({ role: 'system', content, ...metadata });
        break;
      }

      case 'user': {
        if (content.length === 1 && content[0].type === 'text') {
          messages.push({
            role: 'user',
            content: content[0].text,
            ...getOpenAIMetadata(content[0]),
          });
          break;
        }

        messages.push({
          role: 'user',
<<<<<<< HEAD
          content: content.map(part => {
            const partMetadata = getOpenAIMetadata(part);
            switch (part.type) {
              case 'text': {
                return { type: 'text', text: part.text, ...partMetadata };
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
                      url:
                        part.data instanceof URL
                          ? part.data.toString()
                          : `data:${mediaType};base64,${convertToBase64(part.data)}`,
                    },
                    ...partMetadata,
                  };
                }

                if (part.mediaType.startsWith('audio/')) {
                  if (part.data instanceof URL) {
                    throw new UnsupportedFunctionalityError({
                      functionality: 'audio file parts with URLs',
                    });
                  }

                  const format = getAudioFormat(part.mediaType);
                  if (format === null) {
                    throw new UnsupportedFunctionalityError({
                      functionality: `audio media type ${part.mediaType}`,
                    });
                  }

                  return {
                    type: 'input_audio',
                    input_audio: {
                      data: convertToBase64(part.data),
                      format,
                    },
                    ...partMetadata,
                  };
                }

                if (part.mediaType === 'application/pdf') {
                  if (part.data instanceof URL) {
                    throw new UnsupportedFunctionalityError({
                      functionality: 'PDF file parts with URLs',
                    });
                  }

                  return {
                    type: 'file',
                    file: {
                      filename: part.filename ?? 'document.pdf',
                      file_data: `data:application/pdf;base64,${convertToBase64(part.data)}`,
                    },
                    ...partMetadata,
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
                    type: 'text',
                    text: textContent,
                    ...partMetadata,
                  };
                }

                // Unsupported type
                throw new UnsupportedFunctionalityError({
                  functionality: `file part media type ${part.mediaType}`,
                });
              }
            }
          }),
=======
          content: content.map(part =>
            convertToOpenAICompatibleContentPart(part, provider),
          ),
>>>>>>> 2c6996ec62 (feat(openai-compatible): support uploaded file references via file_id (#22466))
          ...metadata,
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
          extra_content?: {
            google?: {
              thought_signature?: string;
            };
          };
        }> = [];

        for (const part of content) {
          const partMetadata = getOpenAIMetadata(part);
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
              // TODO: thoughtSignature should be abstracted once we add support for other providers
              const thoughtSignature =
                part.providerOptions?.google?.thoughtSignature;
              toolCalls.push({
                id: part.toolCallId,
                type: 'function',
                function: {
                  name: part.toolName,
                  arguments: JSON.stringify(part.input),
                },
                ...partMetadata,
                // Include extra_content for Google Gemini thought signatures
                ...(thoughtSignature
                  ? {
                      extra_content: {
                        google: {
                          thought_signature: String(thoughtSignature),
                        },
                      },
                    }
                  : {}),
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
          ...metadata,
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
<<<<<<< HEAD
=======
            case 'content':
              contentValue = supportsMultiPartToolContent
                ? output.value.map(part =>
                    convertToolContentPart(part, provider),
                  )
                : JSON.stringify(output.value);
              break;
>>>>>>> 2c6996ec62 (feat(openai-compatible): support uploaded file references via file_id (#22466))
          }

          const toolResponseMetadata = getOpenAIMetadata(toolResponse);
          messages.push({
            role: 'tool',
            tool_call_id: toolResponse.toolCallId,
            content: contentValue,
            ...toolResponseMetadata,
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
