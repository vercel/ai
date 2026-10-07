import {
  createMCPClient,
  experimental_createMCPEventWebhook,
} from '@ai-sdk/mcp';
import { eventStore } from './event-store';
import { startWebhookServer } from './webhook-server';

async function main() {
  // Uses the saved secret to verify callback challenges and event signatures.
  const webhook = experimental_createMCPEventWebhook({
    store: eventStore,
    async onEvent({ event }) {
      console.log('Received comment:', event.data);
    },
    async onGap({ subscription, gap }) {
      // Some events cannot be replayed; reconcile state or notify the agent.
      console.log('Replay gap:', subscription.id, gap.cursor, gap.truncated);
    },
    async onTerminated({ subscription, termination }) {
      // The server ended the subscription; notify the agent of the reason.
      console.log(
        'Subscription terminated:',
        subscription.id,
        termination.error,
      );
    },
  });

  // Start receiving before subscribing: the server verifies this URL immediately.
  const receiver = await startWebhookServer(webhook);
  try {
    const client = await createMCPClient({
      transport: {
        type: 'http',
        url: 'http://127.0.0.1:3002/mcp',
        headers: {
          Authorization: `Bearer ${process.env.MCP_EVENTS_TOKEN ?? 'local-events-demo'}`,
        },
      },
      experimental_events: { store: eventStore },
    });

    try {
      const { events } = await client.experimental_events.list();
      console.log(
        'Available events:',
        events.map(event => event.name),
      );

      const subscription = await client.experimental_events.subscribe({
        name: 'comment.created',
        arguments: { document_id: 'doc_123' },
        delivery: {
          mode: 'webhook',
          url: 'http://127.0.0.1:3003/mcp-events',
          allowInsecureLocalhost: true, // Local demo; production uses HTTPS.
        },
      });
      console.log('Subscribed (callback verified):', subscription.id);

      try {
        // Simulate a new comment on the server. It sends a webhook to onEvent.
        await client.callTool({
          name: 'publish_comment',
          arguments: { document_id: 'doc_123', text: 'Hello from MCP events!' },
        });
      } finally {
        await client.experimental_events.unsubscribe({ id: subscription.id });
      }
    } finally {
      await client.close();
    }
  } finally {
    await receiver.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
