import assert from 'node:assert/strict';
import { createOpenResponses } from '@ai-sdk/open-responses';
import type { LanguageModelV4Prompt } from '@ai-sdk/provider';

const reasoningText = 'REASONING THAT MUST SURVIVE THE ROUND TRIP';

type AssistantContent = Extract<
  LanguageModelV4Prompt[number],
  { role: 'assistant' }
>['content'];

type RequestItem = {
  type?: string;
  role?: string;
  call_id?: string;
  content?: unknown;
};

type RequestBody = {
  input: RequestItem[];
};

async function main() {
  const requestBodies: RequestBody[] = [];

  function modelReturning(output: unknown[]) {
    return createOpenResponses({
      name: 'reproduction',
      apiKey: 'not-used',
      url: 'https://example.invalid/v1/responses',
      fetch: async (_url, init) => {
        requestBodies.push(JSON.parse(String(init?.body)) as RequestBody);

        return new Response(
          JSON.stringify({
            id: 'r',
            object: 'response',
            created_at: 0,
            model: 'm',
            status: 'completed',
            output,
            usage: { input_tokens: 1, output_tokens: 1 },
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        );
      },
    })('any-model');
  }

  const firstStep = await modelReturning([
    {
      type: 'reasoning',
      id: 'rs_1',
      content: [{ type: 'reasoning_text', text: reasoningText }],
      summary: [],
    },
    {
      type: 'function_call',
      id: 'fc_1',
      call_id: 'call_1',
      name: 'get_weather',
      arguments: '{"location":"San Francisco"}',
    },
  ]).doGenerate({
    prompt: [
      {
        role: 'user',
        content: [{ type: 'text', text: 'What is the weather?' }],
      },
    ],
    tools: [
      {
        type: 'function',
        name: 'get_weather',
        inputSchema: {
          type: 'object',
          properties: { location: { type: 'string' } },
          required: ['location'],
        },
      },
    ],
  });

  const reasoningRead = firstStep.content.filter(
    part => part.type === 'reasoning',
  );
  assert.equal(
    reasoningRead.length,
    1,
    'precondition: the provider response should produce one reasoning part',
  );

  await modelReturning([]).doGenerate({
    prompt: [
      {
        role: 'user',
        content: [{ type: 'text', text: 'What is the weather?' }],
      },
      {
        role: 'assistant',
        content: firstStep.content as AssistantContent,
      },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'call_1',
            toolName: 'get_weather',
            output: {
              type: 'json',
              value: { temperature: 72, condition: 'sunny' },
            },
          },
        ],
      },
    ],
    tools: [
      {
        type: 'function',
        name: 'get_weather',
        inputSchema: {
          type: 'object',
          properties: { location: { type: 'string' } },
          required: ['location'],
        },
      },
    ],
  });

  const secondRequest = requestBodies.at(-1);
  assert.ok(secondRequest != null, 'no second request body was captured');

  assert.deepEqual(
    secondRequest.input.map(item => item.type ?? `message:${item.role}`),
    ['message', 'reasoning', 'function_call', 'function_call_output'],
  );

  const replayedReasoning = secondRequest.input[1];
  assert.deepEqual(replayedReasoning, {
    type: 'reasoning',
    summary: [],
    content: [{ type: 'reasoning_text', text: reasoningText }],
  });

  assert.equal(secondRequest.input[2].call_id, 'call_1');
  assert.equal(secondRequest.input[3].call_id, 'call_1');

  console.log('Reasoning survived the Open Responses tool-loop round trip.');
  console.log(
    secondRequest.input
      .map(item => item.type ?? `message:${item.role}`)
      .join(', '),
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
