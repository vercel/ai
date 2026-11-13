import type { LanguageModelV3Prompt } from '@ai-sdk/provider';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it } from 'vitest';
import { OpenAIResponsesLanguageModel } from './openai-responses-language-model';

const url = 'https://api.openai.com/v1/responses';

const compactionItem = {
  type: 'compaction',
  id: 'cmp_1',
  encrypted_content: 'encrypted-summary',
};

const compactionMetadata = {
  openai: {
    type: 'compaction',
    itemId: 'cmp_1',
    encryptedContent: 'encrypted-summary',
  },
};

const response = {
  id: 'resp_1',
  created_at: 0,
  model: 'gpt-5.4',
  output: [
    compactionItem,
    {
      type: 'message',
      id: 'msg_1',
      role: 'assistant',
      status: 'completed',
      content: [{ type: 'output_text', text: 'Done.', annotations: [] }],
    },
  ],
  usage: { input_tokens: 10, output_tokens: 2 },
};

const createModel = () =>
  new OpenAIResponsesLanguageModel('gpt-5.4', {
    provider: 'openai.responses',
    url: () => url,
    headers: () => ({}),
  });

const userPrompt: LanguageModelV3Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

describe('Responses context management', () => {
  const server = createTestServer({ [url]: {} });

  it('sends context_management', async () => {
    server.urls[url].response = { type: 'json-value', body: response };

    await createModel().doGenerate({
      prompt: userPrompt,
      providerOptions: {
        openai: {
          contextManagement: [{ type: 'compaction', compactThreshold: 50000 }],
        },
      },
    });

    expect((await server.calls[0].requestBodyJson).context_management).toEqual([
      { type: 'compaction', compact_threshold: 50000 },
    ]);
  });

  it('returns a compaction item as an empty reasoning part', async () => {
    server.urls[url].response = { type: 'json-value', body: response };

    const result = await createModel().doGenerate({ prompt: userPrompt });

    expect(result.content[0]).toEqual({
      type: 'reasoning',
      text: '',
      providerMetadata: compactionMetadata,
    });
  });

  it('streams a compaction item as an empty reasoning part', async () => {
    server.urls[url].response = {
      type: 'stream-chunks',
      chunks: [
        { type: 'response.created', response: { ...response, output: [] } },
        {
          type: 'response.output_item.added',
          output_index: 0,
          item: { type: 'compaction', id: 'cmp_1' },
        },
        {
          type: 'response.output_item.done',
          output_index: 0,
          item: compactionItem,
        },
        { type: 'response.completed', response },
      ].map(chunk => `data: ${JSON.stringify(chunk)}\n\n`),
    };

    const { stream } = await createModel().doStream({ prompt: userPrompt });
    const parts = await convertReadableStreamToArray(stream);

    expect(
      parts.filter(
        part =>
          part.type === 'reasoning-start' || part.type === 'reasoning-end',
      ),
    ).toEqual([
      {
        type: 'reasoning-start',
        id: 'cmp_1',
        providerMetadata: compactionMetadata,
      },
      {
        type: 'reasoning-end',
        id: 'cmp_1',
        providerMetadata: compactionMetadata,
      },
    ]);
  });

  describe('replay', () => {
    const history: LanguageModelV3Prompt = [
      ...userPrompt,
      {
        role: 'assistant',
        content: [
          { type: 'reasoning', text: '', providerOptions: compactionMetadata },
          { type: 'text', text: 'Done.' },
        ],
      },
      { role: 'user', content: [{ type: 'text', text: 'Continue.' }] },
    ];

    const replay = async (openai: Record<string, string | boolean>) => {
      server.urls[url].response = { type: 'json-value', body: response };
      await createModel().doGenerate({
        prompt: history,
        providerOptions: { openai },
      });
      return (await server.calls[0].requestBodyJson).input;
    };

    it('sends the compaction item when not stored', async () => {
      expect((await replay({ store: false }))[1]).toEqual(compactionItem);
    });

    it('references the compaction item when stored', async () => {
      expect((await replay({ store: true }))[1]).toEqual({
        type: 'item_reference',
        id: 'cmp_1',
      });
    });

    it('omits the compaction item with a conversation', async () => {
      const input = await replay({ conversation: 'conv_1' });
      expect(JSON.stringify(input)).not.toContain('cmp_1');
    });
  });
});
