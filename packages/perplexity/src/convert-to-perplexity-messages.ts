import {
  type LanguageModelV2FilePart,
  type LanguageModelV2Prompt,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import type {
  PerplexityMessageContent,
  PerplexityPrompt,
} from './perplexity-language-model-prompt';
import {
  convertBase64ToUint8Array,
  convertUint8ArrayToBase64,
} from '@ai-sdk/provider-utils';

type MediaTypeSignature = {
  mediaType: string;
  bytesPrefix: Array<number | null>;
};

const mediaTypeSignaturesByTopLevelType: Record<string, MediaTypeSignature[]> =
  {
    application: [
      {
        mediaType: 'application/pdf',
        bytesPrefix: [0x25, 0x50, 0x44, 0x46], // %PDF
      },
    ],
    image: [
      {
        mediaType: 'image/gif',
        bytesPrefix: [0x47, 0x49, 0x46], // GIF
      },
      {
        mediaType: 'image/png',
        bytesPrefix: [0x89, 0x50, 0x4e, 0x47], // PNG
      },
      {
        mediaType: 'image/jpeg',
        bytesPrefix: [0xff, 0xd8], // JPEG
      },
      {
        mediaType: 'image/webp',
        bytesPrefix: [
          0x52,
          0x49,
          0x46,
          0x46, // "RIFF"
          null,
          null,
          null,
          null, // file size (variable)
          0x57,
          0x45,
          0x42,
          0x50, // "WEBP"
        ],
      },
    ],
  };

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

function detectMediaType({
  data,
  topLevelType,
}: {
  data: string | Uint8Array;
  topLevelType: string;
}) {
  const signatures = mediaTypeSignaturesByTopLevelType[topLevelType];

  if (signatures == null) {
    return undefined;
  }

  const bytes =
    typeof data === 'string'
      ? convertBase64ToUint8Array(data.substring(0, Math.min(data.length, 24)))
      : data;

  return signatures.find(signature =>
    signature.bytesPrefix.every(
      (byte, index) => byte === null || bytes[index] === byte,
    ),
  )?.mediaType;
}

function resolveFullMediaType(part: LanguageModelV2FilePart): string {
  if (isFullMediaType(part.mediaType)) {
    return part.mediaType;
  }

  if (part.data instanceof URL) {
    throw new UnsupportedFunctionalityError({
      functionality: `file of media type "${part.mediaType}" must specify subtype since it is not passed as inline bytes`,
    });
  }

  const detected = detectMediaType({
    data: part.data,
    topLevelType: getTopLevelMediaType(part.mediaType),
  });

  if (detected != null) {
    return detected;
  }

  throw new UnsupportedFunctionalityError({
    functionality: `file of media type "${part.mediaType}" must specify subtype since it could not be auto-detected`,
  });
}

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
        const hasMultipartContent = content.some(
          part =>
            (part.type === 'file' &&
              getTopLevelMediaType(part.mediaType) === 'image') ||
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
                const topLevelMediaType = getTopLevelMediaType(part.mediaType);

                if (topLevelMediaType === 'application') {
                  const fullMediaType = resolveFullMediaType(part);

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
                } else if (topLevelMediaType === 'image') {
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
                          url: `data:${resolveFullMediaType(part)};base64,${
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
