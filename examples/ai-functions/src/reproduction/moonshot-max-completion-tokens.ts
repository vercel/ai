import { createMoonshotAI } from '@ai-sdk/moonshotai';

type RequestBody = Record<string, unknown>;

const prompt = [
  {
    role: 'user' as const,
    content: [{ type: 'text' as const, text: 'Reply with OK.' }],
  },
];

function createJsonResponse() {
  return new Response(
    JSON.stringify({
      id: 'chatcmpl-reproduction',
      object: 'chat.completion',
      created: 1787762059,
      model: 'moonshot-v1-8k',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: 'OK' },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: 11,
        completion_tokens: 2,
        total_tokens: 13,
      },
    }),
    { headers: { 'content-type': 'application/json' } },
  );
}

function createStreamResponse() {
  const chunks = [
    {
      id: 'chatcmpl-reproduction',
      object: 'chat.completion.chunk',
      created: 1787762060,
      model: 'moonshot-v1-8k',
      choices: [
        {
          index: 0,
          delta: { role: 'assistant', content: '' },
          finish_reason: null,
        },
      ],
    },
    {
      id: 'chatcmpl-reproduction',
      object: 'chat.completion.chunk',
      created: 1787762060,
      model: 'moonshot-v1-8k',
      choices: [
        {
          index: 0,
          delta: { content: 'OK' },
          finish_reason: null,
        },
      ],
    },
    {
      id: 'chatcmpl-reproduction',
      object: 'chat.completion.chunk',
      created: 1787762060,
      model: 'moonshot-v1-8k',
      choices: [
        {
          index: 0,
          delta: {},
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: 11,
        completion_tokens: 2,
        total_tokens: 13,
      },
    },
  ];

  return new Response(
    `${chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join('')}data: [DONE]\n\n`,
    { headers: { 'content-type': 'text/event-stream' } },
  );
}

async function main() {
  const requests: RequestBody[] = [];
  const provider = createMoonshotAI({
    apiKey: 'test-api-key',
    fetch: async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as RequestBody;
      requests.push(body);
      return body.stream === true
        ? createStreamResponse()
        : createJsonResponse();
    },
  });
  const model = provider.chatModel('moonshot-v1-8k');

  await model.doGenerate({ prompt, maxOutputTokens: 17 });
  const definedStream = await model.doStream({
    prompt,
    maxOutputTokens: 17,
  });
  for await (const _part of definedStream.stream) {
    // Consume the stream so the streaming path completes.
  }

  await model.doGenerate({ prompt });
  const undefinedStream = await model.doStream({ prompt });
  for await (const _part of undefinedStream.stream) {
    // Consume the stream so the streaming path completes.
  }

  const failures: string[] = [];
  for (const [index, path] of ['non-streaming', 'streaming'].entries()) {
    const body = requests[index];
    if (
      body.max_completion_tokens !== 17 ||
      Object.hasOwn(body, 'max_tokens')
    ) {
      failures.push(
        `${path} sent max_tokens=${String(body.max_tokens)} and max_completion_tokens=${String(body.max_completion_tokens)}`,
      );
    }
  }

  for (const [index, path] of ['non-streaming', 'streaming'].entries()) {
    const body = requests[index + 2];
    if (
      Object.hasOwn(body, 'max_tokens') ||
      Object.hasOwn(body, 'max_completion_tokens')
    ) {
      failures.push(`${path} did not omit an undefined maxOutputTokens value`);
    }
  }

  if (failures.length > 0) {
    console.error(
      `Moonshot max token wire key mismatch: ${failures.join('; ')}`,
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    'Moonshot requests use only max_completion_tokens and omit undefined values.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
