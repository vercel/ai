import { MCPClientError } from '../error/mcp-client-error';
import {
  createMCPEventSecret,
  decodeMCPEventSecret,
} from './mcp-event-signature';
import {
  ListEventsResultSchema,
  SubscribeEventResultSchema,
  type MCPEventStore,
  type MCPEventsConfig,
  type MCPEvents,
  type MCPEventSubscription,
} from './mcp-event-types';
import { ResultSchema, type Request, type RequestOptions } from './types';
import type { z } from 'zod/v4';

export const MCP_EVENT_CALLBACK_KEY = 'mcp_event_subscription';

export function createMCPEvents({
  request,
  store,
  validateArguments,
}: {
  request: <T extends z.ZodType<object>>(args: {
    request: Request;
    resultSchema: T;
    options?: RequestOptions;
  }) => Promise<z.infer<T>>;
  store?: MCPEventStore;
  validateArguments?: MCPEventsConfig['validateArguments'];
}): MCPEvents {
  function getStore(): MCPEventStore {
    if (!store) {
      throw new MCPClientError({
        message: 'Configure events.store to manage event subscriptions',
      });
    }
    return store;
  }

  async function getSubscription(id: string): Promise<MCPEventSubscription> {
    const subscription = await getStore().getById(id);
    if (!subscription || subscription.status !== 'active') {
      throw new MCPClientError({
        message: `Unknown MCP event subscription: ${id}`,
      });
    }
    return subscription;
  }

  async function subscribe(
    subscription: MCPEventSubscription,
    options?: RequestOptions,
  ) {
    const result = await request({
      request: {
        method: 'events/subscribe',
        params: {
          name: subscription.name,
          arguments: subscription.arguments,
          delivery: subscription.delivery,
          cursor: subscription.cursor,
          ...(subscription.ttlMs === undefined
            ? {}
            : { ttlMs: subscription.ttlMs }),
          ...(subscription.maxAgeMs === undefined
            ? {}
            : { maxAgeMs: subscription.maxAgeMs }),
        },
      },
      resultSchema: SubscribeEventResultSchema,
      options,
    });
    await getStore().update(subscription.key, {
      id: result.id,
      refreshBefore: result.refreshBefore,
      cursor: result.cursor,
      truncated: result.truncated,
      status: 'active',
    });
    return result;
  }

  const events: MCPEvents = {
    experimental_list({ params, options } = {}) {
      return request({
        request: { method: 'events/list', params },
        resultSchema: ListEventsResultSchema,
        options,
      });
    },

    async experimental_subscribe({
      name,
      arguments: args = {},
      delivery,
      cursor = null,
      ttlMs,
      maxAgeMs,
      options,
    }) {
      const storage = getStore();
      const url = new URL(delivery.url);
      const localHttp =
        delivery.allowInsecureLocalhost === true &&
        url.protocol === 'http:' &&
        (url.hostname === '127.0.0.1' || url.hostname === '[::1]');
      if (
        (url.protocol !== 'https:' && !localHttp) ||
        url.username ||
        url.password ||
        url.hash
      ) {
        throw new MCPClientError({
          message:
            'MCP event callback URLs must use HTTPS without credentials or fragments',
        });
      }
      if (delivery.mode !== 'webhook') {
        throw new MCPClientError({
          message: 'Only webhook event delivery is supported',
        });
      }
      if (
        (ttlMs != null && (!Number.isSafeInteger(ttlMs) || ttlMs <= 0)) ||
        (maxAgeMs != null && (!Number.isSafeInteger(maxAgeMs) || maxAgeMs < 0))
      ) {
        throw new MCPClientError({
          message: 'Invalid MCP event subscription lifetime or replay age',
        });
      }

      let pageCursor: string | undefined;
      const visited = new Set<string>();
      let definition;
      do {
        const page = await events.experimental_list({
          params: { cursor: pageCursor },
          options,
        });
        definition = page.events.find(event => event.name === name);
        if (definition) break;
        pageCursor = page.nextCursor ?? undefined;
        if (pageCursor != null) {
          if (visited.has(pageCursor)) {
            throw new MCPClientError({
              message: 'Repeated MCP events pagination cursor',
            });
          }
          visited.add(pageCursor);
        }
      } while (pageCursor != null);
      if (!definition) {
        throw new MCPClientError({ message: `Unknown MCP event: ${name}` });
      }
      if (!definition.delivery.includes('webhook')) {
        throw new MCPClientError({
          message: `MCP event ${name} does not support webhook delivery`,
        });
      }
      await validateArguments?.({ definition, arguments: args });
      const secret = delivery.secret ?? createMCPEventSecret();
      decodeMCPEventSecret(secret);

      // A routing key is available before the server-derived subscription ID.
      // Persist it and the secret before the server attempts callback verification.
      const key = crypto.randomUUID();
      url.searchParams.set(MCP_EVENT_CALLBACK_KEY, key);
      const subscription: MCPEventSubscription = {
        key,
        name,
        arguments: structuredClone(args),
        definition,
        delivery: { mode: 'webhook', url: url.href, secret },
        cursor,
        truncated: false,
        ttlMs,
        maxAgeMs,
        status: 'pending',
      };
      await storage.set(subscription);
      // Retain pending state on errors: a timed-out request may have registered
      // the callback remotely. The application can inspect/expire pending records.
      return subscribe(subscription, options);
    },

    async experimental_refresh({ id, options }) {
      return subscribe(await getSubscription(id), options);
    },

    async experimental_unsubscribe({ id, options }) {
      const subscription = await getSubscription(id);
      await request({
        request: {
          method: 'events/unsubscribe',
          params: {
            name: subscription.name,
            arguments: subscription.arguments,
            delivery: { mode: 'webhook', url: subscription.delivery.url },
          },
        },
        resultSchema: ResultSchema,
        options,
      });
      await getStore().delete(subscription.key);
    },
  };
  return events;
}
