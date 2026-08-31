import type { LanguageModelV4StreamPart } from '@ai-sdk/provider';
import { WorkflowAgent, type ModelCallStreamPart } from '@ai-sdk/workflow';
import { convertArrayToReadableStream, MockLanguageModelV4 } from 'ai/test';
import { z } from 'zod';

const usage = {
  inputTokens: {
    total: 1,
    noCache: 1,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: {
    total: 1,
    text: 1,
    reasoning: undefined,
  },
};

function createWritable(chunks: ModelCallStreamPart[]) {
  return new WritableStream<ModelCallStreamPart>({
    write(chunk) {
      chunks.push(chunk);
    },
  });
}

async function main() {
  let modelCallCount = 0;
  const model = new MockLanguageModelV4({
    doStream: async () => {
      modelCallCount++;

      const streamParts: LanguageModelV4StreamPart[] =
        modelCallCount === 1
          ? [
              {
                type: 'tool-call',
                toolCallId: 'call-1',
                toolName: 'consequentialAction',
                input: JSON.stringify({ value: 'approved' }),
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
                delta: 'Approved action completed.',
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

  const executeMessages: unknown[][] = [];
  const userLifecycleCallbacks: string[] = [];
  const agent = new WorkflowAgent({
    model,
    tools: {
      consequentialAction: {
        inputSchema: z.object({ value: z.string() }),
        needsApproval: true,
        execute: async (_input, options) => {
          executeMessages.push(options.messages);
          return { completed: true };
        },
      },
    },
    onToolExecutionStart: async () => {
      userLifecycleCallbacks.push('constructor-start');
    },
    onToolExecutionEnd: async () => {
      userLifecycleCallbacks.push('constructor-end');
    },
  });

  const firstTurnChunks: ModelCallStreamPart[] = [];
  const firstTurn = await agent.stream({
    messages: [{ role: 'user', content: 'Perform the consequential action.' }],
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
    throw new Error('Reproduction setup failed to produce an approval request');
  }

  await agent.stream({
    messages: [
      { role: 'user', content: 'Perform the consequential action.' },
      {
        role: 'assistant',
        content: [
          pendingToolCall,
          {
            type: 'tool-approval-request',
            approvalId: approvalRequest.approvalId,
            toolCallId: approvalRequest.toolCallId,
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
    onToolExecutionStart: async () => {
      userLifecycleCallbacks.push('stream-start');
    },
    onToolExecutionEnd: async () => {
      userLifecycleCallbacks.push('stream-end');
    },
  });

  const observed = {
    executeMessages,
    userLifecycleCallbacks,
  };
  console.log(JSON.stringify(observed));

  const executionReceivedConversation =
    executeMessages.length === 1 &&
    executeMessages[0].length > 0 &&
    executeMessages[0].some(
      message =>
        typeof message === 'object' &&
        message != null &&
        'role' in message &&
        message.role === 'user',
    );
  const expectedLifecycleCallbacks = [
    'constructor-start',
    'stream-start',
    'constructor-end',
    'stream-end',
  ];
  const callbacksMatchedOrdinaryExecution =
    userLifecycleCallbacks.length === expectedLifecycleCallbacks.length &&
    expectedLifecycleCallbacks.every(
      (event, index) => userLifecycleCallbacks[index] === event,
    );

  if (!executionReceivedConversation || !callbacksMatchedOrdinaryExecution) {
    throw new Error(
      'ISSUE_20071_REPRODUCED: approved tool execution parity failed (messages/callbacks)',
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
