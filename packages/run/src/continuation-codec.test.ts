import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  createSignedContinuationCodec,
  createStoredContinuationCodec,
  createRunner,
  type RunContinuationState,
  type StoredContinuation,
} from '../dist/index.js';

const state: RunContinuationState = {
  version: 2,
  runtime: 'run-replay-v2',
  serde: 'run-js-v1',
  source: 'return await tools.pause();',
  logicalRunId: '03'.repeat(16),
  scopeHash: '02'.repeat(32),
  determinism: { dateNowMs: 1_700_000_000_000, randomSeed: '01'.repeat(16) },
  ledger: [
    {
      bindingName: 'tools.pause',
      inputJson: '[[]]',
      status: 'interrupted',
      interruptionId: 'interrupt-1',
      payloadJson: '[{"kind":1},"approval"]',
    },
  ],
};

afterEach(() => vi.useRealTimers());

describe('continuation codecs', () => {
  it('atomically consumes stored continuations', async () => {
    const values = new Map<string, StoredContinuation>();
    const codec = createStoredContinuationCodec({
      storage: {
        set(key, value) {
          values.set(key, value);
        },
        take(key) {
          const value = values.get(key);
          values.delete(key);
          return value;
        },
      },
    });
    const token = await codec.encode(state);
    await expect(codec.decode(token)).resolves.toEqual(state);
    await expect(codec.decode(token)).rejects.toMatchObject({
      code: 'RUN_PROTOCOL_ERROR',
    });
  });

  it('allows exactly one of many concurrent stored continuation consumers', async () => {
    const values = new Map<string, StoredContinuation>();
    const codec = createStoredContinuationCodec({
      storage: {
        set(key, value) {
          values.set(key, value);
        },
        async take(key) {
          const value = values.get(key);
          values.delete(key);
          await Promise.resolve();
          return value;
        },
      },
    });
    const token = await codec.encode(state);
    const results = await Promise.allSettled(
      Array.from({ length: 32 }, () => codec.decode(token)),
    );
    expect(
      results.filter(result => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(
      31,
    );
  });

  it('enforces stored continuation expiry itself', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const values = new Map<string, StoredContinuation>();
    const codec = createStoredContinuationCodec({
      maxAgeMs: 10,
      storage: {
        set(key, value) {
          values.set(key, value);
        },
        take(key) {
          const value = values.get(key);
          values.delete(key);
          return value;
        },
      },
    });
    const token = await codec.encode(state);
    vi.setSystemTime(1_011);
    await expect(codec.decode(token)).rejects.toThrow('expired');
  });

  it('bounds signed tokens before returning or verifying them', () => {
    const codec = createSignedContinuationCodec({
      secret: 's'.repeat(32),
      maxTokenBytes: 32,
    });
    expect(() => codec.encode(state)).toThrow('size limit');
    expect(() => codec.decode('x'.repeat(33))).toThrow('size limit');
  });

  it('requires strong signing keys and validates key-rotation options', () => {
    expect(() =>
      createSignedContinuationCodec({ secret: 'too-short' }),
    ).toThrow('at least 32 bytes');
    expect(() =>
      createSignedContinuationCodec({
        secret: 's'.repeat(32),
        verificationSecrets: ['old-short'],
      }),
    ).toThrow('at least 32 bytes');
    expect(() =>
      createSignedContinuationCodec({
        secret: 's'.repeat(32),
        clockSkewMs: -1,
      }),
    ).toThrow('non-negative integer');
  });

  it('supports verification-only previous secrets during key rotation', () => {
    const oldSecret = 'o'.repeat(32);
    const newSecret = 'n'.repeat(32);
    const oldCodec = createSignedContinuationCodec({ secret: oldSecret });
    const rotatedCodec = createSignedContinuationCodec({
      secret: newSecret,
      verificationSecrets: [oldSecret],
    });
    const oldToken = oldCodec.encode(state) as string;
    expect(rotatedCodec.decode(oldToken)).toEqual(state);

    const newToken = rotatedCodec.encode(state) as string;
    expect(() => oldCodec.decode(newToken)).toThrow('signature');
  });

  it('expires at the exact boundary and rejects future-issued tokens', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const codec = createSignedContinuationCodec({
      secret: 's'.repeat(32),
      maxAgeMs: 10,
      clockSkewMs: 0,
    });
    const token = codec.encode(state) as string;
    vi.setSystemTime(1_010);
    expect(() => codec.decode(token)).toThrow('expired');

    vi.setSystemTime(2_000);
    const futureToken = codec.encode(state) as string;
    vi.setSystemTime(1_999);
    expect(() => codec.decode(futureToken)).toThrow('future');
  });

  it.each([
    ['format', 'other'],
    ['version', 2],
    ['algorithm', 'none'],
    ['nonce', 'bad'],
  ])('rejects authenticated envelope confusion in %s', (field, value) => {
    const secret = 's'.repeat(32);
    const codec = createSignedContinuationCodec({ secret });
    const token = codec.encode(state) as string;
    const [body] = token.split('.');
    const envelope = JSON.parse(
      Buffer.from(body!, 'base64url').toString(),
    ) as Record<string, unknown>;
    envelope[field] = value;
    const changedBody = Buffer.from(JSON.stringify(envelope)).toString(
      'base64url',
    );
    const signature = createHmac('sha256', secret)
      .update('run.continuation.v1\0')
      .update(changedBody)
      .digest('base64url');
    expect(() => codec.decode(`${changedBody}.${signature}`)).toThrow(
      /envelope|canonical|lifetime/i,
    );
  });

  it('rejects authenticated unknown envelope fields and non-canonical JSON', () => {
    const secret = 's'.repeat(32);
    const codec = createSignedContinuationCodec({ secret });
    const token = codec.encode(state) as string;
    const [body] = token.split('.');
    const envelope = JSON.parse(
      Buffer.from(body!, 'base64url').toString(),
    ) as Record<string, unknown>;
    envelope.extra = true;
    const changedBody = Buffer.from(JSON.stringify(envelope)).toString(
      'base64url',
    );
    const signature = createHmac('sha256', secret)
      .update('run.continuation.v1\0')
      .update(changedBody)
      .digest('base64url');
    expect(() => codec.decode(`${changedBody}.${signature}`)).toThrow(
      /envelope|canonical/i,
    );
  });

  it('rejects bit changes, truncation, extension, wrong keys, and invalid base64', () => {
    const codec = createSignedContinuationCodec({ secret: 's'.repeat(32) });
    const wrong = createSignedContinuationCodec({ secret: 'w'.repeat(32) });
    const token = codec.encode(state) as string;
    const mutations = [
      token.slice(0, -1),
      `${token}x`,
      `!${token.slice(1)}`,
      `${token.split('.')[0]}.=`,
      `${token.slice(0, 10)}${token[10] === 'A' ? 'B' : 'A'}${token.slice(11)}`,
    ];
    for (const mutation of mutations) {
      expect(() => codec.decode(mutation)).toThrow();
    }
    expect(() => wrong.decode(token)).toThrow('signature');
  });

  it('fails closed for 1,000 deterministic signed-token mutations', () => {
    const codec = createSignedContinuationCodec({ secret: 's'.repeat(32) });
    const token = codec.encode(state) as string;
    let random = 0x6d2b79f5;
    for (let iteration = 0; iteration < 1_000; iteration++) {
      const index = next() % token.length;
      const replacement = String.fromCodePoint(33 + (next() % 90));
      const mutation = `${token.slice(0, index)}${replacement}${token.slice(index + 1)}`;
      if (mutation === token) continue;
      expect(() => codec.decode(mutation)).toThrowError(
        expect.objectContaining({ code: 'RUN_PROTOCOL_ERROR' }),
      );
    }

    function next(): number {
      random ^= random << 13;
      random ^= random >>> 17;
      random ^= random << 5;
      return random >>> 0;
    }
  });

  it.each([
    '',
    'x',
    'a'.repeat(42),
    'a'.repeat(44),
    'a'.repeat(257),
    'bad!key',
  ])('rejects malformed stored key %j before storage access', async key => {
    const take = vi.fn();
    const codec = createStoredContinuationCodec({
      storage: { set: () => undefined, take },
    });
    await expect(codec.decode(key)).rejects.toMatchObject({
      code: 'RUN_PROTOCOL_ERROR',
    });
    expect(take).not.toHaveBeenCalled();
  });

  it('does not issue a stored key before persistence succeeds', async () => {
    const codec = createStoredContinuationCodec({
      storage: {
        set() {
          throw new Error('storage unavailable');
        },
        take: () => undefined,
      },
    });
    await expect(codec.encode(state)).rejects.toThrow('storage unavailable');
  });

  it.each([
    ['wrong runtime', { ...state, runtime: 'other' }],
    [
      'invalid determinism',
      { ...state, determinism: { dateNowMs: 0, randomSeed: 'bad' } },
    ],
    ['non-array ledger', { ...state, ledger: {} }],
    [
      'invalid input JSON',
      {
        ...state,
        ledger: [{ ...state.ledger[0]!, inputJson: '{' }],
      },
    ],
    [
      'invalid interruption id',
      {
        ...state,
        ledger: [{ ...state.ledger[0]!, interruptionId: 'changed' }],
      },
    ],
  ])('rejects malformed decoded state: %s', async (_name, malformed) => {
    const runner = createRunner({
      continuationCodec: {
        encode: () => 'unused',
        decode: () => malformed as never,
      },
    });
    await expect(
      runner.run({ source: state.source, continuation: 'token' }),
    ).rejects.toMatchObject({ code: 'RUN_PROTOCOL_ERROR' });
  });
});
