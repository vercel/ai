import assert from 'node:assert/strict';
import { createOpenResponses } from '@ai-sdk/open-responses';
import type { LanguageModelV4Prompt } from '@ai-sdk/provider';

const reasoningText = 'REASONING THAT MUST SURVIVE THE ROUND TRIP';

type AssistantContent = Extract<
  LanguageModelV4Prompt[number],
  { role: 'assistant' }
>['content'];

type RequestBody = {
  input: Array<{ type?: string; role?: string }>;
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

  const step1 = await modelReturning([
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
      name: 't',
      arguments: '{}',
    },
  ]).doGenerate({
    prompt: [{ role: 'user', content: [{ type: 'text', text: 'q' }] }],
    tools: [
      {
        type: 'function',
        name: 't',
        inputSchema: { type: 'object', properties: {} },
      },
    ],
  });

  const reasoningRead = step1.content.filter(part => part.type === 'reasoning');
  console.log(
    'step 1 — reasoning parts the SDK produced:',
    reasoningRead.length,
    JSON.stringify(reasoningRead.map(part => part.text)),
  );

  await modelReturning([]).doGenerate({
    prompt: [
      { role: 'user', content: [{ type: 'text', text: 'q' }] },
      {
        role: 'assistant',
        content: step1.content as AssistantContent,
      },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'call_1',
            toolName: 't',
            output: { type: 'json', value: { ok: true } },
          },
        ],
      },
    ],
    tools: [
      {
        type: 'function',
        name: 't',
        inputSchema: { type: 'object', properties: {} },
      },
    ],
  });

  const lastRequestBody = requestBodies.at(-1);
  assert.ok(lastRequestBody != null, 'no second request body was captured');

  const sentReasoning = lastRequestBody.input.filter(
    item => item.type === 'reasoning',
  );
  console.log(
    'step 2 — request input items:',
    lastRequestBody.input
      .map(item => item.type ?? `message:${item.role}`)
      .join(', '),
  );
  console.log('step 2 — reasoning items sent:', sentReasoning.length);

  assert.ok(
    reasoningRead.length > 0,
    'precondition: the SDK did not read the reasoning item back',
  );
  assert.equal(
    sentReasoning.length,
    reasoningRead.length,
    `asymmetric round trip: the SDK produced ${reasoningRead.length} reasoning part(s) from the response, but serialized ${sentReasoning.length} back into the next request.`,
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
