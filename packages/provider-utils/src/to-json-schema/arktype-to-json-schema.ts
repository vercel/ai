import { JSONSchema7 } from '@ai-sdk/provider';

export const arktypeToJsonSchema = async (
  schema: unknown,
): Promise<JSONSchema7> => {
  return (schema as any).toJsonSchema() as JSONSchema7;
};
