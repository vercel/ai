import {
  LanguageModelV2Prompt,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import {
  PerplexityMessageContent,
  PerplexityPrompt,
} from './perplexity-language-model-prompt';
import { convertUint8ArrayToBase64 } from '@ai-sdk/provider-utils';

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
        const hasImage = content.some(
          part => part.type === 'file' && part.mediaType.startsWith('image/'),
        );

        const messageContent = content
          .map(part => {
            switch (part.type) {
              case 'text': {
                return {
                  type: 'text',
                  text: part.text,
                };
              }
              case 'file': {
                return part.data instanceof URL
                  ? {
                      type: 'image_url',
                      image_url: {
                        url: part.data.toString(),
                      },
                    }
                  : {
                      type: 'image_url',
                      image_url: {
                        url: `data:${part.mediaType ?? 'image/jpeg'};base64,${
                          typeof part.data === 'string'
                            ? part.data
                            : convertUint8ArrayToBase64(part.data)
                        }`,
                      },
                    };
              }
            }
          })
          .filter(Boolean) as PerplexityMessageContent[];
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
