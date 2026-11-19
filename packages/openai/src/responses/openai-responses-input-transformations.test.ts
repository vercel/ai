import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it } from 'vitest';
import { OpenAIResponsesLanguageModel } from './openai-responses-language-model';

const url = 'https://api.openai.com/v1/responses';

const options = {
  prompt: [
    {
      role: 'user' as const,
      content: [{ type: 'text' as const, text: 'Hello' }],
    },
  ],
};

function createModel() {
  return new OpenAIResponsesLanguageModel('gpt-6.2-astra', {
    provider: 'openai.responses',
    url: () => url,
    headers: () => ({}),
  });
}

describe.each(['generate', 'stream'] as const)(
  'Responses input transformations (%s)',
  method => {
    const server = createTestServer({ [url]: {} });

    it.each([
      {
        name: 'a removed reasoning item',
        transformations: [
          {
            id: 'rs_1',
            type: 'reasoning',
            action: 'removed',
            reason: 'prefix_mismatch',
          },
        ],
      },
      {
        name: 'several removed reasoning items',
        transformations: [
          {
            id: 'rs_1',
            type: 'reasoning',
            action: 'removed',
            reason: 'end_user_mismatch',
          },
          {
            id: 'rs_2',
            type: 'reasoning',
            action: 'removed',
            reason: 'model_mismatch',
          },
        ],
      },
      { name: 'no transformations', transformations: [] },
      {
        name: 'a future action and reason without an id',
        transformations: [
          {
            type: 'reasoning',
            action: 'future_action',
            reason: 'future_reason',
          },
        ],
      },
      { name: 'null', transformations: null },
      { name: 'a missing field', transformations: undefined },
    ])('returns $name', async ({ transformations }) => {
      const response = {
        id: 'resp_test',
        created_at: 0,
        model: 'gpt-6.2-astra',
        output: [],
        input_transformations: transformations,
      };
      server.urls[url].response =
        method === 'generate'
          ? { type: 'json-value', body: response }
          : {
              type: 'stream-chunks',
              chunks: [
                `data: ${JSON.stringify({ type: 'response.completed', response })}\n\n`,
              ],
            };
      const metadata =
        method === 'generate'
          ? (await createModel().doGenerate(options)).providerMetadata
          : (
              await convertReadableStreamToArray(
                (
                  await createModel().doStream(options)
                ).stream,
              )
            ).find(part => part.type === 'finish')!.providerMetadata;

      if (transformations == null) {
        expect(metadata?.openai).not.toHaveProperty('inputTransformations');
      } else {
        expect(metadata?.openai?.inputTransformations).toEqual(transformations);
      }
    });
  },
);

describe('Responses input transformations (stream, failed response)', () => {
  const server = createTestServer({ [url]: {} });

  it('returns the transformations of a response that fails after output starts', async () => {
    const transformations = [
      {
        id: 'rs_1',
        type: 'reasoning',
        action: 'removed',
        reason: 'prefix_mismatch',
      },
    ];
    server.urls[url].response = {
      type: 'stream-chunks',
      chunks: [
        `data: ${JSON.stringify({
          type: 'response.created',
          response: { id: 'resp_test', created_at: 0, model: 'gpt-6.2-astra' },
        })}\n\n`,
        `data: ${JSON.stringify({
          type: 'response.output_item.added',
          output_index: 0,
          item: { id: 'msg_1', type: 'message' },
        })}\n\n`,
        `data: ${JSON.stringify({
          type: 'response.failed',
          sequence_number: 2,
          response: {
            error: { code: 'server_error', message: 'failed' },
            input_transformations: transformations,
          },
        })}\n\n`,
      ],
    };

    const parts = await convertReadableStreamToArray(
      (await createModel().doStream(options)).stream,
    );

    expect(
      parts.find(part => part.type === 'finish')!.providerMetadata?.openai
        ?.inputTransformations,
    ).toEqual(transformations);
  });
});
