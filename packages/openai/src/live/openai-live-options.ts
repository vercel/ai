import { z } from 'zod/v4';

export type OpenAILiveModelId = 'gpt-live-1' | (string & {});

// Live supports a subset of Responses settings, not a standalone Responses body.
export const openaiLiveResponsesOptionsSchema = z.strictObject({
  model: z.string().min(1).optional(),
  instructions: z.string().optional(),
  tools: z
    .array(
      z.discriminatedUnion('type', [
        z.strictObject({ type: z.literal('web_search') }),
        z.strictObject({
          type: z.literal('function'),
          name: z.string().min(1),
          description: z.string().optional(),
          parameters: z.record(z.string(), z.json()),
          strict: z.boolean().optional(),
        }),
      ]),
    )
    .optional(),
  tool_choice: z
    .union([
      z.enum(['auto', 'none', 'required']),
      z.strictObject({ type: z.literal('function'), name: z.string().min(1) }),
    ])
    .optional(),
  reasoning: z
    .strictObject({
      effort: z
        .enum(['none', 'minimal', 'low', 'medium', 'high', 'xhigh'])
        .optional(),
      summary: z.enum(['concise', 'detailed', 'auto']).optional(),
    })
    .optional(),
  text: z
    .strictObject({ verbosity: z.enum(['low', 'medium', 'high']).optional() })
    .optional(),
  parallel_tool_calls: z.boolean().optional(),
  max_output_tokens: z.number().int().min(16).optional(),
  service_tier: z.enum(['auto', 'default', 'flex', 'priority']).optional(),
});

export const openaiLiveProviderOptionsSchema = z.strictObject({
  delegation: z
    .discriminatedUnion('type', [
      z.strictObject({ type: z.literal('client') }),
      z.strictObject({
        type: z.literal('responses'),
        responses: openaiLiveResponsesOptionsSchema,
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
export type OpenAILiveProviderOptions = z.infer<
  typeof openaiLiveProviderOptionsSchema
>;
