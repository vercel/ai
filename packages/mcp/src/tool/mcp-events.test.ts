import { afterEach, describe, expect, it, vi } from 'vitest';
import * as z4 from 'zod/v4';
import { createMCPClient, type MCPClient } from './mcp-client';
import { createMCPEventWebhook } from './mcp-event-webhook';
import {
  eventDefinition,
  MemoryEventStore,
  signedRequest,
} from './__fixtures__/mcp-events';
import type { JSONRPCMessage, JSONRPCRequest } from './json-rpc-message';
import type { MCPTransport } from './mcp-transport';

class EventTransport implements MCPTransport {
  readonly supportsProtocolVersionDiscovery = true;
  readonly requests: JSONRPCRequest[] = [];
  onmessage?: (message: JSONRPCMessage) => void;
  onclose?: () => void;
  onerror?: (error: Error) => void;
  eventsSupported = true;
  listResult: Record<string, unknown> = { events: [eventDefinition] };
  beforeSubscribe?: (request: JSONRPCRequest) => Promise<void>;
  subscribeError?: { code: number; message: string };

  async start() {}
  async close() {
    this.onclose?.();
  }

  async send(message: JSONRPCMessage) {
    if (!('method' in message) || !('id' in message)) return;
    this.requests.push(message);
    let result: Record<string, unknown>;
    switch (message.method) {
      case 'server/discover':
        result = {
          supportedVersions: ['2026-07-28'],
          capabilities: {
            tools: {},
            ...(this.eventsSupported ? { events: {} } : {}),
          },
        };
        break;
      case 'events/list':
        result = this.listResult;
        break;
      case 'events/subscribe':
        await this.beforeSubscribe?.(message);
        if (this.subscribeError) {
          this.onmessage?.({
            jsonrpc: '2.0',
            id: message.id,
            error: this.subscribeError,
          });
          return;
        }
        result = {
          id: 'sub_1',
          refreshBefore:
            message.params?.ttlMs === null
              ? null
              : new Date(Date.now() + 60_000).toISOString(),
          cursor: 'cursor_1',
          truncated: false,
        };
        break;
      default:
        result = {};
    }
    this.onmessage?.({
      jsonrpc: '2.0',
      id: message.id,
      result: { resultType: 'complete', ...result },
    });
  }
}

describe('MCP client events', () => {
  const clients: MCPClient[] = [];
  afterEach(async () => {
    await Promise.all(clients.splice(0).map(client => client.close()));
  });
  async function setup(
    transport = new EventTransport(),
    store = new MemoryEventStore(),
  ) {
    const client = await createMCPClient({
      transport,
      events: {
        store,
        async validateArguments({ definition, arguments: args }) {
          expect(definition.name).toBe(eventDefinition.name);
          z4.object({ document_id: z4.string() }).strict().parse(args);
        },
      },
    });
    clients.push(client);
    return { client, transport, store };
  }
  const subscribeOptions = {
    name: 'comment.created',
    arguments: { document_id: 'doc_1' },
    delivery: {
      mode: 'webhook' as const,
      url: 'https://app.example/events?tenant=one',
    },
  };

  it('sends filter arguments without validating inputSchema by default', async () => {
    const transport = new EventTransport();
    const client = await createMCPClient({
      transport,
      events: { store: new MemoryEventStore() },
    });
    clients.push(client);
    await client.events.experimental_subscribe({
      ...subscribeOptions,
      arguments: {},
    });
    expect(
      transport.requests.find(request => request.method === 'events/subscribe'),
    ).toMatchObject({ params: { arguments: {} } });
  });

  it('lists events through existing modern MCP discovery and metadata', async () => {
    const { client, transport } = await setup();
    expect((await client.events.experimental_list()).events).toEqual([
      eventDefinition,
    ]);
    expect(transport.requests[1]).toMatchObject({
      method: 'events/list',
      params: {
        _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28' },
      },
    });
  });

  it('persists delivery.secret before subscribing and handles signed verification immediately', async () => {
    const { client, transport, store } = await setup();
    const webhook = createMCPEventWebhook({
      store,
      async onEvent() {
        throw new Error('Verification must not call onEvent');
      },
    });
    transport.beforeSubscribe = async request => {
      const delivery = request.params?.delivery as {
        url: string;
        secret: string;
      };
      const key = new URL(delivery.url).searchParams.get(
        'mcp_event_subscription',
      )!;
      const stored = (await store.get(key))!;
      expect(stored.status).toBe('pending');
      expect(stored.delivery.secret).toBe(delivery.secret);
      expect(Buffer.from(delivery.secret.slice(6), 'base64')).toHaveLength(32);
      expect(new URL(delivery.url).searchParams.get('tenant')).toBe('one');
      const response = await webhook(
        signedRequest(
          stored,
          { type: 'verification', challenge: 'challenge_123' },
          { id: 'msg_verification_1' },
        ),
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ challenge: 'challenge_123' });
    };
    const result = await client.events.experimental_subscribe(subscribeOptions);
    expect(result.id).toBe('sub_1');
    expect(await store.getById(result.id)).toMatchObject({
      id: result.id,
      status: 'active',
    });
    expect(result).not.toHaveProperty('secret');
  });

  it('refreshes from persisted state after closing and recreating the client, preserving identity and secret', async () => {
    const { client, store } = await setup();
    const result = await client.events.experimental_subscribe({
      ...subscribeOptions,
      ttlMs: 60_000,
      maxAgeMs: 5000,
    });
    const before = (await store.getById(result.id))!;
    await store.update(before.key, { cursor: 'cursor_from_delivery' });
    await client.close();
    const restored = await setup(new EventTransport(), store);
    await restored.client.events.experimental_refresh({ id: result.id });
    expect(restored.transport.requests.at(-1)).toMatchObject({
      method: 'events/subscribe',
      params: {
        name: before.name,
        arguments: before.arguments,
        delivery: before.delivery,
        cursor: 'cursor_from_delivery',
        ttlMs: 60_000,
        maxAgeMs: 5000,
      },
    });
  });

  it('unsubscribes using the protocol identity and removes persisted state only after success', async () => {
    const { client, transport, store } = await setup();
    const result = await client.events.experimental_subscribe(subscribeOptions);
    const stored = (await store.getById(result.id))!;
    await client.events.experimental_unsubscribe({ id: result.id });
    expect(transport.requests.at(-1)).toMatchObject({
      method: 'events/unsubscribe',
      params: {
        name: stored.name,
        arguments: stored.arguments,
        delivery: { mode: 'webhook', url: stored.delivery.url },
      },
    });
    expect(transport.requests.at(-1)?.params).not.toHaveProperty('id');
    expect(await store.get(stored.key)).toBeUndefined();
  });

  it.each(['refresh', 'unsubscribe'])(
    'recovers an uncertain non-expiring subscription by key with %s after recreating the client',
    async action => {
      const { client, transport, store } = await setup();
      const remoteSubscriptions = new Set<string>();
      transport.beforeSubscribe = async request => {
        const delivery = request.params?.delivery as { url: string };
        remoteSubscriptions.add(delivery.url);
        throw new Error('Subscribe response lost');
      };
      await expect(
        client.events.experimental_subscribe({
          ...subscribeOptions,
          ttlMs: null,
        }),
      ).rejects.toThrow('Subscribe response lost');
      const pending = [...store.records.values()][0];
      expect(pending).toMatchObject({ status: 'pending', ttlMs: null });
      expect(pending.id).toBeUndefined();
      const original = transport.requests.at(-1)!;
      await client.close();

      const restored = await setup(new EventTransport(), store);
      const send = restored.transport.send.bind(restored.transport);
      restored.transport.send = async message => {
        if ('method' in message && message.method === 'events/unsubscribe') {
          const delivery = message.params?.delivery as { url: string };
          remoteSubscriptions.delete(delivery.url);
        }
        await send(message);
      };
      restored.transport.beforeSubscribe = async request => {
        const delivery = request.params?.delivery as { url: string };
        remoteSubscriptions.add(delivery.url);
      };
      if (action === 'refresh') {
        const result = await restored.client.events.experimental_refresh({
          key: pending.key,
        });
        expect(restored.transport.requests.at(-1)?.params).toEqual(
          original.params,
        );
        expect(remoteSubscriptions.size).toBe(1);
        expect(store.records.size).toBe(1);
        expect(await store.get(pending.key)).toMatchObject({
          id: result.id,
          status: 'active',
          refreshBefore: null,
          delivery: pending.delivery,
        });
      } else {
        await restored.client.events.experimental_unsubscribe({
          key: pending.key,
        });
        expect(restored.transport.requests.at(-1)).toMatchObject({
          method: 'events/unsubscribe',
          params: {
            name: pending.name,
            arguments: pending.arguments,
            delivery: { mode: 'webhook', url: pending.delivery.url },
          },
        });
        expect(await store.get(pending.key)).toBeUndefined();
        expect(remoteSubscriptions.size).toBe(0);
      }
    },
  );

  it.each(['experimental_refresh', 'experimental_unsubscribe'] as const)(
    'rejects an unknown key before sending %s',
    async method => {
      const { client, transport } = await setup();
      await expect(client.events[method]({ key: 'missing' })).rejects.toThrow(
        'Unknown MCP event subscription: missing',
      );
      expect(transport.requests).toHaveLength(1);
    },
  );

  it.each(['request', 'persistence'])(
    'returns 503 during renewal %s and accepts delivery after the new expiration is persisted',
    async phase => {
      const { client, transport, store } = await setup();
      const result =
        await client.events.experimental_subscribe(subscribeOptions);
      const stored = (await store.getById(result.id))!;
      await store.update(stored.key, {
        refreshBefore: new Date(Date.now() - 1000).toISOString(),
      });
      const onEvent = vi.fn(async () => {});
      const webhook = createMCPEventWebhook({ store, onEvent });
      const event = {
        eventId: 'evt_1',
        name: stored.name,
        timestamp: new Date().toISOString(),
        data: { text: 'Delivered during renewal' },
        cursor: 'cursor_2',
      };
      expect((await webhook(signedRequest(stored, event))).status).toBe(410);

      const deliverDuringRenewal = async () => {
        expect((await webhook(signedRequest(stored, event))).status).toBe(503);
        expect(onEvent).not.toHaveBeenCalled();
        expect(await store.get(stored.key)).toMatchObject({
          status: 'pending',
          cursor: stored.cursor,
        });
      };
      if (phase === 'request') {
        transport.beforeSubscribe = deliverDuringRenewal;
      } else {
        const update = store.update.bind(store);
        store.update = async (key, patch) => {
          if (patch.status === 'active') await deliverDuringRenewal();
          await update(key, patch);
        };
      }

      const renewed = await client.events.experimental_refresh({
        id: result.id,
      });
      expect(await store.get(stored.key)).toMatchObject({
        status: 'active',
        refreshBefore: renewed.refreshBefore,
        delivery: stored.delivery,
      });
      expect((await webhook(signedRequest(stored, event))).status).toBe(204);
      expect(onEvent).toHaveBeenCalledOnce();
      expect((await store.get(stored.key))?.cursor).toBe('cursor_2');
    },
  );

  it.each(['refresh', 'unsubscribe'])(
    'retains pending state after a failed renewal and allows %s by the saved ID',
    async action => {
      const { client, transport, store } = await setup();
      const result =
        await client.events.experimental_subscribe(subscribeOptions);
      const stored = (await store.getById(result.id))!;
      transport.subscribeError = {
        code: -32015,
        message: 'CallbackEndpointError',
      };
      await expect(
        client.events.experimental_refresh({ id: result.id }),
      ).rejects.toMatchObject({ code: -32015 });
      expect(await store.getById(result.id)).toMatchObject({
        status: 'pending',
        refreshBefore: stored.refreshBefore,
      });

      transport.subscribeError = undefined;
      if (action === 'refresh') {
        await client.events.experimental_refresh({ id: result.id });
        expect(await store.getById(result.id)).toMatchObject({
          status: 'active',
        });
      } else {
        await client.events.experimental_unsubscribe({ id: result.id });
        expect(await store.get(stored.key)).toBeUndefined();
      }
    },
  );

  it('rejects unsupported servers without sending event requests', async () => {
    const transport = new EventTransport();
    transport.eventsSupported = false;
    const { client } = await setup(transport);
    await expect(client.events.experimental_list()).rejects.toThrow(
      'Server does not support events',
    );
    expect(transport.requests).toHaveLength(1);
  });

  it('allows discovery without storage but requires storage before subscribing', async () => {
    const client = await createMCPClient({ transport: new EventTransport() });
    clients.push(client);
    expect((await client.events.experimental_list()).events).toHaveLength(1);
    await expect(
      client.events.experimental_subscribe(subscribeOptions),
    ).rejects.toThrow('events.store');
  });

  it('awaits optional filter validation before persisting a secret or sending subscribe', async () => {
    const { client, transport, store } = await setup();
    await expect(
      client.events.experimental_subscribe({
        ...subscribeOptions,
        arguments: {},
      }),
    ).rejects.toThrow();
    expect(store.records.size).toBe(0);
    expect(
      transport.requests.some(request => request.method === 'events/subscribe'),
    ).toBe(false);
  });

  it('follows event catalog pagination', async () => {
    const { client, transport } = await setup();
    transport.listResult = { events: [], nextCursor: 'page_2' };
    const send = transport.send.bind(transport);
    transport.send = async message => {
      if (
        'method' in message &&
        message.method === 'events/list' &&
        message.params?.cursor === 'page_2'
      ) {
        transport.listResult = { events: [eventDefinition] };
      }
      await send(message);
    };
    await client.events.experimental_subscribe(subscribeOptions);
    expect(
      transport.requests.filter(request => request.method === 'events/list'),
    ).toHaveLength(2);
  });

  it('rejects repeated pagination cursors', async () => {
    const { client, transport } = await setup();
    transport.listResult = { events: [], nextCursor: 'same' };
    await expect(
      client.events.experimental_subscribe(subscribeOptions),
    ).rejects.toThrow('Repeated');
  });

  it('rejects event types that only offer poll/push', async () => {
    const { client, transport } = await setup();
    transport.listResult = {
      events: [{ ...eventDefinition, delivery: ['poll'] }],
    };
    await expect(
      client.events.experimental_subscribe(subscribeOptions),
    ).rejects.toThrow('does not support webhook');
  });

  it.each([
    'http://app.example/events',
    'https://user:password@app.example/events',
    'https://app.example/events#fragment',
  ])('rejects callback URL %s', async url => {
    const { client } = await setup();
    await expect(
      client.events.experimental_subscribe({
        ...subscribeOptions,
        delivery: { mode: 'webhook', url },
      }),
    ).rejects.toThrow('HTTPS');
  });

  it('requires explicit opt-in for literal loopback HTTP and does not forward the development option', async () => {
    const { client, transport } = await setup();
    const delivery = {
      mode: 'webhook' as const,
      url: 'http://127.0.0.1:3003/events',
    };
    await expect(
      client.events.experimental_subscribe({ ...subscribeOptions, delivery }),
    ).rejects.toThrow('HTTPS');
    await client.events.experimental_subscribe({
      ...subscribeOptions,
      delivery: { ...delivery, allowInsecureLocalhost: true },
    });
    expect(transport.requests.at(-1)?.params?.delivery).not.toHaveProperty(
      'allowInsecureLocalhost',
    );
    await expect(
      client.events.experimental_subscribe({
        ...subscribeOptions,
        delivery: {
          ...delivery,
          url: 'http://app.example/events',
          allowInsecureLocalhost: true,
        },
      }),
    ).rejects.toThrow('HTTPS');
  });

  it('rejects invalid secrets and lifetime options', async () => {
    const { client } = await setup();
    await expect(
      client.events.experimental_subscribe({
        ...subscribeOptions,
        delivery: { ...subscribeOptions.delivery, secret: 'whsec_c2hvcnQ=' },
      }),
    ).rejects.toThrow('24–64');
    await expect(
      client.events.experimental_subscribe({ ...subscribeOptions, ttlMs: -1 }),
    ).rejects.toThrow('lifetime');
    await expect(
      client.events.experimental_subscribe({
        ...subscribeOptions,
        maxAgeMs: -1,
      }),
    ).rejects.toThrow('lifetime');
  });

  it('preserves error metadata and pending verification state when subscribe fails', async () => {
    const { client, transport, store } = await setup();
    transport.subscribeError = {
      code: -32015,
      message: 'CallbackEndpointError',
    };
    await expect(
      client.events.experimental_subscribe(subscribeOptions),
    ).rejects.toMatchObject({ code: -32015 });
    expect([...store.records.values()][0]).toMatchObject({
      status: 'pending',
      delivery: { secret: expect.stringMatching(/^whsec_/) },
    });
  });
});
