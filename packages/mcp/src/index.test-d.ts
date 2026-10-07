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
} from './index';

it('exposes events on the existing client and types webhook callbacks', async () => {
  const store = {} as Experimental_MCPEventStore;
  const client = await createMCPClient({
    transport: { type: 'http', url: 'https://example.com/mcp' },
    events: { store },
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
