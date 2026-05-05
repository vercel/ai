import {
  createProviderExecutedToolFactory,
  lazySchema,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export const advisor_20260301OutputSchema = lazySchema(() =>
  zodSchema(
    z.discriminatedUnion('type', [
      z.object({
        type: z.literal('advisor_result'),
        text: z.string(),
      }),
      z.object({
        type: z.literal('advisor_redacted_result'),
        encrypted_content: z.string(),
      }),
      z.object({
        type: z.literal('advisor_tool_result_error'),
        error_code: z.string(),
      }),
    ]),
  ),
);

export const advisor_20260301ArgsSchema = lazySchema(() =>
  zodSchema(
    z.object({
      model: z.string(),
      maxUses: z.number().optional(),
      caching: z
        .object({
          type: z.literal('ephemeral'),
          ttl: z.enum(['5m', '1h']).optional(),
        })
        .nullish(),
    }),
  ),
);

const advisor_20260301InputSchema = lazySchema(() => zodSchema(z.object({})));

const factory = createProviderExecutedToolFactory<
  Record<string, never>,
  | {
      /**
       * Plaintext advice from the advisor model.
       */
      type: 'advisor_result';
      text: string;
    }
  | {
      /**
       * Opaque encrypted advice that must be round-tripped verbatim in multi-turn conversations.
       */
      type: 'advisor_redacted_result';
      encrypted_content: string;
    }
  | {
      /**
       * Non-fatal error from the advisor (e.g. max_uses_exceeded, overloaded).
       */
      type: 'advisor_tool_result_error';
      error_code: string;
    },
  {
    /**
     * The advisor model ID (e.g. "claude-opus-4-6").
     */
    model: string;

    /**
     * Per-request cap on advisor calls.
     */
    maxUses?: number;

    /**
     * Prompt caching configuration for the advisor's transcript.
     */
    caching?: { type: 'ephemeral'; ttl?: '5m' | '1h' } | null;
  }
>({
  id: 'anthropic.advisor_20260301',
  inputSchema: advisor_20260301InputSchema,
  outputSchema: advisor_20260301OutputSchema,
});

export const advisor_20260301 = (args: Parameters<typeof factory>[0]) => {
  return factory(args);
};
