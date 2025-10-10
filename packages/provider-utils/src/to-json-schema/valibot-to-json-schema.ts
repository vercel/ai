import { JSONSchema7 } from '@ai-sdk/provider';

export const valibotToJsonSchema = (schema: unknown) => {
  return async (): Promise<JSONSchema7> => {
    try {
      const { toJsonSchema } = await import('@valibot/to-json-schema');
      return toJsonSchema(schema as any);
    } catch {
      // TODO dedicated error class
      throw new Error(`Failed to import module '@valibot/to-json-schema'`);
    }
  };
};
