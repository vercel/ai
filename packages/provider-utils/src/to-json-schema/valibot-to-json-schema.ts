import { JSONSchema7 } from '@ai-sdk/provider';

export const valibotToJsonSchema = async (
  schema: unknown,
): Promise<JSONSchema7> => {
  try {
    const { toJsonSchema } = await import('@valibot/to-json-schema');
    return toJsonSchema(schema as any);
  } catch {
    // TODO dedicated error class
    throw new Error(`Failed to import @valibot/to-json-schema`);
  }
};
