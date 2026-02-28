import {
  LanguageModelV3Prompt,
  SharedV3ProviderMetadata,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import {
  OpenAICompatibleChatPrompt,
  OpenAICompatibleContentPart,
} from './openai-compatible-api-types';
import { convertToBase64 } from '@ai-sdk/provider-utils';

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

export function convertToOpenAICompatibleChatMessages(
  prompt: LanguageModelV3Prompt,
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
                        ? part.data
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
          content: text,
          ...(reasoning.length > 0 ? { reasoning_content: reasoning } : {}),
          tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
          ...metadata,
        });

        break;
      }

      case 'tool': {
        // Collect media parts from all tool results in this turn.
        // They will be batched into a single user message after all
        // tool messages to avoid interleaved tool/user ordering.
        const mediaUserContentParts: OpenAICompatibleContentPart[] = [];

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
            case 'content': {
              // Extract text and media parts separately.
              // Text goes into the tool message as a string.
              // Media parts (images) are collected to be injected
              // as a follow-up user message, since the OpenAI chat
              // completions spec only allows string content in tool
              // messages.
              const textParts: string[] = [];
              for (const item of output.value) {
                switch (item.type) {
                  case 'text':
                    textParts.push(item.text);
                    break;
                  case 'image-data':
                    mediaUserContentParts.push({
                      type: 'image_url',
                      image_url: {
                        url: `data:${item.mediaType};base64,${item.data}`,
                      },
                    });
                    break;
                  case 'image-url':
                    mediaUserContentParts.push({
                      type: 'image_url',
                      image_url: { url: item.url },
                    });
                    break;
                  case 'file-data':
                    if (item.mediaType.startsWith('image/')) {
                      mediaUserContentParts.push({
                        type: 'image_url',
                        image_url: {
                          url: `data:${item.mediaType};base64,${item.data}`,
                        },
                      });
                    } else {
                      textParts.push(JSON.stringify(item));
                    }
                    break;
                  default:
                    textParts.push(JSON.stringify(item));
                    break;
                }
              }
              contentValue =
                textParts.length > 0
                  ? textParts.join('\n')
                  : 'See attached media.';
              break;
            }
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

        // Inject a single synthetic user message with all media
        // extracted from tool results. This ensures images reach the
        // model as proper content parts rather than being
        // JSON-stringified in tool messages.
        if (mediaUserContentParts.length > 0) {
          messages.push({
            role: 'user',
            content: [
              {
                type: 'text',
                text: '[Image from tool result]',
              },
              ...mediaUserContentParts,
            ],
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
