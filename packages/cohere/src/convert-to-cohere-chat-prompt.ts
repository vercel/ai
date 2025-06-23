import {
  LanguageModelV2CallWarning,
  LanguageModelV2Prompt,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import { CohereAssistantMessage, CohereChatPrompt } from './cohere-chat-prompt';

export function convertToCohereChatPrompt(prompt: LanguageModelV2Prompt): {
  messages: CohereChatPrompt;
  documents: Array<{
    data: { text: string; title?: string };
  }>;
  warnings: LanguageModelV2CallWarning[];
} {
  const messages: CohereChatPrompt = [];
  const documents: Array<{ data: { text: string; title?: string } }> = [];
  const warnings: LanguageModelV2CallWarning[] = [];

  for (const { role, content } of prompt) {
    switch (role) {
      case 'system': {
        messages.push({ role: 'system', content });
        break;
      }

      case 'user': {
        messages.push({
          role: 'user',
          content: content
            .map(part => {
              switch (part.type) {
                case 'text': {
                  return part.text;
                }
                case 'file': {
                  // Extract documents for RAG
                  let textContent: string;

                  if (typeof part.data === 'string') {
                    // Base64 or text data
                    textContent = part.data;
                  } else if (part.data instanceof Uint8Array) {
                    // Check if the media type is supported for text extraction
                    if (
                      !(
                        part.mediaType?.startsWith('text/') ||
                        part.mediaType === 'application/json'
                      )
                    ) {
                      throw new UnsupportedFunctionalityError({
                        functionality: `document media type: ${part.mediaType}`,
                        message: `Media type '${part.mediaType}' is not supported. Supported media types are: text/* and application/json.`,
                      });
                    }
                    textContent = new TextDecoder().decode(part.data);
                  } else {
                    throw new UnsupportedFunctionalityError({
                      functionality: 'File URL data',
                      message:
                        'URLs should be downloaded by the AI SDK and not reach this point. This indicates a configuration issue.',
                    });
                  }

                  documents.push({
                    data: {
                      text: textContent,
                      title: part.filename,
                    },
                  });

                  // Files are handled separately via the documents parameter
                  // Return empty string to not include file content in message text
                  return '';
                }
              }
            })
            .join(''),
        });
        break;
      }

      case 'assistant': {
        let text = '';
        const toolCalls: CohereAssistantMessage['tool_calls'] = [];

        for (const part of content) {
          switch (part.type) {
            case 'text': {
              text += part.text;
              break;
            }
            case 'tool-call': {
              toolCalls.push({
                id: part.toolCallId,
                type: 'function' as const,
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
          content: toolCalls.length > 0 ? undefined : text,
          tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
          tool_plan: undefined,
        });

        break;
      }
      case 'tool': {
        messages.push(
          ...content.map(toolResult => {
            const output = toolResult.output;

            let contentValue: string;
            switch (output.type) {
              case 'text':
              case 'error-text':
                contentValue = output.value;
                break;
              case 'content':
              case 'json':
              case 'error-json':
                contentValue = JSON.stringify(output.value);
                break;
            }

            return {
              role: 'tool' as const,
              content: contentValue,
              tool_call_id: toolResult.toolCallId,
            };
          }),
        );

        break;
      }
      default: {
        const _exhaustiveCheck: never = role;
        throw new Error(`Unsupported role: ${_exhaustiveCheck}`);
      }
    }
  }

  return { messages, documents, warnings };
}
