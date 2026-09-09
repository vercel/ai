import { createOpenAICompatible } from '../../../../packages/openai-compatible/src';
import { createOpenAI } from '../../../../packages/openai/src';
import { AISDKError } from '../../../../packages/provider/src';

const prompt = [
  {
    role: 'user' as const,
    content: [{ type: 'text' as const, text: 'Reply with OK.' }],
  },
];

const usage = {
  prompt_tokens: 4,
  completion_tokens: 1,
  total_tokens: 5,
};

function createMockFetch(choices: unknown[]) {
  return async () =>
    new Response(
      JSON.stringify({
        id: 'chatcmpl-issue-20351',
        created: 1_757_286_400,
        model: 'test-chat-model',
        choices,
        usage,
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      },
    );
}

function createChoices(content: string) {
  return [
    {
      index: 0,
      message: {
        role: 'assistant',
        content,
      },
      finish_reason: 'stop',
    },
  ];
}

async function captureError(operation: () => Promise<unknown>) {
  try {
    await operation();
    return undefined;
  } catch (error) {
    return error;
  }
}

function describeError(error: unknown) {
  return error instanceof Error
    ? `${error.name}: ${error.message}`
    : `${error}`;
}

async function main() {
  const openAIControl = await createOpenAI({
    apiKey: 'test-api-key',
    fetch: createMockFetch(createChoices('OK.')),
  })
    .chat('test-chat-model')
    .doGenerate({ prompt });

  const compatibleControl = await createOpenAICompatible({
    name: 'test-compatible',
    baseURL: 'https://example.test/v1',
    fetch: createMockFetch(createChoices('OK.')),
  })
    .chatModel('test-chat-model')
    .doGenerate({ prompt });

  if (
    openAIControl.content[0]?.type !== 'text' ||
    openAIControl.content[0].text !== 'OK.' ||
    compatibleControl.content[0]?.type !== 'text' ||
    compatibleControl.content[0].text !== 'OK.'
  ) {
    throw new Error('One-choice control response did not succeed.');
  }

  const openAIError = await captureError(() =>
    createOpenAI({
      apiKey: 'test-api-key',
      fetch: createMockFetch([]),
    })
      .chat('test-chat-model')
      .doGenerate({ prompt }),
  );

  const compatibleError = await captureError(() =>
    createOpenAICompatible({
      name: 'test-compatible',
      baseURL: 'https://example.test/v1',
      fetch: createMockFetch([]),
    })
      .chatModel('test-chat-model')
      .doGenerate({ prompt }),
  );

  if (
    !AISDKError.isInstance(openAIError) ||
    !AISDKError.isInstance(compatibleError)
  ) {
    console.error(
      'ISSUE_20351: empty choices did not surface as AISDKError in both chat adapters',
    );
    console.error(`openai: ${describeError(openAIError)}`);
    console.error(`openai-compatible: ${describeError(compatibleError)}`);
    process.exitCode = 1;
    return;
  }

  console.log('Both chat adapters surfaced empty choices as AISDKError.');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
