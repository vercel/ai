import {
  createOpenResponses,
  type Experimental_OpenResponsesExtension,
} from '@ai-sdk/open-responses';
import type { ModelMessage } from '@ai-sdk/provider-utils';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it } from 'vitest';
import { generateText } from './generate-text';

describe('Open Responses extension round trip', () => {
  const URL = 'https://localhost:1234/v1/responses';
  const server = createTestServer({ [URL]: {} });

  it('replays a source-only item through generateText response messages', async () => {
    const receipt = {
      type: 'acme:document_search_source' as const,
      id: 'source_1',
      status: 'completed',
      url: 'https://example.com/documentation',
      title: 'Extension documentation',
      opaque_receipt: { trace_id: 'trace_source_1' },
    };
    const extension: Experimental_OpenResponsesExtension = {
      id: 'acme.document_search_sources',
      itemTypes: ['acme:document_search_source'],
      decodeItem: ({ item }) => [
        {
          type: 'source',
          sourceType: 'url',
          id: item.id,
          url: item.url as string,
          title: item.title as string,
        },
      ],
    };

    server.urls[URL].response = [
      {
        type: 'json-value',
        body: createResponse({
          id: 'response_1',
          output: [
            receipt,
            {
              type: 'message',
              id: 'message_1',
              status: 'completed',
              role: 'assistant',
              content: [
                {
                  type: 'output_text',
                  text: 'Found the documentation.',
                  annotations: [],
                  logprobs: [],
                },
              ],
            },
          ],
        }),
      },
      {
        type: 'json-value',
        body: createResponse({
          id: 'response_2',
          output: [
            {
              type: 'message',
              id: 'message_2',
              status: 'completed',
              role: 'assistant',
              content: [
                {
                  type: 'output_text',
                  text: 'The receipt was preserved.',
                  annotations: [],
                  logprobs: [],
                },
              ],
            },
          ],
        }),
      },
    ];

    const model = createOpenResponses({
      name: 'acme',
      url: URL,
      experimental_extensions: [extension],
    })('acme-model');
    const messages: ModelMessage[] = [
      { role: 'user', content: 'Find the extension documentation.' },
    ];

    const first = await generateText({ model, messages });
    messages.push(...first.response.messages);
    messages.push({
      role: 'user',
      content: 'Confirm that the source receipt remains in history.',
    });
    await generateText({ model, messages });

    expect(first.sources).toEqual([
      {
        type: 'source',
        sourceType: 'url',
        id: 'source_1',
        url: 'https://example.com/documentation',
        title: 'Extension documentation',
        providerMetadata: expect.any(Object),
      },
    ]);

    const secondRequest = await server.calls[1].requestBodyJson;
    expect(secondRequest.input).toContainEqual(receipt);
    expect(
      secondRequest.input.filter(
        (item: { type?: string; id?: string }) =>
          item.type === receipt.type && item.id === receipt.id,
      ),
    ).toHaveLength(1);
  });
});

function createResponse({
  id,
  output,
}: {
  id: string;
  output: Array<Record<string, unknown>>;
}) {
  return {
    id,
    object: 'response',
    created_at: 0,
    status: 'completed',
    model: 'acme-model',
    output,
    usage: {
      input_tokens: 1,
      output_tokens: 1,
      total_tokens: 2,
    },
  };
}
