import {
  LanguageModelV1CallWarning,
  LanguageModelV1Prompt,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import { convertUint8ArrayToBase64 } from '@ai-sdk/provider-utils';
import { OpenAIChatPrompt } from './openai-chat-prompt';

export function convertToOpenAIChatMessages({
  prompt,
  useLegacyFunctionCalling = false,
  systemMessageMode = 'system',
}: {
  prompt: LanguageModelV1Prompt;
  useLegacyFunctionCalling?: boolean;
  systemMessageMode?: 'system' | 'developer' | 'remove';
}): {
  messages: OpenAIChatPrompt;
  warnings: Array<LanguageModelV1CallWarning>;
} {
  const messages: OpenAIChatPrompt = [];
  const warnings: Array<LanguageModelV1CallWarning> = [];

  for (const { role, content } of prompt) {
    switch (role) {
      case 'system': {
        switch (systemMessageMode) {
          case 'system': {
            messages.push({ role: 'system', content });
            break;
          }
          case 'developer': {
            messages.push({ role: 'developer', content });
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
        if (content.length === 1 && content[0].type === 'text') {
          messages.push({ role: 'user', content: content[0].text });
          break;
        }

        messages.push({
          role: 'user',
          content: content.map((part, index) => {
            switch (part.type) {
              case 'text': {
                return { type: 'text', text: part.text };
              }
              case 'image': {
                return {
                  type: 'image_url',
                  image_url: {
                    url:
                      part.image instanceof URL
                        ? part.image.toString()
                        : `data:${
                            part.mimeType ?? 'image/jpeg'
                          };base64,${convertUint8ArrayToBase64(part.image)}`,

                    // OpenAI specific extension: image detail
                    detail: part.providerMetadata?.openai?.imageDetail,
                  },
                };
              }
              case 'file': {
                if (part.data instanceof URL) {
                  throw new UnsupportedFunctionalityError({
                    functionality:
                      "'File content parts with URL data' functionality not supported.",
                  });
                }

                switch (part.mimeType) {
                  case 'audio/wav': {
                    return {
                      type: 'input_audio',
                      input_audio: { data: part.data, format: 'wav' },
                    };
                  }
                  case 'audio/mp3':
                  case 'audio/mpeg': {
                    return {
                      type: 'input_audio',
                      input_audio: { data: part.data, format: 'mp3' },
                    };
                  }
                  case 'application/pdf': {
                    return {
                      type: 'file',
                      file: {
                        filename: part.filename ?? `part-${index}.pdf`,
                        file_data: `data:application/pdf;base64,${part.data}`,
                      },
                    };
                  }
                  default: {
                    throw new UnsupportedFunctionalityError({
                      functionality: `File content part type ${part.mimeType} in user messages`,
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
                  arguments: JSON.stringify(part.args),
                },
              });
              break;
            }
          }
        }

        if (useLegacyFunctionCalling) {
          if (toolCalls.length > 1) {
            throw new UnsupportedFunctionalityError({
              functionality:
                'useLegacyFunctionCalling with multiple tool calls in one message',
            });
          }

          messages.push({
            role: 'assistant',
            content: text,
            function_call:
              toolCalls.length > 0 ? toolCalls[0].function : undefined,
          });
        } else {
          messages.push({
            role: 'assistant',
            content: text,
            tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
          });
        }

        break;
      }

      case 'tool': {
        for (const toolResponse of content) {
          if (useLegacyFunctionCalling) {
            messages.push({
              role: 'function',
              name: toolResponse.toolName,
              content: JSON.stringify(toolResponse.result),
            });
          } else {
            messages.push({
              role: 'tool',
              tool_call_id: toolResponse.toolCallId,
              content: JSON.stringify(toolResponse.result),
            });
          }
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
