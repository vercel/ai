import {
  LanguageModelV1Prompt,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import { OpenAIResponsesPrompt } from './openai-responses-prompt';

export function convertToOpenAIResponsesMessages({
  prompt,
}: {
  prompt: LanguageModelV1Prompt;
}): OpenAIResponsesPrompt {
  const messages: OpenAIResponsesPrompt = [];

  for (const { role, content } of prompt) {
    switch (role) {
      case 'system': {
        break;
      }

      case 'user': {
        messages.push({
          role: 'user',
          content: content.map(part => {
            switch (part.type) {
              case 'text': {
                return { type: 'input_text', text: part.text };
              }

              case 'image': {
                throw new UnsupportedFunctionalityError({
                  functionality: 'Image content parts in user messages',
                });
              }
              case 'file': {
                throw new UnsupportedFunctionalityError({
                  functionality: 'Image content parts in user messages',
                });
              }
            }
          }),
        });

        break;
      }

      case 'assistant': {
        throw new UnsupportedFunctionalityError({
          functionality: 'Assistant messages',
        });
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
