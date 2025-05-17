import {
  LanguageModelV1Prompt,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import { convertUint8ArrayToBase64 } from '@ai-sdk/provider-utils';
import {
  PerplexityMessageContent,
  PerplexityPrompt,
} from './perplexity-language-model-prompt';

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
        const hasImage = content.some(part => part.type === 'image');
        const messageContent: PerplexityMessageContent[] = content
          .filter(
            part =>
              part.type !== 'reasoning' && part.type !== 'redacted-reasoning',
          )
          .map(part => {
            switch (part.type) {
              case 'text': {
                return {
                  type: 'text',
                  text: part.text,
                };
              }
              case 'image': {
                return part.image instanceof URL
                  ? {
                      type: 'image_url',
                      image_url: {
                        url: part.image.toString(),
                      },
                    }
                  : {
                      type: 'image_url',
                      image_url: {
                        url: `data:${part.mimeType ?? 'image/jpeg'};base64,${convertUint8ArrayToBase64(part.image)}`,
                      },
                    };
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
          });

        messages.push({
          role,
          content: hasImage
            ? messageContent
            : messageContent
                .filter(part => part.type === 'text')
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
