import { createMCPClient } from '@ai-sdk/mcp';
import { run } from '../lib/run';
import { print } from '../lib/print';

// Connect to an authenticated server implementing the draft MCP Events extension.
// This example only discovers definitions; it does not create subscriptions.
run(async () => {
  const url = process.env.MCP_SERVER_URL;
  const token = process.env.MCP_ACCESS_TOKEN;
  if (!url || !token) {
    throw new Error('Set MCP_SERVER_URL and MCP_ACCESS_TOKEN');
  }

  const client = await createMCPClient({
    transport: {
      type: 'http',
      url,
      headers: { Authorization: `Bearer ${token}` },
    },
  });

  try {
    let cursor: string | undefined;
    do {
      const page = await client.experimental_listEvents({ params: { cursor } });
      for (const event of page.events) {
        print(event.name, {
          description: event.description,
          delivery: event.delivery,
          inputSchema: event.inputSchema,
        });
      }
      cursor = page.nextCursor;
    } while (cursor != null);
  } finally {
    await client.close();
  }
});
