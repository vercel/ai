import {
  lazySchema,
  zodSchema,
  type InferSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export const openResponsesLanguageModelOptions = lazySchema(() =>
  zodSchema(
    z.object({
      /**
       * Controls reasoning summary output from the model.
       * Valid values: 'concise', 'detailed', 'auto'.
       */
      reasoningSummary: z.enum(['concise', 'detailed', 'auto']).nullish(),

      /**
       * Restrict the callable tools to a subset while keeping the full tools
       * list intact, so prompt caching is preserved across requests with
       * different allow-lists.
       *
       * When set, this overrides the request-level `toolChoice` and emits
       * `tool_choice: { type: "allowed_tools", mode, tools }` on the wire.
       */
      allowedTools: z
        .object({
          toolNames: z.array(z.string()).min(1),
          mode: z.enum(['auto', 'required']).optional(),
        })
        .optional(),
    }),
  ),
);

export type OpenResponsesLanguageModelOptions = InferSchema<
  typeof openResponsesLanguageModelOptions
>;
