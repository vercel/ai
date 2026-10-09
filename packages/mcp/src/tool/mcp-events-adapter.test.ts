import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createMCPClient,
  type ManagedMCPClient,
  type MCPClientConfig,
} from './mcp-client';
import type {
  MCPEventOperations,
  ManagedSubscription,
} from './mcp-events-adapter';
import { MockMCPTransport } from './mock-mcp-transport';
import { eventDefinition, MemoryEventStore } from './__fixtures__/mcp-events';
import { LATEST_LEGACY_PROTOCOL_VERSION } from './types';

describe('managed MCP events', () => {
  const clients: ManagedMCPClient[] = [];
  afterEach(async () => {
    await Promise.all(clients.splice(0).map(client => client.close()));
  });

  async function setup() {
    const subscription: ManagedSubscription = {
      id: 'managed_1',
      name: eventDefinition.name,
      arguments: { document_id: 'doc_1' },
      status: 'pending',
      expiresAt: null,
    };
    const page = { subscriptions: [subscription], nextCursor: 'page_2' };
    const adapter = {
      subscribe: vi.fn<MCPEventOperations['subscribe']>(
        async function (this: MCPEventOperations) {
          expect(this).toBe(adapter);
          return subscription;
        },
      ),
      getSubscription: vi.fn<MCPEventOperations['getSubscription']>(
        async function (this: MCPEventOperations) {
          expect(this).toBe(adapter);
          return subscription;
        },
      ),
      listSubscriptions: vi.fn<MCPEventOperations['listSubscriptions']>(
        async function (this: MCPEventOperations) {
          expect(this).toBe(adapter);
          return page;
        },
      ),
      unsubscribe: vi.fn<MCPEventOperations['unsubscribe']>(
        async function (this: MCPEventOperations) {
          expect(this).toBe(adapter);
          return {
            ...subscription,
            status: 'stopped',
            cleanupStatus: 'pending',
          };
        },
      ),
    };
    const transport = new MockMCPTransport();
    const originalSend = transport.send.bind(transport);
    const send = vi
      .spyOn(transport, 'send')
      .mockImplementation(async message => {
        if ('method' in message && message.method.startsWith('events/')) {
          expect(message.method).toBe('events/list');
          if ('id' in message)
            transport.onmessage?.({
              jsonrpc: '2.0',
              id: message.id,
              result: { events: [eventDefinition], nextCursor: 'catalog_2' },
            });
          return;
        }
        await originalSend(message);
      });
    const client = await createMCPClient({
      transport,
      initialInitializeResult: {
        protocolVersion: LATEST_LEGACY_PROTOCOL_VERSION,
        serverInfo: { name: 'events', version: '1' },
        capabilities: { events: {}, tools: {} },
      },
      experimental_events: { adapter: { createAdapter: () => adapter } },
    });
    clients.push(client);
    send.mockClear();
    return { client, adapter, transport, send, subscription, page };
  }

  it('discovers the catalog over MCP without calling the adapter', async () => {
    const { client, adapter, send } = await setup();
    expect(
      await client.experimental_events.list({
        params: { cursor: 'catalog_1' },
      }),
    ).toEqual({ events: [eventDefinition], nextCursor: 'catalog_2' });
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0][0]).toMatchObject({
      method: 'events/list',
      params: { cursor: 'catalog_1' },
    });
    for (const operation of Object.values(adapter))
      expect(operation).not.toHaveBeenCalled();
  });

  it.each([
    { expiresAt: null },
    { expiresAt: '2030-01-01T00:00:00Z' },
    { ttlMs: 60_000 },
  ])(
    'delegates creation with %j without a store or upstream subscribe',
    async lifetime => {
      const { client, adapter, subscription, send } = await setup();
      const input = {
        name: eventDefinition.name,
        arguments: { document_id: 'doc_1' },
        context: { bindingId: 'binding_1' },
        idempotencyKey: 'intent_1',
        ...lifetime,
        options: {
          signal: new AbortController().signal,
          timeout: 5000,
          maxTotalTimeout: 10_000,
        },
      };
      expect(await client.experimental_events.subscribe(input)).toBe(
        subscription,
      );
      expect(adapter.subscribe).toHaveBeenCalledExactlyOnceWith(input);
      expect(adapter.subscribe.mock.calls[0][0]).toBe(input);
      expect(send).not.toHaveBeenCalled();
    },
  );

  it('delegates lookup, pagination and stop, preserving cleanup state and options', async () => {
    const { client, adapter, subscription, page, send } = await setup();
    const options = { signal: new AbortController().signal, timeout: 1000 };
    const lookup = { id: subscription.id, options };
    expect(await client.experimental_events.getSubscription(lookup)).toBe(
      subscription,
    );
    expect(adapter.getSubscription).toHaveBeenCalledExactlyOnceWith(lookup);
    const listing = {
      cursor: 'page_1',
      limit: 10,
      status: 'pending' as const,
      options,
    };
    expect(await client.experimental_events.listSubscriptions(listing)).toBe(
      page,
    );
    expect(adapter.listSubscriptions).toHaveBeenCalledExactlyOnceWith(listing);
    await client.experimental_events.listSubscriptions();
    expect(adapter.listSubscriptions).toHaveBeenLastCalledWith(undefined);
    expect(await client.experimental_events.unsubscribe(lookup)).toMatchObject({
      id: subscription.id,
      status: 'stopped',
      cleanupStatus: 'pending',
    });
    expect(adapter.unsubscribe).toHaveBeenCalledExactlyOnceWith(lookup);
    expect(send).not.toHaveBeenCalled();
  });

  it('preserves adapter errors and the idempotency key on a create retry', async () => {
    const { client, adapter, subscription, send } = await setup();
    const error = Object.assign(new Error('Consent required'), {
      code: 'needs_auth',
    });
    adapter.subscribe.mockRejectedValueOnce(error);
    const input = {
      name: eventDefinition.name,
      arguments: {},
      expiresAt: null,
      idempotencyKey: 'intent_1',
    };
    await expect(client.experimental_events.subscribe(input)).rejects.toBe(
      error,
    );
    expect(await client.experimental_events.subscribe(input)).toBe(
      subscription,
    );
    expect(adapter.subscribe.mock.calls.map(([value]) => value)).toEqual([
      input,
      input,
    ]);
    expect(send).not.toHaveBeenCalled();
  });

  it.each(['getSubscription', 'listSubscriptions', 'unsubscribe'] as const)(
    'preserves errors from %s without falling back to MCP',
    async operation => {
      const { client, adapter, send } = await setup();
      const error = Object.assign(new Error('Temporarily unavailable'), {
        code: 'unavailable',
      });
      adapter[operation].mockRejectedValueOnce(error);
      const input = { id: 'managed_1', options: {} };
      await expect(client.experimental_events[operation](input)).rejects.toBe(
        error,
      );
      expect(send).not.toHaveBeenCalled();
    },
  );

  it('does not expose refresh or unsubscribe watches when the client closes', async () => {
    const { client, adapter } = await setup();
    expect(client.experimental_events).not.toHaveProperty('refresh');
    await client.close();
    expect(adapter.unsubscribe).not.toHaveBeenCalled();
  });

  it.each([{ store: new MemoryEventStore() }, { validateArguments: () => {} }])(
    'rejects mixed managed/direct configuration before starting a transport: %j',
    async direct => {
      const { adapter } = await setup();
      const transport = new MockMCPTransport();
      const start = vi.spyOn(transport, 'start');
      await expect(
        createMCPClient({
          transport,
          experimental_events: {
            adapter: { createAdapter: () => adapter },
            ...direct,
          },
        } as unknown as MCPClientConfig),
      ).rejects.toThrow('either an adapter or a store');
      expect(start).not.toHaveBeenCalled();
    },
  );
});
