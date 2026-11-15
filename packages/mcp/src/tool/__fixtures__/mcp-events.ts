import { createHmac } from 'node:crypto';
import type {
  MCPEventDefinition,
  MCPEventStore,
  MCPEventSubscription,
} from '../mcp-event-types';

export const eventDefinition = {
  name: 'comment.created',
  description: 'A new document comment',
  delivery: ['webhook'],
  inputSchema: {
    type: 'object',
    properties: { document_id: { type: 'string' } },
    required: ['document_id'],
    additionalProperties: false,
  },
  payloadSchema: {
    type: 'object',
    properties: { text: { type: 'string' } },
    required: ['text'],
    additionalProperties: false,
  },
} satisfies MCPEventDefinition;

export class MemoryEventStore implements MCPEventStore {
  readonly records = new Map<string, MCPEventSubscription>();

  async get(key: string) {
    const value = this.records.get(key);
    return value == null ? undefined : structuredClone(value);
  }

  async getById(id: string) {
    const value = [...this.records.values()].find(value => value.id === id);
    return value == null ? undefined : structuredClone(value);
  }

  async set(subscription: MCPEventSubscription) {
    this.records.set(subscription.key, structuredClone(subscription));
  }

  async update(key: string, patch: Partial<MCPEventSubscription>) {
    const existing = this.records.get(key);
    if (!existing) throw new Error('Unknown subscription');
    this.records.set(key, { ...existing, ...structuredClone(patch) });
  }

  async delete(key: string) {
    this.records.delete(key);
  }
}

export function signedRequest(
  subscription: MCPEventSubscription,
  value: unknown,
  {
    id = 'evt_1',
    timestamp = String(Math.floor(Date.now() / 1000)),
    secret = subscription.delivery.secret,
    body = JSON.stringify(value),
  } = {},
): Request {
  // Sign independently of the implementation's Web Crypto verification.
  const signature = createHmac('sha256', Buffer.from(secret.slice(6), 'base64'))
    .update(`${id}.${timestamp}.${body}`)
    .digest('base64');
  return new Request(subscription.delivery.url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'webhook-id': id,
      'webhook-timestamp': timestamp,
      'webhook-signature': `v1,${signature}`,
      'X-MCP-Subscription-Id': subscription.id ?? 'sub_1',
    },
    body,
  });
}
