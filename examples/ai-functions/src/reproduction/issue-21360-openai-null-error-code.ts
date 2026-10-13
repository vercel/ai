import { createOpenAI } from '@ai-sdk/openai';
import { APICallError } from '@ai-sdk/provider';
import assert from 'node:assert/strict';

const frames = [
  {
    type: 'error',
    error: {
      type: 'server_error',
      code: null,
      message: 'Sorry, something went wrong.',
      param: null,
    },
    sequence_number: 2,
  },
  {
    type: 'error',
    error: {
      type: 'service_unavailable_error',
      code: null,
      message: 'Unable to verify model access right now. Please retry.',
      param: null,
    },
    sequence_number: 2,
  },
] as const;

async function verifyFrame(frame: (typeof frames)[number]) {
  const openai = createOpenAI({
    apiKey: 'test',
    fetch: async () =>
      new Response(`data: ${JSON.stringify(frame)}\n\n`, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      }),
  });

  let thrown: unknown;

  try {
    const { stream } = await openai.responses('gpt-5').doStream({
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
    });

    const parts = [];
    const reader = stream.getReader();
    while (true) {
      const result = await reader.read();
      if (result.done) {
        break;
      }
      parts.push(result.value);
    }

    throw new Error(
      `ISSUE #21360 REPRODUCED: doStream resolved for ${frame.error.type} and emitted ${parts
        .map(part => part.type)
        .join(', ')}`,
    );
  } catch (error) {
    thrown = error;
  }

  if (
    thrown instanceof Error &&
    thrown.message.startsWith('ISSUE #21360 REPRODUCED:')
  ) {
    throw thrown;
  }

  assert.ok(
    APICallError.isInstance(thrown),
    `expected AI_APICallError for ${frame.error.type}, received ${
      thrown instanceof Error ? thrown.name : String(thrown)
    }`,
  );
  assert.equal(thrown.statusCode, 500);
  assert.equal(thrown.isRetryable, true);
  assert.equal(thrown.message, frame.error.message);
  assert.deepEqual(thrown.data, frame);
}

async function main() {
  for (const frame of frames) {
    await verifyFrame(frame);
  }

  console.log(
    'Issue #21360 does not reproduce: both null-code errors reject with retryable status-500 AI_APICallError values.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
