import { LanguageModelV1Prompt, UnsupportedFunctionalityError } from '../spec';
import {
  AnthropicMessage,
  AnthropicMessagesPrompt,
} from './anthropic-messages-prompt';

export function convertToAnthropicMessagesPrompt({
  prompt,
  provider,
}: {
  prompt: LanguageModelV1Prompt;
  provider: string;
}): AnthropicMessagesPrompt {
  let system: string | undefined;
  const messages: AnthropicMessage[] = [];

  for (const { role, content } of prompt) {
    switch (role) {
      case 'system': {
        system = content;
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
                case 'image': {
                  throw new UnsupportedFunctionalityError({
                    provider,
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

        for (const part of content) {
          switch (part.type) {
            case 'text': {
              text += part.text;
              break;
            }
            case 'tool-call': {
              throw new UnsupportedFunctionalityError({
                provider,
                functionality: 'tool-call-part',
              });
            }
            default: {
              const _exhaustiveCheck: never = part;
              throw new Error(`Unsupported part: ${_exhaustiveCheck}`);
            }
          }
        }

        messages.push({
          role: 'assistant',
          content: text,
        });

        break;
      }
      case 'tool': {
        throw new UnsupportedFunctionalityError({
          provider,
          functionality: 'tool-role',
        });
      }
      default: {
        const _exhaustiveCheck: never = role;
        throw new Error(`Unsupported role: ${_exhaustiveCheck}`);
      }
    }
  }

  return {
    system,
    messages,
  };
}
