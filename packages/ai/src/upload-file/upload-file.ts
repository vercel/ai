import { FilesV4, ProviderV4 } from '@ai-sdk/provider';
import {
  convertBase64ToUint8Array,
  DataContent,
  ProviderOptions,
} from '@ai-sdk/provider-utils';
import { convertToLanguageModelV4DataContent } from '../prompt/data-content';
import { ProviderMetadata } from '../types/provider-metadata';
import { ProviderReference } from '../types/provider-reference';
import { Warning } from '../types/warning';
import {
  audioMediaTypeSignatures,
  detectMediaType,
  documentMediaTypeSignatures,
  imageMediaTypeSignatures,
  videoMediaTypeSignatures,
} from '../util/detect-media-type';
import { UploadFileResult } from './upload-file-result';

/**
 * Uploads a file using a files API interface.
 *
 * @param api - The Files API interface to use for uploading.
 * @param data - The file data to upload.
 * @param mediaType - Optional IANA media type. Auto-detected from file bytes if not provided.
 * @param filename - Optional filename for the uploaded file.
 * @param providerOptions - Additional provider-specific options.
 *
 * @returns A result object containing the provider reference and optional metadata.
 */
export async function uploadFile({
  api,
  data: dataArg,
  mediaType: mediaTypeArg,
  filename,
  providerOptions,
}: {
  /**
   * The files API interface to use for uploading.
   * Can be a `FilesV4` instance or a `ProviderV4` instance with a `files()` method.
   */
  api: FilesV4 | ProviderV4;

  /**
   * The file data to upload.
   */
  data: DataContent;

  /**
   * Optional IANA media type of the file.
   * Auto-detected from file bytes if not provided.
   */
  mediaType?: string;

  /**
   * Optional filename for the uploaded file.
   */
  filename?: string;

  /**
   * Additional provider-specific options.
   */
  providerOptions?: ProviderOptions;
}): Promise<UploadFileResult> {
  const { data } = convertToLanguageModelV4DataContent(dataArg);

  if (data instanceof URL) {
    throw new Error(
      'URL data is not supported for file uploads. Fetch the URL content first and pass the bytes.',
    );
  }

  const mediaType =
    mediaTypeArg ??
    detectMediaType({
      data,
      signatures: [
        ...imageMediaTypeSignatures,
        ...documentMediaTypeSignatures,
        ...audioMediaTypeSignatures,
        ...videoMediaTypeSignatures,
      ],
    }) ??
    (isLikelyText(data) ? 'text/plain' : 'application/octet-stream');

  const filesApi: FilesV4 =
    'uploadFile' in api
      ? api
      : typeof api.files === 'function'
        ? api.files()
        : (() => {
            throw new Error(
              'The provider does not support file uploads. Make sure it exposes a files() method.',
            );
          })();

  const result = await filesApi.uploadFile({
    data,
    mediaType,
    filename,
    providerOptions,
  });

  return new DefaultUploadFileResult({
    providerReference: result.providerReference,
    mediaType: result.mediaType,
    filename: result.filename,
    providerMetadata: result.providerMetadata,
    warnings: result.warnings,
  });
}

class DefaultUploadFileResult implements UploadFileResult {
  readonly providerReference: ProviderReference;
  readonly mediaType?: string;
  readonly filename?: string;
  readonly providerMetadata?: ProviderMetadata;
  readonly warnings: Array<Warning>;

  constructor(options: {
    providerReference: ProviderReference;
    mediaType?: string;
    filename?: string;
    providerMetadata?: ProviderMetadata;
    warnings: Array<Warning>;
  }) {
    this.providerReference = options.providerReference;
    this.mediaType = options.mediaType;
    this.filename = options.filename;
    this.providerMetadata = options.providerMetadata;
    this.warnings = options.warnings;
  }
}

function isLikelyText(data: Uint8Array | string): boolean {
  /*
   * Limit checks to 512 bytes for performance.
   * 4 base64 characters represent 3 bytes, and we use a small margin of 4 bytes just to be safe.
   */
  const CHECK_LENGTH = 512;
  const BASE64_CHECK_LENGTH = Math.ceil((CHECK_LENGTH + 4) / 3) * 4;

  const bytes =
    typeof data === 'string'
      ? convertBase64ToUint8Array(
          data.substring(0, Math.min(data.length, BASE64_CHECK_LENGTH)),
        )
      : data;

  const checkLength = Math.min(bytes.length, CHECK_LENGTH);
  if (checkLength === 0) return false;

  for (let i = 0; i < checkLength; i++) {
    const byte = bytes[i];
    if (
      byte === 0x00 ||
      (byte < 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d)
    ) {
      return false;
    }
  }
  return true;
}
