import { FilesV4 } from '@ai-sdk/provider';
import {
  convertBase64ToUint8Array,
  DataContent,
  ProviderOptions,
} from '@ai-sdk/provider-utils';
import { convertToLanguageModelV4DataContent } from '../prompt/data-content';
import { ProviderMetadata } from '../types/provider-metadata';
import { ProviderReference } from '../types/provider-reference';
import {
  detectMediaType,
  documentMediaTypeSignatures,
  imageMediaTypeSignatures,
} from '../util/detect-media-type';
import { UploadFileResult } from './upload-file-result';

/**
 * Uploads a file using a files interface.
 *
 * @param files - The FilesV4 interface to use for uploading.
 * @param data - The file data to upload.
 * @param mediaType - Optional IANA media type. Auto-detected from file bytes if not provided.
 * @param providerOptions - Additional provider-specific options.
 *
 * @returns A result object containing the provider reference and optional metadata.
 */
export async function uploadFile({
  files,
  data: dataArg,
  mediaType: mediaTypeArg,
  providerOptions,
}: {
  /**
   * The files interface to use for uploading.
   */
  files: FilesV4;

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
      signatures: [...imageMediaTypeSignatures, ...documentMediaTypeSignatures],
    }) ??
    (isLikelyText(data) ? 'text/plain' : undefined);

  const result = await files.uploadFile({
    data,
    mediaType,
    providerOptions: providerOptions ?? {},
  });

  return new DefaultUploadFileResult({
    providerReference: result.providerReference,
    providerMetadata: result.providerMetadata,
  });
}

class DefaultUploadFileResult implements UploadFileResult {
  readonly providerReference: ProviderReference;
  readonly providerMetadata?: ProviderMetadata;

  constructor(options: {
    providerReference: ProviderReference;
    providerMetadata?: ProviderMetadata;
  }) {
    this.providerReference = options.providerReference;
    this.providerMetadata = options.providerMetadata;
  }
}

function isLikelyText(data: Uint8Array | string): boolean {
  const bytes =
    typeof data === 'string'
      ? convertBase64ToUint8Array(data.substring(0, Math.min(data.length, 688)))
      : data;

  const checkLength = Math.min(bytes.length, 512);
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
