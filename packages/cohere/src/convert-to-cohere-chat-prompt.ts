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
              throw new UnsupportedFunctionalityError({
                functionality: 'tool-call',
              });
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
        throw new UnsupportedFunctionalityError({
          functionality: 'tool role',
        });
      }
      default: {
        const _exhaustiveCheck: never = role;
        throw new Error(`Unsupported role: ${_exhaustiveCheck}`);
      }
    }
  }

  return messages;
}
