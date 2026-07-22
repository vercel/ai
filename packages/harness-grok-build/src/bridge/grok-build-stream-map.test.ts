import { describe, expect, it } from 'vitest';
import { createStreamMapState, mapStreamLine } from './grok-build-stream-map';

const lines = [
  JSON.stringify({ type: 'thought', data: 'Thinking' }),
  JSON.stringify({ type: 'thought', data: ' through the request.' }),
  JSON.stringify({ type: 'text', data: 'Created and read hello.txt.' }),
  JSON.stringify({
    type: 'end',
    stopReason: 'EndTurn',
    sessionId: 'session-id',
    requestId: 'request-id',
  }),
];

const mapAll = () => {
  const s = createStreamMapState();
  return lines.flatMap(l => mapStreamLine(l, s));
};

describe('mapStreamLine (grok streaming-json)', () => {
  it('emits exactly one stream-start', () => {
    expect(mapAll().filter(p => p.type === 'stream-start')).toHaveLength(1);
  });
  it('maps thought chunks to reasoning start/delta/end', () => {
    const t = mapAll().map(p => p.type);
    expect(t).toContain('reasoning-start');
    expect(t).toContain('reasoning-delta');
    expect(t).toContain('reasoning-end');
  });
  it('maps text chunks to text start/delta/end', () => {
    const t = mapAll().map(p => p.type);
    expect(t).toContain('text-start');
    expect(t).toContain('text-delta');
    expect(t).toContain('text-end');
  });
  it('reasoning ends before text starts (single ordered transition)', () => {
    const types = mapAll().map(p => p.type);
    const firstText = types.indexOf('text-start');
    const reasoningEnd = types.indexOf('reasoning-end');
    expect(reasoningEnd).toBeGreaterThanOrEqual(0);
    expect(firstText).toBeGreaterThan(reasoningEnd);
  });
  it('concatenated text deltas reconstruct the final answer', () => {
    const text = mapAll()
      .filter(p => p.type === 'text-delta')
      .map((p: any) => p.delta)
      .join('');
    expect(text).toContain('hello.txt');
  });
  it('finishes the inferred step before finishing the turn', () => {
    expect(mapAll().slice(-2)).toEqual([
      {
        type: 'finish-step',
        finishReason: { unified: 'stop', raw: 'EndTurn' },
        usage: {
          inputTokens: {
            total: undefined,
            noCache: undefined,
            cacheRead: undefined,
            cacheWrite: undefined,
          },
          outputTokens: {
            total: undefined,
            text: undefined,
            reasoning: undefined,
          },
        },
        harnessMetadata: { 'grok-build': { inferredStep: true } },
      },
      {
        type: 'finish',
        finishReason: { unified: 'stop', raw: 'EndTurn' },
        totalUsage: {
          inputTokens: {
            total: undefined,
            noCache: undefined,
            cacheRead: undefined,
            cacheWrite: undefined,
          },
          outputTokens: {
            total: undefined,
            text: undefined,
            reasoning: undefined,
          },
        },
      },
    ]);
  });
  it('never throws on malformed input', () => {
    expect(mapStreamLine('not json', createStreamMapState())).toEqual([]);
  });
});
