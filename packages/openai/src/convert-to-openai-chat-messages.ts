import {
  LanguageModelV2CallWarning,
  LanguageModelV2Prompt,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import { OpenAIChatPrompt } from './openai-chat-prompt';

export function convertToOpenAIChatMessages({
  prompt,
  useLegacyFunctionCalling = false,
  systemMessageMode = 'system',
}: {
  prompt: LanguageModelV2Prompt;
  useLegacyFunctionCalling?: boolean;
  systemMessageMode?: 'system' | 'developer' | 'remove';
}): {
  messages: OpenAIChatPrompt;
  warnings: Array<LanguageModelV2CallWarning>;
} {
  const messages: OpenAIChatPrompt = [];
  const warnings: Array<LanguageModelV2CallWarning> = [];

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
              case 'file': {
                if (part.mimeType.startsWith('image/')) {
                  const mimeType =
                    part.mimeType === 'image/*' ? 'image/jpeg' : part.mimeType;

                  return {
                    type: 'image_url',
                    image_url: {
                      url:
                        part.data instanceof URL
                          ? part.data.toString()
                          : `data:${mimeType};base64,${part.data}`,

                      // OpenAI specific extension: image detail
                      detail: part.providerOptions?.openai?.imageDetail,
                    },
                  };
                } else if (part.mimeType.startsWith('audio/')) {
                  if (part.data instanceof URL) {
                    throw new UnsupportedFunctionalityError({
                      functionality: 'audio file parts with URLs',
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

                    default: {
                      throw new UnsupportedFunctionalityError({
                        functionality: `audio content parts with media type ${part.mimeType}`,
                      });
                    }
                  }
                } else if (part.mimeType === 'application/pdf') {
                  if (part.data instanceof URL) {
                    throw new UnsupportedFunctionalityError({
                      functionality: 'PDF file parts with URLs',
                    });
                  }

                  return {
                    type: 'file',
                    file: {
                      filename: part.filename ?? `part-${index}.pdf`,
                      file_data: `data:application/pdf;base64,${part.data}`,
                    },
                  };
                } else {
                  throw new UnsupportedFunctionalityError({
                    functionality: `file part media type ${part.mimeType}`,
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
