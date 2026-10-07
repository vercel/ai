import { safeParseJSON } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { MCP_EVENT_CALLBACK_KEY } from './mcp-events';
import { verifyMCPEventSignature } from './mcp-event-signature';
import {
  MCPEventSchema,
  type MCPEvent,
  type MCPEventDefinition,
  type MCPEventStore,
  type MCPEventSubscriptionInfo,
} from './mcp-event-types';

const MAX_BODY_BYTES = 256 * 1024;
const VerificationSchema = z.object({
  type: z.literal('verification'),
  challenge: z.string().min(1),
});

export type MCPEventWebhookOptions = {
  store: MCPEventStore;
  /**
   * Optionally validate event data using an application schema or the server's
   * payloadSchema. Throw to reject the payload with 400 before onEvent runs.
   * The event envelope and signature are always checked.
   */
  validatePayload?: (args: {
    definition: MCPEventDefinition;
    data: MCPEvent['data'];
  }) => void | PromiseLike<void>;
  /**
   * Resolve only after durable acceptance or successful processing. Deliveries
   * may be duplicated or reordered; deduplicate by subscription ID + eventId.
   * Throw to return 503 so the server can retry. The helper does not run agents.
   */
  onEvent: (args: {
    subscription: MCPEventSubscriptionInfo;
    event: MCPEvent;
  }) => Promise<void>;
  onError?: (error: unknown) => void;
};

/**
 * Create a Web Request/Response handler for MCP webhook deliveries. Mount it
 * at the callback URL before subscribing. Verification is enabled automatically
 * using the pending delivery secret saved by the client's subscribe method.
 */
export function createMCPEventWebhook({
  store,
  validatePayload,
  onEvent,
  onError,
}: MCPEventWebhookOptions): (request: Request) => Promise<Response> {
  return async request => {
    if (request.method !== 'POST') {
      return new Response(null, { status: 405, headers: { Allow: 'POST' } });
    }
    if (
      request.headers
        .get('content-type')
        ?.split(';')[0]
        .trim()
        .toLowerCase() !== 'application/json'
    ) {
      return new Response(null, { status: 415 });
    }
    if (Number(request.headers.get('content-length')) > MAX_BODY_BYTES) {
      return new Response(null, { status: 413 });
    }

    try {
      const key = new URL(request.url).searchParams.get(MCP_EVENT_CALLBACK_KEY);
      const id = request.headers.get('X-MCP-Subscription-Id');
      if (!key || !id) return new Response(null, { status: 401 });
      const subscription = await store.get(key);
      if (
        !subscription ||
        (subscription.id != null && subscription.id !== id)
      ) {
        return new Response(null, { status: 401 });
      }

      // Bound streamed bodies too; Content-Length is optional and untrusted.
      const reader = request.body?.getReader();
      if (!reader) return new Response(null, { status: 400 });
      const chunks: Uint8Array[] = [];
      let length = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          length += value.byteLength;
          if (length > MAX_BODY_BYTES) {
            await reader.cancel();
            return new Response(null, { status: 413 });
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
      const body = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) {
        body.set(chunk, offset);
        offset += chunk.length;
      }

      if (
        !(await verifyMCPEventSignature({
          headers: request.headers,
          body,
          secret: subscription.delivery.secret,
        }))
      ) {
        return new Response(null, { status: 401 });
      }
      const parsed = await safeParseJSON({
        text: new TextDecoder().decode(body),
      });
      if (!parsed.success) return new Response(null, { status: 400 });
      const value = parsed.value;

      if (value != null && typeof value === 'object' && 'type' in value) {
        const verification = VerificationSchema.safeParse(value);
        if (!verification.success) {
          // Poll/push and gap/terminated control notifications are outside this
          // initial webhook subset. Never treat a control body as agent input.
          return new Response(null, { status: 400 });
        }
        return Response.json({ challenge: verification.data.challenge });
      }

      // Servers can POST before a subscribe or refresh response is persisted.
      // Ask them to retry until the ID and renewed expiration have been saved.
      if (subscription.status !== 'active' || subscription.id == null)
        return new Response(null, { status: 503 });
      if (
        subscription.refreshBefore != null &&
        Date.parse(subscription.refreshBefore) <= Date.now()
      ) {
        return new Response(null, { status: 410 });
      }
      const event = MCPEventSchema.safeParse(value);
      if (
        !event.success ||
        event.data.name !== subscription.name ||
        event.data.eventId !== request.headers.get('webhook-id')
      ) {
        return new Response(null, { status: 400 });
      }
      try {
        await validatePayload?.({
          definition: subscription.definition,
          data: event.data.data,
        });
      } catch (error) {
        onError?.(error);
        return new Response(null, { status: 400 });
      }

      await onEvent({
        subscription: {
          id: subscription.id,
          name: subscription.name,
          arguments: subscription.arguments,
          delivery: { mode: 'webhook', url: subscription.delivery.url },
          refreshBefore: subscription.refreshBefore ?? null,
        },
        event: event.data,
      });
      if (event.data.cursor !== undefined) {
        await store.update(subscription.key, { cursor: event.data.cursor });
      }
      return new Response(null, { status: 204 });
    } catch (error) {
      onError?.(error);
      return new Response(null, { status: 503 });
    }
  };
}
