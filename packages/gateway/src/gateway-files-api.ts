import {
  encodePathSegment,
  lazySchema,
  zodSchema,
  type InferSchema,
} from '@ai-sdk/provider-utils';
import { z } from './zod';

export function getGatewayFilesUrl(baseURL: string): string {
  return `${baseURL}/files`;
}

export function getGatewayFileUrl(baseURL: string, fileId: string): string {
  return `${getGatewayFilesUrl(baseURL)}/${encodePathSegment(fileId)}`;
}

/**
 * The upload's file part. The Gateway detects the media type from the bytes
 * and ignores the part's own filename and content type.
 */
export const GATEWAY_FILE_PART = {
  name: 'file',
  mediaType: 'application/octet-stream',
} as const;

/**
 * Text fields sent with an upload, before the file part.
 */
export function getGatewayFileUploadFields({
  filename,
  expiresAfter,
}: {
  filename?: string;
  expiresAfter?: number;
}): Array<{ name: string; value: string }> {
  return [
    ...(filename != null ? [{ name: 'filename', value: filename }] : []),
    ...(expiresAfter != null
      ? [{ name: 'expiresAfter', value: String(expiresAfter) }]
      : []),
  ];
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
