import {
  encodePathSegment,
  lazySchema,
  zodSchema,
  type InferSchema,
} from '@ai-sdk/provider-utils';
import { z } from './zod';

export const GATEWAY_FILE_FIELD = 'file';

export function getGatewayFilesUrl(baseURL: string): string {
  return `${baseURL}/files`;
}

export function getGatewayFileUrl(baseURL: string, fileId: string): string {
  return `${getGatewayFilesUrl(baseURL)}/${encodePathSegment(fileId)}`;
}

/**
 * Form fields sent with an upload, before the file part.
 */
export function getGatewayFileUploadFields({
  expiresAfter,
}: {
  expiresAfter?: number;
}): Array<{ name: string; value: string }> {
  return [
    { name: 'purpose', value: 'user_data' },
    ...(expiresAfter != null
      ? [
          { name: 'expires_after[anchor]', value: 'created_at' },
          { name: 'expires_after[seconds]', value: String(expiresAfter) },
        ]
      : []),
  ];
}

export const gatewayFileResponseSchema = lazySchema(() =>
  zodSchema(
    z.object({
      id: z.string(),
      bytes: z.nullish(z.number()),
      created_at: z.nullish(z.number()),
      expires_at: z.nullish(z.number()),
      filename: z.nullish(z.string()),
      purpose: z.nullish(z.string()),
      status: z.nullish(z.string()),
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

export function toGatewayFileDetails(response: GatewayFileResponse) {
  return {
    providerReference: { gateway: response.id },
    ...(response.filename != null ? { filename: response.filename } : {}),
    ...(response.bytes != null ? { byteSize: response.bytes } : {}),
    ...(response.created_at != null
      ? { createdAt: new Date(response.created_at * 1000) }
      : {}),
    ...(response.expires_at != null
      ? { expiresAt: new Date(response.expires_at * 1000) }
      : {}),
    providerMetadata: {
      gateway: {
        ...(response.filename != null ? { filename: response.filename } : {}),
        ...(response.purpose != null ? { purpose: response.purpose } : {}),
        ...(response.bytes != null ? { bytes: response.bytes } : {}),
        ...(response.created_at != null
          ? { createdAt: response.created_at }
          : {}),
        ...(response.status != null ? { status: response.status } : {}),
        ...(response.expires_at != null
          ? { expiresAt: response.expires_at }
          : {}),
      },
    },
  };
}
