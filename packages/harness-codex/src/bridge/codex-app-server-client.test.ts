import { describe, expect, it, vi } from 'vitest';
import { CodexAppServerClient } from './codex-app-server-client';

describe('CodexAppServerClient', () => {
  it('correlates out-of-order responses and handles server requests concurrently', async () => {
    const notifications: Array<{ method: string; params?: unknown }> = [];
    const requests: string[] = [];
    const client = new CodexAppServerClient({
      executable: process.execPath,
      args: ['-e', TEST_SERVER_SOURCE],
      cwd: process.cwd(),
      env: process.env,
      onNotification: notification => notifications.push(notification),
      onRequest: async request => {
        requests.push(String(request.id));
        if (request.id === 'server-1') {
          await new Promise(resolve => setTimeout(resolve, 20));
        }
        return { handled: request.id };
      },
      onStderr: () => {},
    });

    await client.initialize({ clientName: 'test', clientVersion: '1' });
    const [slow, fast] = await Promise.all([
      client.request({ method: 'slow' }),
      client.request({ method: 'fast' }),
    ]);
    expect({ slow, fast }).toEqual({
      slow: { method: 'slow' },
      fast: { method: 'fast' },
    });

    await client.request({ method: 'triggerServerRequests' });
    await vi.waitFor(() => {
      expect(requests).toEqual(['server-1', 'server-2']);
      expect(
        notifications.filter(({ method }) => method === 'test/serverResponse'),
      ).toHaveLength(2);
    });
    await client.close();
  });

  it('rejects pending work when stdout is not valid JSON-RPC', async () => {
    const client = new CodexAppServerClient({
      executable: process.execPath,
      args: ['-e', INVALID_SERVER_SOURCE],
      cwd: process.cwd(),
      env: process.env,
      onNotification: () => {},
      onRequest: async () => ({}),
      onStderr: () => {},
    });
    await client.initialize({ clientName: 'test', clientVersion: '1' });

    await expect(client.request({ method: 'invalid' })).rejects.toThrow(
      'invalid JSON-RPC',
    );
    await expect(client.waitUntilFailure()).rejects.toThrow('invalid JSON-RPC');
    await client.close();
  });
});

const TEST_SERVER_SOURCE = String.raw`
const readline = require('node:readline');
const input = readline.createInterface({ input: process.stdin });
let slow;
const send = message => process.stdout.write(JSON.stringify(message) + '\n');
input.on('line', line => {
  const message = JSON.parse(line);
  if (message.method === 'initialize') {
    send({ id: message.id, result: {} });
    return;
  }
  if (message.method === 'slow') {
    slow = message;
    return;
  }
  if (message.method === 'fast') {
    send({ id: message.id, result: { method: 'fast' } });
    send({ id: slow.id, result: { method: 'slow' } });
    return;
  }
  if (message.method === 'triggerServerRequests') {
    send({ id: message.id, result: {} });
    send({ id: 'server-1', method: 'item/tool/call', params: { callId: '1' } });
    send({ id: 'server-2', method: 'item/tool/call', params: { callId: '2' } });
    return;
  }
  if (message.id === 'server-1' || message.id === 'server-2') {
    send({ method: 'test/serverResponse', params: { id: message.id, result: message.result } });
  }
});
`;

const INVALID_SERVER_SOURCE = String.raw`
const readline = require('node:readline');
const input = readline.createInterface({ input: process.stdin });
input.on('line', line => {
  const message = JSON.parse(line);
  if (message.method === 'initialize') {
    process.stdout.write(JSON.stringify({ id: message.id, result: {} }) + '\n');
  } else if (message.method === 'invalid') {
    process.stdout.write('not-json\n');
  }
});
`;
