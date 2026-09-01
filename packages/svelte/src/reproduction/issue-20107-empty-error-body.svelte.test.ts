import { jsonSchema } from 'ai';
import { expect, it } from 'vitest';
import { StructuredObject } from '../structured-object.svelte.js';

it('surfaces a non-empty error message for an empty HTTP error response', async () => {
  const structuredObject = new StructuredObject({
    api: '/api/object',
    schema: jsonSchema<{ value: string }>({
      type: 'object',
      properties: { value: { type: 'string' } },
      required: ['value'],
      additionalProperties: false,
    }),
    fetch: async () => new Response(null, { status: 502 }),
  });

  await structuredObject.submit({});

  expect(structuredObject.error).toBeInstanceOf(Error);
  expect(
    structuredObject.error?.message.trim().length,
    'ISSUE20107_SVELTE_EXPECTED_NON_EMPTY_ERROR_MESSAGE',
  ).toBeGreaterThan(0);
});
