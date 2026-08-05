import { readFile } from 'node:fs/promises';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModelV3Prompt } from '@ai-sdk/provider';

type ContentPart = {
  type: string;
  text?: string;
  thinking?: Array<{ type: string; text?: string }>;
  [key: string]: unknown;
};

type GenerateFixture = {
  choices: Array<{
    message: {
      content: Array<ContentPart>;
    };
  }>;
  [key: string]: unknown;
};

type StreamFixtureChunk = {
  choices?: Array<{
    delta?: {
      content?: string | Array<ContentPart>;
    };
  }>;
  [key: string]: unknown;
};

type ExpectedOutput = {
  reasoning: string;
  text: string;
};

const prompt: LanguageModelV3Prompt = [
  {
    role: 'user',
    content: [{ type: 'text', text: 'What is 17 * 23? Answer briefly.' }],
  },
];

function extractExpectedOutput(
  contents: Array<string | Array<ContentPart> | undefined>,
): ExpectedOutput {
  let reasoning = '';
  let text = '';

  for (const content of contents) {
    if (typeof content === 'string') {
      text += content;
      continue;
    }

    for (const part of content ?? []) {
      if (part.type === 'text') {
        text += part.text ?? '';
      } else if (part.type === 'thinking') {
        reasoning +=
          part.thinking
            ?.filter(inner => inner.type === 'text')
            .map(inner => inner.text ?? '')
            .join('') ?? '';
      }
    }
  }

  return { reasoning, text };
}

function createFixtureFetch({
  generateFixture,
  streamFixture,
}: {
  generateFixture: GenerateFixture;
  streamFixture: Array<StreamFixtureChunk>;
}): typeof fetch {
  return async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as { stream?: boolean };

    if (body.stream) {
      const sseBody = [
        ...streamFixture.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`),
        'data: [DONE]\n\n',
      ].join('');

      return new Response(sseBody, {
        headers: { 'content-type': 'text/event-stream' },
      });
    }

    return new Response(JSON.stringify(generateFixture), {
      headers: { 'content-type': 'application/json' },
    });
  };
}

async function assertGenerate({
  generateFixture,
  streamFixture,
}: {
  generateFixture: GenerateFixture;
  streamFixture: Array<StreamFixtureChunk>;
}) {
  const provider = createOpenAICompatible({
    name: 'mistral-reproduction',
    baseURL: 'https://api.mistral.ai/v1',
    fetch: createFixtureFetch({ generateFixture, streamFixture }),
  });

  const result = await provider('mistral-small-latest').doGenerate({ prompt });
  const actual = {
    reasoning: result.content
      .filter(part => part.type === 'reasoning')
      .map(part => part.text)
      .join(''),
    text: result.content
      .filter(part => part.type === 'text')
      .map(part => part.text)
      .join(''),
  };
  const expected = extractExpectedOutput([
    generateFixture.choices[0].message.content,
  ]);

  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `generate output mismatch: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`,
    );
  }
}

async function assertStream({
  generateFixture,
  streamFixture,
}: {
  generateFixture: GenerateFixture;
  streamFixture: Array<StreamFixtureChunk>;
}) {
  const provider = createOpenAICompatible({
    name: 'mistral-reproduction',
    baseURL: 'https://api.mistral.ai/v1',
    fetch: createFixtureFetch({ generateFixture, streamFixture }),
  });

  const result = await provider('mistral-small-latest').doStream({ prompt });
  const actual: ExpectedOutput = { reasoning: '', text: '' };
  const errors: Array<unknown> = [];
  const reader = result.stream.getReader();

  while (true) {
    const { done, value: part } = await reader.read();
    if (done) {
      break;
    }

    if (part.type === 'reasoning-delta') {
      actual.reasoning += part.delta;
    } else if (part.type === 'text-delta') {
      actual.text += part.delta;
    } else if (part.type === 'error') {
      errors.push(part.error);
    }
  }

  const expected = extractExpectedOutput(
    streamFixture.map(chunk => chunk.choices?.[0]?.delta?.content),
  );

  if (errors.length > 0) {
    throw new Error(`stream emitted ${errors.length} validation error(s)`);
  }

  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `stream output mismatch: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`,
    );
  }
}

async function main() {
  const fixtureBase = new URL(
    '../../../../packages/openai-compatible/src/chat/__fixtures__/',
    import.meta.url,
  );
  const generateFixture = JSON.parse(
    await readFile(
      new URL('issue-13703-mistral-thinking.json', fixtureBase),
      'utf8',
    ),
  ) as GenerateFixture;
  const streamFixture = (
    await readFile(
      new URL('issue-13703-mistral-thinking.chunks.txt', fixtureBase),
      'utf8',
    )
  )
    .split('\n')
    .filter(line => line.length > 0)
    .map(line => JSON.parse(line) as StreamFixtureChunk);

  const generateWithUnknownPart = structuredClone(generateFixture);
  generateWithUnknownPart.choices[0].message.content.splice(1, 0, {
    type: 'future-part',
    value: 'must be ignored',
  });

  const streamWithUnknownPart = structuredClone(streamFixture);
  const arrayChunk = streamWithUnknownPart.find(chunk =>
    Array.isArray(chunk.choices?.[0]?.delta?.content),
  );
  if (!Array.isArray(arrayChunk?.choices?.[0]?.delta?.content)) {
    throw new Error('recorded stream fixture has no array content');
  }
  arrayChunk.choices[0].delta.content.push({
    type: 'future-part',
    value: 'must be ignored',
  });

  const failures: Array<string> = [];
  const scenarios = [
    {
      name: 'doGenerate normalizes thinking and text parts',
      run: () => assertGenerate({ generateFixture, streamFixture }),
    },
    {
      name: 'doStream normalizes thinking and text parts',
      run: () => assertStream({ generateFixture, streamFixture }),
    },
    {
      name: 'doGenerate ignores unknown parts',
      run: () =>
        assertGenerate({
          generateFixture: generateWithUnknownPart,
          streamFixture,
        }),
    },
    {
      name: 'doStream ignores unknown parts',
      run: () =>
        assertStream({
          generateFixture,
          streamFixture: streamWithUnknownPart,
        }),
    },
  ];

  for (const scenario of scenarios) {
    try {
      await scenario.run();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${scenario.name}: ${message}`);
    }
  }

  if (failures.length > 0) {
    console.error(
      'ISSUE_13703_REPRODUCED: @ai-sdk/openai-compatible rejects documented array content in generate and stream flows.',
    );
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log('Issue #13703 did not reproduce.');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
