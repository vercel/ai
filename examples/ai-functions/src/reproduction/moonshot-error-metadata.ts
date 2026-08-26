import { createMoonshotAI } from '@ai-sdk/moonshotai';
import { APICallError, type LanguageModelV3Prompt } from '@ai-sdk/provider';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const prompt: LanguageModelV3Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

type ErrorResponse = {
  error: {
    message: string;
    type?: string | null;
    code?: string | null;
  };
};

const fixtureDirectory = new URL(
  '../../../../packages/moonshotai/src/__fixtures__/',
  import.meta.url,
);

function readJsonFixture(filename: string): ErrorResponse {
  return JSON.parse(
    fs.readFileSync(new URL(filename, fixtureDirectory), 'utf8'),
  );
}

function readSseFixture(filename: string): string {
  return fs
    .readFileSync(new URL(filename, fixtureDirectory), 'utf8')
    .split('\n')
    .filter(line => line.length > 0)
    .map(line => `data: ${line}\n\n`)
    .concat('data: [DONE]\n\n')
    .join('');
}

async function getHttpErrorData(errorResponse: ErrorResponse) {
  const provider = createMoonshotAI({
    apiKey: 'test-api-key',
    fetch: async () =>
      new Response(JSON.stringify(errorResponse), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      }),
  });

  try {
    await provider.chatModel('kimi-k3').doGenerate({ prompt });
  } catch (error) {
    assert.ok(APICallError.isInstance(error));
    assert.equal(error.message, errorResponse.error.message);
    return error.data;
  }

  throw new Error('Expected the Moonshot HTTP request to fail.');
}

async function getStreamErrors() {
  const provider = createMoonshotAI({
    apiKey: 'test-api-key',
    fetch: async () =>
      new Response(readSseFixture('moonshotai-error-metadata.chunks.txt'), {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      }),
  });

  const result = await provider.chatModel('kimi-k3').doStream({ prompt });
  const parts = [];
  const reader = result.stream.getReader();

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    parts.push(value);
  }

  return parts.filter(part => part.type === 'error').map(part => part.error);
}

async function main() {
  const codedError = readJsonFixture('moonshotai-error-with-code.json');
  const liveMessageOnlyError = readJsonFixture(
    'moonshotai-error-live-message-only.json',
  );
  const nullableCodeError = {
    error: {
      message: 'Nullable code HTTP error',
      type: 'invalid_request_error',
      code: null,
    },
  };
  const failures: string[] = [];

  for (const [name, expected] of [
    ['coded', codedError],
    ['nullable-code', nullableCodeError],
    ['message-only', liveMessageOnlyError],
  ] as const) {
    const actual = await getHttpErrorData(expected);

    try {
      assert.deepEqual(actual, expected);
    } catch {
      failures.push(`HTTP ${name}`);
    }
  }

  const expectedStreamErrors = [
    {
      message: 'Coded stream failure',
      type: 'server_error',
      code: 'stream_code',
    },
    {
      message: 'Nullable code stream failure',
      type: 'server_error',
      code: null,
    },
    {
      message: 'Message-only stream failure',
    },
  ];
  const actualStreamErrors = await getStreamErrors();

  try {
    assert.deepEqual(actualStreamErrors, expectedStreamErrors);
  } catch {
    failures.push('SSE structured diagnostics');
  }

  console.log(
    JSON.stringify(
      {
        failures,
        actualStreamErrors,
      },
      null,
      2,
    ),
  );

  const lostHttpMetadata = failures.some(failure => failure.startsWith('HTTP'));
  const lostSseMetadata = failures.includes('SSE structured diagnostics');

  if (lostHttpMetadata && lostSseMetadata) {
    console.error(
      'ISSUE_19552_REPRODUCED: Moonshot HTTP and SSE error metadata were dropped',
    );
    process.exitCode = 1;
    return;
  }

  assert.deepEqual(failures, []);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
