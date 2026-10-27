import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { expect, it, vi } from 'vitest';
import type * as Zod from 'zod/v4';
import { z } from 'zod/v4';

vi.mock('zod/v4', async importOriginal => {
  const actual = await importOriginal<typeof Zod>();
  return {
    ...actual,
    z: {
      ...actual.z,
      object: vi.fn(actual.z.object),
    },
  };
});

it('defers chat response and chunk schemas until use and caches each schema', async () => {
  const { createGroq } = await import('./groq-provider');
  const chatSchemaCount = () =>
    vi
      .mocked(z.object)
      .mock.calls.filter(([shape]) => shape != null && 'choices' in shape)
      .length;
  expect(chatSchemaCount()).toBe(0);

  const response = {
    choices: [
      {
        index: 0,
        message: { content: 'hello' },
        finish_reason: 'stop',
      },
    ],
  };
  const provider = createGroq({
    apiKey: 'test-api-key',
    fetch: async (_url, init) => {
      const request = JSON.parse(init?.body as string);
      return request.stream
        ? new Response(
            `data: ${JSON.stringify({
              choices: [
                {
                  index: 0,
                  delta: { content: 'hello' },
                  finish_reason: 'stop',
                },
              ],
            })}\n\ndata: [DONE]\n\n`,
            { headers: { 'Content-Type': 'text/event-stream' } },
          )
        : Response.json(response);
    },
  });
  const model = provider('test-model');
  const options = {
    prompt: [
      {
        role: 'user' as const,
        content: [{ type: 'text' as const, text: 'hi' }],
      },
    ],
  };

  await model.doGenerate(options);
  expect(chatSchemaCount()).toBe(1);
  await model.doGenerate(options);
  expect(chatSchemaCount()).toBe(1);

  const first = await model.doStream(options);
  await convertReadableStreamToArray(first.stream);
  expect(chatSchemaCount()).toBe(2);
  const second = await model.doStream(options);
  await convertReadableStreamToArray(second.stream);
  expect(chatSchemaCount()).toBe(2);
});
