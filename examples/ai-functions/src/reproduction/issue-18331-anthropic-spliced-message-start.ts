import { createAnthropic } from '../../../../packages/anthropic/dist/index.mjs';
import {
  InvalidResponseDataError,
  streamText,
} from '../../../../packages/ai/dist/index.mjs';

type StreamPart = {
  type: string;
  id?: string;
  text?: string;
  toolCallId?: string;
  error?: unknown;
  providerMetadata?: {
    anthropic?: {
      signature?: string;
    };
  };
  usage?: {
    inputTokens?: number;
  };
};

const splicedEvents = [
  {
    type: 'message_start',
    message: {
      id: 'msg_first',
      model: 'claude-sonnet-4-20250514',
      usage: { input_tokens: 10, output_tokens: 1 },
    },
  },
  {
    type: 'content_block_start',
    index: 0,
    content_block: { type: 'thinking', thinking: '' },
  },
  {
    type: 'content_block_delta',
    index: 0,
    delta: { type: 'thinking_delta', thinking: 'first reasoning' },
  },
  {
    type: 'content_block_delta',
    index: 0,
    delta: { type: 'signature_delta', signature: 'sig_first' },
  },
  { type: 'content_block_stop', index: 0 },
  {
    type: 'content_block_start',
    index: 1,
    content_block: {
      type: 'tool_use',
      id: 'toolu_first',
      name: 'lookup',
      input: {},
    },
  },
  {
    type: 'content_block_delta',
    index: 1,
    delta: { type: 'input_json_delta', partial_json: '{"value":"Spark' },
  },
  {
    type: 'message_start',
    message: {
      id: 'msg_second',
      model: 'claude-sonnet-4-20250514',
      usage: { input_tokens: 99, output_tokens: 1 },
    },
  },
  {
    type: 'content_block_start',
    index: 0,
    content_block: { type: 'thinking', thinking: '' },
  },
  {
    type: 'content_block_delta',
    index: 0,
    delta: { type: 'thinking_delta', thinking: 'second reasoning' },
  },
  {
    type: 'content_block_delta',
    index: 0,
    delta: { type: 'signature_delta', signature: 'sig_second' },
  },
  { type: 'content_block_stop', index: 0 },
  {
    type: 'content_block_start',
    index: 1,
    content_block: {
      type: 'tool_use',
      id: 'toolu_second',
      name: 'lookup',
      input: {},
    },
  },
  {
    type: 'content_block_delta',
    index: 1,
    delta: {
      type: 'input_json_delta',
      partial_json: '{"value":"Spark"}',
    },
  },
  { type: 'content_block_stop', index: 1 },
  {
    type: 'message_delta',
    delta: { stop_reason: 'tool_use', stop_sequence: null },
    usage: { output_tokens: 20 },
  },
  { type: 'message_stop' },
];

const duplicateStartEvents = [
  {
    type: 'message_start',
    message: {
      id: 'msg_duplicate',
      model: 'claude-sonnet-4-20250514',
      usage: { input_tokens: 10, output_tokens: 1 },
    },
  },
  {
    type: 'message_start',
    message: {
      id: 'msg_duplicate',
      model: 'claude-sonnet-4-20250514',
      usage: { input_tokens: 99, output_tokens: 1 },
    },
  },
  {
    type: 'content_block_start',
    index: 0,
    content_block: { type: 'text', text: '' },
  },
  {
    type: 'content_block_delta',
    index: 0,
    delta: { type: 'text_delta', text: 'ok' },
  },
  { type: 'content_block_stop', index: 0 },
  {
    type: 'message_delta',
    delta: { stop_reason: 'end_turn', stop_sequence: null },
    usage: { output_tokens: 2 },
  },
  { type: 'message_stop' },
];

function createSseFetch(events: unknown[]) {
  return async () =>
    new Response(
      events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''),
      {
        headers: { 'content-type': 'text/event-stream' },
        status: 200,
      },
    );
}

async function readProviderParts(events: unknown[]): Promise<StreamPart[]> {
  const model = createAnthropic({
    apiKey: 'test-api-key',
    fetch: createSseFetch(events),
  })('claude-sonnet-4-20250514');
  const { stream } = await model.doStream({
    prompt: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
  });
  const parts: StreamPart[] = [];
  for await (const part of stream) {
    parts.push(part as StreamPart);
  }
  return parts;
}

async function main() {
  const providerParts = await readProviderParts(splicedEvents);
  const providerErrors = providerParts.filter(part => part.type === 'error');
  const metadataIds = providerParts
    .filter(part => part.type === 'response-metadata')
    .map(part => part.id);
  const completedToolIds = providerParts
    .filter(part => part.type === 'tool-call')
    .map(part => part.toolCallId);

  const model = createAnthropic({
    apiKey: 'test-api-key',
    fetch: createSseFetch(splicedEvents),
  })('claude-sonnet-4-20250514');
  const result = streamText({
    model,
    prompt: 'Hello',
    maxRetries: 0,
  });
  const fullStreamParts: StreamPart[] = [];
  for await (const part of result.fullStream) {
    fullStreamParts.push(part as StreamPart);
  }
  const steps = await result.steps;

  const duplicateParts = await readProviderParts(duplicateStartEvents);
  const duplicateMetadataCount = duplicateParts.filter(
    part => part.type === 'response-metadata',
  ).length;
  const duplicateInputTokens = duplicateParts.find(
    part => part.type === 'finish',
  )?.usage?.inputTokens;

  const invalidResponseError = providerErrors.some(part =>
    InvalidResponseDataError.isInstance(part.error),
  );
  const mergedReasoning = fullStreamParts
    .filter(part => part.type === 'reasoning-delta')
    .map(part => part.text)
    .join('|');
  const mergedSignatures = fullStreamParts
    .filter(part => part.type === 'reasoning-delta')
    .map(part => part.providerMetadata?.anthropic?.signature)
    .filter(signature => signature != null);

  console.log(
    JSON.stringify(
      {
        metadataIds,
        invalidResponseError,
        completedToolIds,
        mergedReasoning,
        mergedSignatures,
        recordedStepCount: steps.length,
        duplicateMetadataCount,
        duplicateInputTokens,
      },
      null,
      2,
    ),
  );

  if (
    !invalidResponseError &&
    metadataIds.join(',') === 'msg_first,msg_second' &&
    completedToolIds.join(',') === 'toolu_second' &&
    mergedReasoning === 'first reasoning||second reasoning|' &&
    mergedSignatures.join(',') === 'sig_first,sig_second' &&
    steps.length === 1
  ) {
    console.error(
      'ISSUE_18331_REPRODUCED: different message_start was silently merged into one completed streamText step',
    );
    process.exitCode = 1;
    return;
  }

  if (
    invalidResponseError &&
    duplicateMetadataCount === 1 &&
    duplicateInputTokens === 10
  ) {
    console.log(
      'Issue behavior is fixed: the splice failed explicitly and the duplicate start was ignored.',
    );
    return;
  }

  throw new Error(
    `Unexpected result: invalidResponseError=${invalidResponseError}, metadataIds=${metadataIds.join(
      ',',
    )}, completedToolIds=${completedToolIds.join(
      ',',
    )}, recordedStepCount=${steps.length}, duplicateMetadataCount=${duplicateMetadataCount}, duplicateInputTokens=${duplicateInputTokens}`,
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
