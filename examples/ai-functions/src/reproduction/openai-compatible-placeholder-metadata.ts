import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { streamText } from 'ai';

const expectedMetadata = {
  id: 'chatcmpl-123',
  modelId: 'actual-model-name',
  timestamp: new Date(1700000000 * 1000),
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
    id: expectedMetadata.id,
    model: expectedMetadata.modelId,
    object: 'chat.completion.chunk',
  },
  {
    choices: [{ delta: {}, finish_reason: 'stop', index: 0 }],
    created: 1700000000,
    id: expectedMetadata.id,
    model: expectedMetadata.modelId,
    object: 'chat.completion.chunk',
  },
  {
    choices: [],
    created: 1700000000,
    id: expectedMetadata.id,
    model: expectedMetadata.modelId,
    object: 'chat.completion.chunk',
    usage: {
      completion_tokens: 1,
      prompt_tokens: 10,
      total_tokens: 11,
    },
  },
];

async function main() {
  const provider = createOpenAICompatible({
    baseURL: 'https://documented-placeholder.example/v1',
    name: 'placeholder-provider',
    fetch: async () =>
      new Response(
        `${chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join('')}data: [DONE]\n\n`,
        {
          headers: { 'content-type': 'text/event-stream' },
        },
      ),
  });

  const result = streamText({
    model: provider('requested-router-model'),
    prompt: 'Say hello.',
    include: { rawChunks: true },
  });

  const rawChunks: Array<unknown> = [];
  let text = '';

  for await (const part of result.stream) {
    if (part.type === 'raw') {
      rawChunks.push(part.rawValue);
    } else if (part.type === 'text-delta') {
      text += part.text;
    }
  }

  if (text !== 'Hello') {
    throw new Error(
      `Reproduction setup failed: expected text "Hello", got ${text}`,
    );
  }

  const laterRawChunk = rawChunks.find(
    chunk =>
      typeof chunk === 'object' &&
      chunk != null &&
      'model' in chunk &&
      chunk.model === expectedMetadata.modelId,
  );

  if (laterRawChunk == null) {
    throw new Error(
      'Reproduction setup failed: no later raw chunk contained the expected model metadata',
    );
  }

  const response = await result.response;
  const metadataMatches =
    response.id === expectedMetadata.id &&
    response.modelId === expectedMetadata.modelId &&
    response.timestamp.getTime() === expectedMetadata.timestamp.getTime();

  if (!metadataMatches) {
    throw new Error(
      'ISSUE_20829_REPRODUCED: final response metadata used the placeholder first chunk. ' +
        `Expected ${JSON.stringify(expectedMetadata)}, received ${JSON.stringify(
          {
            id: response.id,
            modelId: response.modelId,
            timestamp: response.timestamp,
          },
        )}`,
    );
  }

  console.log(
    'Issue #20829 is fixed: later non-placeholder metadata was used.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
