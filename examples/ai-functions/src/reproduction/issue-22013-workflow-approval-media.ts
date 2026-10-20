import assert from 'node:assert/strict';
import { WorkflowAgent } from '@ai-sdk/workflow';
import { ToolLoopAgent, tool } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { z } from 'zod';

const finish = (reason: 'stop' = 'stop') => ({
  type: 'finish' as const,
  finishReason: { unified: reason, raw: reason },
  usage: {
    inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 1, text: 1, reasoning: 0 },
  },
});

function captureModel() {
  const calls: unknown[] = [];
  const model = new MockLanguageModelV4({
    doStream: async options => {
      calls.push(options);
      return {
        warnings: [],
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue(finish());
            controller.close();
          },
        }),
      };
    },
  });
  return { model, calls };
}

type AgentConstructor = typeof WorkflowAgent | typeof ToolLoopAgent;

async function inspect(Agent: AgentConstructor, approved: boolean) {
  const { model, calls } = captureModel();
  let executionCount = 0;
  let errorName: string | undefined;
  const agentOptions = {
    model,
    tools: {
      save: tool({
        inputSchema: z.object({ id: z.string() }),
        needsApproval: true,
        execute: async () => {
          executionCount++;
          return { saved: true };
        },
      }),
    },
  };
  const messages = [
    { role: 'user' as const, content: 'Save the file.' },
    {
      role: 'assistant' as const,
      content: [
        {
          type: 'tool-call' as const,
          toolCallId: 'call-save',
          toolName: 'save',
          input: { id: 'file' },
        },
        {
          type: 'tool-approval-request' as const,
          approvalId: 'approval-save',
          toolCallId: 'call-save',
        },
        {
          type: 'tool-call' as const,
          toolCallId: 'call-preview',
          toolName: 'view',
          input: {},
        },
      ],
    },
    {
      role: 'tool' as const,
      content: [
        {
          type: 'tool-result' as const,
          toolCallId: 'call-preview',
          toolName: 'view',
          output: { type: 'json' as const, value: { viewed: true } },
        },
      ],
    },
    {
      role: 'user' as const,
      content: [
        {
          type: 'file' as const,
          data: new Uint8Array([137, 80, 78, 71]),
          mediaType: 'image/png',
        },
      ],
    },
    {
      role: 'tool' as const,
      content: [
        {
          type: 'tool-approval-response' as const,
          approvalId: 'approval-save',
          approved,
          reason: 'Keep the file.',
        },
      ],
    },
  ];

  try {
    if (Agent === ToolLoopAgent) {
      const result = await new ToolLoopAgent(agentOptions).stream({ messages });
      for await (const part of result.fullStream) {
        if (part.type === 'error') {
          errorName = (part.error as { name?: string } | undefined)?.name;
        }
      }
      await result.responseMessages;
    } else {
      await new WorkflowAgent(agentOptions).stream({ messages });
    }
  } catch (error) {
    errorName = (error as { name?: string }).name;
  }

  return {
    modelCallCount: calls.length,
    executionCount,
    errorName,
  };
}

async function main() {
  const observations = [];
  for (const approved of [true, false]) {
    observations.push({
      approved,
      actual: await inspect(WorkflowAgent, approved),
      control: await inspect(ToolLoopAgent, approved),
    });
  }

  console.log(JSON.stringify(observations, null, 2));

  for (const { approved, actual, control } of observations) {
    assert.equal(
      control.modelCallCount,
      1,
      `ToolLoopAgent ${approved ? 'approved' : 'denied'} control did not reach the model`,
    );
    assert.equal(
      control.executionCount,
      approved ? 1 : 0,
      `ToolLoopAgent ${approved ? 'approved' : 'denied'} control executed the tool an unexpected number of times`,
    );
    assert.equal(
      control.errorName,
      undefined,
      `ToolLoopAgent ${approved ? 'approved' : 'denied'} control failed`,
    );
    assert.equal(
      actual.executionCount,
      approved ? 1 : 0,
      `WorkflowAgent ${approved ? 'approved' : 'denied'} variant executed the tool an unexpected number of times`,
    );
  }

  const issueReproduced = observations.every(
    ({ actual }) =>
      actual.modelCallCount === 0 &&
      actual.errorName === 'AI_MissingToolResultsError',
  );

  if (issueReproduced) {
    throw new Error(
      'ISSUE_22013_REPRODUCED: WorkflowAgent rejected both approval resumes before the next model call with AI_MissingToolResultsError',
    );
  }

  for (const { approved, actual } of observations) {
    assert.equal(
      actual.modelCallCount,
      1,
      `WorkflowAgent ${approved ? 'approved' : 'denied'} variant did not reach the next model call`,
    );
    assert.equal(
      actual.errorName,
      undefined,
      `WorkflowAgent ${approved ? 'approved' : 'denied'} variant failed`,
    );
  }
}

await main();
