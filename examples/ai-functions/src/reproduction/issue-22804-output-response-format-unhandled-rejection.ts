import assert from 'node:assert/strict';
import { Output, jsonSchema } from 'ai';

const failureSignal =
  'AI_SDK_ISSUE_22804: constructing Output.object or Output.array emitted an unhandledRejection before responseFormat was used';

function waitForUnhandledRejection(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve));
}

async function captureRejection(
  promise: PromiseLike<unknown>,
): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }

  assert.fail('expected responseFormat to reject');
}

async function main() {
  const unhandledRejections: unknown[] = [];
  const onUnhandledRejection = (error: unknown) => {
    unhandledRejections.push(error);
  };

  process.on('unhandledRejection', onUnhandledRejection);

  try {
    const objectFailure = new Error('synthetic object schema loading failure');
    const arrayFailure = new Error('synthetic array schema loading failure');
    let objectFactoryCalls = 0;
    let arrayFactoryCalls = 0;

    const objectOutput = Output.object({
      schema: jsonSchema(async () => {
        objectFactoryCalls++;
        throw objectFailure;
      }),
    });
    const arrayOutput = Output.array({
      element: jsonSchema(async () => {
        arrayFactoryCalls++;
        throw arrayFailure;
      }),
    });

    // The descriptors are intentionally cached for a later generation call.
    await waitForUnhandledRejection();

    const callsBeforeUse = {
      object: objectFactoryCalls,
      array: arrayFactoryCalls,
    };
    const unhandledBeforeUse = unhandledRejections.length;

    const observedObjectFailure = await captureRejection(
      objectOutput.responseFormat,
    );
    const observedArrayFailure = await captureRejection(
      arrayOutput.responseFormat,
    );

    assert.equal(observedObjectFailure, objectFailure);
    assert.equal(observedArrayFailure, arrayFailure);
    assert.equal(objectFactoryCalls, 1);
    assert.equal(arrayFactoryCalls, 1);

    let successfulFactoryCalls = 0;
    const successfulOutput = Output.object({
      schema: jsonSchema(async () => {
        successfulFactoryCalls++;
        return {
          type: 'object',
          properties: { value: { type: 'string' } },
          required: ['value'],
          additionalProperties: false,
        };
      }),
    });

    await successfulOutput.responseFormat;
    await successfulOutput.responseFormat;

    assert.equal(successfulFactoryCalls, 1);

    console.log(
      JSON.stringify({
        callsBeforeUse,
        unhandledBeforeUse,
        failuresPreserved: true,
        successfulFactoryCalls,
      }),
    );

    assert.equal(unhandledBeforeUse, 0, failureSignal);
  } finally {
    process.off('unhandledRejection', onUnhandledRejection);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
