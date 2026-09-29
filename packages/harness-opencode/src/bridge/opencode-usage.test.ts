import { describe, expect, it } from 'vitest';
import {
  extractSessionTokens,
  mapUsage,
  subtractSessionTokens,
} from './opencode-usage';

describe('OpenCode usage helpers', () => {
  it('extracts session tokens from legacy and v2 response shapes', () => {
    const tokens = {
      input: 20,
      output: 10,
      reasoning: 3,
      cache: { read: 8, write: 2 },
    };

    expect(extractSessionTokens({ tokens })).toEqual(tokens);
    expect(extractSessionTokens({ info: { tokens } })).toEqual(tokens);
    expect(extractSessionTokens({ data: { tokens } })).toEqual(tokens);
    expect(extractSessionTokens({ data: { data: { tokens } } })).toEqual(
      tokens,
    );
  });

  it('ignores malformed token envelopes', () => {
    expect(extractSessionTokens(null)).toBeUndefined();
    expect(extractSessionTokens([])).toBeUndefined();
    expect(extractSessionTokens({ data: 'invalid' })).toBeUndefined();
    expect(
      extractSessionTokens({
        tokens: { input: 1, output: 2, reasoning: 0, cache: 'invalid' },
      }),
    ).toBeUndefined();
  });

  it('maps the turn-local session token delta to harness usage', () => {
    const delta = subtractSessionTokens({
      before: {
        input: 100,
        output: 40,
        reasoning: 5,
        cache: { read: 80, write: 10 },
      },
      after: {
        input: 130,
        output: 400,
        reasoning: 25,
        cache: { read: 100, write: 12 },
      },
    });

    expect(mapUsage(delta)).toEqual({
      inputTokens: {
        total: 30,
        noCache: 10,
        cacheRead: 20,
        cacheWrite: 2,
      },
      outputTokens: {
        total: 380,
        text: 360,
        reasoning: 20,
      },
    });
  });
});
