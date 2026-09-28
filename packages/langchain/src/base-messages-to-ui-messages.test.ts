import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from '@langchain/core/messages';
import { describe, expect, it } from 'vitest';
import {
  baseMessagesToUIMessages,
  stateSnapshotToUIMessages,
} from './base-messages-to-ui-messages';
import { convertModelMessages, toBaseMessages } from './adapter';

describe('baseMessagesToUIMessages', () => {
  it('should convert human, system and assistant messages', () => {
    const result = baseMessagesToUIMessages([
      new SystemMessage({ content: 'Be helpful.', id: 's1' }),
      new HumanMessage({ content: 'Hi!', id: 'u1' }),
      new AIMessage({ content: 'Hello!', id: 'a1' }),
    ]);

    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({
      id: 's1',
      role: 'system',
      parts: [{ type: 'text', text: 'Be helpful.' }],
    });
    expect(result[1]).toMatchObject({
      id: 'u1',
      role: 'user',
      parts: [{ type: 'text', text: 'Hi!' }],
    });
    expect(result[2]).toMatchObject({
      id: 'a1',
      role: 'assistant',
      parts: [{ type: 'text', text: 'Hello!' }],
    });
  });

  it('should correlate tool messages back to their assistant message', () => {
    const result = baseMessagesToUIMessages([
      new AIMessage({
        id: 'a1',
        content: '',
        tool_calls: [
          { id: 'call-1', name: 'get_weather', args: { city: 'NYC' } },
        ],
      }),
      new ToolMessage({
        id: 't1',
        tool_call_id: 'call-1',
        content: 'Sunny, 72F',
      }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].role).toBe('assistant');
    expect(result[0].parts).toEqual([
      {
        type: 'dynamic-tool',
        toolName: 'get_weather',
        toolCallId: 'call-1',
        state: 'input-available',
        input: { city: 'NYC' },
      },
      {
        type: 'dynamic-tool',
        toolName: 'tool',
        toolCallId: 'call-1',
        state: 'output-available',
        input: {},
        output: 'Sunny, 72F',
      },
    ]);
  });

  it('should keep orphan tool results instead of dropping them', () => {
    const result = baseMessagesToUIMessages([
      new ToolMessage({
        tool_call_id: 'call-9',
        content: 'result without parent',
      }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].role).toBe('assistant');
    expect(result[0].parts[0]).toMatchObject({
      type: 'dynamic-tool',
      toolCallId: 'call-9',
      state: 'output-available',
    });
  });

  it('should round-trip through toBaseMessages without changing message kinds', async () => {
    const uiMessages = baseMessagesToUIMessages([
      new SystemMessage('Be helpful.'),
      new HumanMessage('Hi!'),
      new AIMessage('Hello!'),
    ]);

    const roundTripped = await toBaseMessages(uiMessages);

    expect(roundTripped.map(message => message.getType())).toEqual([
      'system',
      'human',
      'ai',
    ]);
    expect(convertModelMessages).toBeDefined();
  });
});

describe('stateSnapshotToUIMessages', () => {
  it('should map snapshot values.messages', () => {
    const result = stateSnapshotToUIMessages({
      values: { messages: [new HumanMessage('restore me')] },
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      role: 'user',
      parts: [{ type: 'text', text: 'restore me' }],
    });
  });

  it('should return an empty array for snapshots without messages', () => {
    expect(stateSnapshotToUIMessages({})).toEqual([]);
    expect(stateSnapshotToUIMessages({ values: {} })).toEqual([]);
  });
});
