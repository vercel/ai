import { describe, expect, it } from 'vitest';
import type { HttpFixture, ReplayRuntimeIdentity } from './http-fixture';
import {
  auditHttpFixtureRedaction,
  bufferToFixtureBody,
  fixtureBodyToBuffer,
  fixtureBodyToText,
  redactSecretHeaders,
} from './http-fixture-body';

const identity: ReplayRuntimeIdentity = {
  adapterName: 'claude-code',
  scenario: 'basic',
  fixtureKey: 'e2e-basic-claude-code',
  sessionId: 'sess-abc-123',
  sandboxName: 'agent-sess-abc-123',
  workDir: '/vercel/sandbox/claude-code-sess-abc-123',
  bridgeDir: '/vercel/sandbox/.agent-runs/sess-abc-123/bridge',
  proxyUrl: 'http://sess-abc-123:tok@127.0.0.1:41007',
};

describe('bufferToFixtureBody', () => {
  it('classifies JSON bodies', () => {
    const body = bufferToFixtureBody(Buffer.from('{"a":1}'), {
      'content-type': 'application/json',
    });
    expect(body).toEqual({ type: 'json', value: { a: 1 } });
  });

  it('classifies plain text bodies', () => {
    const body = bufferToFixtureBody(Buffer.from('hello world'), {});
    expect(body).toEqual({ type: 'text', value: 'hello world' });
  });

  it('base64-encodes non-UTF8 (binary) bodies', () => {
    const bytes = Buffer.from([0x00, 0x01, 0xff, 0xfe]);
    const body = bufferToFixtureBody(bytes, {});
    expect(body).toEqual({ type: 'base64', value: bytes.toString('base64') });
  });

  it('returns undefined for empty bodies', () => {
    expect(bufferToFixtureBody(Buffer.alloc(0), {})).toBeUndefined();
  });

  it('round-trips text through fixtureBodyToBuffer', () => {
    const body = bufferToFixtureBody(Buffer.from('round trip'), {});
    expect(fixtureBodyToBuffer(body)?.toString('utf8')).toBe('round trip');
  });

  it('round-trips binary through fixtureBodyToBuffer', () => {
    const bytes = Buffer.from([0x00, 0x10, 0x20, 0xff]);
    const body = bufferToFixtureBody(bytes, {});
    expect(fixtureBodyToBuffer(body)?.equals(bytes)).toBe(true);
  });
});

describe('identity placeholder round-trip', () => {
  it('replaces runtime values with placeholders at record time', () => {
    const body = bufferToFixtureBody(
      Buffer.from(`workdir is ${identity.workDir} for ${identity.sessionId}`),
      {},
      identity,
    );
    expect(body).toEqual({
      type: 'text',
      value: 'workdir is __WORKDIR__ for __SESSION_ID__',
    });
  });

  it('materializes placeholders back to runtime values at replay time', () => {
    const text = fixtureBodyToText(
      { type: 'text', value: 'workdir is __WORKDIR__ for __SESSION_ID__' },
      identity,
    );
    expect(text).toBe(
      `workdir is ${identity.workDir} for ${identity.sessionId}`,
    );
  });
});

describe('redactSecretHeaders', () => {
  it('redacts sensitive header values', () => {
    const redacted = redactSecretHeaders({
      authorization: 'Bearer sk-secret',
      'x-api-key': 'abc',
      'content-type': 'application/json',
    });
    expect(redacted).toEqual({
      authorization: '__REDACTED_SECRET__',
      'x-api-key': '__REDACTED_SECRET__',
      'content-type': 'application/json',
    });
  });
});

describe('auditHttpFixtureRedaction', () => {
  const baseFixture = (bodyText: string): HttpFixture => ({
    version: 1,
    description: 'claude-code basic',
    recordedAt: '2026-01-01T00:00:00.000Z',
    exchanges: [
      {
        request: {
          method: 'POST',
          url: 'https://api.anthropic.com/v1/messages',
          headers: {},
        },
        response: {
          status: 200,
          headers: {},
          body: { type: 'text', value: bodyText },
        },
      },
    ],
  });

  it('passes a clean fixture', () => {
    expect(() =>
      auditHttpFixtureRedaction(baseFixture('all clean here'), identity),
    ).not.toThrow();
  });

  it('throws when a raw runtime identity value survives', () => {
    expect(() =>
      auditHttpFixtureRedaction(
        baseFixture(`leaked ${identity.sessionId}`),
        identity,
      ),
    ).toThrow(/redaction audit failed/);
  });

  it('throws when a secret-shaped token survives', () => {
    expect(() =>
      auditHttpFixtureRedaction(
        baseFixture('token sk-ant-abcdefghijklmnopqrstuvwx'),
        identity,
      ),
    ).toThrow(/Anthropic API key/);
  });
});
