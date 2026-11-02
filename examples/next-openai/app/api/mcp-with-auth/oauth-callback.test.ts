import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAuthorizationCallback } from './oauth-callback';

const listeners: Array<
  Awaited<ReturnType<typeof createAuthorizationCallback>>
> = [];
const listen = async (state: string, controller = new AbortController()) => {
  const listener = await createAuthorizationCallback(state, controller.signal);
  listeners.push(listener);
  return listener;
};
const callbackUrl = (
  redirectUrl: string,
  state: string,
  code = 'test-code',
) => {
  const url = new URL(redirectUrl);
  url.searchParams.set('state', state);
  url.searchParams.set('code', code);
  return url;
};

afterEach(() => {
  for (const listener of listeners) listener.close();
  listeners.length = 0;
  vi.useRealTimers();
});

describe('request-local OAuth callbacks', () => {
  it('accepts the matching state and returns the code and issuer', async () => {
    const listener = await listen('request-one');
    const url = callbackUrl(listener.redirectUrl, 'request-one');
    url.searchParams.set('iss', 'https://login.example.com');
    expect((await fetch(url)).status).toBe(200);
    await expect(listener.authorizationCode).resolves.toEqual({
      code: 'test-code',
      state: 'request-one',
      issuer: 'https://login.example.com',
    });
  });

  it('keeps separate ports and rejects the other request state', async () => {
    const first = await listen('request-one');
    const second = await listen('request-two');
    expect(first.redirectUrl).not.toBe(second.redirectUrl);
    expect(
      (await fetch(callbackUrl(first.redirectUrl, 'request-two'))).status,
    ).toBe(400);
    expect(
      (await fetch(callbackUrl(first.redirectUrl, 'request-one', 'code-one')))
        .status,
    ).toBe(200);
    expect(
      (await fetch(callbackUrl(second.redirectUrl, 'request-two', 'code-two')))
        .status,
    ).toBe(200);
    await expect(first.authorizationCode).resolves.toMatchObject({
      code: 'code-one',
    });
    await expect(second.authorizationCode).resolves.toMatchObject({
      code: 'code-two',
    });
  });

  it('rejects pending authorization when the request is aborted', async () => {
    const controller = new AbortController();
    const listener = await listen('request-one', controller);
    controller.abort();
    await expect(listener.authorizationCode).rejects.toThrow('aborted');
  });

  it('times out pending authorization', async () => {
    vi.useFakeTimers();
    const listener = await listen('request-one');
    vi.advanceTimersByTime(300000);
    await expect(listener.authorizationCode).rejects.toThrow('timed out');
  });
});
