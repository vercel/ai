import { JSONSchema7 } from '@ai-sdk/provider';

export const effectToJsonSchema =
  (schema: unknown) => async (): Promise<JSONSchema7> => {
    try {
      const { JSONSchema } = await import('effect');
      return JSONSchema.make(schema as any) as JSONSchema7;
    } catch {
      // TODO dedicated error class
      throw new Error(`Failed to import module 'effect'`);
    }
  };
