import {
  UnsupportedFunctionalityError,
  type LanguageModelV3Prompt,
} from '@ai-sdk/provider';
import type {
  PerplexityMessageContent,
  PerplexityPrompt,
} from './perplexity-language-model-prompt';
import {
  convertBase64ToUint8Array,
  convertUint8ArrayToBase64,
} from '@ai-sdk/provider-utils';

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
            (part.type === 'file' &&
              getTopLevelMediaType(part.mediaType) === 'application'),
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
                if (getTopLevelMediaType(part.mediaType) === 'application') {
                  const fullMediaType = resolveApplicationMediaType(part);

                  if (fullMediaType !== 'application/pdf') {
                    throw new UnsupportedFunctionalityError({
                      functionality: `file part media type ${fullMediaType}`,
                    });
                  }

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
                throw new UnsupportedFunctionalityError({
                  functionality: `file part media type ${part.mediaType}`,
                });
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

function getTopLevelMediaType(mediaType: string): string {
  const slashIndex = mediaType.indexOf('/');
  return slashIndex === -1 ? mediaType : mediaType.substring(0, slashIndex);
}

function isFullMediaType(mediaType: string): boolean {
  const slashIndex = mediaType.indexOf('/');
  if (slashIndex === -1) {
    return false;
  }
  const subtype = mediaType.substring(slashIndex + 1);
  return subtype.length > 0 && subtype !== '*';
}

function resolveApplicationMediaType(part: {
  mediaType: string;
  data: Uint8Array | string | URL;
}): string {
  if (isFullMediaType(part.mediaType)) {
    return part.mediaType;
  }

  if (part.data instanceof URL) {
    throw new UnsupportedFunctionalityError({
      functionality: `file of media type "${part.mediaType}" must specify subtype since it is not passed as inline bytes`,
    });
  }

  if (isPdfData(part.data)) {
    return 'application/pdf';
  }

  throw new UnsupportedFunctionalityError({
    functionality: `file of media type "${part.mediaType}" must specify subtype since it could not be auto-detected`,
  });
}

function isPdfData(data: Uint8Array | string): boolean {
  const bytes =
    typeof data === 'string'
      ? convertBase64ToUint8Array(data.substring(0, Math.min(data.length, 8)))
      : data;

  return (
    bytes.length >= 4 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46
  );
}
