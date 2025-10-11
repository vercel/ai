import { JSONSchema7 } from '@ai-sdk/provider';

export const arktypeToJsonSchema = (schema: unknown) => (): JSONSchema7 => {
  return (schema as any).toJsonSchema();
};
