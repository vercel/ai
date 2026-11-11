import {
  lazySchema,
  zodSchema,
  type InferSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

/**
 * Deepgram's Voice Agent. The agent's listen, think, and speak components are
 * chosen per session; listening and speaking default to Flux.
 *
 * https://developers.deepgram.com/docs/voice-agent
 */
export type DeepgramRealtimeModelId = 'voice-agent' | (string & {});

/** The LLM a session thinks with when `think` is not set. */
export const DEEPGRAM_REALTIME_DEFAULT_THINK = {
  provider: 'open_ai',
  model: 'gpt-4o-mini',
};

// https://developers.deepgram.com/docs/configure-voice-agent
export const deepgramRealtimeModelOptionsSchema = lazySchema(() =>
  zodSchema(
    z.object({
      /**
       * The LLM the agent thinks with: a Deepgram think provider type and one
       * of its model IDs, such as `{ provider: 'anthropic', model:
       * 'claude-haiku-4-5' }`. Defaults to `open_ai` / `gpt-4o-mini`.
       *
       * https://developers.deepgram.com/docs/voice-agent-llm-models
       */
      think: z
        .object({
          provider: z.string().min(1),
          model: z.string().min(1),
        })
        .optional(),
      /** Message the agent speaks when the session starts. */
      greeting: z.string().optional(),
      /**
       * Flux end-of-turn confidence (0.5 to 1) required before the agent
       * replies. Higher values wait longer before treating a pause as the end
       * of the user's turn. Defaults to 0.7.
       */
      eotThreshold: z.number().min(0.5).max(1).optional(),
    }),
  ),
);

export type DeepgramRealtimeModelOptions = InferSchema<
  typeof deepgramRealtimeModelOptionsSchema
>;
