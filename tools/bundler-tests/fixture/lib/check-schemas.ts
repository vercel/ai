import { gateway } from '@ai-sdk/gateway';
import { asSchema, zodSchema } from '@ai-sdk/provider-utils';
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

  // Exercise Mini metadata registration and URL checks on both minimum peers,
  // including the Mini implementation bundled in Zod 3.25.76.
  const fetchSchema = asSchema(gateway.tools.browserbaseFetch().inputSchema);
  const fetchJsonSchema = await fetchSchema.jsonSchema;
  const urlDefinition = fetchJsonSchema.properties?.url;
  const fetchInput = await fetchSchema.validate!({
    url: 'https://example.com',
  });
  const invalidFetchInput = await fetchSchema.validate!({ url: 'invalid' });
  if (
    typeof urlDefinition !== 'object' ||
    urlDefinition.description !== 'URL of the page to fetch.' ||
    JSON.stringify(fetchJsonSchema.required) !== '["url"]' ||
    !fetchInput.success ||
    fetchInput.value.url !== 'https://example.com' ||
    invalidFetchInput.success
  ) {
    throw new Error('Gateway tool metadata or validation failed');
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
