import { lazySchema, zodSchema } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export const openaiSkillResponseSchema = lazySchema(() =>
  zodSchema(
    z.object({
      id: z.string(),
      name: z.string().nullish(),
      description: z.string().nullish(),
      default_version: z.string().nullish(),
      latest_version: z.string().nullish(),
      created_at: z.number(),
      updated_at: z.number().nullish(),
    }),
  ),
);

export const openaiSkillVersionResponseSchema = lazySchema(() =>
  zodSchema(
    z.object({
      id: z.string(),
      version: z.string().nullish(),
      name: z.string().nullish(),
      description: z.string().nullish(),
    }),
  ),
);

export const openaiSkillDeleteResponseSchema = lazySchema(() =>
  zodSchema(
    z.object({
      id: z.string(),
      deleted: z.boolean(),
    }),
  ),
);

export const openaiSkillListResponseSchema = lazySchema(() =>
  zodSchema(
    z.object({
      data: z.array(
        z.object({
          id: z.string(),
          name: z.string().nullish(),
          description: z.string().nullish(),
          created_at: z.number(),
          updated_at: z.number().nullish(),
        }),
      ),
    }),
  ),
);
