import {
  UnsupportedFunctionalityError,
  type LanguageModelV4Prompt,
  type LanguageModelV4ToolResultOutput,
  type SharedV4ProviderMetadata,
} from '@ai-sdk/provider';
import type {
  OpenAICompatibleChatPrompt,
  OpenAICompatibleContentPart,
} from './openai-compatible-api-types';
import {
  convertBase64ToUint8Array,
  convertToBase64,
  getTopLevelMediaType,
  resolveFullMediaType,
} from '@ai-sdk/provider-utils';

function getOpenAIMetadata(message: {
  providerOptions?: SharedV4ProviderMetadata;
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

function convertToolContent(
  value: Extract<LanguageModelV4ToolResultOutput, { type: 'content' }>['value'],
): Array<OpenAICompatibleContentPart> {
  return value.map(part => {
    if (part.type === 'text') {
      return { type: 'text', text: part.text };
    }
    if (part.type !== 'file') {
      throw new UnsupportedFunctionalityError({
        functionality: 'custom tool result content',
      });
    }
    if (part.data.type !== 'data' && part.data.type !== 'url') {
      throw new UnsupportedFunctionalityError({
        functionality: 'tool result file references',
      });
    }
    const topLevel = getTopLevelMediaType(part.mediaType);
    if (topLevel === 'image' || topLevel === 'video') {
      const url =
        part.data.type === 'url'
          ? part.data.url.toString()
          : `data:${resolveFullMediaType({ part })};base64,${convertToBase64(part.data.data)}`;
      return topLevel === 'image'
        ? { type: 'image_url', image_url: { url } }
        : { type: 'video_url', video_url: { url } };
    }
    if (topLevel === 'audio') {
      if (part.data.type === 'url') {
        throw new UnsupportedFunctionalityError({
          functionality: 'tool result audio URLs',
        });
      }
      const format = getAudioFormat(resolveFullMediaType({ part }));
      if (format === null) {
        throw new UnsupportedFunctionalityError({
          functionality: `tool result audio media type ${part.mediaType}`,
        });
      }
      return {
        type: 'input_audio',
        input_audio: {
          data: convertToBase64(part.data.data),
          format,
        },
      };
    }
    if (topLevel === 'application') {
      if (part.data.type === 'url') {
        throw new UnsupportedFunctionalityError({
          functionality: 'tool result PDF URLs',
        });
      }
      if (resolveFullMediaType({ part }) !== 'application/pdf') {
        throw new UnsupportedFunctionalityError({
          functionality: `tool result file media type ${part.mediaType}`,
        });
      }
      return {
        type: 'file',
        file: {
          filename: part.filename ?? 'document.pdf',
          file_data: `data:application/pdf;base64,${convertToBase64(part.data.data)}`,
        },
      };
    }
    if (topLevel === 'text') {
      const text =
        part.data.type === 'url'
          ? part.data.url.toString()
          : typeof part.data.data === 'string'
            ? new TextDecoder().decode(
                convertBase64ToUint8Array(part.data.data),
              )
            : new TextDecoder().decode(part.data.data);
      return { type: 'text', text };
    }
    throw new UnsupportedFunctionalityError({
      functionality: `tool result media type ${part.mediaType}`,
    });
  });
}

export function convertToOpenAICompatibleChatMessages(
  prompt: LanguageModelV4Prompt,
  { providerOptionsKey = 'google' }: { providerOptionsKey?: string } = {},
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
          content: content.map(part => {
            const partMetadata = getOpenAIMetadata(part);
            switch (part.type) {
              case 'text': {
                return { type: 'text', text: part.text, ...partMetadata };
              }
              case 'file': {
                switch (part.data.type) {
                  case 'reference': {
                    throw new UnsupportedFunctionalityError({
                      functionality: 'file parts with provider references',
                    });
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
          }),
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
                part.providerOptions?.[providerOptionsKey]?.thoughtSignature ??
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

          let contentValue: string | Array<OpenAICompatibleContentPart>;
          switch (output.type) {
            case 'text':
            case 'error-text':
              contentValue = output.value;
              break;
            case 'execution-denied':
              contentValue = output.reason ?? 'Tool call execution denied.';
              break;
            case 'content':
              contentValue = convertToolContent(output.value);
              break;
            case 'json':
            case 'error-json':
              contentValue = JSON.stringify(output.value);
              break;
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
