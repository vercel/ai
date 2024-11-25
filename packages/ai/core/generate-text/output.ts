import { parseJSON, ValidationResult } from '@ai-sdk/provider-utils';
import { asSchema, Schema } from '@ai-sdk/ui-utils';
import { z } from 'zod';

export interface Output<OUTPUT> {
  readonly type: 'object' | 'text';
  parseOutput({ text }: { text: string }): OUTPUT;
}

export const text = (): Output<string> => ({
  type: 'text',
  parseOutput({ text }: { text: string }) {
    return text;
  },
});

export const object = <OUTPUT>({
  schema: inputSchema,
}: {
  schema: z.Schema<OUTPUT, z.ZodTypeDef, any> | Schema<OUTPUT>;
}): Output<OUTPUT> => {
  const schema = asSchema(inputSchema);
  // jsonSchema: schema.jsonSchema,

  return {
    type: 'object',
    parseOutput({ text }: { text: string }) {
      return parseJSON({ text, schema });
    },
  };
};
