import assert from 'node:assert/strict';
import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModelV4Prompt } from '@ai-sdk/provider';

type ResponseInputItem = {
  type?: string;
  id?: string;
  role?: string;
  content?: Array<{ type?: string; text?: string }>;
};

type ResponseRequest = {
  input: Array<ResponseInputItem>;
};

const syntheticResponse = {
  id: 'resp_synthetic',
  created_at: 1,
  model: 'gpt-5-mini',
  status: 'completed',
  output: [
    {
      id: 'msg_synthetic',
      type: 'message',
      role: 'assistant',
      status: 'completed',
      content: [
        { type: 'output_text', text: 'First. ', annotations: [] },
        { type: 'output_text', text: 'Second.', annotations: [] },
      ],
    },
  ],
  usage: {
    input_tokens: 1,
    output_tokens: 2,
    total_tokens: 3,
    input_tokens_details: { cached_tokens: 0 },
    output_tokens_details: { reasoning_tokens: 0 },
  },
};

async function main() {
  const requests: Array<ResponseRequest> = [];
  const model = createOpenAI({
    apiKey: 'test',
    fetch: async (_url, init) => {
      const body = init?.body;
      if (typeof body !== 'string') {
        throw new Error('Expected the Responses request body to be a string');
      }
      requests.push(JSON.parse(body) as ResponseRequest);
      return Response.json(syntheticResponse);
    },
  }).responses('gpt-5-mini');

  const prompt: LanguageModelV4Prompt = [
    { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
  ];
  const providerOptions = { openai: { store: true } };

  const first = await model.doGenerate({ prompt, providerOptions });
  assert.equal(first.content.length, 2);

  const content = first.content.map(part => {
    assert.equal(part.type, 'text');
    assert.equal(
      part.providerMetadata?.openai?.itemId,
      'msg_synthetic',
      'Each parsed text part must retain its stored message item ID',
    );

    return {
      type: 'text' as const,
      text: part.text,
      providerOptions: part.providerMetadata,
    };
  });

  await model.doGenerate({
    prompt: [
      ...prompt,
      { role: 'assistant', content },
      {
        role: 'user',
        content: [{ type: 'text', text: 'Continue' }],
      },
    ],
    providerOptions,
  });

  const secondInput = requests[1].input;
  assert.deepEqual(
    secondInput.filter(item => item.role === 'user'),
    [
      {
        role: 'user',
        content: [{ type: 'input_text', text: 'Hello' }],
      },
      {
        role: 'user',
        content: [{ type: 'input_text', text: 'Continue' }],
      },
    ],
    'The surrounding user turns must be preserved',
  );

  const references = secondInput.filter(
    item => item.type === 'item_reference' && item.id === 'msg_synthetic',
  );

  if (references.length !== 1) {
    throw new Error(
      `Issue #22211 reproduced: expected one item_reference for stored message msg_synthetic, received ${references.length}`,
    );
  }

  console.log('Issue #22211 did not reproduce.');
}

main();
