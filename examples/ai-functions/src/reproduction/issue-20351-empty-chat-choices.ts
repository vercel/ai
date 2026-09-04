import assert from 'node:assert/strict';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModelV4 } from '@ai-sdk/provider';
import { AISDKError } from 'ai';

const prompt = [
  {
    role: 'user' as const,
    content: [{ type: 'text' as const, text: 'Hello' }],
  },
];

const usage = {
  prompt_tokens: 1,
  completion_tokens: 1,
  total_tokens: 2,
};

function createMockFetch(choices: unknown[]): typeof fetch {
  return async () =>
    new Response(
      JSON.stringify({
        id: 'chatcmpl-reproduction',
        object: 'chat.completion',
        created: 0,
        model: 'test-model',
        choices,
        usage,
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      },
    );
}

function createModels(choices: unknown[]): Array<{
  name: string;
  model: LanguageModelV4;
}> {
  return [
    {
      name: 'openai',
      model: createOpenAI({
        apiKey: 'test-api-key',
        fetch: createMockFetch(choices),
      }).chat('gpt-4o-mini'),
    },
    {
      name: 'openai-compatible',
      model: createOpenAICompatible({
        name: 'test-provider',
        baseURL: 'https://example.invalid/v1',
        apiKey: 'test-api-key',
        fetch: createMockFetch(choices),
      })('test-model'),
    },
  ];
}

async function captureError(model: LanguageModelV4): Promise<unknown> {
  try {
    await model.doGenerate({ prompt });
  } catch (error) {
    return error;
  }

  return undefined;
}

async function main() {
  const validChoice = {
    index: 0,
    message: { role: 'assistant', content: 'control succeeded' },
    finish_reason: 'stop',
  };

  for (const { name, model } of createModels([validChoice])) {
    const result = await model.doGenerate({ prompt });
    assert.deepEqual(
      result.content,
      [{ type: 'text', text: 'control succeeded' }],
      `${name} one-choice control response did not succeed`,
    );
  }

  const emptyChoiceErrors = await Promise.all(
    createModels([]).map(async ({ name, model }) => ({
      name,
      error: await captureError(model),
    })),
  );

  for (const { name, error } of emptyChoiceErrors) {
    assert.notEqual(
      error,
      undefined,
      `${name} unexpectedly accepted an empty choices array`,
    );
  }

  const nonAiSdkErrors = emptyChoiceErrors.filter(
    ({ error }) => !AISDKError.isInstance(error),
  );

  if (
    nonAiSdkErrors.length === 2 &&
    nonAiSdkErrors.every(
      ({ error }) =>
        error instanceof TypeError &&
        error.message.includes(
          "Cannot read properties of undefined (reading 'message')",
        ),
    )
  ) {
    throw new Error(
      'ISSUE #20351: OpenAI and OpenAI-compatible doGenerate returned raw TypeError for HTTP 200 empty choices[] instead of AISDKError',
    );
  }

  assert.deepEqual(
    nonAiSdkErrors.map(({ name }) => name),
    [],
    'Every empty choices response must fail with an AISDKError',
  );
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
