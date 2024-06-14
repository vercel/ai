import {
  LanguageModelV1ImagePart,
  LanguageModelV1FilePart,
  LanguageModelV1Message,
  LanguageModelV1Prompt,
  LanguageModelV1TextPart,
} from '@ai-sdk/provider';
import { CoreMessage } from '../prompt/message';
import { detectImageMimeType } from '../util/detect-image-mimetype';
import { convertDataContentToUint8Array } from './data-content';
import { ValidatedPrompt } from './get-validated-prompt';
import { InvalidMessageRoleError } from './invalid-message-role-error';
import { getErrorMessage } from '@ai-sdk/provider-utils';

export function convertToLanguageModelPrompt(
  prompt: ValidatedPrompt,
): LanguageModelV1Prompt {
  const languageModelMessages: LanguageModelV1Prompt = [];

  if (prompt.system != null) {
    languageModelMessages.push({ role: 'system', content: prompt.system });
  }

  const promptType = prompt.type;
  switch (promptType) {
    case 'prompt': {
      languageModelMessages.push({
        role: 'user',
        content: [{ type: 'text', text: prompt.prompt }],
      });
      break;
    }

    case 'messages': {
      languageModelMessages.push(
        ...prompt.messages.map(convertToLanguageModelMessage),
      );
      break;
    }

    default: {
      const _exhaustiveCheck: never = promptType;
      throw new Error(`Unsupported prompt type: ${_exhaustiveCheck}`);
    }
  }

  return languageModelMessages;
}

export function convertToLanguageModelMessage(
  message: CoreMessage,
): LanguageModelV1Message {
  const role = message.role;
  switch (role) {
    case 'system': {
      return { role: 'system', content: message.content };
    }

    case 'user': {
      if (typeof message.content === 'string') {
        return {
          role: 'user',
          content: [{ type: 'text', text: message.content }],
        };
      }

      return {
        role: 'user',
        content: message.content.map(
          (part): LanguageModelV1TextPart | LanguageModelV1ImagePart | LanguageModelV1FilePart => {
            switch (part.type) {
              case 'text': {
                return part;
              }
              case 'file':
                return part;

              case 'image': {
                if (part.image instanceof URL) {
                  return {
                    type: 'image',
                    image: part.image,
                    mimeType: part.mimeType,
                  };
                }

                // try to convert string image parts to urls
                if (typeof part.image === 'string') {
                  try {
                    const url = new URL(part.image);

                    switch (url.protocol) {
                      case 'http:':
                      case 'https:': {
                        return {
                          type: 'image',
                          image: url,
                          mimeType: part.mimeType,
                        };
                      }
                      case 'data:': {
                        try {
                          const [header, base64Content] = part.image.split(',');
                          const mimeType = header.split(';')[0].split(':')[1];

                          if (mimeType == null || base64Content == null) {
                            throw new Error('Invalid data URL format');
                          }

                          return {
                            type: 'image',
                            image:
                              convertDataContentToUint8Array(base64Content),
                            mimeType,
                          };
                        } catch (error) {
                          throw new Error(
                            `Error processing data URL: ${getErrorMessage(
                              message,
                            )}`,
                          );
                        }
                      }
                      default: {
                        throw new Error(
                          `Unsupported URL protocol: ${url.protocol}`,
                        );
                      }
                    }
                  } catch (_ignored) {
                    // not a URL
                  }
                }

                const imageUint8 = convertDataContentToUint8Array(part.image);

                return {
                  type: 'image',
                  image: imageUint8,
                  mimeType: part.mimeType ?? detectImageMimeType(imageUint8),
                };
              }
            }
          },
        ),
      };
    }

    case 'assistant': {
      if (typeof message.content === 'string') {
        return {
          role: 'assistant',
          content: [{ type: 'text', text: message.content }],
        };
      }

      return {
        role: 'assistant',
        content: message.content.filter(
          // remove empty text parts:
          part => part.type !== 'text' || part.text !== '',
        ),
      };
    }

    case 'tool': {
      return message;
    }

    default: {
      const _exhaustiveCheck: never = role;
      throw new InvalidMessageRoleError({ role: _exhaustiveCheck });
    }
  }
}
