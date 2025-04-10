import {
  LanguageModelV2FilePart,
  LanguageModelV2Message,
  LanguageModelV2Prompt,
  LanguageModelV2TextPart,
} from '@ai-sdk/provider';
import { download } from '../../util/download';
import { CoreMessage } from '../prompt/message';
import {
  detectMediaType,
  imageMediaTypeSignatures,
} from '../util/detect-media-type';
import { FilePart, ImagePart, TextPart } from './content-part';
import {
  convertDataContentToBinaryOrBase64OrURL,
  DataContent,
} from './data-content';
import { InvalidMessageRoleError } from './invalid-message-role-error';
import { StandardizedPrompt } from './standardize-prompt';

export async function convertToLanguageModelPrompt({
  prompt,
  modelSupportsImageUrls = true,
  modelSupportsUrl = () => false,
  downloadImplementation = download,
}: {
  prompt: StandardizedPrompt;
  modelSupportsImageUrls: boolean | undefined;
  modelSupportsUrl: undefined | ((url: URL) => boolean);
  downloadImplementation?: typeof download;
}): Promise<LanguageModelV2Prompt> {
  const downloadedAssets = await downloadAssets(
    prompt.messages,
    downloadImplementation,
    modelSupportsImageUrls,
    modelSupportsUrl,
  );

  return [
    ...(prompt.system != null
      ? [{ role: 'system' as const, content: prompt.system }]
      : []),
    ...prompt.messages.map(message =>
      convertToLanguageModelMessage(message, downloadedAssets),
    ),
  ];
}

/**
 * Convert a CoreMessage to a LanguageModelV2Message.
 *
 * @param message The CoreMessage to convert.
 * @param downloadedAssets A map of URLs to their downloaded data. Only
 *   available if the model does not support URLs, null otherwise.
 */
export function convertToLanguageModelMessage(
  message: CoreMessage,
  downloadedAssets: Record<
    string,
    { mediaType: string | undefined; data: Uint8Array }
  >,
): LanguageModelV2Message {
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
            // remove empty text parts:
            part => part.type !== 'text' || part.text !== '',
          )
          .map(part => {
            const providerOptions = part.providerOptions;

            switch (part.type) {
              case 'file': {
                const { data, mediaType } =
                  convertDataContentToBinaryOrBase64OrURL(part.data);
                return {
                  type: 'file',
                  data,
                  filename: part.filename,
                  mediaType: mediaType ?? part.mediaType ?? part.mimeType,
                  providerOptions,
                };
              }
              case 'reasoning': {
                return {
                  type: 'reasoning',
                  text: part.text,
                  signature: part.signature,
                  providerOptions,
                };
              }
              case 'redacted-reasoning': {
                return {
                  type: 'redacted-reasoning',
                  data: part.data,
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
                  args: part.args,
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
          type: 'tool-result',
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          result: part.result,
          content: part.experimental_content,
          isError: part.isError,
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
  messages: CoreMessage[],
  downloadImplementation: typeof download,
  modelSupportsImageUrls: boolean | undefined,
  modelSupportsUrl: (url: URL) => boolean,
): Promise<
  Record<string, { mediaType: string | undefined; data: Uint8Array }>
> {
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
    /**
     * Filter out image parts if the model supports image URLs, before letting it
     * decide if it supports a particular URL.
     */
    .filter(
      (part): part is ImagePart | FilePart =>
        !(part.type === 'image' && modelSupportsImageUrls === true),
    )
    .map(part => (part.type === 'image' ? part.image : part.data))
    .map(part =>
      // support string urls:
      typeof part === 'string' &&
      (part.startsWith('http:') || part.startsWith('https:'))
        ? new URL(part)
        : part,
    )
    .filter((image): image is URL => image instanceof URL)
    /**
     * Filter out URLs that the model supports natively, so we don't download them.
     */
    .filter(url => !modelSupportsUrl(url));

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
    convertDataContentToBinaryOrBase64OrURL(originalData);

  let mediaType: string | undefined =
    convertedMediaType ?? part.mediaType ?? part.mimeType;
  let data: Uint8Array | string | URL = convertedData; // binary | base64 | url

  // If the content is a URL, we check if it was downloaded:
  if (data instanceof URL) {
    const downloadedFile = downloadedAssets[data.toString()];
    if (downloadedFile) {
      data = downloadedFile.data;
      mediaType = downloadedFile.mediaType ?? mediaType;
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

    case 'file': {
      // We must have a mediaType for files, if not, throw an error.
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
  }
}
