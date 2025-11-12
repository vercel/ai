import {
  LanguageModelV3Prompt,
  SharedV3ProviderMetadata,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import { convertToBase64 } from '@ai-sdk/provider-utils';
import { MinimaxChatPrompt } from './minimax-openai-api-types';

function getOpenAIMetadata(message: {
  providerOptions?: SharedV3ProviderMetadata;
}) {
  return message?.providerOptions?.openaiCompatible ?? {};
}

function getMinimaxMetadata(message: {
  providerOptions?: SharedV3ProviderMetadata;
}) {
  return message?.providerOptions?.minimax ?? {};
}

export function convertToMinimaxChatMessages(
  prompt: LanguageModelV3Prompt,
): MinimaxChatPrompt {
  const messages: MinimaxChatPrompt = [];
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
        let reasoningDetails: any = undefined;

        for (const part of content) {
          const partMetadata = getOpenAIMetadata(part);
          const partMinimaxMetadata = getMinimaxMetadata(part);

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
            case 'reasoning': {
              // Extract original reasoning_details from providerOptions if available
              if (partMinimaxMetadata?.reasoningDetails) {
                reasoningDetails = partMinimaxMetadata.reasoningDetails;
              }
              break;
            }
          }
        }

        const messageObj: any = {
          role: 'assistant',
          content: text,
          tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
          ...metadata,
        };

        // Add reasoning_details if available (MiniMax specific)
        if (reasoningDetails) {
          messageObj.reasoning_details = reasoningDetails;
        }

        messages.push(messageObj);

        break;
      }

      case 'tool': {
        for (const toolResponse of content) {
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
            case 'content':
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

