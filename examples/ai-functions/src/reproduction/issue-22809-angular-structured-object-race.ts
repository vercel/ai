import { jsonSchema } from 'ai';

async function main() {
  const angularEntry =
    '../../../../packages/angular/src/lib/structured-object.ng.ts';
  const { StructuredObject } = await import(angularEntry);

  let releaseFirst!: () => void;
  let markFirstStarted!: () => void;
  const firstGate = new Promise<void>(resolve => {
    releaseFirst = resolve;
  });
  const firstStarted = new Promise<void>(resolve => {
    markFirstStarted = resolve;
  });

  let calls = 0;
  const structuredObject = new StructuredObject({
    api: 'https://example.invalid',
    schema: jsonSchema<{ value: string }>({
      type: 'object',
      properties: { value: { type: 'string' } },
      required: ['value'],
      additionalProperties: false,
    }),
    fetch: async () => {
      if (++calls === 1) {
        markFirstStarted();
        await firstGate;
        return new Response('{"value":"old"}');
      }

      return new Response('{"value":"new"}');
    },
  });

  const firstSubmission = structuredObject.submit({});
  await firstStarted;

  await structuredObject.submit({});
  const afterNewSubmission = structuredObject.object;

  if (afterNewSubmission?.value !== 'new') {
    throw new Error(
      `REPRODUCTION_SETUP_FAILURE: newer submission did not produce the expected result: ${JSON.stringify(afterNewSubmission)}`,
    );
  }

  releaseFirst();
  await firstSubmission;

  if (structuredObject.object?.value !== 'new') {
    throw new Error(
      `ISSUE_22809_REPRODUCED: older submission overwrote newer result; final object was ${JSON.stringify(structuredObject.object)}`,
    );
  }
}

main();
