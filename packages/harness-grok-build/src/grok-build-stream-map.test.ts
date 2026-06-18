import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createStreamMapState, mapStreamLine } from './grok-build-stream-map';

const lines = readFileSync(
  join(__dirname, '__fixtures__/streaming-json-basic.jsonl'),
  'utf8',
)
  .split('\n')
  .filter(Boolean);

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
  it('emits a finish for the end event', () => {
    const f = mapAll().find(p => p.type === 'finish');
    expect(f).toBeDefined();
  });
  it('never throws on malformed input', () => {
    expect(mapStreamLine('not json', createStreamMapState())).toEqual([]);
  });
});
