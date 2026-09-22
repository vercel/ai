import type {
  LanguageModelV2FilePart,
  LanguageModelV2Message,
  LanguageModelV2Prompt,
  LanguageModelV2TextPart,
} from '@ai-sdk/provider';
import {
  type DataContent,
  type FilePart,
  type ImagePart,
  type ModelMessage,
  type TextPart,
  isUrlSupported,
} from '@ai-sdk/provider-utils';
import {
  detectMediaType,
  imageMediaTypeSignatures,
} from '../util/detect-media-type';
import {
  type DownloadFunction,
  createDefaultDownloadFunction,
} from '../util/download/download-function';
import { convertToLanguageModelV2DataContent } from './data-content';
import { InvalidMessageRoleError } from './invalid-message-role-error';
import type { StandardizedPrompt } from './standardize-prompt';

export async function convertToLanguageModelPrompt({
  prompt,
  supportedUrls,
  download = createDefaultDownloadFunction(),
}: {
  prompt: StandardizedPrompt;
  supportedUrls: Record<string, RegExp[]>;
  download: DownloadFunction | undefined;
}): Promise<LanguageModelV2Prompt> {
  const downloadedAssets = await downloadAssets(
    prompt.messages,
    download,
    supportedUrls,
  );

  return [
    ...(prompt.system != null
      ? [{ role: 'system' as const, content: prompt.system }]
      : []),
    ...prompt.messages.map(message =>
      convertToLanguageModelMessage({ message, downloadedAssets }),
    ),
  ];
}

/**
 * Convert a ModelMessage to a LanguageModelV2Message.
 *
 * @param message The ModelMessage to convert.
 * @param downloadedAssets A map of URLs to their downloaded data. Only
 *   available if the model does not support URLs, null otherwise.
 */
export function convertToLanguageModelMessage({
  message,
  downloadedAssets,
}: {
  message: ModelMessage;
  downloadedAssets: Record<
    string,
    { mediaType: string | undefined; data: Uint8Array }
  >;
}): LanguageModelV2Message {
  const role = message.role;
  switch (role) {
    case 'system': {
      return {
        role: 'system',
        content: message.content,
        providerOptions: message.providerOptions,
      };
    }

    case 'user': {
      if (typeof message.content === 'string') {
        return {
          role: 'user',
          content: [{ type: 'text', text: message.content }],
          providerOptions: message.providerOptions,
        };
      }

      return {
        role: 'user',
        content: message.content
          .map(part => convertPartToLanguageModelPart(part, downloadedAssets))
          // remove empty text parts:
          .filter(part => part.type !== 'text' || part.text !== ''),
        providerOptions: message.providerOptions,
      };
    }

    case 'assistant': {
      if (typeof message.content === 'string') {
        return {
          role: 'assistant',
          content: [{ type: 'text', text: message.content }],
          providerOptions: message.providerOptions,
        };
      }

      return {
        role: 'assistant',
        content: message.content
          .filter(
            // remove empty text parts (no text, and no provider options):
            part =>
              part.type !== 'text' ||
              part.text !== '' ||
              part.providerOptions != null,
          )
          .map(part => {
            const providerOptions = part.providerOptions;

            switch (part.type) {
              case 'file': {
                const { data, mediaType } = convertToLanguageModelV2DataContent(
                  part.data,
                );
                return {
                  type: 'file',
                  data,
                  filename: part.filename,
                  mediaType: mediaType ?? part.mediaType,
                  providerOptions,
                };
              }
              case 'reasoning': {
                return {
                  type: 'reasoning',
                  text: part.text,
                  providerOptions,
                };
              }
              case 'text': {
                return {
                  type: 'text' as const,
                  text: part.text,
                  providerOptions,
                };
              }
              case 'tool-call': {
                return {
                  type: 'tool-call' as const,
                  toolCallId: part.toolCallId,
                  toolName: part.toolName,
                  input: part.input,
                  providerExecuted: part.providerExecuted,
                  providerOptions,
                };
              }
              case 'tool-result': {
                return {
                  type: 'tool-result' as const,
                  toolCallId: part.toolCallId,
                  toolName: part.toolName,
                  output: part.output,
                  providerOptions,
                };
              }
            }
          }),
        providerOptions: message.providerOptions,
      };
    }

    case 'tool': {
      return {
        role: 'tool',
        content: message.content.map(part => ({
          type: 'tool-result' as const,
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          output: part.output,
          providerOptions: part.providerOptions,
        })),
        providerOptions: message.providerOptions,
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
  messages: ModelMessage[],
  download: DownloadFunction,
  supportedUrls: Record<string, RegExp[]>,
): Promise<
  Record<string, { mediaType: string | undefined; data: Uint8Array }>
> {
  const plannedDownloads = messages
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
    .map(part => {
      const mediaType =
        part.mediaType ?? (part.type === 'image' ? 'image/*' : undefined);

      let data = part.type === 'image' ? part.image : part.data;
      if (typeof data === 'string') {
        try {
          data = new URL(data);
        } catch (ignored) {}
      }

      return { mediaType, data };
    })

    .filter(
      (part): part is { mediaType: string | undefined; data: URL } =>
        part.data instanceof URL,
    )
    .map(part => ({
      url: part.data,
      isUrlSupportedByModel:
        part.mediaType != null &&
        isUrlSupported({
          url: part.data.toString(),
          mediaType: part.mediaType,
          supportedUrls,
        }),
    }));

  // download in parallel:
  const downloadedFiles = await download(plannedDownloads);

  return Object.fromEntries(
    downloadedFiles
      .map((file, index) =>
        file == null
          ? null
          : [
              plannedDownloads[index].url.toString(),
              { data: file.data, mediaType: file.mediaType },
            ],
      )
      .filter(file => file != null),
  );
}

/**
 * Convert part of a message to a LanguageModelV2Part.
 * @param part The part to convert.
 * @param downloadedAssets A map of URLs to their downloaded data. Only
 *  available if the model does not support URLs, null otherwise.
 *
 * @returns The converted part.
 */
function convertPartToLanguageModelPart(
  part: TextPart | ImagePart | FilePart,
  downloadedAssets: Record<
    string,
    { mediaType: string | undefined; data: Uint8Array }
  >,
): LanguageModelV2TextPart | LanguageModelV2FilePart {
  if (part.type === 'text') {
    return {
      type: 'text',
      text: part.text,
      providerOptions: part.providerOptions,
    };
  }

  let originalData: DataContent | URL;
  const type = part.type;
  switch (type) {
    case 'image':
      originalData = part.image;
      break;
    case 'file':
      originalData = part.data;

      break;
    default:
      throw new Error(`Unsupported part type: ${type}`);
  }

  const { data: convertedData, mediaType: convertedMediaType } =
    convertToLanguageModelV2DataContent(originalData);

  let mediaType: string | undefined = convertedMediaType ?? part.mediaType;
  let data: Uint8Array | string | URL = convertedData; // binary | base64 | url

  // If the content is a URL, we check if it was downloaded:
  if (data instanceof URL) {
    const downloadedFile = downloadedAssets[data.toString()];
    if (downloadedFile) {
      data = downloadedFile.data;
      mediaType ??= downloadedFile.mediaType;
    }
  }

  // Now that we have the normalized data either as a URL or a Uint8Array,
  // we can create the LanguageModelV2Part.
  switch (type) {
    case 'image': {
      // When possible, try to detect the media type automatically
      // to deal with incorrect media type inputs.
      // When detection fails, use provided media type.
      if (data instanceof Uint8Array || typeof data === 'string') {
        mediaType =
          detectMediaType({ data, signatures: imageMediaTypeSignatures }) ??
          mediaType;
      }

      return {
        type: 'file',
        mediaType: mediaType ?? 'image/*', // any image
        filename: undefined,
        data,
        providerOptions: part.providerOptions,
      };
    }

<<<<<<< HEAD
    case 'file': {
      // We must have a mediaType for files, if not, throw an error.
      if (mediaType == null) {
        throw new Error(`Media type is missing for file part`);
=======
  if (
    data.type === 'data' &&
    (data.data instanceof Uint8Array || typeof data.data === 'string')
  ) {
    const imageMediaType = detectMediaType({
      data: data.data,
      topLevelType: 'image',
    });
    if (imageMediaType != null) {
      mediaType = imageMediaType;
    }
  }

  if (mediaType == null) {
    throw new Error(`Media type is missing for file part`);
  }

  return {
    type: 'file',
    mediaType,
    filename: part.filename,
    data,
    providerOptions: part.providerOptions,
  };
}

export function mapToolResultOutput({
  output,
  // `provider` is only needed here to convert legacy "file-id" and "image-file-id" types to provider references, in case they are using string ID values.
  // TODO: remove in v8 when "file-id" and "image-file-id" types are removed
  provider,
  warnings = [],
  downloadedAssets,
}: {
  output: ToolResultOutput;
  provider?: string;
  warnings?: Warning[];
  downloadedAssets: Record<
    string,
    { mediaType: string | undefined; data: Uint8Array }
  >;
}): LanguageModelV4ToolResultOutput {
  if (output.type !== 'content') {
    return output;
  }

  return {
    type: 'content',
    value: output.value.map(item => {
      switch (item.type) {
        case 'file': {
          const convertedPart = convertPartToLanguageModelPart(
            item,
            downloadedAssets,
          );

          if (convertedPart.type !== 'file') {
            throw new Error(
              'Expected tool result file content to convert to file.',
            );
          }

          return convertedPart;
        }
        case 'file-data': {
          warnings.push({
            type: 'deprecated',
            setting: '"tool-result" content of type "file-data"',
            message: `The "file-data" type for tool result content is deprecated. Use the "file" type with mediaType and { type: 'data', data } instead.`,
          });
          return {
            type: 'file' as const,
            data: { type: 'data' as const, data: item.data },
            filename: item.filename,
            mediaType: item.mediaType,
            providerOptions: item.providerOptions,
          };
        }
        case 'file-url': {
          const mediaType = item.mediaType ?? getMediaTypeFromUrl(item.url);
          const url = new URL(item.url);
          let message = `The "file-url" type for tool result content is deprecated. Use the "file" type with mediaType and { type: 'url', url } instead.`;
          if (!item.mediaType) {
            const inferenceSuffix =
              mediaType === 'application/octet-stream'
                ? `Unable to infer media type from URL. Defaulting to 'application/octet-stream'.`
                : `Inferred media type '${mediaType}' from URL.`;
            message = `The "file-url" tool result content part with URL "${item.url}" is missing a "mediaType". ${inferenceSuffix} ${message}`;
          }
          warnings.push({
            type: 'deprecated',
            setting: '"tool-result" content of type "file-url"',
            message,
          });
          return {
            type: 'file' as const,
            data: {
              type: 'url' as const,
              url,
              ...(url.toString() !== item.url ? { originalUrl: item.url } : {}),
            },
            mediaType,
            providerOptions: item.providerOptions,
          };
        }
        case 'file-id': {
          warnings.push({
            type: 'deprecated',
            setting: '"tool-result" content of type "file-id"',
            message: `The "file-id" type for tool result content is deprecated. Use the "file" type with mediaType and { type: 'reference', reference } instead.`,
          });
          return {
            type: 'file' as const,
            data: {
              type: 'reference' as const,
              reference: convertFileIdToProviderReference({
                fileId: item.fileId,
                provider,
              }),
            },
            mediaType: 'application',
            providerOptions: item.providerOptions,
          };
        }
        case 'file-reference': {
          warnings.push({
            type: 'deprecated',
            setting: '"tool-result" content of type "file-reference"',
            message: `The "file-reference" type for tool result content is deprecated. Use the "file" type with mediaType and { type: 'reference', reference } instead.`,
          });
          return {
            type: 'file' as const,
            data: {
              type: 'reference' as const,
              reference: item.providerReference,
            },
            mediaType: 'application',
            providerOptions: item.providerOptions,
          };
        }
        // The "image-*" types are legacy and deprecated.
        // TODO: remove migration in v8 in combination with the removal of these types from the provider utils.
        case 'image-data': {
          warnings.push({
            type: 'deprecated',
            setting: '"tool-result" content of type "image-data"',
            message: `The "image-data" type for tool result content is deprecated. Use the "file" type with mediaType and { type: 'data', data } instead.`,
          });
          return {
            type: 'file' as const,
            data: { type: 'data' as const, data: item.data },
            mediaType: item.mediaType,
            providerOptions: item.providerOptions,
          };
        }
        case 'image-url': {
          const url = new URL(item.url);
          warnings.push({
            type: 'deprecated',
            setting: '"tool-result" content of type "image-url"',
            message: `The "image-url" type for tool result content is deprecated. Use the "file" type with mediaType 'image' (or a specific image/* subtype) and { type: 'url', url } instead.`,
          });
          return {
            type: 'file' as const,
            data: {
              type: 'url' as const,
              url,
              ...(url.toString() !== item.url ? { originalUrl: item.url } : {}),
            },
            mediaType: 'image',
            providerOptions: item.providerOptions,
          };
        }
        case 'image-file-id': {
          warnings.push({
            type: 'deprecated',
            setting: '"tool-result" content of type "image-file-id"',
            message: `The "image-file-id" type for tool result content is deprecated. Use the "file" type with mediaType and { type: 'reference', reference } instead.`,
          });
          return {
            type: 'file' as const,
            data: {
              type: 'reference' as const,
              reference: convertFileIdToProviderReference({
                fileId: item.fileId,
                provider,
              }),
            },
            mediaType: 'image',
            providerOptions: item.providerOptions,
          };
        }
        case 'image-file-reference': {
          warnings.push({
            type: 'deprecated',
            setting: '"tool-result" content of type "image-file-reference"',
            message: `The "image-file-reference" type for tool result content is deprecated. Use the "file" type with mediaType and { type: 'reference', reference } instead.`,
          });
          return {
            type: 'file' as const,
            data: {
              type: 'reference' as const,
              reference: item.providerReference,
            },
            mediaType: 'image',
            providerOptions: item.providerOptions,
          };
        }
        default:
          return item;
>>>>>>> ffb0e762cf (fix: Google Vertex percent-encoding literal characters in gs:// object names (#21267))
      }

      return {
        type: 'file',
        mediaType,
        filename: part.filename,
        data,
        providerOptions: part.providerOptions,
      };
    }
  }
}
