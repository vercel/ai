import type {
  AssistantMessage,
  AssistantMessageEvent,
} from '@earendil-works/pi-ai';
import { describe, expect, test } from 'vitest';
import { createPiStreamPartTranslator } from './pi-stream-parts';

function partial(content: unknown[]): AssistantMessage {
  return { content } as AssistantMessage;
}

function translateAll(events: AssistantMessageEvent[]) {
  let id = 0;
  const translator = createPiStreamPartTranslator({
    isBuiltinTool: name => name === 'read',
    generateId: () => `id-${id++}`,
  });
  return events.flatMap(event => translator.translate(event));
}

describe('createPiStreamPartTranslator', () => {
  test('translates text and thinking blocks', () => {
    const message = partial([]);
    expect(
      translateAll([
        { type: 'start', partial: message },
        { type: 'thinking_start', contentIndex: 0, partial: message },
        {
          type: 'thinking_delta',
          contentIndex: 0,
          delta: 'hmm',
          partial: message,
        },
        {
          type: 'thinking_end',
          contentIndex: 0,
          content: 'hmm',
          partial: message,
        },
        { type: 'text_start', contentIndex: 1, partial: message },
        { type: 'text_delta', contentIndex: 1, delta: 'Hi', partial: message },
        { type: 'text_end', contentIndex: 1, content: 'Hi', partial: message },
      ]),
    ).toEqual([
      { type: 'reasoning-start', id: 'id-0' },
      { type: 'reasoning-delta', id: 'id-0', delta: 'hmm' },
      { type: 'reasoning-end', id: 'id-0' },
      { type: 'text-start', id: 'id-1' },
      { type: 'text-delta', id: 'id-1', delta: 'Hi' },
      { type: 'text-end', id: 'id-1' },
    ]);
  });

  test('translates a built-in tool call as provider-executed', () => {
    const block = {
      type: 'toolCall',
      id: 'call-1',
      name: 'read',
      arguments: {},
    };
    const message = partial([block]);
    expect(
      translateAll([
        { type: 'toolcall_start', contentIndex: 0, partial: message },
        {
          type: 'toolcall_delta',
          contentIndex: 0,
          delta: '{"path"',
          partial: message,
        },
        {
          type: 'toolcall_end',
          contentIndex: 0,
          toolCall: { ...block, type: 'toolCall', arguments: { path: 'a' } },
          partial: message,
        },
      ]),
    ).toEqual([
      {
        type: 'tool-input-start',
        id: 'call-1',
        toolName: 'read',
        providerExecuted: true,
      },
      { type: 'tool-input-delta', id: 'call-1', delta: '{"path"' },
      { type: 'tool-input-end', id: 'call-1' },
      {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'read',
        input: '{"path":"a"}',
        providerExecuted: true,
      },
    ]);
  });

  test('starts the tool input once the tool call ID is known', () => {
    const toolCall = {
      type: 'toolCall' as const,
      id: 'call-2',
      name: 'weather',
      arguments: {},
    };
    expect(
      translateAll([
        {
          type: 'toolcall_start',
          contentIndex: 0,
          partial: partial([{ type: 'toolCall' }]),
        },
        {
          type: 'toolcall_delta',
          contentIndex: 0,
          delta: '{',
          partial: partial([{ type: 'toolCall' }]),
        },
        {
          type: 'toolcall_end',
          contentIndex: 0,
          toolCall,
          partial: partial([toolCall]),
        },
      ]),
    ).toEqual([
      { type: 'tool-input-start', id: 'call-2', toolName: 'weather' },
      { type: 'tool-input-end', id: 'call-2' },
      {
        type: 'tool-call',
        toolCallId: 'call-2',
        toolName: 'weather',
        input: '{}',
      },
    ]);
  });
});
