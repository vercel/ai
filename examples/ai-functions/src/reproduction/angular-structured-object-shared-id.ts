import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { jsonSchema } from 'ai';

async function main() {
  const angularEntry = new URL(
    '../../../../packages/angular/src/index.ts',
    import.meta.url,
  ).href;
  const { StructuredObject } = await import(angularEntry);

  const source = await readFile(
    new URL(
      '../../../../packages/angular/src/lib/structured-object.ng.ts',
      import.meta.url,
    ),
    'utf8',
  );
  const documentationPromisesSharedState =
    source.includes('with the same `id` will') &&
    source.includes('have shared states across components');

  const options = {
    id: 'shared',
    api: 'https://example.invalid',
    schema: jsonSchema<{ value: number }>({
      type: 'object',
      properties: { value: { type: 'number' } },
      required: ['value'],
      additionalProperties: false,
    }),
    fetch: async () => new Response('{"value":1}'),
  };

  const first = new StructuredObject(options);
  const second = new StructuredObject(options);

  await first.submit({});

  assert.deepEqual(first.object, { value: 1 });
  assert.equal(first.id, 'shared');
  assert.equal(second.id, 'shared');

  if (documentationPromisesSharedState) {
    assert.deepEqual(
      second.object,
      first.object,
      'StructuredObject id documentation promises shared state, but instances remain isolated',
    );
  }
}

main();
