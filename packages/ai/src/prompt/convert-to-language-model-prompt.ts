import {
  LanguageModelV4FilePart,
  LanguageModelV4Message,
  LanguageModelV4Prompt,
  LanguageModelV4TextPart,
  LanguageModelV4ToolResultOutput,
} from '@ai-sdk/provider';
import {
  asArray,
  CustomPart,
  DataContent,
  FilePart,
  ImagePart,
  isProviderReference,
  isUrlSupported,
  ModelMessage,
  ReasoningFilePart,
  ReasoningPart,
  TextPart,
  ToolCallPart,
  ToolResultOutput,
  ToolResultPart,
} from '@ai-sdk/provider-utils';
import {
  detectMediaType,
  imageMediaTypeSignatures,
} from '../util/detect-media-type';
import {
  createDefaultDownloadFunction,
  DownloadFunction,
} from '../util/download/download-function';
import { convertToLanguageModelV4DataContent } from './data-content';
import { logWarnings } from '../logger/log-warnings';
import type { Warning } from '../types/warning';
import { InvalidMessageRoleError } from './invalid-message-role-error';
import { StandardizedPrompt } from './standardize-prompt';
import { MissingToolResultsError } from '../error/missing-tool-result-error';

export async function convertToLanguageModelPrompt({
  prompt,
  supportedUrls,
  download = createDefaultDownloadFunction(),
  // `provider` is only needed here to convert legacy tool output types via `mapToolResultOutput`.
  // TODO: remove in v8 when "file-id" and "image-file-id" types are removed
  provider,
}: {
  prompt: StandardizedPrompt;
  supportedUrls: Record<string, RegExp[]>;
  download: DownloadFunction | undefined;
  provider?: string;
}): Promise<LanguageModelV4Prompt> {
  const downloadedAssets = await downloadAssets(
    prompt.messages,
    download,
    supportedUrls,
  );

  const approvalIdToToolCallId = new Map<string, string>();
  for (const message of prompt.messages) {
    if (message.role === 'assistant' && Array.isArray(message.content)) {
      for (const part of message.content) {
        if (
          part.type === 'tool-approval-request' &&
          'approvalId' in part &&
          'toolCallId' in part
        ) {
          approvalIdToToolCallId.set(
            part.approvalId as string,
            part.toolCallId as string,
          );
        }
      }
    }
  }

  const approvedToolCallIds = new Set<string>();
  for (const message of prompt.messages) {
    if (message.role === 'tool') {
      for (const part of message.content) {
        if (part.type === 'tool-approval-response') {
          const toolCallId = approvalIdToToolCallId.get(part.approvalId);
          if (toolCallId) {
            approvedToolCallIds.add(toolCallId);
          }
        }
      }
    }
  }

  const messages = [
    ...(prompt.system != null
      ? typeof prompt.system === 'string'
        ? [{ role: 'system' as const, content: prompt.system }]
        : asArray(prompt.system).map(message => ({
            role: 'system' as const,
            content: message.content,
            providerOptions: message.providerOptions,
          }))
      : []),
    ...prompt.messages.map(message =>
      convertToLanguageModelMessage({ message, downloadedAssets, provider }),
    ),
  ];

  // combine consecutive tool messages into a single tool message
  const combinedMessages = [];
  for (const message of messages) {
    if (message.role !== 'tool') {
      combinedMessages.push(message);
      continue;
    }

    const lastCombinedMessage = combinedMessages.at(-1);
    if (lastCombinedMessage?.role === 'tool') {
      lastCombinedMessage.content.push(...message.content);
    } else {
      combinedMessages.push(message);
    }
  }

  const toolCallIds = new Set<string>();
  // Track approved tool-calls that have no matching tool-result.
  // These must be stripped from assistant messages before sending to the
  // provider, otherwise providers get orphaned tool_use blocks.
  const unresolvedApprovedToolCallIds = new Set<string>();

  for (const message of combinedMessages) {
    switch (message.role) {
      case 'assistant': {
        for (const content of message.content) {
          if (content.type === 'tool-call' && !content.providerExecuted) {
            toolCallIds.add(content.toolCallId);
          }
        }
        break;
      }
      case 'tool': {
        for (const content of message.content) {
          if (content.type === 'tool-result') {
            toolCallIds.delete(content.toolCallId);
            unresolvedApprovedToolCallIds.delete(content.toolCallId);
          }
        }
        break;
      }
      case 'user':
      case 'system':
        // remove approved tool calls from the set before checking:
        for (const id of approvedToolCallIds) {
          if (toolCallIds.has(id)) {
            unresolvedApprovedToolCallIds.add(id);
          }
          toolCallIds.delete(id);
        }

        if (toolCallIds.size > 0) {
          throw new MissingToolResultsError({
            toolCallIds: Array.from(toolCallIds),
          });
        }
        break;
    }
  }

  // remove approved tool calls from the set before checking:
  for (const id of approvedToolCallIds) {
    if (toolCallIds.has(id)) {
      unresolvedApprovedToolCallIds.add(id);
    }
    toolCallIds.delete(id);
  }

  if (toolCallIds.size > 0) {
    throw new MissingToolResultsError({ toolCallIds: Array.from(toolCallIds) });
  }

  // Strip unresolved approved tool-calls from assistant messages so
  // providers never see a tool_use without a matching tool_result.
  if (unresolvedApprovedToolCallIds.size > 0) {
    for (const message of combinedMessages) {
      if (message.role === 'assistant') {
        message.content = message.content.filter(
          part =>
            part.type !== 'tool-call' ||
            !unresolvedApprovedToolCallIds.has(part.toolCallId),
        );
      }
    }
  }

  return combinedMessages.filter(
    // Filter out empty tool messages (e.g. if they only contained
    // tool-approval-response parts that were removed).
    // This prevents sending invalid empty messages to the provider.
    // Note: provider-executed tool-approval-response parts are preserved.
    message =>
      (message.role !== 'tool' && message.role !== 'assistant') ||
      message.content.length > 0,
  );
}

/**
 * Convert a ModelMessage to a LanguageModelV4Message.
 *
 * @param message - The ModelMessage to convert.
 * @param downloadedAssets - A map of URLs to their downloaded data. Only
 * available if the model does not support URLs, null otherwise.
 */
export function convertToLanguageModelMessage({
  message,
  downloadedAssets,
  // `provider` is only needed here to convert legacy tool output types via `mapToolResultOutput`.
  // TODO: remove in v8 when "file-id" and "image-file-id" types are removed
  provider,
}: {
  message: ModelMessage;
  downloadedAssets: Record<
    string,
    { mediaType: string | undefined; data: Uint8Array }
  >;
  provider?: string;
}): LanguageModelV4Message {
  const warnings: Warning[] = [];

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

      const converted = {
        role: 'user' as const,
        content: message.content
          .map(part => convertPartToLanguageModelPart(part, downloadedAssets))
          // remove empty text parts:
          .filter(part => part.type !== 'text' || part.text !== ''),
        providerOptions: message.providerOptions,
      };
      if (warnings.length > 0) {
        logWarnings({ warnings });
      }
      return converted;
    }

    case 'assistant': {
      if (typeof message.content === 'string') {
        return {
          role: 'assistant',
          content: [{ type: 'text', text: message.content }],
          providerOptions: message.providerOptions,
        };
      }

      const converted = {
        role: 'assistant' as const,
        content: message.content
          .filter(
            // remove empty text parts (no text, and no provider options):
            part =>
              part.type !== 'text' ||
              part.text !== '' ||
              part.providerOptions != null,
          )
          .filter(
            (
              part,
            ): part is
              | CustomPart
              | TextPart
              | FilePart
              | ReasoningPart
              | ReasoningFilePart
              | ToolCallPart
              | ToolResultPart => part.type !== 'tool-approval-request',
          )
          .map(part => {
            const providerOptions = part.providerOptions;

            switch (part.type) {
              case 'custom': {
                return {
                  type: 'custom' as const,
                  kind: part.kind,
                  providerOptions,
                };
              }
              case 'file': {
                if (
                  !(part.data instanceof ArrayBuffer) &&
                  isProviderReference(part.data)
                ) {
                  return {
                    type: 'file' as const,
                    data: part.data,
                    filename: part.filename,
                    mediaType: part.mediaType,
                    providerOptions,
                  };
                }
                const { data, mediaType } = convertToLanguageModelV4DataContent(
                  part.data,
                );
                return {
                  type: 'file' as const,
                  data,
                  filename: part.filename,
                  mediaType: mediaType ?? part.mediaType,
                  providerOptions,
                };
              }
              case 'reasoning': {
                return {
                  type: 'reasoning' as const,
                  text: part.text,
                  providerOptions,
                };
              }
              case 'reasoning-file': {
                const { data, mediaType } = convertToLanguageModelV4DataContent(
                  part.data,
                );
                return {
                  type: 'reasoning-file' as const,
                  data,
                  mediaType: mediaType ?? part.mediaType,
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
                  output: mapToolResultOutput({
                    output: part.output,
                    provider,
                    warnings,
                  }),
                  providerOptions,
                };
              }
            }
          }),
        providerOptions: message.providerOptions,
      };
      if (warnings.length > 0) {
        logWarnings({ warnings });
      }
      return converted;
    }

    case 'tool': {
      const converted = {
        role: 'tool' as const,
        content: message.content
          .filter(
            // Only include tool-approval-response for provider-executed tools
            part =>
              part.type !== 'tool-approval-response' || part.providerExecuted,
          )
          .map(part => {
            switch (part.type) {
              case 'tool-result': {
                return {
                  type: 'tool-result' as const,
                  toolCallId: part.toolCallId,
                  toolName: part.toolName,
                  output: mapToolResultOutput({
                    output: part.output,
                    provider,
                    warnings,
                  }),
                  providerOptions: part.providerOptions,
                };
              }
              case 'tool-approval-response': {
                return {
                  type: 'tool-approval-response' as const,
                  approvalId: part.approvalId,
                  approved: part.approved,
                  reason: part.reason,
                };
              }
            }
          }),
        providerOptions: message.providerOptions,
      };
      if (warnings.length > 0) {
        logWarnings({ warnings });
      }
      return converted;
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
        } catch {}
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
 * Convert part of a message to a LanguageModelV4Part.
 *
 * @param part - The part to convert.
 * @param downloadedAssets - A map of URLs to their downloaded data. Only
 * available if the model does not support URLs, null otherwise.
 * @returns The converted part.
 */
function convertPartToLanguageModelPart(
  part: TextPart | ImagePart | FilePart,
  downloadedAssets: Record<
    string,
    { mediaType: string | undefined; data: Uint8Array }
  >,
): LanguageModelV4TextPart | LanguageModelV4FilePart {
  if (part.type === 'text') {
    return {
      type: 'text',
      text: part.text,
      providerOptions: part.providerOptions,
    };
  }

  const type = part.type;
  const rawData = type === 'image' ? part.image : part.data;

  if (
    typeof rawData === 'object' &&
    !(rawData instanceof Uint8Array) &&
    !(rawData instanceof ArrayBuffer) &&
    !(rawData instanceof URL)
  ) {
    return {
      type: 'file',
      mediaType: part.mediaType ?? (type === 'image' ? 'image/*' : ''),
      filename: type === 'file' ? part.filename : undefined,
      data: rawData,
      providerOptions: part.providerOptions,
    };
  }

  const originalData: DataContent | URL = rawData;

  const { data: convertedData, mediaType: convertedMediaType } =
    convertToLanguageModelV4DataContent(originalData);

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
  // we can create the LanguageModelV4Part.
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

function mapToolResultOutput({
  output,
  // `provider` is only needed here to convert legacy "file-id" and "image-file-id" types to provider references, in case they are using string ID values.
  // TODO: remove in v8 when "file-id" and "image-file-id" types are removed
  provider,
  warnings = [],
}: {
  output: ToolResultOutput;
  provider?: string;
  warnings?: Warning[];
}): LanguageModelV4ToolResultOutput {
  if (output.type !== 'content') {
    return output;
  }

  return {
    type: 'content',
    value: output.value.map(item => {
      switch (item.type) {
        // The "image-*" types are legacy and deprecated.
        // TODO: remove migration in v8 in combination with the removal of these types from the provider utils.
        case 'image-data': {
          warnings.push({
            type: 'deprecated',
            setting: '"tool-result" content of type "image-data"',
            message: `The "image-data" type for tool result content is deprecated. Use the "file-data" type instead.`,
          });
          return {
            type: 'file-data' as const,
            data: item.data,
            mediaType: item.mediaType,
            providerOptions: item.providerOptions,
          };
        }
        case 'image-url': {
          warnings.push({
            type: 'deprecated',
            setting: '"tool-result" content of type "image-url"',
            message: `The "image-url" type for tool result content is deprecated. Use the "file-url" type instead.`,
          });
          return {
            type: 'file-url' as const,
            url: item.url,
            mediaType: getMediaTypeFromUrl(item.url, 'image/*'),
            providerOptions: item.providerOptions,
          };
        }
        case 'image-file-id': {
          warnings.push({
            type: 'deprecated',
            setting: '"tool-result" content of type "image-file-id"',
            message: `The "image-file-id" type for tool result content is deprecated. Use the "file-reference" type instead.`,
          });
          return {
            type: 'file-reference' as const,
            providerReference: convertFileIdToProviderReference({
              fileId: item.fileId,
              provider,
            }),
            providerOptions: item.providerOptions,
          };
        }
        case 'image-file-reference': {
          warnings.push({
            type: 'deprecated',
            setting: '"tool-result" content of type "image-file-reference"',
            message: `The "image-file-reference" type for tool result content is deprecated. Use the "file-reference" type instead.`,
          });
          return {
            type: 'file-reference' as const,
            providerReference: item.providerReference,
            providerOptions: item.providerOptions,
          };
        }
        case 'file-id': {
          warnings.push({
            type: 'deprecated',
            setting: '"tool-result" content of type "file-id"',
            message: `The "file-id" type for tool result content is deprecated. Use the "file-reference" type instead.`,
          });
          return {
            type: 'file-reference' as const,
            providerReference: convertFileIdToProviderReference({
              fileId: item.fileId,
              provider,
            }),
            providerOptions: item.providerOptions,
          };
        }
        case 'file-url': {
          const mediaType = item.mediaType ?? getMediaTypeFromUrl(item.url);
          if (!item.mediaType) {
            const messageSuffix =
              mediaType === 'application/octet-stream'
                ? `Unable to infer media type from URL. Defaulting to 'application/octet-stream'.`
                : `Inferred media type '${mediaType}' from URL.`;
            warnings.push({
              type: 'deprecated',
              setting:
                '"tool-result" content of type "file-url" without mediaType',
              message:
                `The "file-url" tool result content part with URL "${item.url}" is missing a "mediaType". ` +
                messageSuffix,
            });
          }
          return {
            type: 'file-url' as const,
            url: item.url,
            mediaType,
            providerOptions: item.providerOptions,
          };
        }
        default:
          return item;
      }
    }),
  };
}

function convertFileIdToProviderReference({
  fileId,
  provider,
}: {
  fileId: string | Record<string, string>;
  provider?: string;
}): Record<string, string> {
  if (typeof fileId === 'object') {
    return fileId;
  }

  if (provider == null) {
    throw new Error(
      'Cannot convert string fileId to provider reference without a provider ID. ' +
        'Use a Record<string, string> fileId or switch to the file-reference type.',
    );
  }

  return { [provider]: fileId };
}

// Temporary private helper (see below).
// TODO: remove in v8
const URL_EXTENSION_TO_MEDIA_TYPE: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  avif: 'image/avif',
  heic: 'image/heic',
  bmp: 'image/bmp',
  tiff: 'image/tiff',
  tif: 'image/tiff',
  pdf: 'application/pdf',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
};

/*
 * Attempts to infer an IANA media type from the file extension in a URL's
 * pathname. Returns `fallbackMediaType` when the extension is absent,
 * unrecognized, or the URL cannot be parsed.
 *
 * Temporary private helper as a best-effort solution for missing media types on "file-url" content parts.
 * TODO: remove in v8 when "file-url" content parts are required to have media types, after a migration period.
 */
function getMediaTypeFromUrl(
  url: string,
  fallbackMediaType = 'application/octet-stream',
): string {
  try {
    const pathname = new URL(url).pathname;
    const ext = pathname.split('.').pop()?.toLowerCase();
    if (ext && ext in URL_EXTENSION_TO_MEDIA_TYPE) {
      return URL_EXTENSION_TO_MEDIA_TYPE[ext];
    }
  } catch {
    // ignore URL parse errors
  }
  return fallbackMediaType;
}
