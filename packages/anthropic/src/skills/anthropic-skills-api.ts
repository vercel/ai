import { lazySchema, zodSchema } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export const anthropicSkillResponseSchema = lazySchema(() =>
  zodSchema(
    z.object({
      type: z.literal('skill'),
      id: z.string(),
      display_name: z.string(),
      latest_version_id: z.string(),
      source: z.object({
        type: z.union([
          z.literal('custom'),
          z.literal('anthropic'),
          z.literal('anthropic_example'),
          z.literal('plugin'),
        ]),
      }),
      created_at: z.string(),
      updated_at: z.string(),
    }),
  ),
);

export type AnthropicSkillResponse = ReturnType<
  typeof anthropicSkillResponseSchema
>['_type'];

export const anthropicSkillVersionResponseSchema = lazySchema(() =>
  zodSchema(
    z.object({
      type: z.literal('skill_version'),
      id: z.string(),
      skill_id: z.string(),
      name: z.string().nullish(),
      description: z.string().nullish(),
      created_at: z.string(),
    }),
  ),
);
