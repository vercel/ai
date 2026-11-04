import {
  lazySchema,
  zodSchema,
  type InferSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export const typesafeAiDecisionModelOptions = lazySchema(() =>
  zodSchema(
    z.object({
      /**
       * Enable TypeSafe's experimental long context mode, raising both the
       * per-request and per-question context limits to 262k tokens.
       * Long context is slower and less accurate than the default limits.
       * Defaults to false.
       */
      longContext: z.boolean().optional(),
    }),
  ),
);

export type TypeSafeAiDecisionModelOptions = InferSchema<
  typeof typesafeAiDecisionModelOptions
>;
