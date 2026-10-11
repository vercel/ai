import assert from 'node:assert/strict';
import { jsonSchema } from 'ai';
import { StructuredObject } from '../../../../packages/angular/dist/index.js';

function createCountSchema(onValidate: () => void) {
  return jsonSchema<{ count: number }>(
    {
      type: 'object',
      properties: { count: { type: 'number' } },
      required: ['count'],
      additionalProperties: false,
    },
    {
      validate(value) {
        onValidate();

        return typeof value === 'object' &&
          value != null &&
          'count' in value &&
          typeof value.count === 'number'
          ? { success: true, value: value as { count: number } }
          : {
              success: false,
              error: new Error('count must be numeric'),
            };
      },
    },
  );
}

async function main() {
  let controlValidations = 0;
  let finishError: Error | undefined;
  const withCallback = new StructuredObject({
    api: 'https://example.invalid',
    schema: createCountSchema(() => {
      controlValidations++;
    }),
    fetch: async () => new Response('{"count":"wrong"}'),
    onFinish: ({ error }) => {
      finishError = error;
    },
  });

  await withCallback.submit({});

  assert.equal(
    controlValidations,
    1,
    'control: the final schema validator should run with onFinish',
  );
  assert.ok(
    finishError,
    'control: the invalid final object should be rejected with onFinish',
  );

  let validationsWithoutCallback = 0;
  const withoutCallback = new StructuredObject({
    api: 'https://example.invalid',
    schema: createCountSchema(() => {
      validationsWithoutCallback++;
    }),
    fetch: async () => new Response('{"count":"wrong"}'),
  });

  await withoutCallback.submit({});

  console.log(
    JSON.stringify({
      withCallback: {
        validations: controlValidations,
        error: finishError.name,
      },
      withoutCallback: {
        validations: validationsWithoutCallback,
        object: withoutCallback.object,
        loading: withoutCallback.loading,
        error: withoutCallback.error?.name,
      },
    }),
  );

  if (withoutCallback.error == null) {
    console.error(
      'ISSUE_22876_REPRODUCED: completed invalid object has no observable validation error without onFinish',
    );
    process.exitCode = 1;
  }
}

main();
