import { expectTypeOf, it } from 'vitest';
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
  type Experimental_ManagedMCPClient,
  type Experimental_ManagedMCPClientConfig,
  type Experimental_ManagedMCPEvents,
  type Experimental_ManagedMCPEventsConfig,
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
  const adapter = {} as Experimental_MCPEventsAdapter;
  const transport = { type: 'http' as const, url: 'https://example.com/mcp' };
  const config = {
    transport,
    experimental_events: { adapter },
  } satisfies Experimental_ManagedMCPClientConfig;
  expectTypeOf(
    config.experimental_events,
  ).toMatchTypeOf<Experimental_ManagedMCPEventsConfig>();
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
  const config = {} as MCPClientConfig | Experimental_ManagedMCPClientConfig;
  expectTypeOf(await createMCPClient(config)).toEqualTypeOf<
    MCPClient | Experimental_ManagedMCPClient
  >();
});
