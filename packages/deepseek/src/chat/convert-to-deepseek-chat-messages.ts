import {
  InvalidPromptError,
  UnsupportedFunctionalityError,
  type LanguageModelV4CallOptions,
  type LanguageModelV4Prompt,
  type SharedV4Warning,
} from '@ai-sdk/provider';
import {
  convertToBase64,
  getTopLevelMediaType,
  parseProviderOptions,
  resolveFullMediaType,
  resolveProviderReference,
} from '@ai-sdk/provider-utils';
import type {
  DeepSeekChatPrompt,
  DeepSeekContentPart,
} from './deepseek-chat-api-types';
import { deepseekFilePartProviderOptions } from './deepseek-file-part-options';
import { deepseekAssistantMessageProviderOptions } from './deepseek-chat-language-model-options';

const supportedImageMediaTypes = new Set([
  'image/gif',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);

export async function convertToDeepSeekChatMessages({
  prompt,
  responseFormat,
  modelId,
  providerOptionsName = 'deepseek',
  supportsAssistantPrefixCompletion = false,
  supportsStructuredOutputs = false,
}: {
  prompt: LanguageModelV4Prompt;
  responseFormat: LanguageModelV4CallOptions['responseFormat'];
  modelId: string;
  providerOptionsName?: string;
  supportsAssistantPrefixCompletion?: boolean;
  supportsStructuredOutputs?: boolean;
}): Promise<{
  messages: DeepSeekChatPrompt;
  warnings: Array<SharedV4Warning>;
}> {
  const isDeepSeekV4 = modelId.includes('deepseek-v4');
  const messages: DeepSeekChatPrompt = [];
  const warnings: Array<SharedV4Warning> = [];

  // Inject system message if response format is JSON
  if (responseFormat?.type === 'json') {
    if (responseFormat.schema == null) {
      messages.push({
        role: 'system',
        content: 'Return JSON.',
      });
    } else if (!supportsStructuredOutputs) {
      messages.push({
        role: 'system',
        content:
          'Return JSON that conforms to the following schema: ' +
          JSON.stringify(responseFormat.schema),
      });
      warnings.push({
        type: 'compatibility',
        feature: 'responseFormat JSON schema',
        details: 'JSON response schema is injected into the system message.',
      });
    }
  }

  // TODO use findLastIndex once we use ES2023
  let lastUserMessageIndex = -1;
  for (let i = prompt.length - 1; i >= 0; i--) {
    if (prompt[i].role === 'user') {
      lastUserMessageIndex = i;
      break;
    }
  }

  let index = -1;
  for (const { role, content, providerOptions } of prompt) {
    index++;

    // The assistant schema extends the common message schema, so one parse
    // validates names for every role and the assistant-only prefix option.
    const deepseekMessageOptions = await parseProviderOptions({
      provider: providerOptionsName,
      providerOptions,
      schema: deepseekAssistantMessageProviderOptions,
    });

    if (deepseekMessageOptions?.prefix === true && role !== 'assistant') {
      throw new InvalidPromptError({
        prompt,
        message:
          'DeepSeek assistant prefix completion requires `prefix: true` on an assistant message.',
      });
    }

    switch (role) {
      case 'system': {
        messages.push({
          role: 'system',
          content,
          ...(deepseekMessageOptions?.name != null && {
            name: deepseekMessageOptions.name,
          }),
        });
        break;
      }

      case 'user': {
        const hasImagePart = content.some(
          part =>
            part.type === 'file' &&
            (part.data.type === 'reference' ||
              part.data.type === 'url' ||
              part.data.type === 'data') &&
            getTopLevelMediaType(part.mediaType) === 'image',
        );

        if (!hasImagePart) {
          let userContent = '';
          for (const part of content) {
            if (part.type === 'text') {
              userContent += part.text;
            } else {
              warnings.push({
                type: 'unsupported',
                feature: `user message part type: ${part.type}`,
              });
            }
          }

          messages.push({
            role: 'user',
            content: userContent,
            ...(deepseekMessageOptions?.name != null && {
              name: deepseekMessageOptions.name,
            }),
          });
          break;
        }

        const userContent: Array<DeepSeekContentPart> = [];
        for (const part of content) {
          if (part.type === 'text') {
            userContent.push({ type: 'text', text: part.text });
          } else if (
            part.type === 'file' &&
            getTopLevelMediaType(part.mediaType) === 'image'
          ) {
            const filePartOptions = await parseProviderOptions({
              provider: providerOptionsName,
              providerOptions: part.providerOptions,
              schema: deepseekFilePartProviderOptions,
            });

            if (part.data.type === 'reference') {
              userContent.push({
                type: 'file',
                file_id: resolveProviderReference({
                  reference: part.data.reference,
                  provider: 'deepseek',
                }),
              });
            } else if (part.data.type === 'url' || part.data.type === 'data') {
              const resolvedMediaType = resolveFullMediaType({ part });

              if (!supportedImageMediaTypes.has(resolvedMediaType)) {
                throw new UnsupportedFunctionalityError({
                  functionality: `DeepSeek image media type ${resolvedMediaType}`,
                  message:
                    'DeepSeek supports JPEG, PNG, GIF, and WebP image inputs.',
                });
              }

              if (part.data.type === 'url') {
                const url = part.data.url.toString();

                if (url.length > 8192) {
                  throw new InvalidPromptError({
                    prompt,
                    message:
                      'DeepSeek image URLs must not exceed 8192 characters.',
                  });
                }

                if (filePartOptions?.fileData === true) {
                  throw new InvalidPromptError({
                    prompt,
                    message:
                      'DeepSeek `fileData` image parts require inline data, not a URL.',
                  });
                }

                userContent.push({
                  type: 'image_url',
                  image_url: {
                    url,
                    ...(filePartOptions?.imageDetail != null && {
                      detail: filePartOptions.imageDetail,
                    }),
                  },
                });
              } else {
                const dataUrl = `data:${
                  resolvedMediaType === 'image/jpg'
                    ? 'image/jpeg'
                    : resolvedMediaType
                };base64,${convertToBase64(part.data.data)}`;

                if (filePartOptions?.fileData === true) {
                  if (filePartOptions.imageDetail != null) {
                    throw new InvalidPromptError({
                      prompt,
                      message:
                        'DeepSeek `imageDetail` cannot be combined with `fileData`.',
                    });
                  }

                  userContent.push({
                    type: 'file',
                    file_data: dataUrl,
                    ...(part.filename != null && { filename: part.filename }),
                  });
                } else {
                  userContent.push({
                    type: 'image_url',
                    image_url: {
                      url: dataUrl,
                      ...(filePartOptions?.imageDetail != null && {
                        detail: filePartOptions.imageDetail,
                      }),
                    },
                  });
                }
              }
            } else {
              warnings.push({
                type: 'unsupported',
                feature: `user message part type: ${part.type}`,
              });
            }
          } else {
            warnings.push({
              type: 'unsupported',
              feature: `user message part type: ${part.type}`,
            });
          }
        }

        messages.push({
          role: 'user',
          content: userContent,
          ...(deepseekMessageOptions?.name != null && {
            name: deepseekMessageOptions.name,
          }),
        });

        break;
      }
      case 'assistant': {
        if (deepseekMessageOptions?.prefix === true) {
          if (index !== prompt.length - 1) {
            throw new InvalidPromptError({
              prompt,
              message:
                'DeepSeek assistant prefix completion requires the prefixed assistant message to be the final message.',
            });
          }

          if (!supportsAssistantPrefixCompletion) {
            throw new UnsupportedFunctionalityError({
              functionality: 'DeepSeek assistant prefix completion',
              message:
                'DeepSeek assistant prefix completion requires a beta base URL ending in `/beta`.',
            });
          }
        }

        let text = '';
        let reasoning: string | undefined;

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
              // R1 must not receive prior reasoning; V4 requires it.
              if (index <= lastUserMessageIndex && !isDeepSeekV4) {
                break;
              }

              if (reasoning == null) {
                reasoning = part.text;
              } else {
                reasoning += part.text;
              }
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

        // V4 demands the field on every assistant turn — back-fill an empty
        // string when the source message had no reasoning part at all.
        messages.push({
          role: 'assistant',
          content: text,
          ...(deepseekMessageOptions?.name != null && {
            name: deepseekMessageOptions.name,
          }),
          ...(deepseekMessageOptions?.prefix === true && {
            prefix: true,
          }),
          reasoning_content: reasoning ?? (isDeepSeekV4 ? '' : undefined),
          tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
        });

        break;
      }

      case 'tool': {
        if (deepseekMessageOptions?.name != null) {
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
        warnings.push({
          type: 'unsupported',
          feature: `message role: ${role}`,
        });
        break;
      }
    }
  }

  return { messages, warnings };
}
