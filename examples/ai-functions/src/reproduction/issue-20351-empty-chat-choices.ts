import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModelV3, LanguageModelV3Prompt } from '@ai-sdk/provider';
import { AISDKError } from 'ai';

const prompt: LanguageModelV3Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

const usage = {
  prompt_tokens: 1,
  completion_tokens: 1,
  total_tokens: 2,
};

function responseWithChoices(choices: unknown[]) {
  return new Response(
    JSON.stringify({
      id: 'chatcmpl-issue-20351',
      object: 'chat.completion',
      created: 1,
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

function createModels(choices: unknown[]) {
  const fetch = async () => responseWithChoices(choices);

  return [
    {
      name: 'openai',
      model: createOpenAI({
        apiKey: 'test-api-key',
        fetch,
      }).chat('gpt-4o-mini'),
    },
    {
      name: 'openai-compatible',
      model: createOpenAICompatible({
        name: 'test-compatible',
        baseURL: 'https://compatible.example/v1',
        apiKey: 'test-api-key',
        fetch,
      })('test-model'),
    },
  ] satisfies Array<{ name: string; model: LanguageModelV3 }>;
}

async function generate(model: LanguageModelV3) {
  return model.doGenerate({ prompt });
}

async function main() {
  const validChoice = {
    index: 0,
    message: {
      role: 'assistant',
      content: 'control response',
    },
    finish_reason: 'stop',
  };

  for (const { name, model } of createModels([validChoice])) {
    const result = await generate(model);
    const text = result.content.find(part => part.type === 'text')?.text;

    if (text !== 'control response') {
      throw new Error(
        `${name} control failed: expected "control response", received ${JSON.stringify(text)}.`,
      );
    }
  }

  const observed = [];

  for (const { name, model } of createModels([])) {
    try {
      await generate(model);
      observed.push({ name, error: undefined });
    } catch (error) {
      observed.push({
        name,
        error,
      });
    }
  }

  console.log(
    JSON.stringify(
      observed.map(({ name, error }) => ({
        name,
        errorName: error instanceof Error ? error.name : typeof error,
        errorMessage: error instanceof Error ? error.message : String(error),
        isAISDKError: AISDKError.isInstance(error),
      })),
      null,
      2,
    ),
  );

  const rawTypeErrors = observed.filter(
    ({ error }) =>
      error instanceof TypeError &&
      error.message.includes(
        "Cannot read properties of undefined (reading 'message')",
      ),
  );

  if (rawTypeErrors.length > 0) {
    throw new Error(
      'Reproduced issue #20351: non-streaming chat doGenerate returned a raw TypeError for an empty choices response instead of AISDKError.',
    );
  }

  const missingErrors = observed
    .filter(({ error }) => error == null)
    .map(({ name }) => name);
  if (missingErrors.length > 0) {
    throw new Error(
      `Expected an AISDKError for empty choices from: ${missingErrors.join(', ')}.`,
    );
  }

  const unclassifiedErrors = observed
    .filter(({ error }) => !AISDKError.isInstance(error))
    .map(({ name }) => name);
  if (unclassifiedErrors.length > 0) {
    throw new Error(
      `Expected AISDKError classification for empty choices from: ${unclassifiedErrors.join(', ')}.`,
    );
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
