import {
  LanguageModelV3Prompt,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import {
  PerplexityMessageContent,
  PerplexityPrompt,
} from './perplexity-language-model-prompt';
import { convertUint8ArrayToBase64 } from '@ai-sdk/provider-utils';

export function convertToPerplexityMessages(
  prompt: LanguageModelV3Prompt,
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
        const hasMultipartContent = content.some(
          part =>
            (part.type === 'file' && part.mediaType.startsWith('image/')) ||
            (part.type === 'file' && part.mediaType === 'application/pdf'),
        );

        const messageContent = content
          .map((part, index) => {
            switch (part.type) {
              case 'text': {
                return {
                  type: 'text',
                  text: part.text,
                };
              }
              case 'file': {
                if (part.mediaType === 'application/pdf') {
                  return part.data instanceof URL
                    ? {
                        type: 'file_url',
                        file_url: {
                          url: part.data.toString(),
                        },
                        file_name: part.filename,
                      }
                    : {
                        type: 'file_url',
                        file_url: {
                          url:
                            typeof part.data === 'string'
                              ? part.data
                              : convertUint8ArrayToBase64(part.data),
                        },
                        file_name: part.filename || `document-${index}.pdf`,
                      };
                } else if (part.mediaType.startsWith('image/')) {
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
            }
          })
          .filter(Boolean) as PerplexityMessageContent[];
        messages.push({
          role,
          content: hasMultipartContent
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
