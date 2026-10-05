import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMCPClient, type MCPClient } from './mcp-client';
import { generateMCPWebhookSecret } from './mcp-events';
import type { JSONRPCMessage, JSONRPCRequest } from './json-rpc-message';
import type { MCPTransport } from './mcp-transport';
import {
  LATEST_LEGACY_PROTOCOL_VERSION,
  LATEST_PROTOCOL_VERSION,
} from './types';

const event = {
  name: 'issue.created',
  description: 'New issues in a project',
  delivery: ['webhook', 'poll'],
  inputSchema: {
    type: 'object',
    properties: { project: { type: 'string' } },
    required: ['project'],
  },
  payloadSchema: { type: 'object' },
};
const secret = `whsec_${btoa('a'.repeat(32))}`;
const subscription = {
  name: event.name,
  arguments: { project: 'ABC' },
  delivery: { url: 'https://receiver.example/hooks/abc', secret },
};
const grant = { id: 'sub_123', refreshBefore: '2026-10-06T00:00:00Z' };

class EventTransport implements MCPTransport {
  onmessage?: (message: JSONRPCMessage) => void;
  onclose?: () => void;
  onerror?: (error: Error) => void;
  readonly sent: JSONRPCRequest[] = [];
  result: Record<string, unknown> = { events: [event], nextCursor: 'page-2' };
  error?: { code: number; message: string; data?: unknown };
  respond = true;

  constructor(
    readonly supportsProtocolVersionDiscovery = false,
    readonly eventsCapability: unknown = {},
  ) {}

  async start() {}
  async close() {
    this.onclose?.();
  }
  async send(message: JSONRPCMessage) {
    if (!('method' in message) || !('id' in message)) return;
    this.sent.push(message);
    const capabilities = { events: this.eventsCapability };
    const result =
      message.method === 'server/discover'
        ? { supportedVersions: [LATEST_PROTOCOL_VERSION], capabilities }
        : message.method === 'initialize'
          ? {
              protocolVersion: LATEST_LEGACY_PROTOCOL_VERSION,
              capabilities,
              serverInfo: { name: 'events', version: '1' },
            }
          : this.result;
    if (message.method.startsWith('events/')) {
      if (!this.respond) return;
      if (this.error) {
        this.onmessage?.({ jsonrpc: '2.0', id: message.id, error: this.error });
        return;
      }
    }
    this.onmessage?.({
      jsonrpc: '2.0',
      id: message.id,
      result: {
        ...(this.supportsProtocolVersionDiscovery
          ? { resultType: 'complete' }
          : {}),
        ...result,
      },
    });
  }
}

const clients: MCPClient[] = [];
async function connect(transport = new EventTransport()) {
  const client = await createMCPClient({ transport });
  clients.push(client);
  return client;
}
afterEach(async () => {
  await Promise.all(clients.splice(0).map(client => client.close()));
  vi.useRealTimers();
});

describe.each([false, true])('MCP events (modern protocol: %s)', modern => {
  it('lists a single authenticated catalog page and preserves schemas and metadata', async () => {
    const transport = new EventTransport(modern);
    transport.result = {
      events: [{ ...event, _meta: { vendor: 'example' } }],
      nextCursor: 'page-2',
    };
    const client = await connect(transport);
    expect(
      await client.experimental_listEvents({ params: { cursor: 'page-1' } }),
    ).toMatchObject(transport.result);
    expect(transport.sent.at(-1)).toMatchObject({
      method: 'events/list',
      params: { cursor: 'page-1' },
    });
    expect(
      transport.sent.filter(request => request.method === 'events/list'),
    ).toHaveLength(1);
    if (modern)
      expect(transport.sent.at(-1)?.params?._meta).toMatchObject({
        'io.modelcontextprotocol/protocolVersion': LATEST_PROTOCOL_VERSION,
      });
  });

  it.each([undefined, null, 'replay-position'])(
    'preserves cursor %s and reports replay gaps',
    async cursor => {
      const transport = new EventTransport(modern);
      transport.result = {
        ...grant,
        ...(cursor === undefined ? {} : { cursor }),
        truncated: true,
      };
      const client = await connect(transport);
      expect(
        await client.experimental_subscribeEvent({
          ...subscription,
          cursor: 'saved',
          maxAgeMs: 300_000,
          ttlMs: 60_000,
        }),
      ).toMatchObject({ ...grant, cursor: cursor ?? null, truncated: true });
      expect(transport.sent.at(-1)).toMatchObject({
        method: 'events/subscribe',
        params: {
          ...subscription,
          cursor: 'saved',
          maxAgeMs: 300_000,
          ttlMs: 60_000,
        },
      });
    },
  );

  it('preserves no-expiry grants and delivery health on refresh', async () => {
    const transport = new EventTransport(modern);
    transport.result = {
      id: 'sub_123',
      refreshBefore: null,
      deliveryStatus: {
        active: false,
        lastError: 'http_5xx',
        throttled: true,
        retryAfterMs: 5000,
      },
    };
    const client = await connect(transport);
    expect(
      await client.experimental_subscribeEvent({
        ...subscription,
        ttlMs: null,
      }),
    ).toMatchObject(transport.result);
  });

  it('unsubscribes by tuple without sending a secret or response id', async () => {
    const transport = new EventTransport(modern);
    transport.result = {};
    const client = await connect(transport);
    // The delivery object can also be reused from the original subscribe call.
    await client.experimental_unsubscribeEvent(subscription);
    const request = transport.sent.at(-1)!;
    expect(request).toMatchObject({
      method: 'events/unsubscribe',
      params: {
        name: event.name,
        arguments: subscription.arguments,
        delivery: { url: subscription.delivery.url },
      },
    });
    expect(request.params?.delivery).toEqual({
      url: subscription.delivery.url,
    });
    expect(request.params).not.toHaveProperty('id');
  });
});

it.each([undefined, null, false, [], 'events'])(
  'rejects missing or invalid events capability (%s)',
  async capability => {
    const transport = new EventTransport(
      false,
      capability === undefined ? null : capability,
    );
    const client = await connect(transport);
    await expect(client.experimental_listEvents()).rejects.toThrow(
      'Server does not support events',
    );
    expect(
      transport.sent.some(request => request.method.startsWith('events/')),
    ).toBe(false);
  },
);

it('does not cache a catalog across requests or credentials', async () => {
  const transport = new EventTransport();
  const client = await connect(transport);
  await client.experimental_listEvents();
  transport.result = { events: [] };
  expect(await client.experimental_listEvents()).toMatchObject({ events: [] });
});

it('rejects malformed response fields', async () => {
  const transport = new EventTransport();
  const client = await connect(transport);
  transport.result = { events: [{ ...event, delivery: [] }] };
  await expect(client.experimental_listEvents()).rejects.toThrow(
    'Failed to parse server response',
  );
  transport.result = { id: 'sub_123' };
  await expect(
    client.experimental_subscribeEvent(subscription),
  ).rejects.toThrow('Failed to parse server response');
});

it('does not silently accept an unsolicited indefinite grant', async () => {
  const transport = new EventTransport();
  transport.result = { id: 'sub_123', refreshBefore: null };
  const client = await connect(transport);
  await expect(
    client.experimental_subscribeEvent(subscription),
  ).rejects.toThrow('without an explicit ttlMs: null');
});

it.each([
  { delivery: { url: 'http://receiver.example/hook', secret } },
  { delivery: { url: subscription.delivery.url, secret: 'chosen-secret' } },
  {
    delivery: {
      url: subscription.delivery.url,
      secret: `whsec_${btoa('short')}`,
    },
  },
  { ttlMs: -1 },
  { maxAgeMs: 1.5 },
])(
  'rejects invalid subscription parameters before sending: %j',
  async invalid => {
    const transport = new EventTransport();
    const client = await connect(transport);
    await expect(
      client.experimental_subscribeEvent({ ...subscription, ...invalid }),
    ).rejects.toThrow();
    expect(
      transport.sent.some(request => request.method === 'events/subscribe'),
    ).toBe(false);
  },
);

it('propagates protocol errors without automatically retrying subscriptions', async () => {
  const transport = new EventTransport();
  transport.error = {
    code: -32012,
    message: 'Forbidden',
    data: { kind: 'event' },
  };
  const client = await connect(transport);
  await expect(
    client.experimental_subscribeEvent(subscription),
  ).rejects.toMatchObject({ code: -32012 });
  expect(
    transport.sent.filter(request => request.method === 'events/subscribe'),
  ).toHaveLength(1);
});

it('supports abort and timeout options', async () => {
  const transport = new EventTransport();
  const client = await connect(transport);
  transport.respond = false;
  const controller = new AbortController();
  const aborted = client.experimental_listEvents({
    options: { signal: controller.signal },
  });
  controller.abort();
  await expect(aborted).rejects.toThrow('Request was aborted');
  await expect(
    client.experimental_subscribeEvent({
      ...subscription,
      options: { timeout: 1 },
    }),
  ).rejects.toThrow('Request timed out');
});

it('closing the foreground client never unsubscribes a durable watch', async () => {
  const transport = new EventTransport();
  transport.result = grant;
  const client = await connect(transport);
  await client.experimental_subscribeEvent(subscription);
  await client.close();
  expect(
    transport.sent.some(request => request.method === 'events/unsubscribe'),
  ).toBe(false);
});

it('generates distinct 32-byte Standard Webhooks secrets', () => {
  const first = generateMCPWebhookSecret();
  expect(first).toMatch(/^whsec_/);
  expect(atob(first.slice(6))).toHaveLength(32);
  expect(generateMCPWebhookSecret()).not.toBe(first);
});
