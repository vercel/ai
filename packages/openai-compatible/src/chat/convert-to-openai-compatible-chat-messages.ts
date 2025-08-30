import {
  LanguageModelV2Prompt,
  LanguageModelV2ToolResultOutput,
  SharedV2ProviderMetadata,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import {
  OpenAICompatibleChatPrompt,
  OpenAICompatibleToolMessage,
} from './openai-compatible-api-types';
import { convertToBase64 } from '@ai-sdk/provider-utils';

function getOpenAIMetadata(message: {
  providerOptions?: SharedV2ProviderMetadata;
}) {
  return message?.providerOptions?.openaiCompatible ?? {};
}

export function convertToOpenAICompatibleChatMessages(
  prompt: LanguageModelV2Prompt,
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
                } else {
                  throw new UnsupportedFunctionalityError({
                    functionality: `file part media type ${part.mediaType}`,
                  });
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
        const toolCalls: Array<{
          id: string;
          type: 'function';
          function: { name: string; arguments: string };
        }> = [];

        const toolMessages: OpenAICompatibleToolMessage[] = [];

        for (const part of content) {
          const partMetadata = getOpenAIMetadata(part);
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
                  arguments: JSON.stringify(part.input),
                },
                ...partMetadata,
              });
              break;
            }
            case 'tool-result': {
              const contentValue = toolResultOutputToOpenAICompatibleContent(
                part.output,
              );
              const toolResponseMetadata = getOpenAIMetadata(part);

              toolMessages.push({
                role: 'tool',
                tool_call_id: part.toolCallId,
                content: contentValue,
                ...toolResponseMetadata,
              });
            }
          }
        }

        messages.push({
          role: 'assistant',
          content: text,
          tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
          ...metadata,
        });

        for (const toolMessage of toolMessages) {
          messages.push(toolMessage);
        }

        break;
      }

      case 'tool': {
        for (const toolResponse of content) {
          const contentValue = toolResultOutputToOpenAICompatibleContent(
            toolResponse.output,
          );
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

function toolResultOutputToOpenAICompatibleContent(
  output: LanguageModelV2ToolResultOutput,
): string {
  switch (output.type) {
    case 'text':
    case 'error-text':
      return output.value;
    case 'content':
    case 'json':
    case 'error-json':
      return JSON.stringify(output.value);
  }
}
