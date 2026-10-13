import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { streamText } from 'ai';

const expectedResponse = {
  id: 'chatcmpl-123',
  modelId: 'actual-model-name',
  timestamp: '2023-11-14T22:13:20.000Z',
};

const chunks = [
  {
    choices: [],
    created: 0,
    id: '',
    model: '',
    object: '',
  },
  {
    choices: [
      {
        delta: { content: 'Hello', role: 'assistant' },
        finish_reason: null,
        index: 0,
      },
    ],
    created: 1700000000,
    id: 'chatcmpl-123',
    model: 'actual-model-name',
    object: 'chat.completion.chunk',
  },
  {
    choices: [{ delta: {}, finish_reason: 'stop', index: 0 }],
    created: 1700000000,
    id: 'chatcmpl-123',
    model: 'actual-model-name',
    object: 'chat.completion.chunk',
  },
  {
    choices: [],
    created: 1700000000,
    id: 'chatcmpl-123',
    model: 'actual-model-name',
    object: 'chat.completion.chunk',
    usage: {
      prompt_tokens: 10,
      completion_tokens: 1,
      total_tokens: 11,
    },
  },
];

async function main() {
  const provider = createOpenAICompatible({
    baseURL: 'https://example.test/v1',
    name: 'placeholder-provider',
    fetch: async () =>
      new Response(
        `${chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join('')}data: [DONE]\n\n`,
        {
          headers: { 'content-type': 'text/event-stream' },
          status: 200,
        },
      ),
  });

  const result = streamText({
    model: provider('test-model'),
    prompt: 'Say hello.',
  });

  const text = await result.text;
  const response = await result.response;
  const actualResponse = {
    id: response.id,
    modelId: response.modelId,
    timestamp: response.timestamp.toISOString(),
  };

  if (text !== 'Hello') {
    throw new Error(`Unexpected streamed text: ${JSON.stringify(text)}`);
  }

  if (
    actualResponse.id !== expectedResponse.id ||
    actualResponse.modelId !== expectedResponse.modelId ||
    actualResponse.timestamp !== expectedResponse.timestamp
  ) {
    throw new Error(
      `ISSUE_20829_REPRODUCED: expected later valid response metadata ${JSON.stringify(expectedResponse)}, received ${JSON.stringify(actualResponse)}`,
    );
  }

  console.log('Issue #20829 is fixed: later valid response metadata was used.');
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
