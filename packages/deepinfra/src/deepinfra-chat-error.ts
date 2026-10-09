import type { ProviderErrorStructure } from '@ai-sdk/openai-compatible';
import { z } from 'zod/v4';

const deepInfraErrorDetailsSchema = z.object({
  message: z.string(),
  type: z.string().nullish(),
  param: z.any().nullish(),
  code: z.union([z.string(), z.number()]).nullish(),
});

const deepInfraStandardErrorSchema = z.object({
  error: deepInfraErrorDetailsSchema,
});

// Must never throw: a throw inside the zod transform would turn the frame
// back into a TypeValidationError.
function parseInnerError(
  text: string,
): z.infer<typeof deepInfraErrorDetailsSchema> | undefined {
  try {
    const result = deepInfraStandardErrorSchema.safeParse(JSON.parse(text));
    return result.success ? result.data.error : undefined;
  } catch {
    return undefined;
  }
}

// DeepInfra mid-stream error frame, where `error_message` is a JSON-stringified
// `{ error: { message } }`. Normalized into the standard OpenAI error shape.
const deepInfraNativeErrorSchema = z
  .object({
    error_type: z.string().nullish(),
    error_message: z.string(),
  })
  .transform(({ error_type, error_message }) => {
    const inner = parseInnerError(error_message);
    return {
      error: {
        message: inner?.message ?? error_message,
        type: inner?.type ?? error_type,
        param: inner?.param,
        code:
          inner?.code ?? (error_type === 'validation_error' ? 400 : undefined),
      },
    };
  });

export const deepInfraChatErrorSchema = z.union([
  deepInfraStandardErrorSchema,
  deepInfraNativeErrorSchema,
]);

export type DeepInfraChatErrorData = z.infer<typeof deepInfraChatErrorSchema>;

export const deepInfraChatErrorStructure: ProviderErrorStructure<DeepInfraChatErrorData> =
  {
    errorSchema: deepInfraChatErrorSchema,
    errorToMessage: data => data.error.message,
  };
