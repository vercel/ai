import { describe, expect, it, vi } from 'vitest';
import type { SessionManager } from '@earendil-works/pi-coding-agent';
import {
  runToolBatchReplay,
  takeToolBatchForReplay,
  type PiAgent,
  type PiAssistantMessage,
} from './pi-tool-batch';

function journalOf(messages: unknown[]) {
  const entries = messages.map((message, index) => ({
    type: 'message',
    id: `entry-${index}`,
    parentId: index === 0 ? null : `entry-${index - 1}`,
    message,
  }));
  return {
    getBranch: () => entries,
    branch: vi.fn(),
    resetLeaf: vi.fn(),
  } as unknown as SessionManager & {
    branch: ReturnType<typeof vi.fn>;
    resetLeaf: ReturnType<typeof vi.fn>;
  };
}

const assistant = {
  role: 'assistant',
  content: [
    { type: 'toolCall', id: 'a', name: 'read', arguments: {} },
    { type: 'toolCall', id: 'b', name: 'weather', arguments: {} },
  ],
  stopReason: 'toolUse',
  usage: { input: 3, output: 2, cost: { total: 0.5 } },
};

describe('takeToolBatchForReplay', () => {
  it('moves the journal before the batch and returns journaled results', () => {
    const journal = journalOf([
      { role: 'user', content: 'go' },
      assistant,
      {
        role: 'toolResult',
        toolCallId: 'a',
        content: [{ type: 'text', text: 'file' }],
        details: { path: 'x' },
        isError: false,
      },
    ]);

    const batch = takeToolBatchForReplay({ journal });

    expect(journal.branch).toHaveBeenCalledWith('entry-0');
    expect(batch?.assistantMessage).toMatchObject({
      content: assistant.content,
      usage: { input: 0, output: 0, cost: { total: 0 } },
    });
    expect(assistant.usage.input).toBe(3);
    expect(batch?.journaledToolResults).toEqual([
      {
        toolCallId: 'a',
        result: {
          content: [{ type: 'text', text: 'file' }],
          details: { path: 'x' },
        },
        isError: false,
      },
    ]);
  });

  it('resets the leaf when the batch message is the first entry', () => {
    const journal = journalOf([assistant]);
    takeToolBatchForReplay({ journal });
    expect(journal.resetLeaf).toHaveBeenCalledOnce();
  });

  it('returns undefined without a tool batch', () => {
    const journal = journalOf([{ role: 'user', content: 'go' }]);
    expect(takeToolBatchForReplay({ journal })).toBeUndefined();
    expect(journal.branch).not.toHaveBeenCalled();
  });
});

describe('runToolBatchReplay', () => {
  it('short-circuits stored calls and restores the agent afterwards', async () => {
    const readExecute = vi.fn();
    const weatherExecute = vi.fn(async () => ({
      content: [{ type: 'text', text: 'sunny' }],
      details: undefined,
    }));
    const beforeToolCall = vi.fn(async () => undefined);
    const afterToolCall = vi.fn(async () => undefined);
    const streamFunction = vi.fn();
    const tools = [
      { name: 'read', execute: readExecute },
      { name: 'weather', execute: weatherExecute },
    ];
    const observed: unknown[] = [];
    const agent = {
      streamFunction,
      state: { tools },
      beforeToolCall,
      afterToolCall,
      continue: vi.fn(async () => {
        const stream = await agent.streamFunction(
          {} as never,
          {} as never,
          undefined,
        );
        observed.push(await stream.result());
        for (const id of ['a', 'b']) {
          const context = { toolCall: { id } } as never;
          observed.push(await agent.beforeToolCall!(context));
          observed.push(
            await agent.state.tools
              .find(tool => tool.name === (id === 'a' ? 'read' : 'weather'))!
              .execute(id, {} as never),
          );
          observed.push(await agent.afterToolCall!(context));
        }
      }),
    } as unknown as PiAgent;
    const onReplayedMessage = vi.fn();

    await runToolBatchReplay({
      agent,
      assistantMessage: assistant as unknown as PiAssistantMessage,
      toolResults: new Map([
        [
          'a',
          {
            toolCallId: 'a',
            result: { content: [{ type: 'text', text: 'file' }] },
            isError: true,
          },
        ],
      ]),
      onReplayedMessage,
    });

    expect(onReplayedMessage).toHaveBeenCalledOnce();
    expect(observed).toEqual([
      assistant,
      undefined,
      {
        content: [{ type: 'text', text: 'file' }],
        details: undefined,
        isError: true,
      },
      undefined,
      undefined,
      { content: [{ type: 'text', text: 'sunny' }], details: undefined },
      undefined,
    ]);
    expect(readExecute).not.toHaveBeenCalled();
    expect(weatherExecute).toHaveBeenCalledOnce();
    expect(beforeToolCall).toHaveBeenCalledOnce();
    expect(afterToolCall).toHaveBeenCalledOnce();
    expect(streamFunction).not.toHaveBeenCalled();
    expect(agent.streamFunction).toBe(streamFunction);
    expect(agent.state.tools).toBe(tools);
    expect(agent.beforeToolCall).toBe(beforeToolCall);
    expect(agent.afterToolCall).toBe(afterToolCall);
  });
});
