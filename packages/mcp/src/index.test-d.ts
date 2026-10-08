import { expectTypeOf, it } from 'vitest';
import type { JSONObject } from '@ai-sdk/provider';
import {
  MCPClientError,
  createMCPClient,
  experimental_createMCPEventWebhook,
  type Experimental_MCPEvent,
  type Experimental_MCPEventControl,
  type Experimental_MCPEventStore,
  type Experimental_MCPEvents,
  type Experimental_SubscribeEventResult,
  type Experimental_MCPEventsAdapter,
  type Experimental_MCPEventsAdapterProvider,
  type Experimental_ManagedMCPClient,
  type Experimental_ManagedMCPEvents,
  type Experimental_MCPEventsConfig,
  type Experimental_ManagedSubscribeInput,
  type Experimental_ManagedSubscription,
  type MCPClient,
  type MCPClientConfig,
} from './index';

it('exposes events on the existing client and types webhook callbacks', async () => {
  const store = {} as Experimental_MCPEventStore;
  const client = await createMCPClient({
    transport: { type: 'http', url: 'https://example.com/mcp' },
    experimental_events: { store },
  });
  expectTypeOf(
    client.experimental_events,
  ).toEqualTypeOf<Experimental_MCPEvents>();
  const result = await client.experimental_events.subscribe({
    name: 'comment.created',
    delivery: { mode: 'webhook', url: 'https://app.example/events' },
  });
  expectTypeOf(result).toEqualTypeOf<Experimental_SubscribeEventResult>();
  expectTypeOf(result.cursor).toEqualTypeOf<string | null>();
  const recovered = await client.experimental_events.refresh({
    key: 'pending_1',
  });
  expectTypeOf(recovered).toEqualTypeOf<Experimental_SubscribeEventResult>();
  expectTypeOf(recovered.cursor).toEqualTypeOf<string | null>();
  await client.experimental_events.unsubscribe({ key: 'pending_1' });
  // @ts-expect-error Select a subscription by either ID or key, never both.
  await client.experimental_events.refresh({ id: 'sub_1', key: 'pending_1' });
  // @ts-expect-error A subscription ID or key is required.
  await client.experimental_events.unsubscribe({});
  const handler = experimental_createMCPEventWebhook({
    store,
    async onEvent({ event, subscription }) {
      expectTypeOf(event).toEqualTypeOf<Experimental_MCPEvent>();
      expectTypeOf(subscription.id).toEqualTypeOf<string>();
      // @ts-expect-error Signing secrets must not be exposed to event handlers.
      subscription.delivery.secret;
    },
    async onGap({ gap, subscription, messageId }) {
      expectTypeOf(gap).toEqualTypeOf<
        Extract<Experimental_MCPEventControl, { type: 'gap' }>
      >();
      expectTypeOf(messageId).toEqualTypeOf<string>();
      expectTypeOf(gap.cursor).toEqualTypeOf<string>();
      expectTypeOf(gap.truncated).toEqualTypeOf<true>();
      // @ts-expect-error Gaps do not carry a termination error.
      gap.error.code;
      // @ts-expect-error Signing secrets must not be exposed to gap handlers.
      subscription.delivery.secret;
    },
    async onTerminated({ termination, subscription, messageId }) {
      expectTypeOf(termination).toEqualTypeOf<
        Extract<Experimental_MCPEventControl, { type: 'terminated' }>
      >();
      expectTypeOf(messageId).toEqualTypeOf<string>();
      expectTypeOf(termination.error.code).toEqualTypeOf<number>();
      expectTypeOf(termination.error.message).toEqualTypeOf<string>();
      // @ts-expect-error Terminations do not carry a replay cursor.
      termination.cursor.toUpperCase();
      // @ts-expect-error Signing secrets must not be exposed to termination handlers.
      subscription.delivery.secret;
    },
  });
  expectTypeOf(handler).toEqualTypeOf<
    (request: Request) => Promise<Response>
  >();
});

it('narrows unknown errors and exposes optional MCP error metadata', () => {
  const error: unknown = new MCPClientError({
    message: 'MCP request failed',
  });

  if (MCPClientError.isInstance(error)) {
    expectTypeOf(error).toEqualTypeOf<MCPClientError>();
    expectTypeOf(error.code).toEqualTypeOf<number | undefined>();
    expectTypeOf(error.statusCode).toEqualTypeOf<number | undefined>();
    expectTypeOf(error.url).toEqualTypeOf<string | undefined>();
    expectTypeOf(error.responseBody).toEqualTypeOf<string | undefined>();
  }
});

it('infers managed event operations and rejects mixing direct and managed APIs', async () => {
  const adapter = {
    createAdapter: () => ({}) as Experimental_MCPEventsAdapter,
  } satisfies Experimental_MCPEventsAdapterProvider;
  const transport = { type: 'http' as const, url: 'https://example.com/mcp' };
  const config = {
    transport,
    experimental_events: { adapter },
  } satisfies MCPClientConfig;
  expectTypeOf(
    config.experimental_events,
  ).toMatchTypeOf<Experimental_MCPEventsConfig>();
  const client = await createMCPClient(config);
  expectTypeOf(client).toEqualTypeOf<Experimental_ManagedMCPClient>();
  expectTypeOf(
    client.experimental_events,
  ).toEqualTypeOf<Experimental_ManagedMCPEvents>();
  const input: Experimental_ManagedSubscribeInput = {
    name: 'comment.created',
    arguments: {},
    expiresAt: null,
    idempotencyKey: 'intent_1',
  };
  const watch = await client.experimental_events.subscribe(input);
  expectTypeOf(watch).toEqualTypeOf<Experimental_ManagedSubscription>();
  expectTypeOf(watch.expiresAt).toEqualTypeOf<string | null>();
  expectTypeOf(
    await client.experimental_events.getSubscription({ id: watch.id }),
  ).toEqualTypeOf<Experimental_ManagedSubscription>();
  expectTypeOf(
    await client.experimental_events.unsubscribe({ id: watch.id }),
  ).toEqualTypeOf<Experimental_ManagedSubscription>();
  expectTypeOf(
    (await client.experimental_events.listSubscriptions()).subscriptions,
  ).toEqualTypeOf<Experimental_ManagedSubscription[]>();

  // @ts-expect-error Managed backends own refresh.
  client.experimental_events.refresh({ id: watch.id });
  // @ts-expect-error Managed results are not upstream lease grants.
  watch.refreshBefore;
  // @ts-expect-error A managed subscription needs exactly one monitoring lifetime.
  client.experimental_events.subscribe({
    name: 'comment.created',
    arguments: {},
    idempotencyKey: 'intent_1',
  });
  // @ts-expect-error Relative and absolute deadlines are mutually exclusive.
  client.experimental_events.subscribe({ ...input, ttlMs: 1000 });
  client.experimental_events.subscribe({
    ...input,
    // @ts-expect-error The host's adapter owns the callback destination.
    delivery: { mode: 'webhook', url: 'https://example.com/hook' },
  });
  // @ts-expect-error Managed operations use backend IDs, not direct storage keys.
  client.experimental_events.unsubscribe({ key: 'pending_1' });
  const store = {} as Experimental_MCPEventStore;
  const mixed = { transport, experimental_events: { adapter, store } };
  // @ts-expect-error Reject mixed configuration even through a variable.
  createMCPClient(mixed);
  // @ts-expect-error Managed adapters own argument validation.
  createMCPClient({
    transport,
    experimental_events: { adapter, validateArguments: () => {} },
  });
  // @ts-expect-error The unreleased configuration must use the experimental prefix.
  createMCPClient({ transport, events: { store } });
  const direct = await createMCPClient({
    transport,
    experimental_events: { store },
  });
  expectTypeOf(direct).toEqualTypeOf<MCPClient>();
  // @ts-expect-error Direct mode has no managed subscription registry.
  direct.experimental_events.getSubscription({ id: 'managed_1' });
  // @ts-expect-error Managed input is not a direct webhook subscription.
  direct.experimental_events.subscribe(input);
});

it('accepts configuration whose event mode is only known at runtime', async () => {
  const config = {} as MCPClientConfig;
  expectTypeOf(await createMCPClient(config)).toEqualTypeOf<
    MCPClient | Experimental_ManagedMCPClient
  >();
});

it('uses one event configuration union for direct and managed clients', async () => {
  const adapter = {
    createAdapter: () => ({}) as Experimental_MCPEventsAdapter,
  } satisfies Experimental_MCPEventsAdapterProvider;
  const store = {} as Experimental_MCPEventStore;
  const transport = { type: 'http' as const, url: 'https://example.com/mcp' };
  const managed = { adapter } satisfies Experimental_MCPEventsConfig;
  const direct = {
    store,
    validateArguments: ({ definition, arguments: args }) => {
      expectTypeOf(definition.name).toEqualTypeOf<string>();
      expectTypeOf(args).toEqualTypeOf<JSONObject>();
    },
  } satisfies Experimental_MCPEventsConfig;
  expectTypeOf(
    await createMCPClient({ transport, experimental_events: managed }),
  ).toEqualTypeOf<Experimental_ManagedMCPClient>();
  expectTypeOf(
    await createMCPClient({ transport, experimental_events: direct }),
  ).toEqualTypeOf<MCPClient>();
  const discovery = await createMCPClient({ transport });
  expectTypeOf(discovery).toEqualTypeOf<MCPClient>();
  await discovery.experimental_events.list();

  // @ts-expect-error An explicit configuration must select a store or adapter.
  const empty: Experimental_MCPEventsConfig = {};
  // @ts-expect-error Direct and managed configuration remain exclusive.
  const mixed: Experimental_MCPEventsConfig = { adapter, store };
  // @ts-expect-error Argument validation belongs to the managed backend.
  const validation: Experimental_MCPEventsConfig = {
    adapter,
    validateArguments: () => {},
  };
  void [empty, mixed, validation];

  const events = {} as Experimental_MCPEventsConfig;
  const config: MCPClientConfig = { transport, experimental_events: events };
  const client = await createMCPClient(config);
  expectTypeOf(client).toEqualTypeOf<
    MCPClient | Experimental_ManagedMCPClient
  >();
  await client.experimental_events.list();
  // @ts-expect-error A runtime-selected mode is not known to support direct refresh.
  client.experimental_events.refresh({ id: 'sub_1' });
});

it('infers managed clients from adapter providers and contextually types the URL', async () => {
  const adapter = {} as Experimental_MCPEventsAdapter;
  const config = {
    transport: { type: 'http', url: 'https://example.com/mcp' },
    experimental_events: {
      adapter: {
        createAdapter({ url }) {
          expectTypeOf(url).toEqualTypeOf<string | undefined>();
          return adapter;
        },
      },
    },
  } satisfies MCPClientConfig;
  expectTypeOf(
    config.experimental_events.adapter,
  ).toMatchTypeOf<Experimental_MCPEventsAdapterProvider>();
  const client = await createMCPClient(config);
  expectTypeOf(client).toEqualTypeOf<Experimental_ManagedMCPClient>();
  expectTypeOf(
    await createMCPClient({
      transport: config.transport,
      experimental_events: {
        adapter: {
          createAdapter({ url }) {
            expectTypeOf(url).toEqualTypeOf<string | undefined>();
            return adapter;
          },
        },
      },
    }),
  ).toEqualTypeOf<Experimental_ManagedMCPClient>();
  const watch = await client.experimental_events.subscribe({
    name: 'comment.created',
    arguments: {},
    expiresAt: null,
    idempotencyKey: 'intent_1',
  });
  expectTypeOf(watch).toEqualTypeOf<Experimental_ManagedSubscription>();
  // @ts-expect-error Managed providers do not expose direct refresh.
  client.experimental_events.refresh({ id: watch.id });
  const mixed = {
    ...config,
    experimental_events: {
      ...config.experimental_events,
      store: {} as Experimental_MCPEventStore,
    },
  };
  // @ts-expect-error Providers cannot be combined with a direct store.
  createMCPClient(mixed);
  const provider: Experimental_MCPEventsAdapterProvider = {
    // @ts-expect-error Provider creation is synchronous.
    async createAdapter() {
      return adapter;
    },
  };
  void provider;
});

it('requires a provider instead of a bound adapter in managed configuration', async () => {
  const adapter = {} as Experimental_MCPEventsAdapter;
  const transport = { type: 'http' as const, url: 'https://example.com/mcp' };
  const config = { transport, experimental_events: { adapter } };
  // @ts-expect-error Managed configuration requires a provider.
  createMCPClient(config);
  // @ts-expect-error The config union rejects a bound adapter too.
  const events: Experimental_MCPEventsConfig = { adapter };
  void events;
  const wrapped = await createMCPClient({
    transport,
    experimental_events: { adapter: { createAdapter: () => adapter } },
  });
  expectTypeOf(wrapped).toEqualTypeOf<Experimental_ManagedMCPClient>();
});
