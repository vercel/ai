import { createOpenResponses } from '@ai-sdk/open-responses';
import assert from 'node:assert/strict';

type JsonObject = Record<string, any>;

function createMockModel(output: JsonObject[], requestBodies: JsonObject[]) {
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
    name: 'open-responses',
    url: 'https://example.invalid/v1/responses',
    fetch: async (_url, init) => {
      requestBodies.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify(responseBody), {
        headers: { 'content-type': 'application/json' },
      });
    },
  })('test-model');
}

async function roundTrip(output: JsonObject[]) {
  const requestBodies: JsonObject[] = [];
  const model = createMockModel(output, requestBodies);

  const first = await model.doGenerate({
    prompt: [{ role: 'user', content: [{ type: 'text', text: 'question' }] }],
  });

  await model.doGenerate({
    prompt: [{ role: 'assistant', content: first.content as any }],
  });

  return {
    decoded: first.content as JsonObject[],
    replayed: requestBodies[1].input as JsonObject[],
  };
}

function providerData(part: JsonObject | undefined): JsonObject | undefined {
  return (
    part?.providerMetadata?.['open-responses'] ??
    part?.providerOptions?.['open-responses']
  );
}

async function main() {
  const failures: string[] = [];

  const check = (name: string, assertion: () => void) => {
    try {
      assertion();
    } catch (error) {
      failures.push(
        `${name}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

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
          logprobs: [],
        },
      ],
    },
  ]);

  check('decoded heterogeneous item order', () => {
    assert.deepEqual(
      ordered.decoded.map(part => part.type),
      ['reasoning', 'tool-call', 'text'],
    );
  });
  check('replayed heterogeneous item order', () => {
    assert.deepEqual(
      ordered.replayed.map(item => item.type),
      ['reasoning', 'function_call', 'message'],
    );
  });

  const opaqueReasoning = await roundTrip([
    {
      id: 'rs_2',
      type: 'reasoning',
      status: 'completed',
      summary: [{ type: 'summary_text', text: 'safe summary' }],
      encrypted_content: 'opaque-provider-state',
    },
  ]);

  check('opaque reasoning remains represented after decoding', () => {
    assert.equal(opaqueReasoning.decoded.length, 1);
    assert.equal(opaqueReasoning.decoded[0].type, 'reasoning');
  });
  check('opaque reasoning metadata survives decoding', () => {
    assert.deepEqual(providerData(opaqueReasoning.decoded[0]), {
      itemId: 'rs_2',
      reasoningSummary: [{ type: 'summary_text', text: 'safe summary' }],
      reasoningContent: null,
      reasoningEncryptedContent: 'opaque-provider-state',
    });
  });
  check('opaque reasoning survives replay', () => {
    assert.deepEqual(opaqueReasoning.replayed, [
      {
        id: 'rs_2',
        type: 'reasoning',
        summary: [{ type: 'summary_text', text: 'safe summary' }],
        encrypted_content: 'opaque-provider-state',
      },
    ]);
  });

  const annotatedMessage = await roundTrip([
    {
      id: 'msg_2',
      type: 'message',
      role: 'assistant',
      status: 'completed',
      content: [
        {
          type: 'output_text',
          text: 'cited answer',
          annotations: [
            {
              type: 'url_citation',
              start_index: 0,
              end_index: 5,
              url: 'https://example.com/source',
              title: 'Example source',
            },
          ],
          logprobs: [],
        },
      ],
    },
  ]);

  const expectedAnnotations = [
    {
      type: 'url_citation',
      start_index: 0,
      end_index: 5,
      url: 'https://example.com/source',
      title: 'Example source',
    },
  ];

  check('URL citation annotations survive decoding', () => {
    assert.deepEqual(
      providerData(annotatedMessage.decoded[0])?.annotations,
      expectedAnnotations,
    );
  });
  check('URL citation annotations survive replay', () => {
    assert.deepEqual(
      annotatedMessage.replayed[0]?.content?.[0]?.annotations,
      expectedAnnotations,
    );
  });

  const multiEntryReasoning = await roundTrip([
    {
      id: 'rs_3',
      type: 'reasoning',
      status: 'completed',
      summary: [],
      content: [
        { type: 'reasoning_text', text: 'first' },
        { type: 'reasoning_text', text: 'second' },
      ],
    },
  ]);

  check('multiple reasoning entries retain their boundaries', () => {
    assert.deepEqual(
      multiEntryReasoning.decoded.map(part => part.text),
      ['first', 'second'],
    );
  });
  check('multiple reasoning entries survive replay as one item', () => {
    assert.deepEqual(multiEntryReasoning.replayed, [
      {
        id: 'rs_3',
        type: 'reasoning',
        summary: [],
        content: [
          { type: 'reasoning_text', text: 'first' },
          { type: 'reasoning_text', text: 'second' },
        ],
      },
    ]);
  });

  if (failures.length > 0) {
    console.error(failures.join('\n'));
    console.error(
      'ISSUE_18839_REPRODUCED: Open Responses manual-history round trip is lossy',
    );
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
