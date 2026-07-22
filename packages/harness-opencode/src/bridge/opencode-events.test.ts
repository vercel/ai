import { describe, expect, it } from 'vitest';
import {
  createTranslationState,
  emitLegacyPartDelta,
  emitLegacyTextPartUpdate,
  emitMissingFinalDelta,
  getOpenCodeEventSessionId,
  isStepSettlementEvent,
  unwrapOpenCodeEvent,
} from './opencode-events';

describe('OpenCode event helpers', () => {
  it('unwraps native v2 events with data payloads', () => {
    const event = unwrapOpenCodeEvent({
      id: 'event-1',
      type: 'session.next.step.ended',
      data: {
        sessionID: 'session-1',
        finish: 'stop',
      },
    });

    expect(event).toEqual({
      id: 'event-1',
      type: 'session.next.step.ended',
      properties: {
        sessionID: 'session-1',
        finish: 'stop',
      },
    });
    expect(getOpenCodeEventSessionId(event!)).toBe('session-1');
    expect(isStepSettlementEvent(event!)).toBe(true);
  });

  it('unwraps synchronized events and strips version suffixes', () => {
    const event = unwrapOpenCodeEvent({
      type: 'sync',
      id: 'outer-event',
      syncEvent: {
        id: 'sync-event',
        type: 'session.next.text.ended.1',
        data: {
          sessionID: 'session-1',
          textID: 'text-1',
          text: 'done',
        },
      },
    });

    expect(event).toEqual({
      id: 'sync-event',
      type: 'session.next.text.ended',
      properties: {
        sessionID: 'session-1',
        textID: 'text-1',
        text: 'done',
      },
    });
  });

  it('finds legacy tool part session ids', () => {
    expect(
      getOpenCodeEventSessionId({
        type: 'message.part.updated',
        properties: {
          part: {
            type: 'tool',
            sessionID: 'session-1',
          },
        },
      }),
    ).toBe('session-1');
  });

  it('emits only the final text that has not already streamed', () => {
    const emitted: Record<string, unknown>[] = [];

    emitMissingFinalDelta({
      id: 'text-1',
      fullText: 'hello world',
      emittedText: 'hello ',
      emit: msg => emitted.push(msg),
      type: 'text-delta',
    });
    emitMissingFinalDelta({
      id: 'text-1',
      fullText: 'hello world',
      emittedText: 'hello world',
      emit: msg => emitted.push(msg),
      type: 'text-delta',
    });
    emitMissingFinalDelta({
      id: 'text-1',
      fullText: 'rewritten',
      emittedText: 'hello',
      emit: msg => emitted.push(msg),
      type: 'text-delta',
    });

    expect(emitted).toEqual([
      { type: 'text-delta', id: 'text-1', delta: 'world' },
    ]);
  });
});

describe('legacy reasoning part translation', () => {
  it('keeps a reasoning part streamed under field:"text" as reasoning, not text', () => {
    const state = createTranslationState();
    const out: Array<Record<string, unknown>> = [];
    const emit = (msg: Record<string, unknown>) => out.push(msg);

    // OpenCode announces the part as reasoning (message.part.updated).
    emitLegacyTextPartUpdate({
      part: { id: 'p1', type: 'reasoning', text: '' },
      state,
      emit,
    });
    // OpenCode streams the reasoning delta with field:"text" (its quirk).
    emitLegacyPartDelta({
      props: {
        partID: 'p1',
        field: 'text',
        delta: 'thinking about the answer',
      },
      state,
      emit,
    });
    // reasoning-end (final part with the full text and an end time).
    emitLegacyTextPartUpdate({
      part: {
        id: 'p1',
        type: 'reasoning',
        text: 'thinking about the answer',
        time: { end: 1 },
      },
      state,
      emit,
    });

    // The reasoning must never surface as a text part.
    expect(out.filter(msg => msg.type === 'text-delta')).toEqual([]);
    expect(out.some(msg => msg.type === 'text-start')).toBe(false);

    // It should appear exactly once, as reasoning.
    const reasoning = out
      .filter(msg => msg.type === 'reasoning-delta')
      .map(msg => msg.delta)
      .join('');
    expect(reasoning).toBe('thinking about the answer');
  });

  it('still emits text-delta for a plain (non-reasoning) field:"text" delta', () => {
    const state = createTranslationState();
    const out: Array<Record<string, unknown>> = [];
    const emit = (msg: Record<string, unknown>) => out.push(msg);

    emitLegacyPartDelta({
      props: { partID: 'p2', field: 'text', delta: 'hello world' },
      state,
      emit,
    });

    expect(out).toEqual([
      { type: 'text-start', id: 'p2' },
      { type: 'text-delta', id: 'p2', delta: 'hello world' },
    ]);
    expect(out.some(msg => msg.type === 'reasoning-delta')).toBe(false);
  });
});
