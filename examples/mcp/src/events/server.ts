import {
  McpServer,
  createMcpHandler,
  fromJsonSchema,
  ProtocolError,
  type ServerCapabilities,
  type JsonSchemaType,
} from '@modelcontextprotocol/server';
import { toNodeHandler } from '@modelcontextprotocol/node';
import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import express from 'express';
import * as z4 from 'zod/v4';

const token = process.env.MCP_EVENTS_TOKEN ?? 'local-events-demo';
const subscriptions = new Map<
  string,
  {
    id: string;
    documentId: string;
    url: string;
    secret: string;
    expiresAt: number;
  }
>();
const argumentsSchema = z4.object({ document_id: z4.string() }).strict();
const commentSchema = {
  type: 'object',
  properties: {
    document_id: { type: 'string' },
    text: { type: 'string' },
  },
  required: ['document_id', 'text'],
  additionalProperties: false,
} satisfies JsonSchemaType;
const eventDefinition = {
  name: 'comment.created',
  description: 'A new comment on a document.',
  delivery: ['webhook'],
  inputSchema: z4.toJSONSchema(argumentsSchema),
  payloadSchema: commentSchema,
};

async function deliver(
  subscription: { id: string; url: string; secret: string },
  id: string,
  value: unknown,
) {
  // This demo only delivers to its fixed local receiver. Do not accept arbitrary
  // callback URLs in a server without delivery-time SSRF protections.
  const url = new URL(subscription.url);
  if (
    url.origin !== 'http://127.0.0.1:3003' ||
    url.pathname !== '/mcp-events' ||
    url.username ||
    url.password ||
    url.hash
  ) {
    throw new Error('This demo only allows http://127.0.0.1:3003/mcp-events');
  }
  const body = JSON.stringify(value);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac(
    'sha256',
    Buffer.from(subscription.secret.slice(6), 'base64'),
  )
    .update(`${id}.${timestamp}.${body}`)
    .digest('base64');
  return fetch(url, {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(5000),
    headers: {
      'content-type': 'application/json',
      'webhook-id': id,
      'webhook-timestamp': timestamp,
      'webhook-signature': `v1,${signature}`,
      'X-MCP-Subscription-Id': subscription.id,
    },
    body,
  });
}

function createServer() {
  const capabilities: ServerCapabilities & { events: Record<string, never> } = {
    events: {},
  };
  const server = new McpServer(
    { name: 'mcp-events-example', version: '1.0.0' },
    { capabilities },
  );

  // Events are a draft extension: register them using the SDK's custom handlers.
  server.server.setRequestHandler(
    'events/list',
    { params: z4.object({}) },
    async () => ({ events: [eventDefinition] }),
  );

  server.server.setRequestHandler(
    'events/subscribe',
    {
      params: z4.object({
        name: z4.literal('comment.created'),
        arguments: argumentsSchema,
        delivery: z4.object({
          mode: z4.literal('webhook'),
          url: z4.string().url(),
          secret: z4.string().regex(/^whsec_[A-Za-z0-9+/]+={0,2}$/),
        }),
        ttlMs: z4.number().int().positive().nullish(),
      }),
    },
    async input => {
      const bytes = Buffer.from(input.delivery.secret.slice(6), 'base64');
      if (bytes.length < 24 || bytes.length > 64)
        throw new ProtocolError(-32602, 'Invalid signing secret');

      // Reusing this identity renews the subscription instead of duplicating it.
      const id = `sub_${createHash('sha256')
        .update(
          JSON.stringify([
            token,
            input.delivery.url,
            input.name,
            input.arguments.document_id,
          ]),
        )
        .digest('hex')
        .slice(0, 24)}`;
      const subscription = {
        id,
        documentId: input.arguments.document_id,
        url: input.delivery.url,
        secret: input.delivery.secret,
        expiresAt: Date.now() + Math.min(input.ttlMs ?? 60_000, 60_000),
      };

      // Verify the callback before accepting the subscription.
      const challenge = randomUUID();
      const verification = await deliver(subscription, `msg_${randomUUID()}`, {
        type: 'verification',
        challenge,
      });
      const echoed = z4
        .object({ challenge: z4.string() })
        .parse(await verification.json());
      const expected = Buffer.from(challenge);
      const actual = Buffer.from(echoed.challenge);
      if (
        !verification.ok ||
        expected.length !== actual.length ||
        !timingSafeEqual(expected, actual)
      ) {
        throw new ProtocolError(-32015, 'Callback verification failed');
      }
      subscriptions.set(id, subscription);
      console.log('Verified callback and registered subscription:', id);
      return {
        id,
        refreshBefore: new Date(subscription.expiresAt).toISOString(),
        cursor: null,
        truncated: false,
      };
    },
  );

  server.server.setRequestHandler(
    'events/unsubscribe',
    {
      params: z4.object({
        name: z4.literal('comment.created'),
        arguments: argumentsSchema,
        delivery: z4.object({ mode: z4.literal('webhook'), url: z4.string() }),
      }),
    },
    async input => {
      const subscription = [...subscriptions.values()].find(
        subscription =>
          subscription.url === input.delivery.url &&
          subscription.documentId === input.arguments.document_id,
      );
      if (!subscription)
        throw new ProtocolError(-32011, 'Subscription not found');
      subscriptions.delete(subscription.id);
      return {};
    },
  );

  server.registerTool(
    'publish_comment',
    {
      description: 'Publish a comment and emit a comment.created event.',
      inputSchema: fromJsonSchema<{ document_id: string; text: string }>(
        eventDefinition.payloadSchema,
      ),
    },
    async data => {
      const event = {
        eventId: `evt_${randomUUID()}`,
        name: 'comment.created',
        timestamp: new Date().toISOString(),
        data,
        cursor: null,
      };
      for (const subscription of subscriptions.values()) {
        if (
          subscription.expiresAt <= Date.now() ||
          subscription.documentId !== data.document_id
        )
          continue;
        const delivery = await deliver(subscription, event.eventId, event);
        if (!delivery.ok)
          throw new Error(`Delivery returned ${delivery.status}`);
        console.log('Event acknowledged:', delivery.status);
      }
      return { content: [{ type: 'text', text: 'Comment published.' }] };
    },
  );

  return server;
}

const handler = toNodeHandler(createMcpHandler(createServer));
const app = express();
app.all('/mcp', async (request, response) => {
  if (request.get('authorization') !== `Bearer ${token}`) {
    response.status(403).end();
    return;
  }
  await handler(request, response);
});

app.listen(3002, '127.0.0.1', () => {
  console.log('MCP events server: http://127.0.0.1:3002/mcp');
});
