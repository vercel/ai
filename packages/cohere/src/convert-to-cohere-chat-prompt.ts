import {
  LanguageModelV2Prompt,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import { CohereAssistantMessage, CohereChatPrompt } from './cohere-chat-prompt';

export function convertToCohereChatPrompt(
  prompt: LanguageModelV2Prompt,
): CohereChatPrompt {
  const messages: CohereChatPrompt = [];

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
                  throw new UnsupportedFunctionalityError({
                    functionality: 'File URL data',
                  });
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
                  arguments: JSON.stringify(part.args),
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
        // Cohere uses one tool message per tool result
        messages.push(
          ...content.map(toolResult => ({
            role: 'tool' as const,
            content: JSON.stringify(toolResult.result),
            tool_call_id: toolResult.toolCallId,
          })),
        );

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
