import {
  UnsupportedFunctionalityError,
  type SharedV3Warning,
  type LanguageModelV3Prompt,
  type SharedV3ProviderOptions,
} from '@ai-sdk/provider';
import type { OpenAIChatPrompt } from './openai-chat-prompt';
import { convertToBase64 } from '@ai-sdk/provider-utils';

function serializeToolCallArguments(input: unknown): string {
  return JSON.stringify(input === undefined ? {} : input);
}

type OpenAIPromptCacheBreakpoint = { mode: 'explicit' };

function getPromptCacheBreakpoint(
  providerOptions: SharedV3ProviderOptions | undefined,
): OpenAIPromptCacheBreakpoint | undefined {
  return providerOptions?.openai?.promptCacheBreakpoint as
    | OpenAIPromptCacheBreakpoint
    | undefined;
}

export function convertToOpenAIChatMessages({
  prompt,
  systemMessageMode = 'system',
}: {
  prompt: LanguageModelV3Prompt;
  systemMessageMode?: 'system' | 'developer' | 'remove';
}): {
  messages: OpenAIChatPrompt;
  warnings: Array<SharedV3Warning>;
} {
  const messages: OpenAIChatPrompt = [];
  const warnings: Array<SharedV3Warning> = [];

  for (const { role, content, providerOptions } of prompt) {
    switch (role) {
      case 'system': {
        switch (systemMessageMode) {
          case 'system': {
            const promptCacheBreakpoint =
              getPromptCacheBreakpoint(providerOptions);
            messages.push({
              role: 'system',
              content:
                promptCacheBreakpoint == null
                  ? content
                  : [
                      {
                        type: 'text',
                        text: content,
                        prompt_cache_breakpoint: promptCacheBreakpoint,
                      },
                    ],
            });
            break;
          }
          case 'developer': {
            const promptCacheBreakpoint =
              getPromptCacheBreakpoint(providerOptions);
            messages.push({
              role: 'developer',
              content:
                promptCacheBreakpoint == null
                  ? content
                  : [
                      {
                        type: 'text',
                        text: content,
                        prompt_cache_breakpoint: promptCacheBreakpoint,
                      },
                    ],
            });
            break;
          }
          case 'remove': {
            warnings.push({
              type: 'other',
              message: 'system messages are removed for this model',
            });
            break;
          }
          default: {
            const _exhaustiveCheck: never = systemMessageMode;
            throw new Error(
              `Unsupported system message mode: ${_exhaustiveCheck}`,
            );
          }
        }
        break;
      }

      case 'user': {
        if (
          content.length === 1 &&
          content[0].type === 'text' &&
          getPromptCacheBreakpoint(content[0].providerOptions) == null
        ) {
          messages.push({ role: 'user', content: content[0].text });
          break;
        }

        messages.push({
          role: 'user',
          content: content.map((part, index) => {
            switch (part.type) {
              case 'text': {
                const promptCacheBreakpoint = getPromptCacheBreakpoint(
                  part.providerOptions,
                );
                return {
                  type: 'text',
                  text: part.text,
                  ...(promptCacheBreakpoint != null && {
                    prompt_cache_breakpoint: promptCacheBreakpoint,
                  }),
                };
              }
              case 'file': {
                const promptCacheBreakpoint = getPromptCacheBreakpoint(
                  part.providerOptions,
                );
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

                      // OpenAI specific extension: image detail
                      detail: part.providerOptions?.openai?.imageDetail,
                    },
                    ...(promptCacheBreakpoint != null && {
                      prompt_cache_breakpoint: promptCacheBreakpoint,
                    }),
                  };
                } else if (part.mediaType.startsWith('audio/')) {
                  if (part.data instanceof URL) {
                    throw new UnsupportedFunctionalityError({
                      functionality: 'audio file parts with URLs',
                    });
                  }

                  switch (part.mediaType) {
                    case 'audio/wav': {
                      return {
                        type: 'input_audio',
                        input_audio: {
                          data: convertToBase64(part.data),
                          format: 'wav',
                        },
                        ...(promptCacheBreakpoint != null && {
                          prompt_cache_breakpoint: promptCacheBreakpoint,
                        }),
                      };
                    }
                    case 'audio/mp3':
                    case 'audio/mpeg': {
                      return {
                        type: 'input_audio',
                        input_audio: {
                          data: convertToBase64(part.data),
                          format: 'mp3',
                        },
                        ...(promptCacheBreakpoint != null && {
                          prompt_cache_breakpoint: promptCacheBreakpoint,
                        }),
                      };
                    }

                    default: {
                      throw new UnsupportedFunctionalityError({
                        functionality: `audio content parts with media type ${part.mediaType}`,
                      });
                    }
                  }
                } else if (part.mediaType === 'application/pdf') {
                  if (part.data instanceof URL) {
                    throw new UnsupportedFunctionalityError({
                      functionality: 'PDF file parts with URLs',
                    });
                  }

                  return {
                    type: 'file',
                    file:
                      typeof part.data === 'string' &&
                      part.data.startsWith('file-')
                        ? { file_id: part.data }
                        : {
                            filename: part.filename ?? `part-${index}.pdf`,
                            file_data: `data:application/pdf;base64,${convertToBase64(part.data)}`,
                          },
                    ...(promptCacheBreakpoint != null && {
                      prompt_cache_breakpoint: promptCacheBreakpoint,
                    }),
                  };
                } else {
                  throw new UnsupportedFunctionalityError({
                    functionality: `file part media type ${part.mediaType}`,
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
        const textParts: Array<{
          type: 'text';
          text: string;
          prompt_cache_breakpoint?: OpenAIPromptCacheBreakpoint;
        }> = [];
        let hasPromptCacheBreakpoint = false;
        const toolCalls: Array<{
          id: string;
          type: 'function';
          function: { name: string; arguments: string };
        }> = [];

        for (const part of content) {
          switch (part.type) {
            case 'text': {
              const promptCacheBreakpoint = getPromptCacheBreakpoint(
                part.providerOptions,
              );
              text += part.text;
              textParts.push({
                type: 'text',
                text: part.text,
                ...(promptCacheBreakpoint != null && {
                  prompt_cache_breakpoint: promptCacheBreakpoint,
                }),
              });
              hasPromptCacheBreakpoint ||= promptCacheBreakpoint != null;
              break;
            }
            case 'tool-call': {
              toolCalls.push({
                id: part.toolCallId,
                type: 'function',
                function: {
                  name: part.toolName,
                  arguments: serializeToolCallArguments(part.input),
                },
              });
              break;
            }
          }
        }

        messages.push({
          role: 'assistant',
          content: hasPromptCacheBreakpoint
            ? textParts
            : toolCalls.length > 0
              ? text || null
              : text,
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
          const promptCacheBreakpoint =
            (output.type === 'content'
              ? output.value
                  .map(part => getPromptCacheBreakpoint(part.providerOptions))
                  .find(breakpoint => breakpoint != null)
              : getPromptCacheBreakpoint(output.providerOptions)) ??
            getPromptCacheBreakpoint(toolResponse.providerOptions);

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
            content:
              promptCacheBreakpoint == null
                ? contentValue
                : [
                    {
                      type: 'text',
                      text: contentValue,
                      prompt_cache_breakpoint: promptCacheBreakpoint,
                    },
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

  return { messages, warnings };
}
