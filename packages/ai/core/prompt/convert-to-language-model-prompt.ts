import {
  isJSONValue,
  LanguageModelV1ImagePart,
  LanguageModelV1Message,
  LanguageModelV1Prompt,
  LanguageModelV1TextPart,
  LanguageModelV2DataPart,
  LanguageModelV2Message,
  LanguageModelV2Prompt,
  LanguageModelV2TextPart,
  LanguageModelV2ToolCallPart,
  LanguageModelV2ToolResultPart,
} from '@ai-sdk/provider';
import { getErrorMessage } from '@ai-sdk/provider-utils';
import { download } from '../../util/download';
import { CoreMessage } from '../prompt/message';
import { detectImageMimeType } from '../util/detect-image-mimetype';
import { ImagePart, TextPart } from './content-part';
import { convertDataContentToUint8Array } from './data-content';
import { ValidatedPrompt } from './get-validated-prompt';
import { InvalidMessageRoleError } from './invalid-message-role-error';

export async function convertToLanguageModelV1Prompt({
  prompt,
  modelSupportsImageUrls = true,
  downloadImplementation = download,
}: {
  prompt: ValidatedPrompt;
  modelSupportsImageUrls: boolean | undefined;
  downloadImplementation?: typeof download;
}): Promise<LanguageModelV1Prompt> {
  const languageModelMessages: LanguageModelV1Prompt = [];

  if (prompt.system != null) {
    languageModelMessages.push({ role: 'system', content: prompt.system });
  }

  const downloadedImages =
    modelSupportsImageUrls || prompt.messages == null
      ? null
      : await downloadImages(prompt.messages, downloadImplementation);

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
        ...prompt.messages.map(
          (message): LanguageModelV1Message =>
            convertToLanguageModelV1Message(message, downloadedImages),
        ),
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

/**
 * Convert a CoreMessage to a LanguageModelV1Message.
 *
 * @param message The CoreMessage to convert.
 * @param downloadedImages A map of image URLs to their downloaded data. Only
 *   available if the model does not support image URLs, null otherwise.
 */
export function convertToLanguageModelV1Message(
  message: CoreMessage,
  downloadedImages: Record<
    string,
    { mimeType: string | undefined; data: Uint8Array }
  > | null,
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
          (part): LanguageModelV1TextPart | LanguageModelV1ImagePart => {
            switch (part.type) {
              case 'text': {
                return part;
              }

              case 'image': {
                if (part.image instanceof URL) {
                  if (downloadedImages == null) {
                    return {
                      type: 'image',
                      image: part.image,
                      mimeType: part.mimeType,
                    };
                  } else {
                    const downloadedImage =
                      downloadedImages[part.image.toString()];
                    return {
                      type: 'image',
                      image: downloadedImage.data,
                      mimeType: part.mimeType ?? downloadedImage.mimeType,
                    };
                  }
                }

                // try to convert string image parts to urls
                if (typeof part.image === 'string') {
                  try {
                    const url = new URL(part.image);

                    switch (url.protocol) {
                      case 'http:':
                      case 'https:': {
                        if (downloadedImages == null) {
                          return {
                            type: 'image',
                            image: url,
                            mimeType: part.mimeType,
                          };
                        } else {
                          const downloadedImage = downloadedImages[part.image];
                          return {
                            type: 'image',
                            image: downloadedImage.data,
                            mimeType: part.mimeType ?? downloadedImage.mimeType,
                          };
                        }
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

export async function convertToLanguageModelV2Prompt({
  prompt,
  modelSupportsImageUrls = true,
  downloadImplementation = download,
}: {
  prompt: ValidatedPrompt;
  modelSupportsImageUrls: boolean | undefined;
  downloadImplementation?: typeof download;
}): Promise<LanguageModelV2Prompt> {
  const languageModelMessages: LanguageModelV2Prompt = [];

  if (prompt.system != null) {
    languageModelMessages.push({ role: 'system', content: prompt.system });
  }

  const downloadedImages =
    modelSupportsImageUrls || prompt.messages == null
      ? null
      : await downloadImages(prompt.messages, downloadImplementation);

  const promptType = prompt.type;
  switch (promptType) {
    case 'prompt': {
      languageModelMessages.push({
        role: 'user',
        content: [{ type: 'text', text: prompt.prompt }],
        providerMetadata: undefined,
      });
      break;
    }

    case 'messages': {
      languageModelMessages.push(
        ...prompt.messages.map(
          (message): LanguageModelV2Message =>
            convertToLanguageModelV2Message(message, downloadedImages),
        ),
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

/**
 * Convert a CoreMessage to a LanguageModelV2Message.
 *
 * @param message The CoreMessage to convert.
 * @param downloadedImages A map of image URLs to their downloaded data. Only
 *   available if the model does not support image URLs, null otherwise.
 */
export function convertToLanguageModelV2Message(
  message: CoreMessage,
  downloadedImages: Record<
    string,
    { mimeType: string | undefined; data: Uint8Array }
  > | null,
): LanguageModelV2Message {
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
          providerMetadata: message.providerMetadata,
        };
      }

      return {
        role: 'user',
        content: message.content.map(
          (part): LanguageModelV2TextPart | LanguageModelV2DataPart => {
            switch (part.type) {
              case 'text': {
                return {
                  type: 'text',
                  text: part.text,
                  providerMetadata: part.providerMetadata,
                };
              }

              case 'image': {
                if (part.image instanceof URL) {
                  if (downloadedImages == null) {
                    return {
                      type: 'data',
                      kind: 'image',
                      data: part.image,
                      mimeType: part.mimeType,
                      providerMetadata: part.providerMetadata,
                    };
                  } else {
                    const downloadedImage =
                      downloadedImages[part.image.toString()];
                    return {
                      type: 'data',
                      kind: 'image',
                      data: downloadedImage.data,
                      mimeType: part.mimeType ?? downloadedImage.mimeType,
                      providerMetadata: part.providerMetadata,
                    };
                  }
                }

                // try to convert string image parts to urls
                if (typeof part.image === 'string') {
                  try {
                    const url = new URL(part.image);

                    switch (url.protocol) {
                      case 'http:':
                      case 'https:': {
                        if (downloadedImages == null) {
                          return {
                            type: 'data',
                            kind: 'image',
                            data: url,
                            mimeType: part.mimeType,
                            providerMetadata: part.providerMetadata,
                          };
                        } else {
                          const downloadedImage = downloadedImages[part.image];
                          return {
                            type: 'data',
                            kind: 'image',
                            data: downloadedImage.data,
                            mimeType: part.mimeType ?? downloadedImage.mimeType,
                            providerMetadata: part.providerMetadata,
                          };
                        }
                      }
                      case 'data:': {
                        try {
                          const [header, base64Content] = part.image.split(',');
                          const mimeType = header.split(';')[0].split(':')[1];

                          if (mimeType == null || base64Content == null) {
                            throw new Error('Invalid data URL format');
                          }

                          return {
                            type: 'data',
                            kind: 'image',
                            data: convertDataContentToUint8Array(base64Content),
                            mimeType,
                            providerMetadata: part.providerMetadata,
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
                  type: 'data',
                  kind: 'image',
                  data: imageUint8,
                  mimeType: part.mimeType ?? detectImageMimeType(imageUint8),
                  providerMetadata: part.providerMetadata,
                };
              }
            }
          },
        ),
        providerMetadata: message.providerMetadata,
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
        content: message.content
          .filter(
            // remove empty text parts:
            part => part.type !== 'text' || part.text !== '',
          )
          .map(
            (part): LanguageModelV2ToolCallPart | LanguageModelV2TextPart => {
              const type = part.type;
              switch (type) {
                case 'text': {
                  return {
                    type: 'text',
                    text: part.text,
                    providerMetadata: part.providerMetadata,
                  };
                }

                case 'tool-call': {
                  if (!isJSONValue(part.args)) {
                    // TODO dedicated error with details
                    throw new Error('Tool args must be JSON values');
                  }

                  return {
                    type: 'tool-call',
                    toolCallId: part.toolCallId,
                    toolName: part.toolName,
                    args: part.args,
                  };
                }

                default: {
                  const _exhaustiveCheck: never = type;
                  throw new Error(`Unsupported part type: ${_exhaustiveCheck}`);
                }
              }
            },
          ),
      };
    }

    case 'tool': {
      return {
        role: 'user',
        content: message.content.map((part): LanguageModelV2ToolResultPart => {
          if (!isJSONValue(part.result)) {
            // TODO dedicated error with details
            throw new Error('Tool results must be JSON values');
          }

          return {
            type: 'tool-result',
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            result: part.result,
            isError: part.isError,
            providerMetadata: part.providerMetadata,
          };
        }),
        providerMetadata: message.providerMetadata,
      };
    }

    default: {
      const _exhaustiveCheck: never = role;
      throw new InvalidMessageRoleError({ role: _exhaustiveCheck });
    }
  }
}

async function downloadImages(
  messages: CoreMessage[],
  downloadImplementation: typeof download,
): Promise<Record<string, { mimeType: string | undefined; data: Uint8Array }>> {
  const urls = messages
    .filter(message => message.role === 'user')
    .map(message => message.content)
    .filter((content): content is Array<TextPart | ImagePart> =>
      Array.isArray(content),
    )
    .flat()
    .filter((part): part is ImagePart => part.type === 'image')
    .map(part => part.image)
    .map(part =>
      // support string urls in image parts:
      typeof part === 'string' &&
      (part.startsWith('http:') || part.startsWith('https:'))
        ? new URL(part)
        : part,
    )
    .filter((image): image is URL => image instanceof URL);

  // download images in parallel:
  const downloadedImages = await Promise.all(
    urls.map(async url => ({
      url,
      data: await downloadImplementation({ url }),
    })),
  );

  return Object.fromEntries(
    downloadedImages.map(({ url, data }) => [url.toString(), data]),
  );
}
