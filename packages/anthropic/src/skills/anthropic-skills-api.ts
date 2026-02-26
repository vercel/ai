import { lazySchema, zodSchema } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export const anthropicSkillResponseSchema = lazySchema(() =>
  zodSchema(
    z.object({
      id: z.string(),
      display_title: z.string().nullish(),
      name: z.string().nullish(),
      description: z.string().nullish(),
      latest_version: z.string().nullish(),
      source: z.string(),
      created_at: z.string(),
      updated_at: z.string(),
    }),
  ),
);

export const anthropicSkillVersionListResponseSchema = lazySchema(() =>
  zodSchema(
    z.object({
      data: z.array(
        z.object({
          version: z.string(),
        }),
      ),
    }),
  ),
);

export const anthropicSkillVersionResponseSchema = lazySchema(() =>
  zodSchema(
    z.object({
      type: z.string(),
      skill_id: z.string(),
      name: z.string().nullish(),
      description: z.string().nullish(),
    }),
  ),
);

export const anthropicSkillVersionDeleteResponseSchema = lazySchema(() =>
  zodSchema(
    z.object({
      type: z.string(),
      id: z.string(),
    }),
  ),
);

export const anthropicSkillDeleteResponseSchema = lazySchema(() =>
  zodSchema(
    z.object({
      id: z.string(),
      type: z.string(),
    }),
  ),
);

export const anthropicSkillListResponseSchema = lazySchema(() =>
  zodSchema(
    z.object({
      data: z.array(
        z.object({
          id: z.string(),
          display_title: z.string().nullish(),
          name: z.string().nullish(),
          description: z.string().nullish(),
          latest_version: z.string().nullish(),
          source: z.string(),
          created_at: z.string(),
          updated_at: z.string(),
        }),
      ),
    }),
  ),
);
