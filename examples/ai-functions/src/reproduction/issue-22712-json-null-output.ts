import assert from 'node:assert/strict';
import { generateText, NoOutputGeneratedError, Output } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import * as z from 'zod/v4';

const usage = {
  inputTokens: {
    total: 1,
    noCache: 1,
    cacheRead: 0,
    cacheWrite: 0,
  },
  outputTokens: {
    total: 1,
    text: 1,
    reasoning: 0,
  },
};

function createModel(
  text: string,
  finishReason: 'stop' | 'tool-calls' = 'stop',
) {
  return new MockLanguageModelV4({
    doGenerate: {
      content: text === '' ? [] : [{ type: 'text', text }],
      warnings: [],
      finishReason: { unified: finishReason, raw: finishReason },
      usage,
    },
  });
}

async function readJsonOutput(text: string) {
  const result = await generateText({
    prompt: 'Return JSON.',
    output: Output.json(),
    model: createModel(text),
  });

  try {
    return { status: 'output' as const, value: result.output };
  } catch (error) {
    if (NoOutputGeneratedError.isInstance(error)) {
      return { status: 'no-output-error' as const };
    }
    throw error;
  }
}

async function main() {
  const falseResult = await readJsonOutput('false');
  assert.deepEqual(falseResult, { status: 'output', value: false });

  const zeroResult = await readJsonOutput('0');
  assert.deepEqual(zeroResult, { status: 'output', value: 0 });

  const nullableObjectResult = await generateText({
    prompt: 'Return a nullable object.',
    output: Output.object({
      schema: z.object({ value: z.string() }).nullable(),
    }),
    model: createModel('null'),
  });

  let nullableObjectThrewNoOutput = false;
  try {
    assert.equal(nullableObjectResult.output, null);
  } catch (error) {
    if (!NoOutputGeneratedError.isInstance(error)) {
      throw error;
    }
    nullableObjectThrewNoOutput = true;
  }

  const missingOutputResult = await generateText({
    prompt: 'Do not return output.',
    output: Output.json(),
    model: createModel('', 'tool-calls'),
  });
  assert.throws(
    () => missingOutputResult.output,
    error => NoOutputGeneratedError.isInstance(error),
    'A genuinely missing output must still throw NoOutputGeneratedError.',
  );

  const nullResult = await readJsonOutput('null');
  if (nullResult.status === 'no-output-error' && nullableObjectThrewNoOutput) {
    console.error('ISSUE_22712: result.output throws for parsed JSON null');
    process.exitCode = 1;
    return;
  }

  assert.deepEqual(nullResult, { status: 'output', value: null });
  assert.equal(nullableObjectThrewNoOutput, false);
  console.log('Issue #22712 did not reproduce.');
}

main().catch(error => {
  console.error('REPRODUCTION_HARNESS_ERROR', error);
  process.exitCode = 2;
});
