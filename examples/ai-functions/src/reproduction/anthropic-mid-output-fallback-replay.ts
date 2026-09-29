import { createAnthropic } from '@ai-sdk/anthropic';
import { stepCountIs, streamText, tool } from 'ai';
import { z } from 'zod';

const issueSignal =
  'ISSUE_21734_REPRODUCED: the replayed assistant message dropped the required mid-output fallback block and Anthropic rejected the next step with HTTP 400';

function toSse(events: Array<Record<string, unknown>>): string {
  return events
    .map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
    .join('');
}

const rescued = toSse([
  {
    type: 'message_start',
    message: {
      id: 'msg_1',
      type: 'message',
      role: 'assistant',
      model: 'claude-opus-5-5',
      content: [],
      stop_reason: null,
      usage: { input_tokens: 10, output_tokens: 0 },
    },
  },
  {
    type: 'content_block_start',
    index: 0,
    content_block: { type: 'thinking', thinking: '', signature: '' },
  },
  {
    type: 'content_block_delta',
    index: 0,
    delta: { type: 'thinking_delta', thinking: 'Opus 5.5 thinking' },
  },
  {
    type: 'content_block_delta',
    index: 0,
    delta: { type: 'signature_delta', signature: 'SIG_FROM_OPUS_5_5' },
  },
  { type: 'content_block_stop', index: 0 },
  {
    type: 'content_block_start',
    index: 1,
    content_block: {
      type: 'fallback',
      from: { model: 'claude-opus-5-5' },
      to: { model: 'claude-opus-4-8' },
    },
  },
  { type: 'content_block_stop', index: 1 },
  {
    type: 'content_block_start',
    index: 2,
    content_block: { type: 'thinking', thinking: '', signature: '' },
  },
  {
    type: 'content_block_delta',
    index: 2,
    delta: { type: 'thinking_delta', thinking: 'Opus 4.8 thinking' },
  },
  {
    type: 'content_block_delta',
    index: 2,
    delta: { type: 'signature_delta', signature: 'SIG_FROM_OPUS_4_8' },
  },
  { type: 'content_block_stop', index: 2 },
  {
    type: 'content_block_start',
    index: 3,
    content_block: {
      type: 'tool_use',
      id: 'toolu_1',
      name: 'lookup',
      input: {},
    },
  },
  {
    type: 'content_block_delta',
    index: 3,
    delta: { type: 'input_json_delta', partial_json: '{"q":"x"}' },
  },
  { type: 'content_block_stop', index: 3 },
  {
    type: 'message_delta',
    delta: { stop_reason: 'tool_use' },
    usage: {
      output_tokens: 70,
      iterations: [
        {
          type: 'message',
          model: 'claude-opus-5-5',
          input_tokens: 10,
          output_tokens: 40,
        },
        {
          type: 'fallback_message',
          model: 'claude-opus-4-8',
          input_tokens: 12,
          output_tokens: 30,
        },
      ],
    },
  },
  { type: 'message_stop' },
]);

const done = toSse([
  {
    type: 'message_start',
    message: {
      id: 'msg_2',
      type: 'message',
      role: 'assistant',
      model: 'claude-opus-5-5',
      content: [],
      stop_reason: null,
      usage: { input_tokens: 10, output_tokens: 0 },
    },
  },
  {
    type: 'message_delta',
    delta: { stop_reason: 'end_turn' },
    usage: { output_tokens: 1 },
  },
  { type: 'message_stop' },
]);

type AnthropicContentBlock = {
  type?: string;
  signature?: string;
};

type AnthropicRequest = {
  messages?: Array<{
    role?: string;
    content?: AnthropicContentBlock[];
  }>;
};

function hasValidFallbackBoundary(request: AnthropicRequest): boolean {
  const assistant = request.messages?.find(
    message => message.role === 'assistant',
  );
  const content = assistant?.content ?? [];
  const fallbackIndex = content.findIndex(block => block.type === 'fallback');
  const primaryThinkingIndex = content.findIndex(
    block => block.signature === 'SIG_FROM_OPUS_5_5',
  );
  const fallbackThinkingIndex = content.findIndex(
    block => block.signature === 'SIG_FROM_OPUS_4_8',
  );

  return (
    fallbackIndex !== -1 &&
    (primaryThinkingIndex === -1 ||
      (primaryThinkingIndex < fallbackIndex &&
        fallbackIndex < fallbackThinkingIndex))
  );
}

async function main() {
  let capturedInvalidReplay = false;
  let streamError: unknown;

  const anthropic = createAnthropic({
    apiKey: 'test',
    fetch: async (_url, init) => {
      const request = JSON.parse(String(init?.body)) as AnthropicRequest;
      const isFirstRequest = !JSON.stringify(request).includes('toolu_1');

      if (isFirstRequest) {
        return new Response(rescued, {
          headers: { 'content-type': 'text/event-stream' },
        });
      }

      if (!hasValidFallbackBoundary(request)) {
        capturedInvalidReplay = true;
        return Response.json(
          {
            type: 'error',
            error: {
              type: 'invalid_request_error',
              message:
                'messages.1.content.1: `thinking` or `redacted_thinking` blocks in the latest assistant message cannot be modified. These blocks must remain as they were in the original response.',
            },
          },
          { status: 400 },
        );
      }

      return new Response(done, {
        headers: { 'content-type': 'text/event-stream' },
      });
    },
  });

  await streamText({
    model: anthropic('claude-opus-5-5'),
    providerOptions: { anthropic: { fallbacks: 'default' } },
    prompt: 'Look something up.',
    onError: ({ error }) => {
      streamError = error;
    },
    tools: {
      lookup: tool({
        inputSchema: z.object({ q: z.string() }),
        execute: async () => 'result',
      }),
    },
    stopWhen: stepCountIs(2),
  }).consumeStream({
    onError: error => {
      streamError = error;
    },
  });

  if (
    capturedInvalidReplay &&
    streamError instanceof Error &&
    streamError.message.includes(
      '`thinking` or `redacted_thinking` blocks in the latest assistant message cannot be modified',
    )
  ) {
    console.error(issueSignal);
    process.exitCode = 1;
    return;
  }

  if (streamError != null) {
    throw streamError;
  }

  console.log(
    'Issue #21734 did not reproduce: the fallback boundary survived replay.',
  );
}

await main();
