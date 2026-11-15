import { tool } from 'ai';
import { MockLanguageModelV4, convertArrayToReadableStream } from 'ai/test';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod/v4';
import { WorkflowAgent } from './workflow-agent.js';

const usage = {
  inputTokens: {
    total: 1,
    noCache: 1,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};

describe('WorkflowAgent.stream content retention', () => {
  it('retains model files and sources in results, callbacks, and message history', async () => {
    const source = {
      type: 'source' as const,
      sourceType: 'url' as const,
      id: 'source-1',
      url: 'https://example.com/source',
      title: 'Example source',
    };
    const file = {
      type: 'file' as const,
      data: { type: 'data' as const, data: 'ZmlsZS1jb250ZW50' },
      mediaType: 'text/plain',
    };
    const model = new MockLanguageModelV4({
      doStream: async () => ({
        stream: convertArrayToReadableStream([
          { type: 'stream-start' as const, warnings: [] },
          source,
          file,
          { type: 'text-start' as const, id: 'text-1' },
          {
            type: 'text-delta' as const,
            id: 'text-1',
            delta: 'answer',
          },
          { type: 'text-end' as const, id: 'text-1' },
          {
            type: 'finish' as const,
            finishReason: { unified: 'stop' as const, raw: 'stop' },
            usage: {
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
            },
          },
        ]),
      }),
    });
    const onStepEnd = vi.fn();
    const onEnd = vi.fn();

    const result = await new WorkflowAgent({ model }).stream({
      messages: [{ role: 'user', content: 'question' }],
      writable: new WritableStream(),
      onStepEnd,
      onEnd,
    });

    const step = result.steps[0]!;
    expect(step.content).toEqual([
      source,
      expect.objectContaining({
        type: 'file',
        file: expect.objectContaining({ mediaType: 'text/plain' }),
      }),
      { type: 'text', text: 'answer' },
    ]);
    expect(step.files).toHaveLength(1);
    expect(step.files[0]?.base64).toBe('ZmlsZS1jb250ZW50');
    expect(step.sources).toEqual([source]);
    expect(onStepEnd).toHaveBeenCalledWith(step);
    expect(onEnd).toHaveBeenCalledWith(
      expect.objectContaining({
        steps: [step],
      }),
    );

    const assistantMessage = result.messages.find(
      message => message.role === 'assistant',
    );
    expect(assistantMessage).toEqual({
      role: 'assistant',
      content: [
        {
          type: 'file',
          data: { type: 'data', data: 'ZmlsZS1jb250ZW50' },
          mediaType: 'text/plain',
        },
        { type: 'text', text: 'answer' },
      ],
    });
    expect(onEnd.mock.calls[0]?.[0].messages).toContainEqual(assistantMessage);
  });

  it('retains custom parts in step results and subsequent model requests', async () => {
    const customPart = {
      type: 'custom' as const,
      kind: 'openai.compaction' as const,
      providerMetadata: {
        openai: { itemId: 'cmp_1', encryptedContent: 'encrypted' },
      },
    };
    const prompts: unknown[] = [];
    let callCount = 0;
    const model = new MockLanguageModelV4({
      doStream: async ({ prompt }) => {
        prompts.push(prompt);
        const parts =
          callCount++ === 0
            ? [
                customPart,
                {
                  type: 'tool-call' as const,
                  toolCallId: 'call-1',
                  toolName: 'search',
                  input: '{}',
                },
                {
                  type: 'finish' as const,
                  finishReason: {
                    unified: 'tool-calls' as const,
                    raw: 'tool_calls',
                  },
                  usage,
                },
              ]
            : [
                { type: 'text-start' as const, id: 'text-1' },
                { type: 'text-delta' as const, id: 'text-1', delta: 'done' },
                { type: 'text-end' as const, id: 'text-1' },
                {
                  type: 'finish' as const,
                  finishReason: { unified: 'stop' as const, raw: 'stop' },
                  usage,
                },
              ];
        return {
          stream: convertArrayToReadableStream([
            { type: 'stream-start' as const, warnings: [] },
            ...parts,
          ]),
        };
      },
    });
    const onStepEnd = vi.fn();

    const result = await new WorkflowAgent({
      model,
      tools: {
        search: tool({
          inputSchema: z.object({}),
          execute: async () => 'ok',
        }),
      },
    }).stream({
      messages: [{ role: 'user', content: 'question' }],
      writable: new WritableStream(),
      onStepEnd,
    });

    const step = result.steps[0]!;
    expect(step.content[0]).toEqual(customPart);
    expect(onStepEnd).toHaveBeenCalledWith(step);

    const expectedMessagePart = {
      type: 'custom',
      kind: 'openai.compaction',
      providerOptions: customPart.providerMetadata,
    };
    expect(
      (prompts[1] as Array<{ role: string; content: unknown[] }>).find(
        message => message.role === 'assistant',
      )?.content[0],
    ).toEqual(expectedMessagePart);
    expect(
      result.messages.find(message => message.role === 'assistant')?.content,
    ).toContainEqual(expectedMessagePart);
  });
});
