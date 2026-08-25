import { createMoonshotAI } from '@ai-sdk/moonshotai';
import type { LanguageModelV4CallOptions } from '@ai-sdk/provider';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const generateFixturePath = new URL(
  '../../../../packages/moonshotai/src/__fixtures__/moonshotai-metadata-live.json',
  import.meta.url,
);
const streamFixturePath = new URL(
  '../../../../packages/moonshotai/src/__fixtures__/moonshotai-metadata-live.chunks.txt',
  import.meta.url,
);

const generateFixture = JSON.parse(
  fs.readFileSync(generateFixturePath, 'utf8'),
);
const streamChunks = fs
  .readFileSync(streamFixturePath, 'utf8')
  .trim()
  .split('\n')
  .map(line => JSON.parse(line));

const expectedGenerateMetadata = {
  moonshotai: {
    responseObject: 'chat.completion',
    choiceIndex: 0,
    messageRole: 'assistant',
    toolCallTypes: ['function'],
  },
};

const expectedStreamMetadata = {
  moonshotai: {
    responseObject: 'chat.completion.chunk',
    choiceIndex: 0,
    messageRole: 'assistant',
    toolCallTypes: ['function'],
  },
};

const fixtureFetch: typeof fetch = async (_input, init) => {
  const requestBody = JSON.parse(String(init?.body));

  if (requestBody.stream === true) {
    return new Response(
      `${streamChunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join('')}data: [DONE]\n\n`,
      {
        headers: { 'content-type': 'text/event-stream' },
      },
    );
  }

  return Response.json(generateFixture);
};

async function main() {
  // Preconditions describe the documented provider response, not the bug.
  assert.equal(generateFixture.object, 'chat.completion');
  assert.equal(generateFixture.choices[0].index, 0);
  assert.equal(generateFixture.choices[0].message.role, 'assistant');
  assert.equal(
    generateFixture.choices[0].message.tool_calls[0].type,
    'function',
  );
  assert.equal(streamChunks[0].object, 'chat.completion.chunk');
  assert.equal(streamChunks[0].choices[0].index, 0);
  assert.equal(streamChunks[0].choices[0].delta.role, 'assistant');
  assert.equal(streamChunks[1].choices[0].delta.tool_calls[0].type, 'function');

  const model = createMoonshotAI({
    apiKey: 'test-api-key',
    fetch: fixtureFetch,
  })('kimi-k3');
  const options = {
    prompt: [
      {
        role: 'user' as const,
        content: [
          {
            type: 'text' as const,
            text: 'Call get_weather for Paris.',
          },
        ],
      },
    ],
    tools: [
      {
        type: 'function' as const,
        name: 'get_weather',
        description: 'Get weather',
        inputSchema: {
          type: 'object' as const,
          properties: { city: { type: 'string' as const } },
          required: ['city'],
        },
      },
    ],
    toolChoice: { type: 'tool' as const, toolName: 'get_weather' },
    providerOptions: {
      moonshotai: { thinking: { type: 'disabled' as const } },
    },
  } satisfies LanguageModelV4CallOptions;

  const generated = await model.doGenerate(options);
  assert.deepEqual(generated.content, [
    {
      type: 'tool-call',
      toolCallId: 'get_weather_0',
      toolName: 'get_weather',
      input: '{"city": "Paris"}',
    },
  ]);
  assert.deepEqual(generated.response?.body, generateFixture);

  const streamed = await model.doStream({
    ...options,
    includeRawChunks: true,
  });
  const streamParts = [];
  const reader = streamed.stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    streamParts.push(value);
  }

  assert.deepEqual(
    streamParts.filter(part => part.type === 'raw').map(part => part.rawValue),
    streamChunks,
  );
  assert.ok(
    streamParts.some(
      part =>
        part.type === 'tool-call' &&
        part.toolCallId === 'get_weather_0' &&
        part.toolName === 'get_weather' &&
        part.input === '{"city": "Paris"}',
    ),
  );

  const finish = streamParts.find(part => part.type === 'finish');
  assert.ok(finish);

  const generateMetadataMatches =
    JSON.stringify(generated.providerMetadata) ===
    JSON.stringify(expectedGenerateMetadata);
  const streamMetadataMatches =
    JSON.stringify(finish.providerMetadata) ===
    JSON.stringify(expectedStreamMetadata);

  if (!generateMetadataMatches || !streamMetadataMatches) {
    throw new Error(
      'ISSUE #19559 REPRODUCED: Moonshot generate and stream results dropped official chat response metadata',
    );
  }

  assert.deepEqual(generated.providerMetadata, expectedGenerateMetadata);
  assert.deepEqual(finish.providerMetadata, expectedStreamMetadata);
}

main();
