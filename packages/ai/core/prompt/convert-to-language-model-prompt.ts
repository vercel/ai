import {
  LanguageModelV1FilePart,
  LanguageModelV1ImagePart,
  LanguageModelV1Message,
  LanguageModelV1Prompt,
  LanguageModelV1TextPart,
} from '@ai-sdk/provider';
import {
  convertUint8ArrayToBase64,
  getErrorMessage,
} from '@ai-sdk/provider-utils';
import { download } from '../../util/download';
import { CoreMessage } from '../prompt/message';
import { detectImageMimeType } from '../util/detect-image-mimetype';
import { FilePart, ImagePart, TextPart } from './content-part';
import {
  convertDataContentToBase64String,
  convertDataContentToUint8Array,
} from './data-content';
import { InvalidMessageRoleError } from './invalid-message-role-error';
import { splitDataUrl } from './split-data-url';
import { ValidatedPrompt } from './validate-prompt';

export async function convertToLanguageModelPrompt({
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

  const downloadedAssets =
    modelSupportsImageUrls || prompt.messages == null
      ? null
      : await downloadAssets(prompt.messages, downloadImplementation);

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
            convertToLanguageModelMessage(message, downloadedAssets),
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
 * @param downloadedAssets A map of URLs to their downloaded data. Only
 *   available if the model does not support URLs, null otherwise.
 */
export function convertToLanguageModelMessage(
  message: CoreMessage,
  downloadedAssets: Record<
    string,
    { mimeType: string | undefined; data: Uint8Array }
  > | null,
): LanguageModelV1Message {
  const role = message.role;
  switch (role) {
    case 'system': {
      return {
        role: 'system',
        content: message.content,
        providerMetadata: message.experimental_providerMetadata,
      };
    }

    case 'user': {
      if (typeof message.content === 'string') {
        return {
          role: 'user',
          content: [{ type: 'text', text: message.content }],
          providerMetadata: message.experimental_providerMetadata,
        };
      }

      return {
        role: 'user',
        content: message.content
          .map(
            (
              part,
            ):
              | LanguageModelV1TextPart
              | LanguageModelV1ImagePart
              | LanguageModelV1FilePart => {
              switch (part.type) {
                case 'text': {
                  return {
                    type: 'text',
                    text: part.text,
                    providerMetadata: part.experimental_providerMetadata,
                  };
                }

                case 'image': {
                  if (part.image instanceof URL) {
                    if (downloadedAssets == null) {
                      return {
                        type: 'image',
                        image: part.image,
                        mimeType: part.mimeType,
                        providerMetadata: part.experimental_providerMetadata,
                      };
                    } else {
                      const downloadedImage =
                        downloadedAssets[part.image.toString()];
                      return {
                        type: 'image',
                        image: downloadedImage.data,
                        mimeType: part.mimeType ?? downloadedImage.mimeType,
                        providerMetadata: part.experimental_providerMetadata,
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
                          if (downloadedAssets == null) {
                            return {
                              type: 'image',
                              image: url,
                              mimeType: part.mimeType,
                              providerMetadata:
                                part.experimental_providerMetadata,
                            };
                          } else {
                            const downloadedImage =
                              downloadedAssets[url.toString()];
                            return {
                              type: 'image',
                              image: downloadedImage.data,
                              mimeType:
                                part.mimeType ?? downloadedImage.mimeType,
                              providerMetadata:
                                part.experimental_providerMetadata,
                            };
                          }
                        }
                        case 'data:': {
                          try {
                            const { mimeType, base64Content } = splitDataUrl(
                              part.image,
                            );

                            if (mimeType == null || base64Content == null) {
                              throw new Error('Invalid data URL format');
                            }

                            return {
                              type: 'image',
                              image:
                                convertDataContentToUint8Array(base64Content),
                              mimeType,
                              providerMetadata:
                                part.experimental_providerMetadata,
                            };
                          } catch (error) {
                            throw new Error(
                              `Error processing data URL: ${getErrorMessage(
                                message,
                              )}`,
                            );
                          }
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
                    providerMetadata: part.experimental_providerMetadata,
                  };
                }

                case 'file': {
                  if (part.data instanceof URL) {
                    if (downloadedAssets == null) {
                      return {
                        type: 'file',
                        data: part.data,
                        mimeType: part.mimeType,
                        providerMetadata: part.experimental_providerMetadata,
                      };
                    } else {
                      const downloadedImage =
                        downloadedAssets[part.data.toString()];
                      return {
                        type: 'file',
                        data: convertUint8ArrayToBase64(downloadedImage.data),
                        mimeType: part.mimeType ?? downloadedImage.mimeType,
                        providerMetadata: part.experimental_providerMetadata,
                      };
                    }
                  }

                  // try to convert string image parts to urls
                  if (typeof part.data === 'string') {
                    try {
                      const url = new URL(part.data);

                      switch (url.protocol) {
                        case 'http:':
                        case 'https:': {
                          if (downloadedAssets == null) {
                            return {
                              type: 'file',
                              data: url,
                              mimeType: part.mimeType,
                              providerMetadata:
                                part.experimental_providerMetadata,
                            };
                          } else {
                            const downloadedImage =
                              downloadedAssets[url.toString()];
                            return {
                              type: 'file',
                              data: convertUint8ArrayToBase64(
                                downloadedImage.data,
                              ),
                              mimeType:
                                part.mimeType ?? downloadedImage.mimeType,
                              providerMetadata:
                                part.experimental_providerMetadata,
                            };
                          }
                        }
                        case 'data:': {
                          try {
                            const { mimeType, base64Content } = splitDataUrl(
                              part.data,
                            );

                            if (mimeType == null || base64Content == null) {
                              throw new Error('Invalid data URL format');
                            }

                            return {
                              type: 'file',
                              data: convertDataContentToBase64String(
                                base64Content,
                              ),
                              mimeType,
                              providerMetadata:
                                part.experimental_providerMetadata,
                            };
                          } catch (error) {
                            throw new Error(
                              `Error processing data URL: ${getErrorMessage(
                                message,
                              )}`,
                            );
                          }
                        }
                      }
                    } catch (_ignored) {
                      // not a URL
                    }
                  }

                  const imageBase64 = convertDataContentToBase64String(
                    part.data,
                  );

                  return {
                    type: 'file',
                    data: imageBase64,
                    mimeType: part.mimeType,
                    providerMetadata: part.experimental_providerMetadata,
                  };
                }
              }
            },
          )
          // remove empty text parts:
          .filter(part => part.type !== 'text' || part.text !== ''),
        providerMetadata: message.experimental_providerMetadata,
      };
    }

    case 'assistant': {
      if (typeof message.content === 'string') {
        return {
          role: 'assistant',
          content: [{ type: 'text', text: message.content }],
          providerMetadata: message.experimental_providerMetadata,
        };
      }

      return {
        role: 'assistant',
        content: message.content
          .filter(
            // remove empty text parts:
            part => part.type !== 'text' || part.text !== '',
          )
          .map(part => {
            const { experimental_providerMetadata, ...rest } = part;
            return {
              ...rest,
              providerMetadata: experimental_providerMetadata,
            };
          }),
        providerMetadata: message.experimental_providerMetadata,
      };
    }

    case 'tool': {
      return {
        role: 'tool',
        content: message.content.map(part => ({
          type: 'tool-result',
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          result: part.result,
          providerMetadata: part.experimental_providerMetadata,
        })),
        providerMetadata: message.experimental_providerMetadata,
      };
    }

    default: {
      const _exhaustiveCheck: never = role;
      throw new InvalidMessageRoleError({ role: _exhaustiveCheck });
    }
  }
}

/**
 * Downloads images and files from URLs in the messages.
 */
async function downloadAssets(
  messages: CoreMessage[],
  downloadImplementation: typeof download,
): Promise<Record<string, { mimeType: string | undefined; data: Uint8Array }>> {
  const urls = messages
    .filter(message => message.role === 'user')
    .map(message => message.content)
    .filter((content): content is Array<TextPart | ImagePart | FilePart> =>
      Array.isArray(content),
    )
    .flat()
    .filter(
      (part): part is ImagePart | FilePart =>
        part.type === 'image' || part.type === 'file',
    )
    .map(part => (part.type === 'image' ? part.image : part.data))
    .map(part =>
      // support string urls:
      typeof part === 'string' &&
      (part.startsWith('http:') || part.startsWith('https:'))
        ? new URL(part)
        : part,
    )
    .filter((image): image is URL => image instanceof URL);

  // download in parallel:
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
