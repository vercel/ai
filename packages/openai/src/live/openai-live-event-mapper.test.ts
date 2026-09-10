import { describe, expect, it } from 'vitest';
import { createOpenAI } from '../index';

const model = createOpenAI().live('gpt-live-1');

describe('OpenAI Live server events', () => {
  it.each([
    [
      {
        type: 'session.started',
        session: { id: 'session-1', model: 'gpt-live-1' },
      },
      { type: 'session-started', sessionId: 'session-1' },
    ],
    [
      {
        type: 'session.closed',
        session: { id: 'session-1' },
        usage: { seconds: 12 },
        reason: 'close_requested',
      },
      {
        type: 'session-closed',
        sessionId: 'session-1',
        usage: { seconds: 12 },
        reason: 'close_requested',
      },
    ],
    [
      {
        type: 'session.closed',
        usage: { seconds: 0 },
        reason: 'connection_lost',
      },
      {
        type: 'session-closed',
        usage: { seconds: 0 },
        reason: 'connection_lost',
      },
    ],
    [
      {
        type: 'session.usage.updated',
        usage: { seconds: 12 },
        context_window: { usage_ratio: 0.42 },
      },
      {
        type: 'session-usage',
        usage: { seconds: 12 },
        contextWindowUsageRatio: 0.42,
      },
    ],
    [
      { type: 'session.output_audio.delta', delta: 'AAAA' },
      { type: 'audio-chunk', delta: 'AAAA' },
    ],
    [
      {
        type: 'session.input_transcript.delta',
        delta: ' hello',
        start_ms: 100,
        end_ms: 200,
      },
      {
        type: 'transcript-fragment',
        speaker: 'user',
        delta: ' hello',
        startMs: 100,
        endMs: 200,
      },
    ],
    [
      {
        type: 'session.output_transcript.delta',
        delta: 'Hi ',
        start_ms: 120,
        end_ms: 210,
      },
      {
        type: 'transcript-fragment',
        speaker: 'assistant',
        delta: 'Hi ',
        startMs: 120,
        endMs: 210,
      },
    ],
    [
      {
        type: 'session.delegation.created',
        offset_ms: 1000,
        delegation: {
          id: 'opaque-delegation',
          target: 'client',
          type: 'delegation',
        },
      },
      {
        type: 'delegation-created',
        delegationId: 'opaque-delegation',
        target: 'client',
        offsetMs: 1000,
      },
    ],
    [
      { type: 'session.input_audio.muted', client_event_id: 'mute-1' },
      {
        type: 'command-acknowledged',
        command: 'session.input_audio.mute',
        clientEventId: 'mute-1',
      },
    ],
    [
      { type: 'session.input_audio.unmuted' },
      { type: 'command-acknowledged', command: 'session.input_audio.unmute' },
    ],
    [
      {
        type: 'session.updated',
        session: { id: 'session-1' },
        client_event_id: 'update-1',
      },
      {
        type: 'command-acknowledged',
        command: 'session.update',
        clientEventId: 'update-1',
      },
    ],
    [
      {
        type: 'session.instructions.appended',
        client_event_id: 'append-1',
        start_ms: 10,
        end_ms: 20,
      },
      {
        type: 'command-acknowledged',
        command: 'session.instructions.append',
        clientEventId: 'append-1',
      },
    ],
    [
      { type: 'session.thinking.appended', start_ms: 10, end_ms: 20 },
      { type: 'command-acknowledged', command: 'session.thinking.append' },
    ],
    [
      { type: 'session.commentary.appended', start_ms: 10, end_ms: 20 },
      { type: 'command-acknowledged', command: 'session.commentary.append' },
    ],
    [
      {
        type: 'error',
        error: {
          message: 'Rejected',
          code: 'immutable_field_update',
          client_event_id: 'update-1',
        },
      },
      {
        type: 'error',
        message: 'Rejected',
        code: 'immutable_field_update',
        clientEventId: 'update-1',
      },
    ],
  ])('normalizes %j and retains the original event', (raw, expected) => {
    const parsed = model.parseServerEvent(raw);
    expect(parsed).toMatchObject(expected);
    expect(Array.isArray(parsed) ? parsed[0].raw : parsed.raw).toBe(raw);
    expect(parsed).not.toHaveProperty('itemId');
    expect(parsed).not.toHaveProperty('responseId');
  });

  it('retains cumulative usage snapshots rather than summing updates', () => {
    for (const seconds of [1, 2, 2, 3]) {
      expect(
        model.parseServerEvent({
          type: 'session.usage.updated',
          usage: { seconds },
        }),
      ).toMatchObject({ type: 'session-usage', usage: { seconds } });
    }
  });

  it.each([null, undefined, 'rejected'])(
    'handles an error code of %s and keeps the raw value',
    code => {
      const raw = { type: 'error', error: { message: 'Rejected', code } };
      expect(model.parseServerEvent(raw)).toEqual({
        type: 'error',
        message: 'Rejected',
        code: code ?? undefined,
        clientEventId: undefined,
        raw,
      });
    },
  );

  it.each(['opaque-delegation', null, undefined])(
    'preserves delegated Responses envelopes with ID %s',
    delegationId => {
      const event = {
        type: 'response.completed',
        response: { id: 'response-1', output: [], usage: { input_tokens: 10 } },
        additional: { future: true },
      };
      const raw = {
        type: 'response.event',
        delegation_id: delegationId,
        event,
      };
      const parsed = model.parseServerEvent(raw);
      expect(parsed).toEqual([
        {
          type: 'backend-event',
          delegationId,
          event,
          raw,
        },
      ]);
      expect(Array.isArray(parsed) ? parsed[0].raw : parsed.raw).toBe(raw);
    },
  );

  it.each(['future.event', 'response.completed', 'response.output_text.delta'])(
    'preserves unknown %s events as custom',
    type => {
      const raw = { type, additional: true };
      expect(model.parseServerEvent(raw)).toEqual({
        type: 'custom',
        rawType: type,
        raw,
      });
    },
  );

  it.each([
    null,
    'not an event object',
    {},
    { type: 'session.started' },
    { type: 'session.started', session: { id: '' } },
    {
      type: 'session.closed',
      session: { id: 'session-1' },
      reason: 'close_requested',
    },
    { type: 'session.closed', usage: { seconds: 1 } },
    {
      type: 'session.closed',
      session: { id: 123 },
      usage: { seconds: 1 },
      reason: 'expired',
    },
    { type: 'session.usage.updated', usage: { seconds: -1 } },
    { type: 'session.usage.updated', usage: { seconds: '1' } },
    {
      type: 'session.usage.updated',
      usage: { seconds: 1 },
      context_window: { usage_ratio: '0.2' },
    },
    { type: 'session.output_audio.delta', delta: 123 },
    { type: 'session.input_transcript.delta', delta: 'hi' },
    {
      type: 'session.output_transcript.delta',
      delta: 'hi',
      start_ms: 20,
      end_ms: 10,
    },
    { type: 'session.delegation.created', delegation: {} },
    { type: 'session.updated' },
    { type: 'session.input_audio.muted', client_event_id: 123 },
    { type: 'session.instructions.appended', client_event_id: 'append-1' },
    { type: 'response.event' },
    { type: 'response.event', event: null },
    { type: 'error', error: { message: 'bad', code: 42 } },
  ])(
    'reports invalid known events without signaling readiness or finalization: %j',
    raw => {
      const parsed = model.parseServerEvent(raw);
      expect(parsed).toMatchObject({
        type: 'error',
        code: 'invalid_server_event',
      });
      expect(Array.isArray(parsed) ? parsed[0].raw : parsed.raw).toBe(raw);
    },
  );
});
