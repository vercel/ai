import type { LanguageModelV4StreamPart } from '@ai-sdk/provider';
import { WorkflowAgent, type ModelCallStreamPart } from '@ai-sdk/workflow';
import { convertArrayToReadableStream, MockLanguageModelV4 } from 'ai/test';
import { z } from 'zod';
import { run } from '../../lib/run';

const usage = {
  inputTokens: {
    total: 5,
    noCache: 5,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: {
    total: 5,
    text: 5,
    reasoning: undefined,
  },
};

let modelCallCount = 0;
const model = new MockLanguageModelV4({
  doStream: async () => {
    modelCallCount++;

    const streamParts: LanguageModelV4StreamPart[] =
      modelCallCount === 1
        ? [
            {
              type: 'tool-call',
              toolCallId: 'call-book-flight',
              toolName: 'bookFlight',
              input: JSON.stringify({ flightId: 'FL-123' }),
            },
            {
              type: 'finish',
              finishReason: { unified: 'tool-calls', raw: 'tool-calls' },
              usage,
            },
          ]
        : [
            { type: 'text-start', id: 'text-1' },
            {
              type: 'text-delta',
              id: 'text-1',
              delta: 'Flight FL-123 was booked.',
            },
            { type: 'text-end', id: 'text-1' },
            {
              type: 'finish',
              finishReason: { unified: 'stop', raw: 'stop' },
              usage,
            },
          ];

    return { stream: convertArrayToReadableStream(streamParts) };
  },
});

function createWritable(chunks: ModelCallStreamPart[]) {
  return new WritableStream<ModelCallStreamPart>({
    write(chunk) {
      chunks.push(chunk);
    },
  });
}

run(async () => {
  // In production, load the same high-entropy secret from server-side secret
  // storage on every worker that can issue or resume an approval.
  process.env.TOOL_APPROVAL_SECRET ??= Buffer.from(
    crypto.getRandomValues(new Uint8Array(32)),
  ).toString('base64');
  const agent = new WorkflowAgent({
    model,
    experimental_toolApprovalSecret: {
      environmentVariable: 'TOOL_APPROVAL_SECRET',
    },
    tools: {
      bookFlight: {
        inputSchema: z.object({ flightId: z.string() }),
        needsApproval: true,
        execute: async ({ flightId }) => ({ flightId, status: 'booked' }),
      },
    },
  });

  const firstTurnChunks: ModelCallStreamPart[] = [];
  const firstTurn = await agent.stream({
    messages: [{ role: 'user', content: 'Book flight FL-123.' }],
    writable: createWritable(firstTurnChunks),
  });
  const pendingToolCall = firstTurn.toolCalls[0];
  const approvalRequest = firstTurnChunks.find(
    part => part.type === 'tool-approval-request',
  );

  if (
    pendingToolCall == null ||
    approvalRequest == null ||
    !('toolCallId' in approvalRequest)
  ) {
    throw new Error('Expected a signed tool approval request');
  }

  console.log('signed approval:', approvalRequest.signature != null);

  const resumed = await agent.stream({
    messages: [
      { role: 'user', content: 'Book flight FL-123.' },
      {
        role: 'assistant',
        content: [
          pendingToolCall,
          {
            type: 'tool-approval-request',
            approvalId: approvalRequest.approvalId,
            toolCallId: approvalRequest.toolCallId,
            signature: approvalRequest.signature,
          },
        ],
      },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-approval-response',
            approvalId: approvalRequest.approvalId,
            approved: true,
          },
        ],
      },
    ],
    writable: createWritable([]),
  });

  console.log(resumed.steps.at(-1)?.text);
});
