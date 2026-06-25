import { describe, expect, it } from 'vitest';
import {
  canonicalizeBody,
  normalizeRouteKey,
  normalizeVolatileString,
  semanticRequestSignature,
} from './http-fixture-normalize';

describe('normalizeVolatileString', () => {
  it('collapses UUIDs, hex ids, and timestamps to stable tokens', () => {
    const a = normalizeVolatileString(
      'req 550e8400-e29b-41d4-a716-446655440000 at 2026-01-02T03:04:05.123Z',
    );
    const b = normalizeVolatileString(
      'req 7c9e6679-7425-40de-944b-e07fc1f90ae7 at 2026-09-09T09:09:09Z',
    );
    expect(a).toBe(b);
    expect(a).toContain('__UUID__');
    expect(a).toContain('__ISO_TIMESTAMP__');
  });

  it('collapses sandbox paths', () => {
    expect(
      normalizeVolatileString('/vercel/sandbox/claude-code-abc/file.ts'),
    ).toBe('/vercel/sandbox/__SANDBOX_PATH__');
  });

  it('collapses id-prefixed tokens', () => {
    expect(normalizeVolatileString('toolu_01ABCdef and msg_999')).toBe(
      '__ID__ and __ID__',
    );
  });
});

describe('canonicalizeBody', () => {
  it('is key-order independent', () => {
    const a = canonicalizeBody({ type: 'json', value: { b: 2, a: 1 } });
    const b = canonicalizeBody({ type: 'json', value: { a: 1, b: 2 } });
    expect(a).toBe(b);
  });

  it('strips volatile string values', () => {
    const a = canonicalizeBody({
      type: 'json',
      value: { note: 'id 550e8400-e29b-41d4-a716-446655440000' },
    });
    const b = canonicalizeBody({
      type: 'json',
      value: { note: 'id 7c9e6679-7425-40de-944b-e07fc1f90ae7' },
    });
    expect(a).toBe(b);
  });

  it('drops volatile keys', () => {
    const withId = canonicalizeBody({
      type: 'json',
      value: { id: 'x', model: 'm' },
    });
    const withoutId = canonicalizeBody({ type: 'json', value: { model: 'm' } });
    expect(withId).toBe(withoutId);
  });
});

describe('semanticRequestSignature', () => {
  it('captures model + user turns for Anthropic messages', () => {
    const sig = semanticRequestSignature({
      type: 'json',
      value: {
        model: 'claude-x',
        messages: [{ role: 'user', content: 'Capital of France?' }],
      },
    });
    expect(sig).toBe('messages:claude-x:Capital of France?');
  });

  it('captures only the first user turn when requested', () => {
    const body = {
      type: 'json' as const,
      value: {
        model: 'claude-x',
        messages: [
          { role: 'user', content: 'first' },
          { role: 'assistant', content: 'ok' },
          { role: 'user', content: 'second' },
        ],
      },
    };
    expect(semanticRequestSignature(body)).toBe(
      'messages:claude-x:first||second',
    );
    expect(semanticRequestSignature(body, { firstUserTurnOnly: true })).toBe(
      'messages:claude-x:first',
    );
  });

  it('captures OpenAI Responses input turns', () => {
    const sig = semanticRequestSignature({
      type: 'json',
      value: {
        model: 'gpt-x',
        input: [{ role: 'user', content: 'hello' }],
      },
    });
    expect(sig).toBe('input:gpt-x:hello');
  });
});

describe('normalizeRouteKey', () => {
  it('sorts query parameters', () => {
    const a = normalizeRouteKey(new URL('https://h.test/p?b=2&a=1'));
    const b = normalizeRouteKey(new URL('https://h.test/p?a=1&b=2'));
    expect(a).toBe(b);
    expect(a).toBe('https://h.test/p?a=1&b=2');
  });
});
