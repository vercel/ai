import type { LanguageModelV4StreamPart } from '@ai-sdk/provider';
import { ToolLoopAgent, tool, type ToolSet } from 'ai';
import { MockLanguageModelV4, convertArrayToReadableStream } from 'ai/test';
import { describe, expect, it } from 'vitest';
import { z } from 'zod/v4';
import { WorkflowAgent } from './workflow-agent.js';

const prompt = 'What is the weather in London?';

type ToolInputCallbackCall = {
  hook: 'onInputStart' | 'onInputDelta' | 'onInputAvailable';
  input?: unknown;
};

function finishPart(
  finishReason: 'tool-calls' | 'stop',
): LanguageModelV4StreamPart {
  return {
    type: 'finish',
    finishReason: { unified: finishReason, raw: finishReason },
    usage: {
      inputTokens: {
        total: 3,
        noCache: 2,
        cacheRead: 1,
        cacheWrite: undefined,
      },
      outputTokens: { total: 2, text: 2, reasoning: undefined },
    },
  };
}

function textTurn(text: string): LanguageModelV4StreamPart[] {
  return [
    { type: 'stream-start', warnings: [] },
    { type: 'text-start', id: 'text-1' },
    { type: 'text-delta', id: 'text-1', delta: text },
    { type: 'text-end', id: 'text-1' },
    finishPart('stop'),
  ];
}

function toolCallTurn(
  ...parts: LanguageModelV4StreamPart[]
): LanguageModelV4StreamPart[] {
  return [
    { type: 'stream-start', warnings: [] },
    ...parts,
    finishPart('tool-calls'),
  ];
}

function createStreamModel(turns: LanguageModelV4StreamPart[][]) {
  return new MockLanguageModelV4({
    doStream: turns.map(parts => ({
      stream: convertArrayToReadableStream(parts),
    })),
  });
}

function weatherTools(calls: ToolInputCallbackCall[]): ToolSet {
  return {
    weather: tool({
      inputSchema: z.object({ city: z.string() }),
      execute: async () => ({ temperature: 18 }),
      onInputStart: () => {
        calls.push({ hook: 'onInputStart' });
      },
      onInputDelta: () => {
        calls.push({ hook: 'onInputDelta' });
      },
      onInputAvailable: ({ input }) => {
        calls.push({ hook: 'onInputAvailable', input });
      },
    }),
  };
}

async function runBoth(
  turns: LanguageModelV4StreamPart[][],
  createTools: (calls: ToolInputCallbackCall[]) => ToolSet = weatherTools,
) {
  const coreCalls: ToolInputCallbackCall[] = [];
  const workflowCalls: ToolInputCallbackCall[] = [];

  const core = await new ToolLoopAgent({
    model: createStreamModel(turns),
    tools: createTools(coreCalls),
  }).stream({ prompt });
  await core.consumeStream();

  await new WorkflowAgent({
    model: createStreamModel(turns),
    tools: createTools(workflowCalls),
  }).stream({ prompt });

  return { coreCalls, workflowCalls };
}

describe('WorkflowAgent tool input callbacks in stream()', () => {
  it('calls onInputAvailable when the tool call arrives without streamed input', async () => {
    const { coreCalls, workflowCalls } = await runBoth([
      toolCallTurn({
        type: 'tool-call',
        toolCallId: 'weather-call',
        toolName: 'weather',
        input: '{"city":"London"}',
      }),
      textTurn('It is 18°C.'),
    ]);

    expect(coreCalls).toEqual([
      { hook: 'onInputAvailable', input: { city: 'London' } },
    ]);
    expect(workflowCalls).toEqual(coreCalls);
  });

  it('calls every tool input callback once when the input is streamed', async () => {
    const { coreCalls, workflowCalls } = await runBoth([
      toolCallTurn(
        { type: 'tool-input-start', id: 'weather-call', toolName: 'weather' },
        { type: 'tool-input-delta', id: 'weather-call', delta: '{"city":' },
        { type: 'tool-input-delta', id: 'weather-call', delta: '"London"}' },
        { type: 'tool-input-end', id: 'weather-call' },
        {
          type: 'tool-call',
          toolCallId: 'weather-call',
          toolName: 'weather',
          input: '{"city":"London"}',
        },
      ),
      textTurn('It is 18°C.'),
    ]);

    expect(coreCalls).toEqual([
      { hook: 'onInputStart' },
      { hook: 'onInputDelta' },
      { hook: 'onInputDelta' },
      { hook: 'onInputAvailable', input: { city: 'London' } },
    ]);
    expect(workflowCalls).toEqual(coreCalls);
  });

  it('calls onInputAvailable for each of several tool calls without streamed input', async () => {
    const { coreCalls, workflowCalls } = await runBoth([
      toolCallTurn(
        {
          type: 'tool-call',
          toolCallId: 'weather-1',
          toolName: 'weather',
          input: '{"city":"London"}',
        },
        {
          type: 'tool-call',
          toolCallId: 'weather-2',
          toolName: 'weather',
          input: '{"city":"Paris"}',
        },
      ),
      textTurn('It is 18°C in London and 21°C in Paris.'),
    ]);

    expect(coreCalls).toEqual([
      { hook: 'onInputAvailable', input: { city: 'London' } },
      { hook: 'onInputAvailable', input: { city: 'Paris' } },
    ]);
    expect(workflowCalls).toEqual(coreCalls);
  });

  it('skips onInputAvailable when the input does not match the schema', async () => {
    const { coreCalls, workflowCalls } = await runBoth([
      toolCallTurn({
        type: 'tool-call',
        toolCallId: 'weather-call',
        toolName: 'weather',
        input: '{"city":42}',
      }),
      textTurn('I could not look that up.'),
    ]);

    expect(coreCalls).toEqual([]);
    expect(workflowCalls).toEqual(coreCalls);
  });

  it('skips onInputAvailable for a tool call to an unknown tool', async () => {
    const { coreCalls, workflowCalls } = await runBoth([
      toolCallTurn({
        type: 'tool-call',
        toolCallId: 'unknown-call',
        toolName: 'missing',
        input: '{"city":"London"}',
      }),
      textTurn('I could not look that up.'),
    ]);

    expect(coreCalls).toEqual([]);
    expect(workflowCalls).toEqual(coreCalls);
  });

  it('calls onInputAvailable for a provider-executed tool call', async () => {
    const { coreCalls, workflowCalls } = await runBoth([
      toolCallTurn(
        {
          type: 'tool-call',
          toolCallId: 'weather-call',
          toolName: 'weather',
          input: '{"city":"London"}',
          providerExecuted: true,
        },
        {
          type: 'tool-result',
          toolCallId: 'weather-call',
          toolName: 'weather',
          result: { temperature: 18 },
        },
      ),
      textTurn('It is 18°C.'),
    ]);

    expect(coreCalls).toEqual([
      { hook: 'onInputAvailable', input: { city: 'London' } },
    ]);
    expect(workflowCalls).toEqual(coreCalls);
  });
});
