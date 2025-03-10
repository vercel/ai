import {
  LanguageModelV1Prompt,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import { PerplexityPrompt } from './perplexity-language-model-prompt';

export function convertToPerplexityMessages(
  prompt: LanguageModelV1Prompt,
): PerplexityPrompt {
  const messages: PerplexityPrompt = [];

  for (const { role, content } of prompt) {
    switch (role) {
      case 'system': {
        messages.push({ role: 'system', content });
        break;
      }

      case 'user':
      case 'assistant': {
        messages.push({
          role,
          content: content
            .filter(
              part =>
                part.type !== 'reasoning' && part.type !== 'redacted-reasoning',
            )
            .map(part => {
              switch (part.type) {
                case 'text': {
                  return part.text;
                }
                case 'image': {
                  throw new UnsupportedFunctionalityError({
                    functionality: 'Image content parts in user messages',
                  });
                }
                case 'file': {
                  throw new UnsupportedFunctionalityError({
                    functionality: 'File content parts in user messages',
                  });
                }
                case 'tool-call': {
                  throw new UnsupportedFunctionalityError({
                    functionality: 'Tool calls in assistant messages',
                  });
                }
                default: {
                  const _exhaustiveCheck: never = part;
                  throw new Error(`Unsupported part: ${_exhaustiveCheck}`);
                }
              }
            })
            .join(''),
        });
        break;
      }
      case 'tool': {
        throw new UnsupportedFunctionalityError({
          functionality: 'Tool messages',
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
