import { createAnthropic } from '@ai-sdk/anthropic';
import {
  InvalidResponseDataError,
  type LanguageModelV3,
  type LanguageModelV3StreamPart,
} from '@ai-sdk/provider';
import { streamText, tool } from 'ai';
import { z } from 'zod';

type AnthropicEvent = Record<string, unknown>;

function createSseResponse(events: AnthropicEvent[]): Response {
  const body = events
    .map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
    .join('');

  return new Response(body, {
    headers: { 'content-type': 'text/event-stream' },
  });
}

async function parse(events: AnthropicEvent[]) {
  const model = createModel(events);

  const { stream } = await model.doStream({
    prompt: [
      {
        role: 'user',
        content: [{ type: 'text', text: 'Use the lookup tool.' }],
      },
    ],
    tools: [
      {
        type: 'function',
        name: 'lookup',
        inputSchema: {
          type: 'object',
          properties: { value: { type: 'string' } },
          required: ['value'],
          additionalProperties: false,
        },
      },
    ],
  });

  const parts: LanguageModelV3StreamPart[] = [];
  const reader = stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    parts.push(value);
  }
  return parts;
}

function createModel(events: AnthropicEvent[]): LanguageModelV3 {
  return createAnthropic({
    apiKey: 'test-api-key',
    fetch: async () => createSseResponse(events),
  })('claude-sonnet-4-20250514');
}

function messageStart(id: string, inputTokens: number): AnthropicEvent {
  return {
    type: 'message_start',
    message: {
      id,
      type: 'message',
      role: 'assistant',
      model: 'claude-sonnet-4-20250514',
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: inputTokens, output_tokens: 1 },
    },
  };
}

const splicedGeneration = [
  messageStart('msg_first', 10),
  {
    type: 'content_block_start',
    index: 0,
    content_block: { type: 'thinking', thinking: '', signature: '' },
  },
  {
    type: 'content_block_delta',
    index: 0,
    delta: { type: 'thinking_delta', thinking: 'first thinking' },
  },
  {
    type: 'content_block_delta',
    index: 0,
    delta: { type: 'signature_delta', signature: 'signature-first' },
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
    delta: {
      type: 'input_json_delta',
      partial_json: '{"value":"Spark',
    },
  },
  messageStart('msg_second', 20),
  {
    type: 'content_block_start',
    index: 0,
    content_block: { type: 'thinking', thinking: '', signature: '' },
  },
  {
    type: 'content_block_delta',
    index: 0,
    delta: { type: 'thinking_delta', thinking: 'second thinking' },
  },
  {
    type: 'content_block_delta',
    index: 0,
    delta: { type: 'signature_delta', signature: 'signature-second' },
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
      partial_json: '{"value":"complete"}',
    },
  },
  { type: 'content_block_stop', index: 1 },
  {
    type: 'message_delta',
    delta: { stop_reason: 'tool_use', stop_sequence: null },
    usage: { output_tokens: 30 },
  },
  { type: 'message_stop' },
] satisfies AnthropicEvent[];

const duplicateSameId = [
  messageStart('msg_duplicate', 10),
  messageStart('msg_duplicate', 99),
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
] satisfies AnthropicEvent[];

const sequentialMessages = [
  messageStart('msg_programmatic_first', 10),
  {
    type: 'message_delta',
    delta: { stop_reason: 'tool_use', stop_sequence: null },
    usage: { output_tokens: 2 },
  },
  { type: 'message_stop' },
  messageStart('msg_programmatic_second', 11),
  {
    type: 'message_delta',
    delta: { stop_reason: 'end_turn', stop_sequence: null },
    usage: { output_tokens: 3 },
  },
  { type: 'message_stop' },
] satisfies AnthropicEvent[];

async function main() {
  const streamTextResult = streamText({
    model: createModel(splicedGeneration),
    prompt: 'Use the lookup tool.',
    tools: {
      lookup: tool({
        inputSchema: z.object({ value: z.string() }),
      }),
    },
  });
  await streamTextResult.consumeStream();
  const steps = await streamTextResult.steps;
  const stepContent = steps.flatMap(step => step.content);
  const stepReasoning = stepContent
    .filter(part => part.type === 'reasoning')
    .map(part => part.text);
  const stepSignatures = stepContent
    .filter(part => part.type === 'reasoning')
    .map(part => part.providerMetadata?.anthropic?.signature);
  const stepToolCallIds = stepContent
    .filter(part => part.type === 'tool-call')
    .map(part => part.toolCallId);
  if (
    steps.length !== 1 ||
    stepReasoning.join(',') !== 'first thinking,second thinking' ||
    stepSignatures.join(',') !== 'signature-first,signature-second' ||
    stepToolCallIds.join(',') !== 'toolu_second'
  ) {
    throw new Error(
      `Harness mismatch: streamText did not record the merged generation in one step: ${JSON.stringify(
        {
          stepCount: steps.length,
          stepReasoning,
          stepSignatures,
          stepToolCallIds,
        },
      )}`,
    );
  }

  const splicedParts = await parse(splicedGeneration);
  const splicedMetadataIds = splicedParts
    .filter(part => part.type === 'response-metadata')
    .map(part => part.id);
  const reasoning = splicedParts
    .filter(
      (
        part,
      ): part is Extract<
        LanguageModelV3StreamPart,
        { type: 'reasoning-delta' }
      > => part.type === 'reasoning-delta' && part.delta !== '',
    )
    .map(part => part.delta);
  const toolCallIds = splicedParts
    .filter(part => part.type === 'tool-call')
    .map(part => part.toolCallId);
  const spliceErrors = splicedParts.filter(part => part.type === 'error');

  if (
    splicedMetadataIds.join(',') !== 'msg_first,msg_second' ||
    reasoning.join(',') !== 'first thinking,second thinking' ||
    toolCallIds.join(',') !== 'toolu_second'
  ) {
    throw new Error(
      `Harness mismatch: ${JSON.stringify({
        splicedMetadataIds,
        reasoning,
        toolCallIds,
      })}`,
    );
  }

  const duplicateParts = await parse(duplicateSameId);
  const duplicateMetadataCount = duplicateParts.filter(
    part => part.type === 'response-metadata',
  ).length;
  const duplicateInputTokens = duplicateParts.find(
    part => part.type === 'finish',
  )?.usage.inputTokens.total;
  if (duplicateMetadataCount !== 2 || duplicateInputTokens !== 99) {
    throw new Error(
      `Harness mismatch: expected duplicate metadata and overwritten usage, received ${JSON.stringify(
        { duplicateMetadataCount, duplicateInputTokens },
      )}.`,
    );
  }

  const sequentialParts = await parse(sequentialMessages);
  const sequentialMetadataIds = sequentialParts
    .filter(part => part.type === 'response-metadata')
    .map(part => part.id);
  if (
    sequentialMetadataIds.join(',') !==
    'msg_programmatic_first,msg_programmatic_second'
  ) {
    throw new Error(
      `Harness mismatch: valid sequential messages did not parse: ${sequentialMetadataIds.join(',')}.`,
    );
  }

  const hasExpectedError = spliceErrors.some(
    part =>
      part.type === 'error' && InvalidResponseDataError.isInstance(part.error),
  );
  if (!hasExpectedError) {
    throw new Error(
      'ISSUE_18331_REPRODUCED: different message_start was silently merged without InvalidResponseDataError',
    );
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
