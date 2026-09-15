import { z } from 'zod/v4';

export type OpenAIRealtimeModelLiveId = 'gpt-live-1' | (string & {});

export const openaiRealtimeModelLiveOptionsSchema = z.strictObject({
  delegation: z
    .strictObject({ type: z.literal('client') })
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
