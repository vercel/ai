import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createMCPClient,
  type ManagedMCPClient,
  type MCPClientConfig,
} from './mcp-client';
import type {
  ManagedMCPEventOperations,
  MCPEventsAdapter,
  ManagedSubscription,
} from './mcp-events-adapter';
import * as transports from './mcp-transport';
import { MockMCPTransport } from './mock-mcp-transport';
import { MemoryEventStore } from './__fixtures__/mcp-events';

function createOperations(): ManagedMCPEventOperations {
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

describe('managed MCP event adapter creation', () => {
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
      const adapter = createOperations();
      const integration: MCPEventsAdapter = {
        createAdapter: vi.fn(function (this: MCPEventsAdapter) {
          expect(this).toBe(integration);
          expect(start).not.toHaveBeenCalled();
          return adapter;
        }),
      };
      const url = 'https://example.com/tenant/mcp?region=west';
      const client = await createMCPClient({
        transport: { type, url, headers: { Authorization: 'Bearer test' } },
        experimental_events: { adapter: integration },
      });
      clients.push(client);
      expect(integration.createAdapter).toHaveBeenCalledExactlyOnceWith({
        url,
      });
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
      expect(integration.createAdapter).toHaveBeenCalledOnce();
    },
  );

  it.each([undefined, 'metadata'])(
    'rejects bound operations with createAdapter=%s before transport startup',
    async createAdapterMember => {
      const adapter = Object.assign(createOperations(), {
        createAdapter: createAdapterMember,
      });
      const transport = new MockMCPTransport();
      const start = vi.spyOn(transport, 'start');
      await expect(
        createMCPClient({
          transport,
          experimental_events: { adapter },
        } as unknown as MCPClientConfig),
      ).rejects.toThrow('must implement createAdapter');
      expect(start).not.toHaveBeenCalled();
      expect(adapter.subscribe).not.toHaveBeenCalled();
    },
  );

  it('always invokes createAdapter even if the integration also exposes lifecycle methods', async () => {
    const bound = createOperations();
    const adapter = {
      ...createOperations(),
      createAdapter: vi.fn(() => bound),
    };
    const client = await createMCPClient({
      transport: new MockMCPTransport(),
      experimental_events: { adapter },
    });
    clients.push(client);
    await client.experimental_events.subscribe(input);
    expect(adapter.createAdapter).toHaveBeenCalledOnce();
    expect(bound.subscribe).toHaveBeenCalledExactlyOnceWith(input);
    expect(adapter.subscribe).not.toHaveBeenCalled();
  });

  it('does not infer a URL from arbitrary custom transport properties', async () => {
    const transport = Object.assign(new MockMCPTransport(), {
      url: 'https://not-a-standard-property.example',
    });
    const adapter = { createAdapter: vi.fn(createOperations) };
    const client = await createMCPClient({
      transport,
      experimental_events: { adapter },
    });
    clients.push(client);
    expect(adapter.createAdapter).toHaveBeenCalledExactlyOnceWith({
      url: undefined,
    });
    await client.experimental_events.subscribe(input);
  });

  it('creates separate bound operations for each client when an adapter is reused', async () => {
    vi.spyOn(transports, 'createMcpTransport').mockImplementation(
      () => new MockMCPTransport(),
    );
    const adapters = [createOperations(), createOperations()];
    const adapter = {
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
          experimental_events: { adapter },
        }),
      );
    }
    await clients[0].experimental_events.subscribe(input);
    await clients[1].experimental_events.subscribe({
      ...input,
      idempotencyKey: 'intent_2',
    });
    expect(adapter.createAdapter.mock.calls).toEqual([
      [{ url: 'https://first.example/mcp' }],
      [{ url: 'https://second.example/mcp' }],
    ]);
    expect(adapters[0].subscribe).toHaveBeenCalledExactlyOnceWith(input);
    expect(adapters[1].subscribe).toHaveBeenCalledExactlyOnceWith({
      ...input,
      idempotencyKey: 'intent_2',
    });
  });

  it('preserves adapter errors without starting or modifying the transport', async () => {
    const transport = new MockMCPTransport();
    const start = vi.spyOn(transport, 'start');
    const onmessage = vi.fn();
    transport.onmessage = onmessage;
    const error = new Error('Missing endpoint configuration');
    const adapter = {
      createAdapter() {
        throw error;
      },
    };
    await expect(
      createMCPClient({
        transport,
        experimental_events: { adapter },
      }),
    ).rejects.toBe(error);
    expect(start).not.toHaveBeenCalled();
    expect(transport.onmessage).toBe(onmessage);
  });

  it.each([{ store: new MemoryEventStore() }, { validateArguments: () => {} }])(
    'rejects mixed configuration before invoking the adapter: %j',
    async direct => {
      const transport = new MockMCPTransport();
      const start = vi.spyOn(transport, 'start');
      const adapter = { createAdapter: vi.fn(createOperations) };
      await expect(
        createMCPClient({
          transport,
          experimental_events: { adapter, ...direct },
        } as unknown as MCPClientConfig),
      ).rejects.toThrow('either an adapter or a store');
      expect(adapter.createAdapter).not.toHaveBeenCalled();
      expect(start).not.toHaveBeenCalled();
    },
  );
});
