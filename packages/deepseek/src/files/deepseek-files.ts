import {
  InvalidArgumentError,
  type FilesV4,
  type FilesV4UploadFileCallOptions,
  type FilesV4UploadFileResult,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  convertInlineFileDataToUint8Array,
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  detectMediaType,
  parseProviderOptions,
  postFormDataToApi,
  type FetchFunction,
  type InferSchema,
} from '@ai-sdk/provider-utils';
import { deepSeekErrorSchema } from '../chat/deepseek-chat-api-types';
import { deepSeekFilesResponseSchema } from './deepseek-files-api';
import {
  deepSeekFilesOptionsSchema,
  type DeepSeekFilesOptions,
} from './deepseek-files-options';

interface DeepSeekFilesConfig {
  provider: string;
  baseURL: string;
  headers: () => Record<string, string | undefined>;
  fetch?: FetchFunction;
}

const deepSeekFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: deepSeekErrorSchema,
  errorToMessage: (error: InferSchema<typeof deepSeekErrorSchema>) =>
    error.error.message,
});

const MAX_FILE_SIZE_BYTES = 64 * 1024 * 1024;
const MAX_FILENAME_LENGTH = 512;

const supportedMediaTypes = new Set([
  'image/gif',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);

const genericMediaTypes = new Set([
  '',
  'application/binary',
  'application/octet-stream',
  'binary/octet-stream',
  'image',
  'image/*',
]);

const supportedFilenameExtensions = new Set([
  'gif',
  'jpeg',
  'jpg',
  'png',
  'webp',
]);

export class DeepSeekFiles implements FilesV4 {
  readonly specificationVersion = 'v4';

  get provider(): string {
    return this.config.provider;
  }

  constructor(private readonly config: DeepSeekFilesConfig) {}

  async uploadFile({
    data,
    mediaType,
    filename,
    abortSignal,
    headers,
    providerOptions,
  }: FilesV4UploadFileCallOptions): Promise<FilesV4UploadFileResult> {
    const deepSeekOptions = (await parseProviderOptions({
      provider: 'deepseek',
      providerOptions,
      schema: deepSeekFilesOptionsSchema,
    })) as DeepSeekFilesOptions | undefined;

    const fileBytes = convertInlineFileDataToUint8Array(data);
    validateFileUpload({ fileBytes, mediaType, filename });

    const blob = new Blob([fileBytes], { type: mediaType });

    const formData = new FormData();
    if (filename != null) {
      formData.append('file', blob, filename);
    } else {
      formData.append('file', blob);
    }
    formData.append('purpose', 'user_data');

    if (deepSeekOptions?.expiresAfter != null) {
      formData.append('expires_after[anchor]', 'created_at');
      formData.append(
        'expires_after[seconds]',
        String(deepSeekOptions.expiresAfter),
      );
    }

    const { value: response } = await postFormDataToApi({
      url: `${this.config.baseURL}/files`,
      headers: combineHeaders(this.config.headers(), headers),
      formData,
      failedResponseHandler: deepSeekFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        deepSeekFilesResponseSchema,
      ),
      abortSignal,
      fetch: this.config.fetch,
    });

    return {
      warnings: [],
      providerReference: { deepseek: response.id },
      ...((response.filename ?? filename)
        ? { filename: response.filename ?? filename }
        : {}),
      ...(mediaType != null ? { mediaType } : {}),
      providerMetadata: {
        deepseek: {
          ...(response.object != null ? { object: response.object } : {}),
          ...(response.filename != null ? { filename: response.filename } : {}),
          ...(response.purpose != null ? { purpose: response.purpose } : {}),
          ...(response.bytes != null ? { bytes: response.bytes } : {}),
          ...(response.created_at != null
            ? { createdAt: response.created_at }
            : {}),
          ...(response.expires_at != null
            ? { expiresAt: response.expires_at }
            : {}),
        },
      },
    };
  }
}

function validateFileUpload({
  fileBytes,
  mediaType,
  filename,
}: {
  fileBytes: Uint8Array;
  mediaType: string;
  filename: string | undefined;
}) {
  if (fileBytes.length > MAX_FILE_SIZE_BYTES) {
    throw new InvalidArgumentError({
      argument: 'data',
      message:
        `DeepSeek file uploads must not exceed 64 MiB ` +
        `(${MAX_FILE_SIZE_BYTES.toLocaleString('en-US')} bytes). ` +
        `Received ${fileBytes.length.toLocaleString('en-US')} bytes.`,
    });
  }

  if (filename != null) {
    const filenameLength = Array.from(filename).length;

    if (filenameLength > MAX_FILENAME_LENGTH) {
      throw new InvalidArgumentError({
        argument: 'filename',
        message:
          `DeepSeek filenames must not exceed ${MAX_FILENAME_LENGTH} characters. ` +
          `Received ${filenameLength} characters.`,
      });
    }
  }

  const normalizedMediaType = normalizeMediaType(mediaType);
  const detectedMediaType = detectMediaType({ data: fileBytes });

  if (
    detectedMediaType != null &&
    !supportedMediaTypes.has(detectedMediaType)
  ) {
    throw new InvalidArgumentError({
      argument: 'data',
      message:
        `DeepSeek file uploads support JPEG, PNG, GIF, and WebP images. ` +
        `Detected unsupported file content type "${detectedMediaType}".`,
    });
  }

  if (supportedMediaTypes.has(normalizedMediaType)) {
    return;
  }

  if (!genericMediaTypes.has(normalizedMediaType)) {
    throw new InvalidArgumentError({
      argument: 'mediaType',
      message:
        `DeepSeek file uploads support JPEG, PNG, GIF, and WebP images. ` +
        `Received unsupported media type "${mediaType}".`,
    });
  }

  if (detectedMediaType != null || hasSupportedFilenameExtension(filename)) {
    return;
  }

  throw new InvalidArgumentError({
    argument: 'mediaType',
    message:
      `DeepSeek file uploads support JPEG, PNG, GIF, and WebP images. ` +
      `Provide a supported media type or a filename ending in ` +
      `.jpg, .jpeg, .png, .gif, or .webp. Received "${mediaType}".`,
  });
}

function normalizeMediaType(mediaType: string): string {
  return mediaType.split(';', 1)[0].trim().toLowerCase();
}

function hasSupportedFilenameExtension(filename: string | undefined): boolean {
  if (filename == null) {
    return false;
  }

  const extensionSeparatorIndex = filename.lastIndexOf('.');

  return (
    extensionSeparatorIndex !== -1 &&
    supportedFilenameExtensions.has(
      filename.slice(extensionSeparatorIndex + 1).toLowerCase(),
    )
  );
}
