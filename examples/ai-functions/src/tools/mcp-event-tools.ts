import { experimental_eventToolsFromDefinitions as eventToolsFromDefinitions } from '@ai-sdk/mcp';
import { print } from '../lib/print';

// The same helper accepts definitions obtained from client.experimental_listEvents().
// This runnable example uses a catalog fixture and a dry-run subscription handler;
// it creates no upstream subscriptions and does not need model/provider credentials.
const tools = eventToolsFromDefinitions(
  {
    events: [
      {
        name: 'issue.created',
        description: 'New issues in a selected project',
        delivery: ['webhook'],
        inputSchema: {
          type: 'object',
          properties: { project_id: { type: 'string' } },
          required: ['project_id'],
        },
        payloadSchema: { type: 'object' },
      },
    ],
  },
  {
    subscribe: async ({ name, arguments: args }) => {
      // Replace with your authorized, durable subscription backend.
      // Bind the account/conversation and callback configuration in trusted code.
      print('Subscription intent:', { name, arguments: args });
      return { status: 'dry-run', event: name };
    },
  },
);

// Pass `tools` to generateText/streamText or a framework's discovery layer.
// Direct execution below demonstrates the same adapter without calling a model.
const result = await tools.mcp_subscribe_issue_created.execute!(
  { project_id: 'ABC' },
  { toolCallId: 'demo', messages: [], context: {} },
);
print('Result:', result);
