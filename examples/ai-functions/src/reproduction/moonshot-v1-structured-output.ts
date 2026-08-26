import assert from 'node:assert/strict';
import { createMoonshotAI } from '@ai-sdk/moonshotai';

const officialMoonshotV1ModelIds = [
  'moonshot-v1-8k',
  'moonshot-v1-32k',
  'moonshot-v1-128k',
  'moonshot-v1-auto',
  'moonshot-v1-8k-vision-preview',
  'moonshot-v1-32k-vision-preview',
  'moonshot-v1-128k-vision-preview',
] as const;

const responseBody = {
  id: 'chatcmpl-reproduction',
  object: 'chat.completion',
  created: 1787761878,
  model: 'moonshot-v1-8k',
  choices: [
    {
      index: 0,
      message: {
        role: 'assistant',
        content: '{"answer":"ok"}',
      },
      finish_reason: 'stop',
    },
  ],
  usage: {
    prompt_tokens: 17,
    completion_tokens: 6,
    total_tokens: 23,
  },
};

async function getResponseFormatType(modelId: string) {
  let requestBody: Record<string, any> | undefined;
  const fetch: typeof globalThis.fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify(responseBody), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  const provider = createMoonshotAI({ apiKey: 'test-api-key', fetch });

  await provider.chatModel(modelId).doGenerate({
    prompt: [
      {
        role: 'user',
        content: [{ type: 'text', text: 'Return an answer.' }],
      },
    ],
    responseFormat: {
      type: 'json',
      name: 'structured_response',
      schema: {
        type: 'object',
        properties: { answer: { type: 'string' } },
        required: ['answer'],
        additionalProperties: false,
      },
    },
  });

  assert.ok(requestBody, `No request was captured for ${modelId}`);
  return requestBody.response_format?.type;
}

async function main() {
  const downgradedModelIds: string[] = [];

  for (const modelId of officialMoonshotV1ModelIds) {
    const responseFormatType = await getResponseFormatType(modelId);
    if (responseFormatType === 'json_object') {
      downgradedModelIds.push(modelId);
    } else {
      assert.equal(
        responseFormatType,
        'json_schema',
        `${modelId} must use native JSON-schema structured output`,
      );
    }
  }

  assert.equal(
    await getResponseFormatType('kimi-k3'),
    'json_schema',
    'Kimi structured-output behavior must remain unchanged',
  );
  assert.equal(
    await getResponseFormatType('custom-model-id'),
    'json_object',
    'Unknown model IDs must retain the conservative fallback',
  );

  if (downgradedModelIds.length > 0) {
    console.error(
      `ISSUE #19558 REPRODUCED: official Moonshot V1 structured-output requests were downgraded to json_object: ${downgradedModelIds.join(', ')}`,
    );
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
