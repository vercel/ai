import type { LanguageModelV4StreamPart } from '@ai-sdk/provider';
import {
  NoOutputGeneratedError,
  Output,
  ToolLoopAgent,
  tool,
  type ToolSet,
} from 'ai';
import { convertArrayToReadableStream, MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod/v4';
import { WorkflowAgent } from './workflow-agent.js';

const usage = {
  inputTokens: {
    total: 3,
    noCache: 3,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: {
    total: 4,
    text: 4,
    reasoning: undefined,
  },
};

function stream(parts: LanguageModelV4StreamPart[]) {
  return {
    stream: convertArrayToReadableStream([
      { type: 'stream-start' as const, warnings: [] },
      ...parts,
    ]),
  };
}

describe('WorkflowAgent.generate', () => {
  it('requires exactly one of prompt or messages at runtime', async () => {
    const agent = new WorkflowAgent({ model: new MockLanguageModelV4() });

    await expect(
      agent.generate({} as Parameters<typeof agent.generate>[0]),
    ).rejects.toThrow('prompt or messages must be defined');
    await expect(
      agent.generate({
        prompt: 'hello',
        messages: [{ role: 'user', content: 'hello' }],
      } as unknown as Parameters<typeof agent.generate>[0]),
    ).rejects.toThrow('prompt and messages cannot be defined at the same time');
  });

  it('returns a GenerateTextResult-compatible text result', async () => {
    const agent = new WorkflowAgent({
      model: new MockLanguageModelV4({
        doStream: async () =>
          stream([
            {
              type: 'response-metadata',
              id: 'response-id',
              modelId: 'mock-model',
              timestamp: new Date(0),
            },
            { type: 'text-start', id: 'text-1' },
            { type: 'text-delta', id: 'text-1', delta: 'durable hello' },
            { type: 'text-end', id: 'text-1' },
            {
              type: 'finish',
              finishReason: { unified: 'stop', raw: 'stop' },
              usage,
              providerMetadata: { test: { traceId: 'trace-1' } },
            },
          ]),
      }),
    });

    const result = await agent.generate({ prompt: 'Say hello.' });

    expect(result.text).toBe('durable hello');
    expect(result.content).toEqual([{ type: 'text', text: 'durable hello' }]);
    expect(result.finishReason).toBe('stop');
    expect(result.rawFinishReason).toBe('stop');
    expect(result.usage).toEqual({
      inputTokens: 3,
      outputTokens: 4,
      totalTokens: 7,
    });
    expect(result.totalUsage).toEqual(result.usage);
    expect(result.warnings).toEqual([]);
    expect(result.finalStep).toBe(result.steps[0]);
    expect(result.response.id).toBe('response-id');
    expect(result.responseMessages).toEqual(result.finalStep.response.messages);
    expect(result.messages.at(-1)?.role).toBe('assistant');
    expect((result as { output: unknown }).output).toBe('durable hello');
  });

  it('aggregates tool calls and results across durable steps', async () => {
    let streamCallCount = 0;
    let generateCallCount = 0;
    const tools = {
      lookup: tool({
        inputSchema: z.object({ query: z.string() }),
        execute: async ({ query }) => ({ answer: `${query}-result` }),
      }),
    };
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        if (generateCallCount++ === 0) {
          return {
            content: [
              {
                type: 'tool-call',
                toolCallType: 'function',
                toolCallId: 'tool-call-1',
                toolName: 'lookup',
                input: '{"query":"weather"}',
              },
            ],
            finishReason: { unified: 'tool-calls', raw: 'tool-calls' },
            usage,
            warnings: [],
          };
        }

        return {
          content: [{ type: 'text', text: 'sunny' }],
          finishReason: { unified: 'stop', raw: 'stop' },
          usage,
          warnings: [],
        };
      },
      doStream: async () => {
        if (streamCallCount++ === 0) {
          return stream([
            {
              type: 'tool-call',
              toolCallId: 'tool-call-1',
              toolName: 'lookup',
              input: '{"query":"weather"}',
            },
            {
              type: 'finish',
              finishReason: { unified: 'tool-calls', raw: 'tool-calls' },
              usage,
            },
          ]);
        }

        return stream([
          { type: 'text-start', id: 'text-1' },
          { type: 'text-delta', id: 'text-1', delta: 'sunny' },
          { type: 'text-end', id: 'text-1' },
          {
            type: 'finish',
            finishReason: { unified: 'stop', raw: 'stop' },
            usage,
          },
        ]);
      },
    });
    const agent = new WorkflowAgent({
      model,
      tools,
    });
    const toolLoopAgent = new ToolLoopAgent({
      model,
      tools,
    });

    const result = await agent.generate({ prompt: 'Check the weather.' });
    const toolLoopResult = await toolLoopAgent.generate({
      prompt: 'Check the weather.',
    });

    expect(result.steps).toHaveLength(2);
    expect(result.toolCalls).toEqual([
      expect.objectContaining({
        toolCallId: 'tool-call-1',
        toolName: 'lookup',
        input: { query: 'weather' },
      }),
    ]);
    expect(result.toolResults).toEqual([
      expect.objectContaining({
        toolCallId: 'tool-call-1',
        toolName: 'lookup',
        output: { answer: 'weather-result' },
      }),
    ]);
    expect(result.text).toBe('sunny');
    expect(result.responseMessages.map(message => message.role)).toEqual([
      'assistant',
      'tool',
      'assistant',
    ]);
    expect(result.steps[0]?.response.messages).toEqual(
      result.responseMessages.slice(0, 2),
    );
    expect(result.usage).toEqual({
      inputTokens: 6,
      outputTokens: 8,
      totalTokens: 14,
    });
    const summarizeResult = (value: typeof result | typeof toolLoopResult) => ({
      text: value.text,
      finishReason: value.finishReason,
      usage: {
        inputTokens: value.usage.inputTokens,
        outputTokens: value.usage.outputTokens,
        totalTokens: value.usage.totalTokens,
      },
      toolCalls: value.toolCalls.map(({ toolCallId, toolName, input }) => ({
        toolCallId,
        toolName,
        input,
      })),
      toolResults: value.toolResults.map(
        ({ toolCallId, toolName, input, output }) => ({
          toolCallId,
          toolName,
          input,
          output,
        }),
      ),
      responseMessages: value.responseMessages,
    });
    expect(summarizeResult(result)).toEqual(summarizeResult(toolLoopResult));
  });

  it('reuses custom tool model output for durable continuation and response messages', async () => {
    let streamCallCount = 0;
    let generateCallCount = 0;
    let workflowContinuationOutput: unknown;
    const createTools = () => {
      let called = false;
      const toModelOutput = vi.fn(
        async ({ output }: { output: { answer: string } }) => {
          if (called) {
            throw new Error('toModelOutput called more than once');
          }
          called = true;
          return {
            type: 'text' as const,
            value: `model sees ${output.answer}`,
          };
        },
      );
      return {
        tools: {
          lookup: {
            inputSchema: z.object({ query: z.string() }),
            execute: async ({ query }: { query: string }) => ({
              answer: `${query}-result`,
            }),
            toModelOutput,
          },
        } satisfies ToolSet,
        toModelOutput,
      };
    };
    const workflowTools = createTools();
    const toolLoopTools = createTools();
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        if (generateCallCount++ === 0) {
          return {
            content: [
              {
                type: 'tool-call',
                toolCallType: 'function',
                toolCallId: 'tool-call-1',
                toolName: 'lookup',
                input: '{"query":"weather"}',
              },
            ],
            finishReason: { unified: 'tool-calls', raw: 'tool-calls' },
            usage,
            warnings: [],
          };
        }

        return {
          content: [{ type: 'text', text: 'sunny' }],
          finishReason: { unified: 'stop', raw: 'stop' },
          usage,
          warnings: [],
        };
      },
      doStream: async ({ prompt }) => {
        if (streamCallCount++ === 0) {
          return stream([
            {
              type: 'tool-call',
              toolCallId: 'tool-call-1',
              toolName: 'lookup',
              input: '{"query":"weather"}',
            },
            {
              type: 'finish',
              finishReason: { unified: 'tool-calls', raw: 'tool-calls' },
              usage,
            },
          ]);
        }

        workflowContinuationOutput = (
          prompt.at(-1) as {
            role: 'tool';
            content: Array<{ output: unknown }>;
          }
        ).content[0]?.output;

        return stream([
          { type: 'text-start', id: 'text-1' },
          { type: 'text-delta', id: 'text-1', delta: 'sunny' },
          { type: 'text-end', id: 'text-1' },
          {
            type: 'finish',
            finishReason: { unified: 'stop', raw: 'stop' },
            usage,
          },
        ]);
      },
    });
    const workflowAgent = new WorkflowAgent({
      model,
      tools: workflowTools.tools,
    });
    const toolLoopAgent = new ToolLoopAgent({
      model,
      tools: toolLoopTools.tools,
    });

    const workflowResult = await workflowAgent.generate({
      prompt: 'Check the weather.',
    });
    const toolLoopResult = await toolLoopAgent.generate({
      prompt: 'Check the weather.',
    });

    expect(workflowTools.toModelOutput).toHaveBeenCalledTimes(1);
    expect(toolLoopTools.toModelOutput).toHaveBeenCalledTimes(1);
    expect(workflowContinuationOutput).toEqual({
      type: 'text',
      value: 'model sees weather-result',
    });
    expect(workflowResult.responseMessages).toEqual(
      toolLoopResult.responseMessages,
    );
  });

  it('includes pre-step approval results in responseMessages like ToolLoopAgent', async () => {
    const tools = {
      lookup: tool({
        inputSchema: z.object({ query: z.string() }),
        needsApproval: true,
        execute: async ({ query }) => ({ answer: `${query}-result` }),
      }),
    };
    const model = new MockLanguageModelV4({
      doGenerate: async () => ({
        content: [{ type: 'text', text: 'approved result' }],
        finishReason: { unified: 'stop', raw: 'stop' },
        usage,
        warnings: [],
      }),
      doStream: async () =>
        stream([
          { type: 'text-start', id: 'text-1' },
          { type: 'text-delta', id: 'text-1', delta: 'approved result' },
          { type: 'text-end', id: 'text-1' },
          {
            type: 'finish',
            finishReason: { unified: 'stop', raw: 'stop' },
            usage,
          },
        ]),
    });
    const messages = [
      { role: 'user', content: 'Look it up.' },
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'tool-call-1',
            toolName: 'lookup',
            input: { query: 'weather' },
          },
          {
            type: 'tool-approval-request',
            approvalId: 'approval-tool-call-1',
            toolCallId: 'tool-call-1',
          },
        ],
      },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-approval-response',
            approvalId: 'approval-tool-call-1',
            approved: true,
          },
        ],
      },
    ] as const;
    const workflowAgent = new WorkflowAgent({ model, tools });
    const toolLoopAgent = new ToolLoopAgent({ model, tools });

    const workflowResult = await workflowAgent.generate({
      messages: messages as any,
    });
    const toolLoopResult = await toolLoopAgent.generate({
      messages: messages as any,
    });

    expect(workflowResult.responseMessages).toEqual(
      toolLoopResult.responseMessages,
    );
    expect(
      workflowResult.responseMessages.map(message => message.role),
    ).toEqual(['tool', 'assistant']);
    expect(workflowResult.responseMessages[0]).toMatchObject({
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolCallId: 'tool-call-1',
          toolName: 'lookup',
        },
      ],
    });
  });

  it('preserves stream object output behavior for empty stop responses', async () => {
    const agent = new WorkflowAgent({
      model: new MockLanguageModelV4({
        doStream: async () =>
          stream([
            {
              type: 'finish',
              finishReason: { unified: 'stop', raw: 'stop' },
              usage,
            },
          ]),
      }),
      output: Output.object({
        schema: z.object({ answer: z.string() }),
      }),
    });

    const result = await agent.stream({ prompt: 'Answer.' });

    expect(result.output).toBeUndefined();
  });

  it('preserves stream text output behavior for empty stop responses', async () => {
    const agent = new WorkflowAgent({
      model: new MockLanguageModelV4({
        doStream: async () =>
          stream([
            {
              type: 'finish',
              finishReason: { unified: 'stop', raw: 'stop' },
              usage,
            },
          ]),
      }),
      output: Output.text(),
    });

    const result = await agent.stream({ prompt: 'Answer.' });

    expect(result.output).toBeUndefined();
  });

  it('returns typed structured output', async () => {
    const agent = new WorkflowAgent({
      model: new MockLanguageModelV4({
        doStream: async () =>
          stream([
            { type: 'text-start', id: 'text-1' },
            {
              type: 'text-delta',
              id: 'text-1',
              delta: '{"answer":"durable"}',
            },
            { type: 'text-end', id: 'text-1' },
            {
              type: 'finish',
              finishReason: { unified: 'stop', raw: 'stop' },
              usage,
            },
          ]),
      }),
      output: Output.object({
        schema: z.object({ answer: z.string() }),
      }),
    });

    const result = await agent.generate({ prompt: 'Answer.' });

    expect(result.output).toEqual({ answer: 'durable' });
  });

  it('throws when structured output is unavailable', async () => {
    const agent = new WorkflowAgent({
      model: new MockLanguageModelV4({
        doStream: async () =>
          stream([
            {
              type: 'tool-call',
              toolCallId: 'tool-call-1',
              toolName: 'lookup',
              input: '{"query":"weather"}',
            },
            {
              type: 'finish',
              finishReason: { unified: 'tool-calls', raw: 'tool-calls' },
              usage,
            },
          ]),
      }),
      tools: {
        lookup: tool({
          inputSchema: z.object({ query: z.string() }),
        }),
      },
      output: Output.object({
        schema: z.object({ answer: z.string() }),
      }),
    });

    const result = await agent.generate({ prompt: 'Answer.' });

    expect(() => result.output).toThrow(NoOutputGeneratedError);
  });

  it('rejects model stream errors instead of returning partial stream state', async () => {
    const providerError = new Error('provider failed');
    const onEnd = vi.fn();
    const agent = new WorkflowAgent({
      model: new MockLanguageModelV4({
        doStream: async () => stream([{ type: 'error', error: providerError }]),
      }),
    });

    await expect(agent.generate({ prompt: 'Answer.', onEnd })).rejects.toBe(
      providerError,
    );
    expect(onEnd).not.toHaveBeenCalled();
  });

  it('rejects with the abort reason before starting the model call', async () => {
    const abortError = new DOMException('cancelled', 'AbortError');
    const abortController = new AbortController();
    abortController.abort(abortError);
    const model = new MockLanguageModelV4();
    const agent = new WorkflowAgent({ model });

    await expect(
      agent.generate({
        prompt: 'Answer.',
        abortSignal: abortController.signal,
      }),
    ).rejects.toBe(abortError);
    expect(model.doStreamCalls).toHaveLength(0);
  });
});
