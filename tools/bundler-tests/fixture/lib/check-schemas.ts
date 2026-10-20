import { zodSchema } from '@ai-sdk/provider-utils';
import { safeValidateUIMessages, validateUIMessages } from 'ai';
import * as z3 from 'zod/v3';
import * as z4 from 'zod/v4';

export async function checkSchemas() {
  for (const input of [
    z3.object({ text: z3.string() }),
    z4.object({ text: z4.string() }),
  ]) {
    const schema = zodSchema(input);
    const jsonSchema = await schema.jsonSchema;
    const valid = await schema.validate!({ text: 'ok' });
    const invalid = await schema.validate!({ text: 123 });
    if (
      jsonSchema.type !== 'object' ||
      JSON.stringify(jsonSchema.properties?.text) !== '{"type":"string"}' ||
      !valid.success ||
      valid.value.text !== 'ok' ||
      invalid.success
    ) {
      throw new Error('Schema conversion or validation failed');
    }
  }

  const messages = await validateUIMessages({
    messages: [
      { id: '1', role: 'user', parts: [{ type: 'text', text: 'hello' }] },
    ],
  });
  const invalid = await safeValidateUIMessages({
    messages: [{ id: '2', role: 'invalid-role', parts: [] }],
  });
  if (messages.length !== 1 || invalid.success) {
    throw new Error('Lazy UI-message validation failed');
  }
  return {
    schemas: ['zod3', 'zod4'],
    messages: messages.length,
    rejected: true,
  };
}
