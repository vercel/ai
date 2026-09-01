import assert from 'node:assert/strict';
import type { LanguageModelV4FunctionTool } from '@ai-sdk/provider';
import { WorkflowAgent } from '@ai-sdk/workflow';
import {
  ToolLoopAgent,
  dynamicTool,
  stepCountIs,
  tool,
  type ModelMessage,
} from 'ai';
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

function toolCallStream() {
  return convertArrayToReadableStream([
    { type: 'stream-start' as const, warnings: [] },
    {
      type: 'tool-input-start' as const,
      id: 'lookup-call',
      toolName: 'lookup',
    },
    {
      type: 'tool-input-delta' as const,
      id: 'lookup-call',
      delta: '{"query":"audit"}',
    },
    { type: 'tool-input-end' as const, id: 'lookup-call' },
    {
      type: 'tool-call' as const,
      toolCallId: 'lookup-call',
      toolName: 'lookup',
      input: '{"query":"audit"}',
    },
    {
      type: 'tool-call' as const,
      toolCallId: 'dynamic-call',
      toolName: 'dynamicLookup',
      input: '{"query":"dynamic"}',
    },
    {
      type: 'finish' as const,
      finishReason: { unified: 'tool-calls' as const, raw: 'tool-calls' },
      usage,
    },
  ]);
}

function createTools(callbacks: string[]) {
  return {
    lookup: tool({
      title: 'Lookup title',
      metadata: { source: 'audit' },
      strict: true,
      inputSchema: z.object({ query: z.string() }),
      onInputStart: () => {
        callbacks.push('start');
      },
      onInputDelta: () => {
        callbacks.push('delta');
      },
      onInputAvailable: () => {
        callbacks.push('available');
      },
      execute: async () => ({ ok: true }),
    }),
    dynamicLookup: dynamicTool({
      inputSchema: z.object({ query: z.string() }),
      execute: async () => ({ ok: true }),
    }),
  };
}

function findFunctionTool(
  tools: Parameters<MockLanguageModelV4['doStream']>[0]['tools'],
  name: string,
): LanguageModelV4FunctionTool | undefined {
  return tools?.find(
    (tool): tool is LanguageModelV4FunctionTool =>
      tool.type === 'function' && tool.name === name,
  );
}

function findToolCall(parts: Array<Record<string, unknown>>, toolName: string) {
  return parts.find(
    part => part.type === 'tool-call' && part.toolName === toolName,
  );
}

function toolResultNames(prompt: ModelMessage[]): string[] {
  return prompt.flatMap(message => {
    if (message.role !== 'tool') {
      return [];
    }

    return message.content
      .filter(part => part.type === 'tool-result')
      .map(part => part.toolName);
  });
}

function createDeferredTools() {
  return {
    program: tool({
      type: 'provider',
      isProviderExecuted: true,
      id: 'test.program',
      args: {},
      inputSchema: z.object({ code: z.string() }),
      outputSchema: z.object({ status: z.string() }),
      supportsDeferredResults: true,
    }),
    getHours: tool({
      inputSchema: z.object({ member: z.string() }),
      execute: async () => ({ hours: 8 }),
    }),
  };
}

function createDeferredModel() {
  let callCount = 0;

  return new MockLanguageModelV4({
    doStream: async () => {
      callCount++;

      if (callCount === 1) {
        return {
          stream: convertArrayToReadableStream([
            { type: 'stream-start' as const, warnings: [] },
            {
              type: 'tool-call' as const,
              toolCallId: 'program-call',
              toolName: 'program',
              input: '{"code":"getHours()"}',
              providerExecuted: true,
            },
            {
              type: 'tool-call' as const,
              toolCallId: 'get-hours-call',
              toolName: 'getHours',
              input: '{"member":"Ada"}',
            },
            {
              type: 'finish' as const,
              finishReason: {
                unified: 'tool-calls' as const,
                raw: 'tool-calls',
              },
              usage,
            },
          ]),
        };
      }

      return {
        stream: convertArrayToReadableStream([
          { type: 'stream-start' as const, warnings: [] },
          {
            type: 'tool-result' as const,
            toolCallId: 'program-call',
            toolName: 'program',
            result: { status: 'complete' },
            providerExecuted: true,
          },
          { type: 'text-start' as const, id: 'text-1' },
          {
            type: 'text-delta' as const,
            id: 'text-1',
            delta: 'Done',
          },
          { type: 'text-end' as const, id: 'text-1' },
          {
            type: 'finish' as const,
            finishReason: { unified: 'stop' as const, raw: 'stop' },
            usage,
          },
        ]),
      };
    },
  });
}

async function verifyToolLoopAgentControl() {
  const callbacks: string[] = [];
  const model = new MockLanguageModelV4({
    doStream: async () => ({ stream: toolCallStream() }),
  });
  const agent = new ToolLoopAgent({
    model,
    tools: createTools(callbacks),
    stopWhen: stepCountIs(1),
  });

  const result = await agent.stream({ prompt: 'Call both tools.' });
  const parts: Array<Record<string, unknown>> = [];
  for await (const part of result.fullStream) {
    parts.push(part as unknown as Record<string, unknown>);
  }

  assert.equal(
    findFunctionTool(model.doStreamCalls[0]?.tools, 'lookup')?.strict,
    true,
  );
  assert.deepEqual(findToolCall(parts, 'lookup'), {
    type: 'tool-call',
    toolCallId: 'lookup-call',
    toolName: 'lookup',
    input: { query: 'audit' },
    providerExecuted: undefined,
    providerMetadata: undefined,
    toolMetadata: { source: 'audit' },
    title: 'Lookup title',
  });
  assert.equal(findToolCall(parts, 'dynamicLookup')?.dynamic, true);
  assert.deepEqual(callbacks, ['start', 'delta', 'available']);
}

async function verifyDeferredControl() {
  const model = createDeferredModel();
  const agent = new ToolLoopAgent({
    model,
    tools: createDeferredTools(),
    stopWhen: stepCountIs(2),
  });

  const result = await agent.stream({ prompt: 'Get Ada hours.' });
  await result.consumeStream();

  assert.equal(model.doStreamCalls.length, 2);
  assert.deepEqual(
    toolResultNames(model.doStreamCalls[1].prompt as unknown as ModelMessage[]),
    ['getHours'],
  );
}

async function captureWorkflowBehavior() {
  const callbacks: string[] = [];
  const model = new MockLanguageModelV4({
    doStream: async () => ({ stream: toolCallStream() }),
  });
  const parts: Array<Record<string, unknown>> = [];
  const agent = new WorkflowAgent({
    model,
    tools: createTools(callbacks),
    stopWhen: stepCountIs(1),
  });

  await agent.stream({
    prompt: 'Call both tools.',
    writable: new WritableStream({
      write(part) {
        parts.push(part as unknown as Record<string, unknown>);
      },
    }),
  });

  return { callbacks, model, parts };
}

async function captureDeferredWorkflowBehavior() {
  const model = createDeferredModel();
  const agent = new WorkflowAgent({
    model,
    tools: createDeferredTools(),
    stopWhen: stepCountIs(2),
  });

  await agent.stream({ prompt: 'Get Ada hours.' });

  return {
    callCount: model.doStreamCalls.length,
    secondPromptToolResults:
      model.doStreamCalls.length < 2
        ? []
        : toolResultNames(
            model.doStreamCalls[1].prompt as unknown as ModelMessage[],
          ),
  };
}

async function main() {
  await verifyToolLoopAgentControl();
  await verifyDeferredControl();

  const workflow = await captureWorkflowBehavior();
  const deferredWorkflow = await captureDeferredWorkflowBehavior();
  const missing: string[] = [];

  if (
    findFunctionTool(workflow.model.doStreamCalls[0]?.tools, 'lookup')
      ?.strict !== true
  ) {
    missing.push('strict');
  }

  const lookupCall = findToolCall(workflow.parts, 'lookup');
  if (
    lookupCall?.title !== 'Lookup title' ||
    JSON.stringify(lookupCall.toolMetadata) !==
      JSON.stringify({ source: 'audit' })
  ) {
    missing.push('title/metadata');
  }

  if (findToolCall(workflow.parts, 'dynamicLookup')?.dynamic !== true) {
    missing.push("type:'dynamic'");
  }

  if (
    JSON.stringify(workflow.callbacks) !==
    JSON.stringify(['start', 'delta', 'available'])
  ) {
    missing.push('input lifecycle callbacks');
  }

  if (
    deferredWorkflow.callCount !== 2 ||
    deferredWorkflow.secondPromptToolResults.includes('program')
  ) {
    missing.push('supportsDeferredResults');
  }

  if (missing.length > 0) {
    throw new Error(
      `ISSUE #20068 REPRODUCED: WorkflowAgent dropped tool behavior across the workflow step boundary: ${missing.join(', ')}`,
    );
  }

  console.log('Issue #20068 no longer reproduces.');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
