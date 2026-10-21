import type { LanguageModelV4StreamPart } from '@ai-sdk/provider';
import { MockLanguageModelV4, convertArrayToReadableStream } from 'ai/test';
import { describe, expect, it, vi } from 'vitest';
import { tool } from 'ai';
import { z } from 'zod/v4';
import { WorkflowAgent } from './workflow-agent.js';

describe('WorkflowAgent.stream model files and sources', () => {
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

  it('preserves OpenAI compaction across streamed tool steps', async () => {
    const compaction = {
      type: 'custom' as const,
      kind: 'openai.compaction' as const,
      providerMetadata: {
        openai: {
          type: 'compaction',
          itemId: 'cmp_synthetic_preserved',
          encryptedContent: 'synthetic-encrypted-compaction-exact-payload',
        },
      },
    };
    let call = 0;
    const finish = (reason: 'tool-calls' | 'stop') => ({
      type: 'finish' as const,
      finishReason: {
        unified: reason,
        raw: reason === 'tool-calls' ? 'tool_calls' : 'stop',
      },
      usage: {
        inputTokens: {
          total: 1,
          noCache: 1,
          cacheRead: undefined,
          cacheWrite: undefined,
        },
        outputTokens: { total: 1, text: 1, reasoning: undefined },
      },
    });
    const searchCall = (id: string, query: string) => ({
      type: 'tool-call' as const,
      toolCallId: id,
      toolName: 'search',
      input: JSON.stringify({ query }),
    });
    const model = new MockLanguageModelV4({
      doStream: async () => {
        call++;
        let parts: LanguageModelV4StreamPart[];
        if (call === 1) {
          parts = [
            { type: 'stream-start', warnings: [] },
            compaction,
            searchCall('search-1', 'first'),
            finish('tool-calls'),
          ];
        } else if (call === 2) {
          parts = [
            { type: 'stream-start', warnings: [] },
            searchCall('search-2', 'second'),
            finish('tool-calls'),
          ];
        } else {
          parts = [
            { type: 'stream-start', warnings: [] },
            { type: 'text-start', id: 'text-1' },
            { type: 'text-delta', id: 'text-1', delta: 'done' },
            { type: 'text-end', id: 'text-1' },
            finish('stop'),
          ];
        }

        return { stream: convertArrayToReadableStream(parts) };
      },
    });
    const onStepEnd = vi.fn();
    const agent = new WorkflowAgent({
      model,
      tools: {
        search: tool({
          inputSchema: z.object({ query: z.string() }),
          execute: async ({ query }) => query,
        }),
      },
    });

    const result = await agent.stream({
      prompt: 'search twice',
      providerOptions: {
        openai: {
          store: false,
          contextManagement: [{ type: 'compaction', compactThreshold: 200000 }],
        },
      },
      onStepEnd,
      writable: new WritableStream(),
    });

    const firstStep = result.steps[0]!;
    expect(firstStep.content).toContainEqual(compaction);
    expect(onStepEnd).toHaveBeenCalledWith(firstStep);
    expect(result.messages).toContainEqual({
      role: 'assistant',
      content: expect.arrayContaining([
        {
          type: 'custom',
          kind: 'openai.compaction',
          providerOptions: compaction.providerMetadata,
        },
      ]),
    });
    expect(firstStep.response.messages).toContainEqual(
      expect.objectContaining({
        role: 'assistant',
        content: expect.arrayContaining([
          {
            type: 'custom',
            kind: 'openai.compaction',
            providerOptions: compaction.providerMetadata,
          },
        ]),
      }),
    );

    expect(model.doStreamCalls[1]?.prompt).toContainEqual(
      expect.objectContaining({
        role: 'assistant',
        content: expect.arrayContaining([
          {
            type: 'custom',
            kind: 'openai.compaction',
            providerOptions: compaction.providerMetadata,
          },
        ]),
      }),
    );
    expect(model.doStreamCalls[2]?.prompt).toContainEqual(
      expect.objectContaining({
        role: 'assistant',
        content: expect.arrayContaining([
          {
            type: 'custom',
            kind: 'openai.compaction',
            providerOptions: compaction.providerMetadata,
          },
        ]),
      }),
    );
    for (const call of model.doStreamCalls) {
      expect(call.providerOptions).toMatchObject({
        openai: {
          store: false,
          contextManagement: [{ type: 'compaction', compactThreshold: 200000 }],
        },
      });
    }
  });
});
