import {
  createMCPClient,
  type MCPClientConfig,
  type Experimental_MCPEventOperations as MCPEventOperations,
  type Experimental_MCPEventAdapter as MCPEventAdapter,
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
  adapter: MCPEventAdapter;
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

/**
 * A backend integration can expose an adapter so callers configure the MCP URL
 * only on the transport. An explicit backend override takes precedence.
 * Backend implementations must authorize the endpoint before sending credentials.
 */
export function createManagedEventsAdapter({
  createAdapter,
  mcpUrl,
}: {
  createAdapter: (config: { mcpUrl: string | undefined }) => MCPEventOperations;
  mcpUrl?: string;
}): MCPEventAdapter {
  return {
    createAdapter({ url }) {
      return createAdapter({ mcpUrl: mcpUrl ?? url });
    },
  };
}
