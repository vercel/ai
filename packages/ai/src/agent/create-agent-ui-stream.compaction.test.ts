import type { LanguageModelV4StreamPart } from '@ai-sdk/provider';
import { parseJSON, tool, type ModelMessage } from '@ai-sdk/provider-utils';
import {
  convertArrayToReadableStream,
  convertReadableStreamToArray,
} from '@ai-sdk/provider-utils/test';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod/v4';
import { createCheckpoint } from '../compact-messages/validate-compaction';
import type { CompactionCheckpoint } from '../compact-messages/types';
import { MockLanguageModelV4 } from '../test/mock-language-model-v4';
import { readUIMessageStream } from '../ui-message-stream/read-ui-message-stream';
import { convertToModelMessages } from '../ui/convert-to-model-messages';
import { createUIMessageCompaction } from '../ui/create-ui-message-compaction';
import type { UIMessage } from '../ui/ui-messages';
import { validateUIMessages } from '../ui/validate-ui-messages';
import { createAgentUIStream } from './create-agent-ui-stream';
import { ToolLoopAgent } from './tool-loop-agent';

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};

describe('agent UI compaction', () => {
  async function createHistoryWithCompactedTool() {
    const prefix: UIMessage[] = [
      {
        id: 'u1',
        role: 'user',
        parts: [{ type: 'text', text: 'Old question' }],
      },
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-search',
            toolCallId: 'old-call',
            state: 'output-available',
            input: { query: 'Old input schema' },
            output: 'Old result',
          },
        ],
      },
    ];
    const record = await createUIMessageCompaction({
      messages: prefix,
      replacementMessages: [
        { role: 'user', content: 'Summarized earlier search.' },
      ],
    });
    return [
      ...prefix,
      { id: 'record', role: 'assistant' as const, parts: [record] },
      {
        id: 'u2',
        role: 'user' as const,
        parts: [{ type: 'text' as const, text: 'Continue' }],
      },
    ];
  }

  function createTextModel() {
    return new MockLanguageModelV4({
      doStream: async () => ({
        stream: convertArrayToReadableStream<LanguageModelV4StreamPart>([
          { type: 'stream-start', warnings: [] },
          { type: 'text-start', id: 'text' },
          { type: 'text-delta', id: 'text', delta: 'Answer' },
          { type: 'text-end', id: 'text' },
          {
            type: 'finish',
            finishReason: { unified: 'stop', raw: 'stop' },
            usage,
          },
        ]),
      }),
    });
  }

  it.each(['changed-schema', 'removed-tool'] as const)(
    'uses compaction before validating covered tools with %s',
    async mode => {
      const messages = await createHistoryWithCompactedTool();
      const model = createTextModel();
      const onEnd = vi.fn();
      const agent = new ToolLoopAgent({
        model,
        tools:
          mode === 'removed-tool'
            ? {}
            : { search: tool({ inputSchema: z.object({ term: z.string() }) }) },
      });
      await convertReadableStreamToArray(
        await createAgentUIStream({
          agent,
          uiMessages: messages,
          onEnd,
        }),
      );

      expect(model.doStreamCalls[0].prompt).toEqual([
        {
          role: 'user',
          content: [{ type: 'text', text: 'Summarized earlier search.' }],
        },
        { role: 'user', content: [{ type: 'text', text: 'Continue' }] },
      ]);
      expect(onEnd.mock.calls[0][0].messages.slice(0, messages.length)).toEqual(
        messages,
      );
    },
  );

  it('still rejects current-schema mismatches after the compaction boundary', async () => {
    const messages: UIMessage[] = await createHistoryWithCompactedTool();
    messages.push({
      id: 'new-tool',
      role: 'assistant',
      parts: [
        {
          type: 'tool-search',
          toolCallId: 'new-call',
          state: 'output-available',
          input: { query: 'Stale suffix input' },
          output: 'Result',
        },
      ],
    });
    const model = createTextModel();
    const agent = new ToolLoopAgent({
      model,
      tools: { search: tool({ inputSchema: z.object({ term: z.string() }) }) },
    });

    await expect(
      createAgentUIStream({ agent, uiMessages: messages }),
    ).rejects.toThrow('Type validation failed');
    expect(model.doStreamCalls).toHaveLength(0);
  });

  it('still rejects missing pending tools after the compaction boundary', async () => {
    const messages: UIMessage[] = await createHistoryWithCompactedTool();
    messages.push({
      id: 'new-tool',
      role: 'assistant',
      parts: [
        {
          type: 'tool-missing',
          toolCallId: 'new-call',
          state: 'input-available',
          input: {},
        },
      ],
    });
    const model = createTextModel();

    await expect(
      createAgentUIStream({
        agent: new ToolLoopAgent({ model }),
        uiMessages: messages,
      }),
    ).rejects.toThrow('No tool schema found for tool part missing');
    expect(model.doStreamCalls).toHaveLength(0);
  });

  it('applies a first automatic record even when removed tools were normalized on the server', async () => {
    const original: UIMessage[] = [
      {
        id: 'u1',
        role: 'user',
        parts: [{ type: 'text', text: 'Old question' }],
      },
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-removed',
            toolCallId: 'old-call',
            state: 'output-available',
            input: { query: 'Old input' },
            output: 'Old result',
          },
        ],
      },
      { id: 'u2', role: 'user', parts: [{ type: 'text', text: 'Continue' }] },
    ];
    const replacement: ModelMessage[] = [
      { role: 'user', content: 'Summarized removed tool.' },
    ];
    const agent = new ToolLoopAgent({
      model: createTextModel(),
      prepareStep: () => ({
        compaction: {
          messages: replacement,
          compacted: true,
          measurement: 'unavailable',
        },
      }),
    });
    let response: UIMessage | undefined;
    for await (const message of readUIMessageStream({
      stream: await createAgentUIStream({ agent, uiMessages: original }),
      terminateOnError: true,
    }))
      response = message;

    // The browser keeps its existing messages; only the new response is streamed.
    const clientHistory = [...original, response!];
    expect(clientHistory[1].parts[0].type).toBe('tool-removed');
    expect(response!.parts.some(part => part.type === 'compaction')).toBe(true);
    expect(await convertToModelMessages(clientHistory)).toEqual([
      ...replacement,
      { role: 'assistant', content: [{ type: 'text', text: 'Answer' }] },
    ]);
  });

  it('records ordered boundaries and restores checkpoints without application stream wiring', async () => {
    const original: UIMessage[] = [
      {
        id: 'u1',
        role: 'user',
        parts: [{ type: 'text', text: 'Remember Ada.' }],
      },
      {
        id: 'a1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'Remembered.' }],
      },
      {
        id: 'u2',
        role: 'user',
        parts: [{ type: 'text', text: 'Get the time.' }],
      },
    ];
    let modelCalls = 0;
    const model = new MockLanguageModelV4({
      doStream: async () => ({
        stream: convertArrayToReadableStream<LanguageModelV4StreamPart>(
          ++modelCalls === 1
            ? [
                { type: 'stream-start', warnings: [] },
                {
                  type: 'tool-call',
                  toolCallId: 'time-1',
                  toolName: 'getTime',
                  input: '{}',
                },
                {
                  type: 'finish',
                  finishReason: { unified: 'tool-calls', raw: 'tool-calls' },
                  usage,
                },
              ]
            : [
                { type: 'stream-start', warnings: [] },
                { type: 'text-start', id: 'text' },
                { type: 'text-delta', id: 'text', delta: 'It is noon, Ada.' },
                { type: 'text-end', id: 'text' },
                {
                  type: 'finish',
                  finishReason: { unified: 'stop', raw: 'stop' },
                  usage,
                },
              ],
        ),
      }),
    });
    const tools = {
      getTime: tool({ inputSchema: z.object({}), execute: async () => 'noon' }),
    };
    const seenCheckpoints: Array<CompactionCheckpoint | undefined> = [];
    const replacements: ModelMessage[][] = [
      [{ role: 'user', content: 'Ada wants the time.' }],
      [
        {
          role: 'user',
          content: 'Ada asked for the time, and the tool returned noon.',
        },
      ],
    ];
    const checkpoints = await Promise.all(
      replacements.map(messages => createCheckpoint(messages, 0, 1)),
    );
    const agent = new ToolLoopAgent({
      model,
      tools,
      prepareStep: ({ stepNumber, compactionCheckpoint }) => {
        seenCheckpoints.push(compactionCheckpoint);
        return {
          compaction: {
            messages: replacements[stepNumber],
            checkpoint: checkpoints[stepNumber],
            compacted: true,
            measurement: 'unavailable',
          },
        };
      },
    });
    let saved: UIMessage[] = [];
    let response: UIMessage | undefined;
    for await (const message of readUIMessageStream({
      stream: await createAgentUIStream({
        agent,
        uiMessages: original,
        onEnd: ({ messages }) => {
          saved = messages;
        },
      }),
      terminateOnError: true,
    })) {
      response = message;
    }

    expect(seenCheckpoints).toEqual([undefined, checkpoints[0]]);
    expect(response?.id).not.toBe('');
    expect(saved).toEqual([...original, response]);
    const records = response!.parts.filter(part => part.type === 'compaction');
    expect(records).toHaveLength(2);
    expect(records[0].replaces).toMatchObject({
      messageId: 'u2',
      messageCount: 3,
      partCount: 1,
    });
    expect(records[1].replaces).toMatchObject({
      messageId: response!.id,
      messageCount: 4,
    });
    const coveredParts = response!.parts.slice(
      0,
      records[1].replaces.partCount,
    );
    expect(coveredParts).toContainEqual(
      expect.objectContaining({
        type: 'tool-getTime',
        state: 'output-available',
        output: 'noon',
      }),
    );
    expect(coveredParts).not.toContain(records[1]);
    expect(await convertToModelMessages(saved)).toEqual([
      ...replacements[1],
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'It is noon, Ada.' }],
      },
    ]);

    const restored = await validateUIMessages({
      messages: await parseJSON({ text: JSON.stringify(saved) }),
      tools,
    });
    restored.push({
      id: 'u3',
      role: 'user',
      parts: [{ type: 'text', text: 'What did you learn?' }],
    });
    let restoredCheckpoint: CompactionCheckpoint | undefined;
    const nextAgent = new ToolLoopAgent({
      model,
      tools,
      prepareStep: ({ compactionCheckpoint }) => {
        restoredCheckpoint = compactionCheckpoint;
      },
    });
    for await (const _message of readUIMessageStream({
      stream: await createAgentUIStream({
        agent: nextAgent,
        uiMessages: restored,
      }),
      terminateOnError: true,
    })) {
      // Consume the ordinary UI response; no application-side lifecycle code.
    }
    expect(restoredCheckpoint).toEqual(checkpoints[1]);
    expect(model.doStreamCalls[2].prompt).toEqual([
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Ada asked for the time, and the tool returned noon.',
          },
        ],
      },
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'It is noon, Ada.' }],
      },
      {
        role: 'user',
        content: [{ type: 'text', text: 'What did you learn?' }],
      },
    ]);
  });
});
