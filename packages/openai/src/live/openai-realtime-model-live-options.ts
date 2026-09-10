import { z } from 'zod/v4';

export type OpenAIRealtimeModelLiveId = 'gpt-live-1' | (string & {});

// Live supports a subset of Responses settings, not a standalone Responses body.
const openaiLiveResponsesUpdateOptionsSchema = z.strictObject({
  model: z.string().min(1).optional(),
  instructions: z.string().nullish(),
  tools: z
    .array(
      z.discriminatedUnion('type', [
        z.strictObject({ type: z.literal('web_search') }),
        z.strictObject({
          type: z.literal('function'),
          name: z.string().min(1),
          description: z.string().nullish(),
          parameters: z.record(z.string(), z.json()).nullish(),
          strict: z.boolean().nullish(),
        }),
      ]),
    )
    .optional(),
  toolChoice: z
    .union([
      z.enum(['auto', 'none', 'required']),
      z.strictObject({ type: z.literal('function'), name: z.string().min(1) }),
    ])
    .optional(),
  reasoning: z
    .strictObject({
      effort: z
        .enum(['none', 'minimal', 'low', 'medium', 'high', 'xhigh'])
        .nullish(),
      summary: z.enum(['concise', 'detailed', 'auto']).nullish(),
    })
    .nullish(),
  text: z
    .strictObject({ verbosity: z.enum(['low', 'medium', 'high']).nullish() })
    .nullish(),
  parallelToolCalls: z.boolean().nullish(),
  maxOutputTokens: z.number().int().min(16).nullish(),
  serviceTier: z.enum(['auto', 'default', 'flex', 'priority']).nullish(),
});

export const openaiRealtimeModelLiveOptionsSchema = z.strictObject({
  delegation: z
    .discriminatedUnion('type', [
      z.strictObject({ type: z.literal('client') }),
      z.strictObject({
        type: z.literal('responses'),
        responses: openaiLiveResponsesUpdateOptionsSchema.extend({
          model: z.string().min(1),
        }),
      }),
    ])
    .nullable()
    .optional(),
  input: z
    .array(
      z.discriminatedUnion('role', [
        z.strictObject({
          type: z.literal('message'),
          role: z.enum(['developer', 'user']),
          content: z.tuple([
            z.strictObject({ type: z.literal('input_text'), text: z.string() }),
          ]),
        }),
        z.strictObject({
          type: z.literal('message'),
          role: z.literal('assistant'),
          content: z.tuple([
            z.strictObject({
              type: z.enum(['text', 'output_text']),
              text: z.string(),
            }),
          ]),
        }),
      ]),
    )
    .max(128)
    .optional(),
  store: z.boolean().optional(),
  voice: z.strictObject({ id: z.string().min(1) }).optional(),
});

/** Experimental Live options under sessionConfig.providerOptions.openai. */
export type OpenAIRealtimeModelLiveOptions = z.infer<
  typeof openaiRealtimeModelLiveOptionsSchema
>;

export const openaiRealtimeModelLiveUpdateOptionsSchema = z.strictObject({
  delegation: z.strictObject({
    type: z.literal('responses').optional(),
    responses: openaiLiveResponsesUpdateOptionsSchema,
  }),
});

/** Mutable Live options under sessionConfig.providerOptions.openai. */
export type OpenAIRealtimeModelLiveUpdateOptions = z.infer<
  typeof openaiRealtimeModelLiveUpdateOptionsSchema
>;
