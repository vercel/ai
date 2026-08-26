import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  type ClaudeMessage,
  createClaudeStreamEventState,
  createEmitStreamEvent,
} from './create-emit-stream-event';

type RecordedClaudeMessage = {
  type?: string;
  event?: {
    type?: string;
    delta?: {
      type?: string;
      partial_json?: string;
    };
  };
};

describe('createEmitStreamEvent tool input streaming', () => {
  it('forwards Claude input_json_delta events before tool completion', () => {
    const messages = JSON.parse(
      readFileSync(
        new URL('./__fixtures__/tool-input-stream.json', import.meta.url),
        'utf8',
      ),
    ) as RecordedClaudeMessage[];
    const expectedDeltas = messages.flatMap(message =>
      message.event?.type === 'content_block_delta' &&
      message.event.delta?.type === 'input_json_delta' &&
      typeof message.event.delta.partial_json === 'string'
        ? [message.event.delta.partial_json]
        : [],
    );
    const emitted: Record<string, unknown>[] = [];
    const emitStreamEvent = createEmitStreamEvent({
      state: createClaudeStreamEventState(),
      emit: event => emitted.push(event),
      emitWarning: () => {},
      emitTerminalError: () => {},
      onCompactionBoundary: () => {},
      toCommonName: name => name,
    });

    for (const message of messages) {
      emitStreamEvent(message as ClaudeMessage);
    }

    const toolInputEvents = emitted.filter(event =>
      ['tool-input-start', 'tool-input-delta', 'tool-input-end'].includes(
        String(event.type),
      ),
    );

    expect(expectedDeltas.length).toBeGreaterThan(1);
    expect(toolInputEvents.map(event => event.type)).toEqual([
      'tool-input-start',
      ...expectedDeltas.map(() => 'tool-input-delta'),
      'tool-input-end',
    ]);
    expect(
      toolInputEvents
        .filter(event => event.type === 'tool-input-delta')
        .map(event => event.delta),
    ).toEqual(expectedDeltas);
    expect(new Set(toolInputEvents.map(event => event.id)).size).toBe(1);
    expect(toolInputEvents[0]).toMatchObject({ toolName: 'Write' });
  });
});
