import { createServer } from 'node:http';
import { once } from 'node:events';
import { createOpenAICompatible } from './packages/openai-compatible/dist/index.js';
import { streamText, tool, jsonSchema, stepCountIs } from './packages/ai/dist/index.js';

function sse(data) {
  return `data: ${JSON.stringify(data)}\n\n`;
}

const responses = [
  [
    sse({
      id: 'chatcmpl-step-1',
      object: 'chat.completion.chunk',
      created: 1711357598,
      model: 'test-model',
      choices: [
        {
          index: 0,
          delta: { role: 'assistant', content: "I'll check that..." },
          finish_reason: null,
        },
      ],
    }),
    sse({
      id: 'chatcmpl-step-1',
      object: 'chat.completion.chunk',
      created: 1711357598,
      model: 'test-model',
      choices: [
        {
          index: 0,
          delta: {
            tool_calls: [
              {
                index: 0,
                id: 'call_lookup_1',
                type: 'function',
                function: { name: 'lookup', arguments: '{}' },
              },
            ],
          },
          finish_reason: null,
        },
      ],
    }),
    sse({
      id: 'chatcmpl-step-1',
      object: 'chat.completion.chunk',
      created: 1711357598,
      model: 'test-model',
      choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    }),
    'data: [DONE]\n\n',
  ],
  [
    sse({
      id: 'chatcmpl-step-2',
      object: 'chat.completion.chunk',
      created: 1711357599,
      model: 'test-model',
      choices: [
        {
          index: 0,
          delta: { role: 'assistant', content: "Done, here's the result." },
          finish_reason: null,
        },
      ],
    }),
    sse({
      id: 'chatcmpl-step-2',
      object: 'chat.completion.chunk',
      created: 1711357599,
      model: 'test-model',
      choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    }),
    'data: [DONE]\n\n',
  ],
];

let requestCount = 0;
const server = createServer(async (req, res) => {
  if (req.method !== 'POST' || req.url !== '/v1/chat/completions') {
    res.writeHead(404).end();
    return;
  }

  req.resume();
  const chunks = responses[requestCount++];
  if (!chunks) {
    res.writeHead(500).end('unexpected extra request');
    return;
  }

  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  });

  for (const chunk of chunks) {
    res.write(chunk);
  }
  res.end();
});

server.listen(0, '127.0.0.1');
await once(server, 'listening');
const { port } = server.address();

try {
  const provider = createOpenAICompatible({
    name: 'local-openai-compatible',
    baseURL: `http://127.0.0.1:${port}/v1`,
    apiKey: 'test-api-key',
  });

  const result = streamText({
    model: provider.chatModel('test-model'),
    prompt: 'Please look this up.',
    tools: {
      lookup: tool({
        inputSchema: jsonSchema({
          type: 'object',
          properties: {},
          additionalProperties: false,
        }),
        execute: async () => ({ ok: true }),
      }),
    },
    stopWhen: stepCountIs(2),
  });

  const interesting = [];
  for await (const part of result.fullStream) {
    if (
      part.type === 'text-start' ||
      part.type === 'text-delta' ||
      part.type === 'text-end' ||
      part.type === 'tool-call' ||
      part.type === 'tool-result' ||
      part.type === 'finish-step' ||
      part.type === 'start-step'
    ) {
      interesting.push(part);
    }
  }

  console.log(JSON.stringify({ requestCount, interesting }, null, 2));

  const textStarts = interesting.filter(part => part.type === 'text-start');
  const ids = textStarts.map(part => part.id);
  if (ids.length !== 2 || new Set(ids).size !== 1 || ids[0] !== 'txt-0') {
    throw new Error(`Unexpected reproduction output text-start ids: ${ids.join(', ')}`);
  }
} finally {
  server.close();
}
