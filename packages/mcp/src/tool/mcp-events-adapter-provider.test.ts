import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createMCPClient,
  type ManagedMCPClient,
  type MCPClientConfig,
} from './mcp-client';
import type {
  MCPEventsAdapter,
  MCPEventsAdapterProvider,
  ManagedSubscription,
} from './mcp-events-adapter';
import * as transports from './mcp-transport';
import { MockMCPTransport } from './mock-mcp-transport';
import { MemoryEventStore } from './__fixtures__/mcp-events';

function createAdapter(): MCPEventsAdapter {
  const subscription: ManagedSubscription = {
    id: 'managed_1',
    name: 'comment.created',
    arguments: {},
    status: 'active',
    expiresAt: null,
  };
  return {
    subscribe: vi.fn(async () => subscription),
    getSubscription: vi.fn(async () => subscription),
    listSubscriptions: vi.fn(async () => ({ subscriptions: [subscription] })),
    unsubscribe: vi.fn(async () => ({
      ...subscription,
      status: 'stopped' as const,
    })),
  };
}

const input = {
  name: 'comment.created',
  arguments: {},
  expiresAt: null,
  idempotencyKey: 'intent_1',
};

describe('managed MCP event adapter providers', () => {
  const clients: ManagedMCPClient[] = [];
  afterEach(async () => {
    await Promise.all(clients.splice(0).map(client => client.close()));
    vi.restoreAllMocks();
  });

  it.each(['http', 'sse'] as const)(
    'binds the configured %s URL once before starting, without passing credentials',
    async type => {
      const transport = new MockMCPTransport();
      const start = vi.spyOn(transport, 'start');
      vi.spyOn(transports, 'createMcpTransport').mockReturnValue(transport);
      const adapter = createAdapter();
      const provider: MCPEventsAdapterProvider = {
        createAdapter: vi.fn(function (this: MCPEventsAdapterProvider) {
          expect(this).toBe(provider);
          expect(start).not.toHaveBeenCalled();
          return adapter;
        }),
      };
      const url = 'https://example.com/tenant/mcp?region=west';
      const client = await createMCPClient({
        transport: { type, url, headers: { Authorization: 'Bearer test' } },
        experimental_events: { adapter: provider },
      });
      clients.push(client);
      expect(provider.createAdapter).toHaveBeenCalledExactlyOnceWith({ url });
      await client.experimental_events.subscribe(input);
      await client.experimental_events.getSubscription({ id: 'managed_1' });
      await client.experimental_events.listSubscriptions();
      await client.experimental_events.unsubscribe({ id: 'managed_1' });
      expect(adapter.subscribe).toHaveBeenCalledExactlyOnceWith(input);
      expect(adapter.getSubscription).toHaveBeenCalledExactlyOnceWith({
        id: 'managed_1',
      });
      expect(adapter.listSubscriptions).toHaveBeenCalledExactlyOnceWith(
        undefined,
      );
      expect(adapter.unsubscribe).toHaveBeenCalledExactlyOnceWith({
        id: 'managed_1',
      });
      expect(provider.createAdapter).toHaveBeenCalledOnce();
    },
  );

  it.each(['callable', 'non-callable', 'inherited'] as const)(
    'preserves an existing adapter with a %s createAdapter member',
    async kind => {
      const adapter = createAdapter();
      const factory = vi.fn(() => {
        throw new Error('Unrelated factory must not run');
      });
      if (kind === 'inherited') {
        Object.setPrototypeOf(adapter, { createAdapter: factory });
      } else {
        Object.assign(adapter, {
          createAdapter: kind === 'callable' ? factory : 'metadata',
        });
      }
      const client = await createMCPClient({
        transport: new MockMCPTransport(),
        experimental_events: { adapter },
      });
      clients.push(client);
      await client.experimental_events.subscribe(input);
      expect(adapter.subscribe).toHaveBeenCalledExactlyOnceWith(input);
      expect(factory).not.toHaveBeenCalled();
    },
  );

  it('does not infer a URL from arbitrary custom transport properties', async () => {
    const transport = Object.assign(new MockMCPTransport(), {
      url: 'https://not-a-standard-property.example',
    });
    const provider = { createAdapter: vi.fn(createAdapter) };
    const client = await createMCPClient({
      transport,
      experimental_events: { adapter: provider },
    });
    clients.push(client);
    expect(provider.createAdapter).toHaveBeenCalledExactlyOnceWith({
      url: undefined,
    });
    await client.experimental_events.subscribe(input);
  });

  it('creates a separate adapter for each client when a provider is reused', async () => {
    vi.spyOn(transports, 'createMcpTransport').mockImplementation(
      () => new MockMCPTransport(),
    );
    const adapters = [createAdapter(), createAdapter()];
    const provider = {
      createAdapter: vi
        .fn()
        .mockReturnValueOnce(adapters[0])
        .mockReturnValueOnce(adapters[1]),
    };
    for (const url of [
      'https://first.example/mcp',
      'https://second.example/mcp',
    ]) {
      clients.push(
        await createMCPClient({
          transport: { type: 'http', url },
          experimental_events: { adapter: provider },
        }),
      );
    }
    await clients[0].experimental_events.subscribe(input);
    await clients[1].experimental_events.subscribe({
      ...input,
      idempotencyKey: 'intent_2',
    });
    expect(provider.createAdapter.mock.calls).toEqual([
      [{ url: 'https://first.example/mcp' }],
      [{ url: 'https://second.example/mcp' }],
    ]);
    expect(adapters[0].subscribe).toHaveBeenCalledExactlyOnceWith(input);
    expect(adapters[1].subscribe).toHaveBeenCalledExactlyOnceWith({
      ...input,
      idempotencyKey: 'intent_2',
    });
  });

  it('preserves provider errors without starting or modifying the transport', async () => {
    const transport = new MockMCPTransport();
    const start = vi.spyOn(transport, 'start');
    const onmessage = vi.fn();
    transport.onmessage = onmessage;
    const error = new Error('Missing endpoint configuration');
    const provider = {
      createAdapter() {
        throw error;
      },
    };
    await expect(
      createMCPClient({
        transport,
        experimental_events: { adapter: provider },
      }),
    ).rejects.toBe(error);
    expect(start).not.toHaveBeenCalled();
    expect(transport.onmessage).toBe(onmessage);
  });

  it.each([{ store: new MemoryEventStore() }, { validateArguments: () => {} }])(
    'rejects mixed configuration before invoking the provider: %j',
    async direct => {
      const transport = new MockMCPTransport();
      const start = vi.spyOn(transport, 'start');
      const provider = { createAdapter: vi.fn(createAdapter) };
      await expect(
        createMCPClient({
          transport,
          experimental_events: { adapter: provider, ...direct },
        } as unknown as MCPClientConfig),
      ).rejects.toThrow('either an adapter or a store');
      expect(provider.createAdapter).not.toHaveBeenCalled();
      expect(start).not.toHaveBeenCalled();
    },
  );
});
