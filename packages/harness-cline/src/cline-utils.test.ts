import { describe, expect, it } from 'vitest';
import {
  extractUserInput,
  mapModelFinishReason,
  mapRunFinishReason,
  toToolResultValue,
  usageFromAgentUsage,
} from './cline-utils';

describe('extractUserInput', () => {
  it('passes plain strings through', () => {
    expect(extractUserInput('hello')).toBe('hello');
  });

  it('extracts string content from a user message', () => {
    expect(extractUserInput({ role: 'user', content: 'hello' })).toBe('hello');
  });

  it('joins text parts with blank lines', () => {
    expect(
      extractUserInput({
        role: 'user',
        content: [
          { type: 'text', text: 'first' },
          { type: 'text', text: 'second' },
        ],
      }),
    ).toBe('first\n\nsecond');
  });

  it('converts mixed text and image content into a Cline user message', () => {
    expect(
      extractUserInput({
        role: 'user',
        content: [
          { type: 'text', text: 'before' },
          {
            type: 'file',
            mediaType: 'image/png',
            data: 'iVBORw0KGgo=',
          },
          { type: 'text', text: 'after' },
        ],
      }),
    ).toEqual({
      id: expect.any(String),
      role: 'user',
      content: [
        { type: 'text', text: 'before' },
        { type: 'image', image: 'iVBORw0KGgo=', mediaType: 'image/png' },
        { type: 'text', text: 'after' },
      ],
      createdAt: expect.any(Number),
    });
  });
});

describe('toToolResultValue', () => {
  it('passes strings through', () => {
    expect(toToolResultValue('output')).toBe('output');
  });

  it('maps undefined and null to null', () => {
    expect(toToolResultValue(undefined)).toBe(null);
    expect(toToolResultValue(null)).toBe(null);
  });

  it('round-trips JSON-serializable objects', () => {
    expect(toToolResultValue({ a: 1, b: ['x'] })).toEqual({ a: 1, b: ['x'] });
  });

  it('round-trips values with custom JSON serialization', () => {
    expect(toToolResultValue(new Date('2026-08-13T00:00:00.000Z'))).toBe(
      '2026-08-13T00:00:00.000Z',
    );
  });

  it('stringifies objects with unsafe prototype properties', () => {
    const value = Object.defineProperty({}, '__proto__', {
      enumerable: true,
      value: { polluted: true },
    });

    expect(toToolResultValue(value)).toBe('[object Object]');
  });

  it('stringifies values that cannot be serialized', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(typeof toToolResultValue(cyclic)).toBe('string');
  });
});

describe('finish reason mapping', () => {
  it('maps model finish reasons', () => {
    expect(mapModelFinishReason('stop')).toEqual({
      unified: 'stop',
      raw: 'stop',
    });
    expect(mapModelFinishReason('tool-calls')).toEqual({
      unified: 'tool-calls',
      raw: 'tool-calls',
    });
    expect(mapModelFinishReason('max-tokens')).toEqual({
      unified: 'length',
      raw: 'max-tokens',
    });
    expect(mapModelFinishReason('aborted')).toEqual({
      unified: 'other',
      raw: 'aborted',
    });
    expect(mapModelFinishReason('error')).toEqual({
      unified: 'error',
      raw: 'error',
    });
  });

  it('maps run statuses', () => {
    expect(mapRunFinishReason('completed').unified).toBe('stop');
    expect(mapRunFinishReason('aborted').unified).toBe('other');
    expect(mapRunFinishReason('failed').unified).toBe('error');
  });
});

describe('usageFromAgentUsage', () => {
  it('converts cumulative usage', () => {
    expect(
      usageFromAgentUsage({
        inputTokens: 100,
        outputTokens: 50,
        cacheReadTokens: 30,
        cacheWriteTokens: 10,
        totalCost: 0.42,
      }),
    ).toEqual({
      inputTokens: {
        total: 100,
        noCache: undefined,
        cacheRead: 30,
        cacheWrite: 10,
      },
      outputTokens: { total: 50, text: undefined, reasoning: undefined },
      raw: { totalCost: 0.42 },
    });
  });

  it('omits raw when no cost is reported', () => {
    const usage = usageFromAgentUsage({
      inputTokens: 1,
      outputTokens: 2,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    });
    expect('raw' in usage).toBe(false);
  });
});
