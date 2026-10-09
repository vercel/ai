import type { LanguageModelV4StreamPart } from '@ai-sdk/provider';
import { tool } from 'ai';
import { MockLanguageModelV4, convertArrayToReadableStream } from 'ai/test';
import { describe, expect, it } from 'vitest';
import { z } from 'zod/v4';
import type { ModelCallStreamPart } from './do-stream-step.js';
import { WorkflowAgent } from './workflow-agent.js';

const usage = {
  inputTokens: {
    total: 1,
    noCache: 1,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};

function finish(reason: 'stop' | 'tool-calls'): LanguageModelV4StreamPart {
  return {
    type: 'finish',
    finishReason: { unified: reason, raw: reason },
    usage,
  };
}

function createScriptedModel(streams: LanguageModelV4StreamPart[][]) {
  const prompts: unknown[][] = [];
  let call = 0;
  const model = new MockLanguageModelV4({
    doStream: async ({ prompt }) => {
      prompts.push(prompt);
      return {
        stream: convertArrayToReadableStream(
          streams[Math.min(call++, streams.length - 1)],
        ),
      };
    },
  });

  return { model, prompts };
}

function toolMessageOutputs(messages: unknown[]) {
  return (
    messages as Array<{
      role: string;
      content: Array<{ output?: { value?: unknown } }>;
    }>
  )
    .filter(message => message.role === 'tool')
    .flatMap(message => message.content)
    .map(part => part.output?.value);
}

function duplicateToolCallStream(): LanguageModelV4StreamPart[] {
  return [
    { type: 'stream-start', warnings: [] },
    {
      type: 'tool-call',
      toolCallId: 'call_0',
      toolName: 'lookup',
      input: '{"q":"a"}',
    },
    {
      type: 'tool-call',
      toolCallId: 'call_0',
      toolName: 'lookup',
      input: '{"q":"b"}',
    },
    finish('tool-calls'),
  ];
}

const done: LanguageModelV4StreamPart[] = [
  { type: 'stream-start', warnings: [] },
  finish('stop'),
];

describe('WorkflowAgent duplicate tool call IDs', () => {
  it('preserves each tool result across result surfaces', async () => {
    const { model, prompts } = createScriptedModel([
      duplicateToolCallStream(),
      done,
    ]);
    const writtenParts: ModelCallStreamPart[] = [];

    const result = await new WorkflowAgent({
      model,
      tools: {
        lookup: tool({
          inputSchema: z.object({ q: z.string() }),
          execute: async ({ q }) => `result for ${q}`,
        }),
      },
    }).stream({
      prompt: 'go',
      writable: new WritableStream<ModelCallStreamPart>({
        write(part) {
          writtenParts.push(part);
        },
      }),
    });

    const expectedOutputs = ['result for a', 'result for b'];
    expect(toolMessageOutputs(prompts[1])).toEqual(expectedOutputs);
    expect(result.steps[0].toolResults).toMatchObject([
      {
        toolCallId: 'call_0',
        input: { q: 'a' },
        output: 'result for a',
      },
      {
        toolCallId: 'call_0',
        input: { q: 'b' },
        output: 'result for b',
      },
    ]);
    expect(
      writtenParts
        .filter(part => part.type === 'tool-result')
        .map(part => ({ input: part.input, output: part.output })),
    ).toEqual([
      { input: { q: 'a' }, output: 'result for a' },
      { input: { q: 'b' }, output: 'result for b' },
    ]);
    expect(toolMessageOutputs(result.messages)).toEqual(expectedOutputs);
  });

  it('keeps call order when the second duplicate finishes first with an error', async () => {
    const { model, prompts } = createScriptedModel([
      duplicateToolCallStream(),
      done,
    ]);
    const completionOrder: string[] = [];
    let releaseFirst!: () => void;
    const firstCanFinish = new Promise<void>(resolve => {
      releaseFirst = resolve;
    });
    const writtenParts: ModelCallStreamPart[] = [];

    const result = await new WorkflowAgent({
      model,
      tools: {
        lookup: tool({
          inputSchema: z.object({ q: z.string() }),
          execute: async ({ q }) => {
            if (q === 'a') {
              await firstCanFinish;
              completionOrder.push(q);
              return `result for ${q}`;
            }

            completionOrder.push(q);
            releaseFirst();
            throw new Error(`failed for ${q}`);
          },
        }),
      },
    }).stream({
      prompt: 'go',
      writable: new WritableStream<ModelCallStreamPart>({
        write(part) {
          writtenParts.push(part);
        },
      }),
    });

    expect(completionOrder).toEqual(['b', 'a']);
    expect(toolMessageOutputs(prompts[1])).toEqual([
      'result for a',
      'Error: failed for b',
    ]);
    expect(result.steps[0].content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'tool-result',
          input: { q: 'a' },
          output: 'result for a',
        }),
        expect.objectContaining({
          type: 'tool-error',
          input: { q: 'b' },
          error: 'Error: failed for b',
        }),
      ]),
    );
    expect(
      writtenParts
        .filter(
          part => part.type === 'tool-result' || part.type === 'tool-error',
        )
        .map(part =>
          part.type === 'tool-result'
            ? { input: part.input, output: part.output }
            : { input: part.input, error: part.error },
        ),
    ).toEqual([
      { input: { q: 'a' }, output: 'result for a' },
      { input: { q: 'b' }, error: 'Error: failed for b' },
    ]);
    expect(toolMessageOutputs(result.messages)).toEqual([
      'result for a',
      'Error: failed for b',
    ]);
  });

  it('preserves duplicate provider-executed results and errors', async () => {
    const { model } = createScriptedModel([
      [
        { type: 'stream-start', warnings: [] },
        {
          type: 'tool-call',
          toolCallId: 'call_0',
          toolName: 'lookup',
          input: '{"q":"a"}',
          providerExecuted: true,
        },
        {
          type: 'tool-call',
          toolCallId: 'call_0',
          toolName: 'lookup',
          input: '{"q":"b"}',
          providerExecuted: true,
        },
        {
          type: 'tool-result',
          toolCallId: 'call_0',
          toolName: 'lookup',
          result: 'provider result for a',
        },
        {
          type: 'tool-result',
          toolCallId: 'call_0',
          toolName: 'lookup',
          result: 'provider failed for b',
          isError: true,
        },
        finish('tool-calls'),
      ],
    ]);
    const writtenParts: ModelCallStreamPart[] = [];

    const result = await new WorkflowAgent({
      model,
      tools: {
        lookup: tool({
          inputSchema: z.object({ q: z.string() }),
        }),
      },
    }).stream({
      prompt: 'go',
      writable: new WritableStream<ModelCallStreamPart>({
        write(part) {
          writtenParts.push(part);
        },
      }),
    });

    expect(
      result.steps[0].content
        .filter(
          part => part.type === 'tool-result' || part.type === 'tool-error',
        )
        .map(part =>
          part.type === 'tool-result'
            ? { input: part.input, output: part.output }
            : { input: part.input, error: part.error },
        ),
    ).toEqual([
      { input: { q: 'a' }, output: 'provider result for a' },
      { input: { q: 'b' }, error: 'provider failed for b' },
    ]);
    expect(
      writtenParts
        .filter(
          part => part.type === 'tool-result' || part.type === 'tool-error',
        )
        .map(part =>
          part.type === 'tool-result'
            ? part.output
            : part.error instanceof Error
              ? part.error.message
              : part.error,
        ),
    ).toEqual([
      'provider result for a',
      'provider failed for b',
      'provider result for a',
      'provider failed for b',
    ]);
    expect(
      result.messages.flatMap(message =>
        message.role === 'assistant' && Array.isArray(message.content)
          ? message.content.flatMap(part =>
              part.type === 'tool-result' && 'value' in part.output
                ? [part.output.value]
                : [],
            )
          : [],
      ),
    ).toEqual(['provider result for a', 'provider failed for b']);
  });

  it('retains metadata when a valid call follows an invalid call', async () => {
    const { model } = createScriptedModel([
      [
        { type: 'stream-start', warnings: [] },
        {
          type: 'tool-call',
          toolCallId: 'invalid',
          toolName: 'lookup',
          input: '{"wrong":true}',
        },
        {
          type: 'tool-call',
          toolCallId: 'valid',
          toolName: 'lookup',
          input: '{"q":"valid"}',
        },
        finish('tool-calls'),
      ],
      done,
    ]);

    const result = await new WorkflowAgent({
      model,
      tools: {
        lookup: tool({
          inputSchema: z.object({ q: z.string() }),
          execute: async ({ q }) => `result for ${q}`,
        }),
      },
    }).stream({ prompt: 'go' });

    expect(result.steps[0].toolResults).toMatchObject([
      {
        toolCallId: 'valid',
        input: { q: 'valid' },
        output: 'result for valid',
      },
    ]);
  });
});
