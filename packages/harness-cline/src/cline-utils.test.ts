import { describe, expect, it } from 'vitest';
import {
  extractUserText,
  frameInstructions,
  mapModelFinishReason,
  mapRunFinishReason,
  toToolResultValue,
  usageFromAgentUsage,
} from './cline-utils';

describe('extractUserText', () => {
  it('passes plain strings through', () => {
    expect(extractUserText('hello')).toBe('hello');
  });

  it('extracts string content from a user message', () => {
    expect(extractUserText({ role: 'user', content: 'hello' })).toBe('hello');
  });

  it('joins text parts with blank lines', () => {
    expect(
      extractUserText({
        role: 'user',
        content: [
          { type: 'text', text: 'first' },
          { type: 'text', text: 'second' },
        ],
      }),
    ).toBe('first\n\nsecond');
  });

  it('rejects non-text parts', () => {
    expect(() =>
      extractUserText({
        role: 'user',
        content: [
          {
            type: 'image',
            image: new Uint8Array([1]),
            mediaType: 'image/png',
          },
        ],
      }),
    ).toThrow(/only text user-message parts/);
  });
});

describe('frameInstructions', () => {
  it('wraps instructions and user text in labeled blocks', () => {
    const framed = frameInstructions('be terse', 'do the thing');
    expect(framed).toContain('<session-instructions>');
    expect(framed).toContain('be terse');
    expect(framed).toContain('<user-message>\ndo the thing\n</user-message>');
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
