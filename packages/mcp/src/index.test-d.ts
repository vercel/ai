import { expectTypeOf, it } from 'vitest';
import {
  MCPClientError,
  createMCPClient,
  experimental_createMCPEventWebhook,
  type Experimental_MCPEvent,
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
  expectTypeOf(client.events).toEqualTypeOf<Experimental_MCPEvents>();
  const result = await client.events.experimental_subscribe({
    name: 'comment.created',
    delivery: { mode: 'webhook', url: 'https://app.example/events' },
  });
  expectTypeOf(result).toEqualTypeOf<Experimental_SubscribeEventResult>();
  const recovered = await client.events.experimental_refresh({
    key: 'pending_1',
  });
  expectTypeOf(recovered).toEqualTypeOf<Experimental_SubscribeEventResult>();
  await client.events.experimental_unsubscribe({ key: 'pending_1' });
  // @ts-expect-error Select a subscription by either ID or key, never both.
  await client.events.experimental_refresh({ id: 'sub_1', key: 'pending_1' });
  // @ts-expect-error A subscription ID or key is required.
  await client.events.experimental_unsubscribe({});
  const handler = experimental_createMCPEventWebhook({
    store,
    async onEvent({ event, subscription }) {
      expectTypeOf(event).toEqualTypeOf<Experimental_MCPEvent>();
      expectTypeOf(subscription.id).toEqualTypeOf<string>();
      // @ts-expect-error Signing secrets must not be exposed to event handlers.
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
