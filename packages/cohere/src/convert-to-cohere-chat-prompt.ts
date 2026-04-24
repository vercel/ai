import {
  SharedV4Warning,
  LanguageModelV4Prompt,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import { CohereAssistantMessage, CohereChatPrompt } from './cohere-chat-prompt';

export function convertToCohereChatPrompt(prompt: LanguageModelV4Prompt): {
  messages: CohereChatPrompt;
  documents: Array<{
    data: { text: string; title?: string };
  }>;
  warnings: SharedV4Warning[];
} {
  const messages: CohereChatPrompt = [];
  const documents: Array<{ data: { text: string; title?: string } }> = [];
  const warnings: SharedV4Warning[] = [];

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
                  let textContent: string;

                  switch (part.data.type) {
                    case 'reference': {
                      throw new UnsupportedFunctionalityError({
                        functionality: 'file parts with provider references',
                      });
                    }
                    case 'url': {
                      throw new UnsupportedFunctionalityError({
                        functionality: 'File URL data',
                        message:
                          'URLs should be downloaded by the AI SDK and not reach this point. This indicates a configuration issue.',
                      });
                    }
                    case 'text': {
                      textContent = part.data.text;
                      break;
                    }
                    case 'data': {
                      textContent =
                        typeof part.data.data === 'string'
                          ? part.data.data
                          : new TextDecoder().decode(part.data.data);
                      break;
                    }
                  }

                  documents.push({
                    data: {
                      text: textContent,
                      title: part.filename,
                    },
                  });

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
          ...content
            .filter(toolResult => toolResult.type !== 'tool-approval-response')
            .map(toolResult => {
              const output = toolResult.output;

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
