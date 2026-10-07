import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as z4 from 'zod/v4';
import { createMCPEventWebhook } from './mcp-event-webhook';
import {
  eventDefinition,
  MemoryEventStore,
  signedRequest,
} from './__fixtures__/mcp-events';
import type { MCPEventSubscription } from './mcp-event-types';

describe('MCP event webhook receiver', () => {
  let store: MemoryEventStore;
  let subscription: MCPEventSubscription;
  const event = {
    eventId: 'evt_1',
    name: 'comment.created',
    timestamp: '2026-10-05T12:00:00Z',
    data: { text: 'Please review this ✨' },
    cursor: 'cursor_2',
  };
  const onEvent = vi.fn(async () => {});
  const onGap = vi.fn(async () => {});
  const onTerminated = vi.fn(async () => {});
  const onError = vi.fn();
  let webhook: ReturnType<typeof createMCPEventWebhook>;

  beforeEach(async () => {
    onEvent.mockReset();
    onGap.mockReset();
    onTerminated.mockReset();
    onError.mockReset();
    store = new MemoryEventStore();
    subscription = {
      key: 'local_1',
      id: 'sub_1',
      name: eventDefinition.name,
      arguments: { document_id: 'doc_1' },
      definition: eventDefinition,
      delivery: {
        mode: 'webhook',
        url: 'https://app.example/events?mcp_event_subscription=local_1',
        secret: `whsec_${Buffer.alloc(32, 1).toString('base64')}`,
      },
      cursor: 'cursor_1',
      truncated: false,
      refreshBefore: new Date(Date.now() + 60_000).toISOString(),
      status: 'active',
    };
    await store.set(subscription);
    webhook = createMCPEventWebhook({
      store,
      onEvent,
      onGap,
      onTerminated,
      onError,
      async validatePayload({ definition, data }) {
        expect(definition.name).toBe(eventDefinition.name);
        z4.object({ text: z4.string() }).strict().parse(data);
      },
    });
  });

  it('verifies exact body bytes and forwards validated data without exposing the secret', async () => {
    const response = await webhook(
      signedRequest(subscription, event, {
        body: JSON.stringify(event, null, 2),
      }),
    );
    expect(response.status).toBe(204);
    expect(onEvent).toHaveBeenCalledOnce();
    expect(onGap).not.toHaveBeenCalled();
    expect(onTerminated).not.toHaveBeenCalled();
    expect(onEvent).toHaveBeenCalledWith({
      subscription: {
        id: subscription.id,
        name: subscription.name,
        arguments: subscription.arguments,
        delivery: { mode: 'webhook', url: subscription.delivery.url },
        refreshBefore: subscription.refreshBefore,
      },
      event,
    });
    expect(await store.get(subscription.key)).toMatchObject({
      cursor: 'cursor_2',
    });
  });

  it('automatically echoes signed verification while the subscription is pending', async () => {
    subscription.status = 'pending';
    delete subscription.id;
    await store.set(subscription);
    const response = await webhook(
      signedRequest(
        subscription,
        { type: 'verification', challenge: 'single_use_nonce' },
        { id: 'msg_verification_1' },
      ),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ challenge: 'single_use_nonce' });
    expect(onGap).not.toHaveBeenCalled();
    expect(onTerminated).not.toHaveBeenCalled();
    expect(onEvent).not.toHaveBeenCalled();
    expect(await store.get(subscription.key)).toMatchObject({
      status: 'pending',
      cursor: 'cursor_1',
    });
  });

  it('passes event data through when no payload validator is supplied', async () => {
    const handler = createMCPEventWebhook({ store, onEvent });
    const delivered = { ...event, data: { different: true } };
    expect((await handler(signedRequest(subscription, delivered))).status).toBe(
      204,
    );
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: delivered }),
    );
    expect(await store.get(subscription.key)).toMatchObject({
      cursor: 'cursor_2',
    });
  });

  it('does not echo an unsigned verification challenge', async () => {
    const request = signedRequest(subscription, {
      type: 'verification',
      challenge: 'nonce',
    });
    request.headers.delete('webhook-signature');
    expect((await webhook(request)).status).toBe(401);
    expect(onEvent).not.toHaveBeenCalled();
  });

  it('returns a retryable status for events received before activation', async () => {
    await store.update(subscription.key, { status: 'pending' });
    expect((await webhook(signedRequest(subscription, event))).status).toBe(
      503,
    );
    expect(onEvent).not.toHaveBeenCalled();
  });

  it('rejects a tampered body and does not advance the cursor', async () => {
    const signed = signedRequest(subscription, event);
    const tampered = new Request(signed.url, {
      method: 'POST',
      headers: signed.headers,
      body: JSON.stringify({ ...event, data: { text: 'tampered' } }),
    });
    expect((await webhook(tampered)).status).toBe(401);
    expect(onEvent).not.toHaveBeenCalled();
    expect((await store.get(subscription.key))?.cursor).toBe('cursor_1');
  });

  it.each([-301, 301])(
    'rejects signing timestamps %s seconds from now',
    async seconds => {
      const timestamp = String(Math.floor(Date.now() / 1000) + seconds);
      expect(
        (await webhook(signedRequest(subscription, event, { timestamp })))
          .status,
      ).toBe(401);
    },
  );

  it.each([
    'webhook-id',
    'webhook-timestamp',
    'webhook-signature',
    'X-MCP-Subscription-Id',
  ])('requires the %s header', async header => {
    const request = signedRequest(subscription, event);
    request.headers.delete(header);
    expect((await webhook(request)).status).toBe(401);
  });

  it('accepts a valid rotation signature alongside an invalid signature', async () => {
    const request = signedRequest(subscription, event);
    request.headers.set(
      'webhook-signature',
      `v1,malformed v2,unknown ${request.headers.get('webhook-signature')}`,
    );
    expect((await webhook(request)).status).toBe(204);
  });

  it('rejects a signature made with another secret', async () => {
    const secret = `whsec_${Buffer.alloc(32, 2).toString('base64')}`;
    expect(
      (await webhook(signedRequest(subscription, event, { secret }))).status,
    ).toBe(401);
  });

  it('rejects an unknown routing key or a substituted subscription header', async () => {
    const request = signedRequest(subscription, event);
    request.headers.set('X-MCP-Subscription-Id', 'sub_other');
    expect((await webhook(request)).status).toBe(401);
    const unknown = new Request(
      'https://app.example/events?mcp_event_subscription=missing',
      { method: 'POST', headers: request.headers, body: JSON.stringify(event) },
    );
    expect((await webhook(unknown)).status).toBe(401);
  });

  it.each([
    { ...event, name: 'other.event' },
    { ...event, eventId: 'evt_other' },
    { ...event, timestamp: 'invalid' },
    { ...event, data: { text: 42 } },
    { ...event, data: { text: 'comment', unexpected: true } },
  ])('rejects invalid event envelopes or payloads', async invalid => {
    expect((await webhook(signedRequest(subscription, invalid))).status).toBe(
      400,
    );
    expect(onEvent).not.toHaveBeenCalled();
    expect(await store.get(subscription.key)).toMatchObject({
      cursor: 'cursor_1',
    });
  });

  const controls = [
    { type: 'gap', cursor: 'cursor_fresh' },
    {
      type: 'terminated',
      error: {
        code: -32012,
        message: 'Forbidden',
        data: { reason: 'Access revoked' },
      },
    },
  ];

  it.each(controls)(
    'handles signed $type controls separately from events',
    async control => {
      const messageId = `msg_${control.type}_1`;
      expect(
        (await webhook(signedRequest(subscription, control, { id: messageId })))
          .status,
      ).toBe(204);
      expect(onEvent).not.toHaveBeenCalled();
      const callback = control.type === 'gap' ? onGap : onTerminated;
      const otherCallback = control.type === 'gap' ? onTerminated : onGap;
      expect(callback).toHaveBeenCalledOnce();
      expect(otherCallback).not.toHaveBeenCalled();
      expect(callback).toHaveBeenCalledWith({
        subscription: {
          id: subscription.id,
          name: subscription.name,
          arguments: subscription.arguments,
          delivery: { mode: 'webhook', url: subscription.delivery.url },
          refreshBefore: subscription.refreshBefore,
        },
        messageId,
        ...(control.type === 'gap'
          ? { gap: { ...control, truncated: true } }
          : { termination: control }),
      });
      if (control.type === 'gap') {
        expect(await store.get(subscription.key)).toMatchObject({
          cursor: control.cursor,
          truncated: true,
          status: 'active',
        });
        expect((await webhook(signedRequest(subscription, event))).status).toBe(
          204,
        );
      } else {
        expect(await store.get(subscription.key)).toBeUndefined();
      }
    },
  );

  it.each(controls)(
    'returns 503 and preserves state when $type control handling fails',
    async control => {
      const callback = control.type === 'gap' ? onGap : onTerminated;
      callback.mockRejectedValueOnce(new Error('Queue unavailable'));
      expect((await webhook(signedRequest(subscription, control))).status).toBe(
        503,
      );
      expect(await store.get(subscription.key)).toEqual(subscription);
      expect(onError).toHaveBeenCalledOnce();
      expect(onEvent).not.toHaveBeenCalled();
      expect((await webhook(signedRequest(subscription, control))).status).toBe(
        204,
      );
    },
  );

  it.each(controls)(
    'returns 503 if saving $type control state fails',
    async control => {
      const update = store.update.bind(store);
      const remove = store.delete.bind(store);
      const fail = async () => {
        throw new Error('Database unavailable');
      };
      store.update = fail;
      store.delete = fail;
      expect((await webhook(signedRequest(subscription, control))).status).toBe(
        503,
      );
      expect(await store.get(subscription.key)).toEqual(subscription);
      expect(onError).toHaveBeenCalledOnce();
      store.update = update;
      store.delete = remove;
      expect((await webhook(signedRequest(subscription, control))).status).toBe(
        204,
      );
    },
  );

  it.each(controls)(
    'updates $type control state when no lifecycle callbacks are configured',
    async control => {
      const handler = createMCPEventWebhook({ store, onEvent });
      expect((await handler(signedRequest(subscription, control))).status).toBe(
        204,
      );
      expect(onEvent).not.toHaveBeenCalled();
      if (control.type === 'gap') {
        expect(await store.get(subscription.key)).toMatchObject({
          cursor: control.cursor,
          truncated: true,
        });
      } else {
        expect(await store.get(subscription.key)).toBeUndefined();
      }
    },
  );

  it.each(['onGap', 'onTerminated'] as const)(
    'allows configuring only %s and still handles both control types',
    async callbackName => {
      const callback = vi.fn(async () => {});
      const handler = createMCPEventWebhook({
        store,
        onEvent,
        [callbackName]: callback,
      });
      for (const control of controls) {
        expect(
          (await handler(signedRequest(subscription, control))).status,
        ).toBe(204);
      }
      expect(callback).toHaveBeenCalledOnce();
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining(
          callbackName === 'onGap'
            ? { gap: { ...controls[0], truncated: true } }
            : { termination: controls[1] },
        ),
      );
      expect(await store.get(subscription.key)).toBeUndefined();
      expect(onEvent).not.toHaveBeenCalled();
    },
  );

  it.each(controls)(
    'handles $type controls even when the local expiration has passed',
    async control => {
      await store.update(subscription.key, {
        refreshBefore: new Date(Date.now() - 1000).toISOString(),
      });
      expect((await webhook(signedRequest(subscription, control))).status).toBe(
        204,
      );
      expect(
        control.type === 'gap' ? onGap : onTerminated,
      ).toHaveBeenCalledOnce();
      expect(onEvent).not.toHaveBeenCalled();
    },
  );

  it.each(controls)(
    'returns 503 for $type controls while subscription activation is pending',
    async control => {
      await store.update(subscription.key, {
        status: 'pending',
        id: undefined,
      });
      expect((await webhook(signedRequest(subscription, control))).status).toBe(
        503,
      );
      expect(onGap).not.toHaveBeenCalled();
      expect(onTerminated).not.toHaveBeenCalled();
      expect(await store.get(subscription.key)).toMatchObject({
        status: 'pending',
        cursor: subscription.cursor,
        truncated: false,
      });
    },
  );

  it('returns 503 for gap controls while renewal is pending', async () => {
    await store.update(subscription.key, { status: 'pending' });
    expect(
      (await webhook(signedRequest(subscription, controls[0]))).status,
    ).toBe(503);
    expect(onGap).not.toHaveBeenCalled();
    expect(onTerminated).not.toHaveBeenCalled();
    expect(await store.get(subscription.key)).toMatchObject({
      id: subscription.id,
      status: 'pending',
      cursor: subscription.cursor,
      truncated: false,
    });
  });

  it.each(['callback', 'storage'])(
    'returns 503 and preserves a pending renewal when termination %s fails',
    async failure => {
      await store.update(subscription.key, { status: 'pending' });
      const remove = store.delete.bind(store);
      if (failure === 'callback') {
        onTerminated.mockRejectedValueOnce(new Error('Queue unavailable'));
      } else {
        store.delete = async () => {
          throw new Error('Database unavailable');
        };
      }
      expect(
        (await webhook(signedRequest(subscription, controls[1]))).status,
      ).toBe(503);
      expect(await store.get(subscription.key)).toEqual({
        ...subscription,
        status: 'pending',
      });
      expect(onError).toHaveBeenCalledOnce();
      expect(onEvent).not.toHaveBeenCalled();
      expect(onGap).not.toHaveBeenCalled();

      store.delete = remove;
      expect(
        (await webhook(signedRequest(subscription, controls[1]))).status,
      ).toBe(204);
      expect(await store.get(subscription.key)).toBeUndefined();
    },
  );

  it.each(['unsigned', 'wrong signature', 'wrong subscription', 'malformed'])(
    'rejects %s termination while renewal is pending',
    async invalid => {
      await store.update(subscription.key, { status: 'pending' });
      const request = signedRequest(
        subscription,
        invalid === 'malformed' ? { type: 'terminated' } : controls[1],
      );
      if (invalid === 'unsigned') request.headers.delete('webhook-signature');
      if (invalid === 'wrong signature')
        request.headers.set('webhook-signature', 'v1,invalid');
      if (invalid === 'wrong subscription')
        request.headers.set('X-MCP-Subscription-Id', 'sub_other');
      expect((await webhook(request)).status).toBe(
        invalid === 'malformed' ? 400 : 401,
      );
      expect(onTerminated).not.toHaveBeenCalled();
      expect(await store.get(subscription.key)).toEqual({
        ...subscription,
        status: 'pending',
      });
    },
  );

  it.each(controls)(
    'rejects unsigned $type controls without notifying or changing state',
    async control => {
      const request = signedRequest(subscription, control);
      request.headers.delete('webhook-signature');
      expect((await webhook(request)).status).toBe(401);
      expect(onGap).not.toHaveBeenCalled();
      expect(onTerminated).not.toHaveBeenCalled();
      expect(onEvent).not.toHaveBeenCalled();
      expect(await store.get(subscription.key)).toEqual(subscription);
    },
  );

  it.each([
    { type: 'unknown', cursor: 'cursor_3' },
    { type: 'gap' },
    { type: 'gap', cursor: 42 },
    { type: 'terminated' },
    { type: 'terminated', error: { code: 'invalid', message: 'Forbidden' } },
  ])(
    'rejects invalid control envelopes without notifying or changing state: %j',
    async control => {
      expect((await webhook(signedRequest(subscription, control))).status).toBe(
        400,
      );
      expect(onEvent).not.toHaveBeenCalled();
      expect(onGap).not.toHaveBeenCalled();
      expect(onTerminated).not.toHaveBeenCalled();
      expect(await store.get(subscription.key)).toEqual(subscription);
    },
  );

  it('rejects signed invalid JSON', async () => {
    expect(
      (await webhook(signedRequest(subscription, {}, { body: '{ invalid' })))
        .status,
    ).toBe(400);
  });

  it('returns 503 on application failure and saves no cursor', async () => {
    onEvent.mockRejectedValueOnce(new Error('Queue unavailable'));
    expect((await webhook(signedRequest(subscription, event))).status).toBe(
      503,
    );
    expect((await store.get(subscription.key))?.cursor).toBe('cursor_1');
    expect(onError).toHaveBeenCalledOnce();
    expect((await webhook(signedRequest(subscription, event))).status).toBe(
      204,
    );
  });

  it('returns 503 on storage failure', async () => {
    store.get = async () => {
      throw new Error('Database unavailable');
    };
    expect((await webhook(signedRequest(subscription, event))).status).toBe(
      503,
    );
    expect(onEvent).not.toHaveBeenCalled();
  });

  it('returns 410 for expired subscriptions', async () => {
    await store.update(subscription.key, {
      refreshBefore: new Date(Date.now() - 1000).toISOString(),
    });
    expect((await webhook(signedRequest(subscription, event))).status).toBe(
      410,
    );
    expect(onEvent).not.toHaveBeenCalled();
  });

  it('accepts a subscription with no expiration', async () => {
    await store.update(subscription.key, { refreshBefore: null });
    expect((await webhook(signedRequest(subscription, event))).status).toBe(
      204,
    );
  });

  it('rejects oversized bodies even without Content-Length', async () => {
    const request = signedRequest(subscription, event, {
      body: ' '.repeat(256 * 1024 + 1),
    });
    expect(request.headers.has('content-length')).toBe(false);
    expect((await webhook(request)).status).toBe(413);
    expect(onEvent).not.toHaveBeenCalled();
  });

  it('rejects oversized Content-Length before reading the body', async () => {
    const request = signedRequest(subscription, event);
    request.headers.set('content-length', String(256 * 1024 + 1));
    expect((await webhook(request)).status).toBe(413);
    expect(request.bodyUsed).toBe(false);
  });

  it('requires POST and JSON content', async () => {
    const response = await webhook(new Request(subscription.delivery.url));
    expect(response.status).toBe(405);
    expect(response.headers.get('Allow')).toBe('POST');
    const request = signedRequest(subscription, event);
    request.headers.set('content-type', 'text/plain');
    expect((await webhook(request)).status).toBe(415);
  });
});
