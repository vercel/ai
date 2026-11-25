import { z } from 'zod/v4';
import type { GroqModelIds } from './groq-model-catalog';

// https://console.groq.com/docs/models
export type GroqChatModelId = GroqModelIds['language'] | (string & {});

export const groqLanguageModelChatOptions = z.object({
  reasoningFormat: z.enum(['parsed', 'raw', 'hidden']).optional(),

  /**
   * Specifies the reasoning effort level for model inference.
   * @see https://console.groq.com/docs/reasoning#reasoning-effort
   */
  reasoningEffort: z
    .enum(['none', 'default', 'low', 'medium', 'high'])
    .optional(),

  /**
   * Whether to enable parallel function calling during tool use. Default to true.
   */
  parallelToolCalls: z.boolean().optional(),

  /**
   * A unique identifier representing your end-user, which can help OpenAI to
   * monitor and detect abuse. Learn more.
   */
  user: z.string().optional(),

  /**
   * Whether to use structured outputs.
   *
   * @default true
   */
  structuredOutputs: z.boolean().optional(),

  /**
   * Whether to use strict JSON schema validation.
   * When true, the model uses constrained decoding to guarantee schema compliance.
   * Only used when structured outputs are enabled and a schema is provided.
   *
   * @default true
   */
  strictJsonSchema: z.boolean().optional(),

  /**
   * Service tier for the request.
   * - 'on_demand': Default tier with consistent performance and fairness
   * - 'performance': Prioritized tier for latency-sensitive workloads
   * - 'flex': Higher throughput tier optimized for workloads that can handle occasional request failures
   * - 'auto': Uses on_demand rate limits, then falls back to flex tier if exceeded
   *
   * @default 'on_demand'
   */
  serviceTier: z.enum(['on_demand', 'performance', 'flex', 'auto']).optional(),
});

export type GroqLanguageModelChatOptions = z.infer<
  typeof groqLanguageModelChatOptions
>;
