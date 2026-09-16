import { lazySchema, zodSchema } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export const xaiFilesResponseSchema = /* @__PURE__ */ lazySchema(() =>
  zodSchema(
    z.object({
      id: z.string(),
      object: z.string().nullish(),
      bytes: z.number().nullish(),
      created_at: z.number().nullish(),
      expires_at: z.number().nullish(),
      filename: z.string().nullish(),
      purpose: z.string().nullish(),
      status: z.string().nullish(),
    }),
  ),
);

export const xaiFileDeleteResponseSchema = /* @__PURE__ */ lazySchema(() =>
  zodSchema(
    z.object({
      id: z.string(),
      object: z.string().nullish(),
      deleted: z.boolean(),
    }),
  ),
);
