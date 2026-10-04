import assert from 'node:assert/strict';
import { WorkflowAgent } from '@ai-sdk/workflow';
import { tool, ToolLoopAgent, type ModelMessage } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { z } from 'zod';

const finish = {
  type: 'finish' as const,
  finishReason: { unified: 'stop' as const, raw: 'stop' },
  usage: {
    inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 1, text: 1, reasoning: 0 },
  },
};

const messages: ModelMessage[] = [
  { role: 'user', content: 'Save the file.' },
  {
    role: 'assistant',
    content: [
      {
        type: 'tool-call',
        toolCallId: 'call-save',
        toolName: 'save',
        input: { id: 'file' },
      },
      {
        type: 'tool-approval-request',
        approvalId: 'approval-save',
        toolCallId: 'call-save',
      },
    ],
  },
  {
    role: 'tool',
    content: [
      {
        type: 'tool-approval-response',
        approvalId: 'approval-save',
        approved: false,
        reason: 'Keep the file.',
      },
      {
        type: 'tool-result',
        toolCallId: 'call-save',
        toolName: 'save',
        output: { type: 'execution-denied', reason: 'Keep the file.' },
      },
    ],
  },
];

function createCaptureModel() {
  const calls: Array<{ prompt: ModelMessage[] }> = [];
  const model = new MockLanguageModelV4({
    doStream: async options => {
      calls.push(options);
      return {
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue(finish);
            controller.close();
          },
        }),
      };
    },
  });
  return { calls, model };
}

const saveTool = tool({
  inputSchema: z.object({ id: z.string() }),
  execute: async () => 'saved',
});

function countSaveResults(prompt: ModelMessage[]) {
  let count = 0;
  for (const message of prompt) {
    if (message.role !== 'tool') {
      continue;
    }
    for (const part of message.content) {
      if (part.type === 'tool-result' && part.toolCallId === 'call-save') {
        count++;
      }
    }
  }
  return count;
}

async function inspectToolLoopAgent() {
  const { calls, model } = createCaptureModel();
  let executionCount = 0;
  const agent = new ToolLoopAgent({
    model,
    tools: {
      save: {
        ...saveTool,
        execute: async () => {
          executionCount++;
          return 'saved';
        },
      },
    },
  });

  const result = await agent.stream({ messages });
  await result.responseMessages;
  assert.ok(calls[0], 'ToolLoopAgent did not call the model');

  return {
    executionCount,
    resultCount: countSaveResults(calls[0].prompt),
  };
}

async function inspectWorkflowAgent() {
  const { calls, model } = createCaptureModel();
  let executionCount = 0;
  const agent = new WorkflowAgent({
    model,
    tools: {
      save: {
        ...saveTool,
        execute: async () => {
          executionCount++;
          return 'saved';
        },
      },
    },
  });

  await agent.stream({ messages });
  assert.ok(calls[0], 'WorkflowAgent did not call the model');

  return {
    executionCount,
    resultCount: countSaveResults(calls[0].prompt),
  };
}

async function main() {
  const control = await inspectToolLoopAgent();
  const actual = await inspectWorkflowAgent();

  assert.deepEqual(control, { executionCount: 0, resultCount: 1 });
  assert.equal(actual.executionCount, 0);

  if (actual.resultCount === 2) {
    throw new Error(
      'ISSUE_22012_REPRODUCED: WorkflowAgent sent 2 tool results for call-save; expected exactly 1',
    );
  }
  assert.equal(
    actual.resultCount,
    1,
    'WorkflowAgent should send exactly one persisted denial result',
  );

  console.log({ actual, control });
}

await main();
