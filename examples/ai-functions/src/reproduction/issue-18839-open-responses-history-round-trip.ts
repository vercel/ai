import { createOpenResponses } from '@ai-sdk/open-responses';
import type { LanguageModelV4Prompt } from '@ai-sdk/provider';

type ResponseOutputItem = Record<string, unknown> & { type: string };
type AssistantContent = Extract<
  LanguageModelV4Prompt[number],
  { role: 'assistant' }
>['content'];

function createMockModel(
  output: ResponseOutputItem[],
  requestBodies: Array<Record<string, unknown>>,
) {
  const responseBody = {
    id: 'resp_1',
    object: 'response',
    created_at: 0,
    model: 'test-model',
    status: 'completed',
    output,
    usage: {
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0,
    },
  };

  return createOpenResponses({
    name: 'repro',
    url: 'https://example.invalid/v1/responses',
    fetch: async (_url, init) => {
      requestBodies.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify(responseBody), {
        headers: { 'content-type': 'application/json' },
      });
    },
  })('test-model');
}

async function roundTrip(output: ResponseOutputItem[]) {
  const requestBodies: Array<Record<string, unknown>> = [];
  const model = createMockModel(output, requestBodies);

  const first = await model.doGenerate({
    prompt: [{ role: 'user', content: [{ type: 'text', text: 'question' }] }],
  });

  await model.doGenerate({
    prompt: [
      {
        role: 'assistant',
        content: first.content as AssistantContent,
      },
    ],
  });

  return {
    decoded: first.content,
    replayed: requestBodies[1].input as ResponseOutputItem[],
  };
}

async function main() {
  const ordered = await roundTrip([
    {
      id: 'rs_1',
      type: 'reasoning',
      status: 'completed',
      summary: [],
      content: [{ type: 'reasoning_text', text: 'reasoning' }],
    },
    {
      id: 'fc_1',
      type: 'function_call',
      status: 'completed',
      call_id: 'call_1',
      name: 'search',
      arguments: '{}',
    },
    {
      id: 'msg_1',
      type: 'message',
      role: 'assistant',
      status: 'completed',
      content: [
        {
          type: 'output_text',
          text: 'answer after the call',
          annotations: [],
        },
      ],
    },
  ]);

  const opaqueReasoning = await roundTrip([
    {
      id: 'rs_2',
      type: 'reasoning',
      status: 'completed',
      summary: [{ type: 'summary_text', text: 'safe summary' }],
      encrypted_content: 'opaque-provider-state',
    },
  ]);

  const failures: string[] = [];
  const replayedOrder = ordered.replayed.map(item => item.type);
  const expectedOrder = ['reasoning', 'function_call', 'message'];

  if (JSON.stringify(replayedOrder) !== JSON.stringify(expectedOrder)) {
    failures.push(
      `item order changed from ${expectedOrder.join(' -> ')} to ${replayedOrder.join(' -> ')}`,
    );
  }

  const replayedOpaqueReasoning = opaqueReasoning.replayed.find(
    item => item.type === 'reasoning',
  );

  if (opaqueReasoning.decoded.length === 0) {
    failures.push('summary/encrypted-only reasoning decoded to no content');
  }

  if (
    replayedOpaqueReasoning?.id !== 'rs_2' ||
    replayedOpaqueReasoning.encrypted_content !== 'opaque-provider-state' ||
    JSON.stringify(replayedOpaqueReasoning.summary) !==
      JSON.stringify([{ type: 'summary_text', text: 'safe summary' }])
  ) {
    failures.push(
      'reasoning id, summary, and encrypted_content were not preserved on replay',
    );
  }

  if (failures.length > 0) {
    throw new Error(
      `Issue #18839: Open Responses manual-history round trip is lossy: ${failures.join('; ')}`,
    );
  }

  console.log('Issue #18839 reproduction passed: round trip was lossless.');
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
