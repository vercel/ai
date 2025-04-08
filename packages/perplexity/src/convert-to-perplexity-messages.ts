import {
  LanguageModelV2Prompt,
  LanguageModelV2TextPart,
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
            .filter(
              (part): part is LanguageModelV2TextPart => part.type === 'text',
            )
            .map(part => part.text)
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
