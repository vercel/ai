import type { FilesV4UploadFileCallOptions } from '@ai-sdk/provider';
import {
  convertInlineFileDataToUint8Array,
  encodePathSegment,
  lazySchema,
  zodSchema,
  type InferSchema,
  type MultipartStreamPart,
} from '@ai-sdk/provider-utils';
import { z } from './zod';

export function getGatewayFilesUrl(baseURL: string): string {
  return `${baseURL}/files`;
}

export function getGatewayFileUrl(baseURL: string, fileId: string): string {
  return `${getGatewayFilesUrl(baseURL)}/${encodePathSegment(fileId)}`;
}

/**
 * Builds the upload request body: a multipart form with the file and its
 * optional fields. The Gateway detects the media type from the bytes.
 */
export function getGatewayFileUploadBody({
  data,
  filename,
  expiresAfter,
}: {
  data: FilesV4UploadFileCallOptions['data'];
  filename?: string;
  expiresAfter?: number;
}):
  | { type: 'stream'; parts: Array<MultipartStreamPart> }
  | { type: 'form-data'; formData: FormData } {
  const fields = [
    ...(filename != null ? [{ name: 'filename', value: filename }] : []),
    ...(expiresAfter != null
      ? [{ name: 'expiresAfter', value: String(expiresAfter) }]
      : []),
  ];

  if (data.type === 'stream') {
    return {
      type: 'stream',
      parts: [
        ...fields.map(field => ({ type: 'field' as const, ...field })),
        {
          type: 'file',
          name: 'file',
          mediaType: 'application/octet-stream',
          content: data.stream,
        },
      ],
    };
  }

  const formData = new FormData();
  for (const field of fields) {
    formData.append(field.name, field.value);
  }
  formData.append(
    'file',
    new Blob(
      [convertInlineFileDataToUint8Array(data) as Uint8Array<ArrayBuffer>],
      { type: 'application/octet-stream' },
    ),
  );
  return { type: 'form-data', formData };
}

/**
 * Reads the Gateway's `x-should-retry` error header, which takes precedence
 * over retryability derived from the status code.
 */
export function getGatewayShouldRetry(
  responseHeaders: Record<string, string> | undefined,
): boolean | undefined {
  const value = responseHeaders?.['x-should-retry'];
  return value === 'true' ? true : value === 'false' ? false : undefined;
}

export const gatewayFileResponseSchema = lazySchema(() =>
  zodSchema(
    z.object({
      id: z.string(),
      mediaType: z.nullish(z.string()),
      filename: z.nullish(z.string()),
      byteSize: z.nullish(z.number()),
      createdAt: z.nullish(z.string()),
      expiresAt: z.nullish(z.string()),
    }),
  ),
);

export const gatewayFileDeleteResponseSchema = lazySchema(() =>
  zodSchema(
    z.object({
      id: z.string(),
      deleted: z.boolean(),
    }),
  ),
);

type GatewayFileResponse = InferSchema<typeof gatewayFileResponseSchema>;

export function toGatewayFileDeleteResult(
  response: InferSchema<typeof gatewayFileDeleteResponseSchema>,
) {
  return {
    providerReference: { gateway: response.id },
    deleted: response.deleted,
  };
}

export function toGatewayFileDetails(response: GatewayFileResponse): {
  providerReference: { gateway: string };
  mediaType?: string;
  filename?: string;
  byteSize?: number;
  createdAt?: Date;
  expiresAt?: Date;
} {
  const createdAt = parseTimestamp(response.createdAt);
  const expiresAt = parseTimestamp(response.expiresAt);

  return {
    providerReference: { gateway: response.id },
    ...(response.mediaType != null ? { mediaType: response.mediaType } : {}),
    ...(response.filename != null ? { filename: response.filename } : {}),
    ...(response.byteSize != null ? { byteSize: response.byteSize } : {}),
    ...(createdAt != null ? { createdAt } : {}),
    ...(expiresAt != null ? { expiresAt } : {}),
  };
}

function parseTimestamp(value: string | null | undefined): Date | undefined {
  if (value == null) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}
