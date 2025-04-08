import {
  LanguageModelV2Prompt,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import { PerplexityPrompt } from './perplexity-language-model-prompt';

export function convertToPerplexityMessages(
  prompt: LanguageModelV2Prompt,
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
            .map(part => {
              switch (part.type) {
                case 'text': {
                  return part.text;
                }
              }
            })
            .filter(Boolean)
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
