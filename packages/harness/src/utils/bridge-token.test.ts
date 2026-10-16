import { describe, expect, it } from 'vitest';
import { createBridgeToken, withBridgeToken } from './bridge-token';

describe('bridge token utilities', () => {
  it('creates unique random 32-byte hexadecimal tokens', () => {
    const first = createBridgeToken();
    const second = createBridgeToken();

    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(second).toMatch(/^[0-9a-f]{64}$/);
    expect(second).not.toBe(first);
  });

  it('adds an encoded bridge token while preserving the endpoint', () => {
    const endpoint = {
      url: 'wss://sandbox.example/bridge?existing=value',
      headers: { 'x-access-token': 'traffic-token' },
    };

    expect(
      withBridgeToken({
        endpoint,
        token: 'token with special characters &?',
      }),
    ).toEqual({
      url: 'wss://sandbox.example/bridge?existing=value&agent_bridge_token=token+with+special+characters+%26%3F',
      headers: endpoint.headers,
    });
    expect(endpoint.url).toBe('wss://sandbox.example/bridge?existing=value');
  });

  it('replaces an existing bridge token', () => {
    expect(
      withBridgeToken({
        endpoint: {
          url: 'wss://sandbox.example/bridge?agent_bridge_token=old-token',
        },
        token: 'new-token',
      }),
    ).toEqual({
      url: 'wss://sandbox.example/bridge?agent_bridge_token=new-token',
    });
  });
});
