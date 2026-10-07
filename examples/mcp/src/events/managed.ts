import {
  createMCPClient,
  type MCPClientConfig,
  type Experimental_MCPEventsAdapter as MCPEventsAdapter,
  type Experimental_ManagedSubscribeInput as ManagedSubscribeInput,
} from '@ai-sdk/mcp';

/**
 * Integrate a managed backend without an AI SDK event store.
 * The caller persists its authorized creation intent and supplies a backend
 * adapter bound to the same account as the authenticated MCP transport.
 * The backend provisions the webhook and owns delivery, renewal and cleanup.
 */
export async function createManagedWatch({
  transport,
  adapter,
  input,
}: {
  transport: MCPClientConfig['transport'];
  adapter: MCPEventsAdapter;
  input: ManagedSubscribeInput;
}) {
  const client = await createMCPClient({
    transport,
    experimental_events: { adapter },
  });
  try {
    // Use this catalog to select event names and construct schema-valid arguments.
    const catalog = await client.experimental_events.list();
    const subscription = await client.experimental_events.subscribe(input);
    return { catalog, subscription };
  } finally {
    // Closing the discovery connection leaves the managed watch running.
    await client.close();
  }
}
