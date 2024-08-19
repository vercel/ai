import {
  LanguageModelV1Prompt,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import { CohereChatPrompt } from './cohere-chat-prompt';

export function convertToCohereChatPrompt(
  prompt: LanguageModelV1Prompt,
): CohereChatPrompt {
  const messages: CohereChatPrompt = [];

  for (const { role, content } of prompt) {
    switch (role) {
      case 'system': {
        messages.push({ role: 'SYSTEM', message: content });
        break;
      }

      case 'user': {
        messages.push({
          role: 'USER',
          message: content
            .map(part => {
              switch (part.type) {
                case 'text': {
                  return part.text;
                }
                case 'image': {
                  throw new UnsupportedFunctionalityError({
                    functionality: 'image-part',
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
        const toolCalls: Array<{
          name: string;
          parameters: object;
        }> = [];

        for (const part of content) {
          switch (part.type) {
            case 'text': {
              text += part.text;
              break;
            }
            case 'tool-call': {
              toolCalls.push({
                name: part.toolName,
                parameters: part.args as object,
              });
              break;
            }
            default: {
              const _exhaustiveCheck: never = part;
              throw new Error(`Unsupported part: ${_exhaustiveCheck}`);
            }
          }
        }

        messages.push({
          role: 'CHATBOT',
          message: text,
          tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
        });

        break;
      }
      case 'tool': {
        messages.push({
          role: 'TOOL',
          tool_results: content.map(toolResult => ({
            call: {
              name: toolResult.toolName,

              /* 
              Note: Currently the tool_results field requires we pass the parameters of the tool results again. It it is blank for two reasons:

              1. The parameters are already present in chat_history as a tool message
              2. The tool core message of the ai sdk does not include parameters
              
              It is possible to traverse through the chat history and get the parameters by id but it's currently empty since there wasn't any degradation in the output when left blank.
              */
              parameters: {},
            },
            outputs: [toolResult.result as object],
          })),
        });

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
