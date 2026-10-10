import assert from 'node:assert/strict';
import { generateText, InvalidArgumentError, Output } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';

const usage = {
  inputTokens: {
    total: 1,
    noCache: 1,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};

class ReproducedBugError extends Error {}

async function checkEmptyChoice() {
  let observedSchema: unknown;

  const model = new MockLanguageModelV4({
    doGenerate: async options => {
      observedSchema =
        options.responseFormat?.type === 'json'
          ? options.responseFormat.schema
          : undefined;

      return {
        content: [{ type: 'text', text: '{"result":"anything"}' }],
        warnings: [],
        finishReason: { unified: 'stop', raw: 'stop' },
        usage,
      };
    },
  });

  let error: unknown;
  try {
    await generateText({
      model,
      prompt: 'Choose',
      output: Output.choice({ options: [] }),
      maxRetries: 0,
    });
  } catch (caughtError) {
    error = caughtError;
  }

  const schemaEnum = (
    observedSchema as
      | { properties?: { result?: { enum?: unknown[] } } }
      | undefined
  )?.properties?.result?.enum;

  if (
    model.doGenerateCalls.length === 1 &&
    Array.isArray(schemaEnum) &&
    schemaEnum.length === 0 &&
    error instanceof Error &&
    error.name === 'AI_NoObjectGeneratedError'
  ) {
    return new ReproducedBugError(
      'ISSUE_22684_REPRODUCED: empty Output.choice invoked the provider with enum [] and threw AI_NoObjectGeneratedError',
    );
  }

  assert.equal(
    model.doGenerateCalls.length,
    0,
    'an empty choice set must be rejected before invoking the provider',
  );
  assert.ok(
    InvalidArgumentError.isInstance(error),
    'an empty choice set must throw AI_InvalidArgumentError',
  );

  return undefined;
}

async function checkNonemptyChoice() {
  const model = new MockLanguageModelV4({
    doGenerate: {
      content: [{ type: 'text', text: '{"result":"sunny"}' }],
      warnings: [],
      finishReason: { unified: 'stop', raw: 'stop' },
      usage,
    },
  });

  const result = await generateText({
    model,
    prompt: 'Choose the weather',
    output: Output.choice({ options: ['sunny', 'rainy'] }),
    maxRetries: 0,
  });

  assert.equal(result.output, 'sunny');
  assert.equal(
    model.doGenerateCalls.length,
    1,
    'a nonempty choice set must still invoke the provider',
  );
  assert.deepEqual(
    model.doGenerateCalls[0].responseFormat?.type === 'json'
      ? model.doGenerateCalls[0].responseFormat.schema
      : undefined,
    {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        result: { type: 'string', enum: ['sunny', 'rainy'] },
      },
      required: ['result'],
      additionalProperties: false,
    },
  );
}

async function main() {
  const reproducedBug = await checkEmptyChoice();
  await checkNonemptyChoice();

  if (reproducedBug != null) {
    throw reproducedBug;
  }

  console.log('Output.choice validation behaves as expected.');
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
