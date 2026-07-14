import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express from 'express';
import { z } from 'zod';

const app = express();
app.use(express.json());

app.post('/mcp', async (req, res) => {
  const server = new McpServer({
    name: 'tool-annotations-example-server',
    version: '1.0.0',
  });

  // A read-only tool: safe to auto-approve.
  server.registerTool(
    'read-order',
    {
      title: 'Read Order',
      description: 'Read the status of a customer order.',
      inputSchema: {
        orderId: z.string().describe('The order ID to read.'),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: false,
      },
    },
    async ({ orderId }) => ({
      content: [
        {
          type: 'text',
          text: `Order ${orderId} is packed and ready to ship.`,
        },
      ],
    }),
  );

  // A destructive tool: the client should gate this behind approval.
  server.registerTool(
    'cancel-order',
    {
      title: 'Cancel Order',
      description: 'Cancel a customer order. This cannot be undone.',
      inputSchema: {
        orderId: z.string().describe('The order ID to cancel.'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ orderId }) => ({
      content: [
        {
          type: 'text',
          text: `Order ${orderId} has been cancelled.`,
        },
      ],
    }),
  );

  try {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
    res.on('close', () => {
      transport.close();
      server.close();
    });
  } catch (error) {
    console.error('Error handling MCP request:', error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error',
        },
        id: null,
      });
    }
  }
});

app.listen(8086, () => {
  console.log('Tool annotations example MCP server listening on port 8086');
  console.log('Connect via Streamable HTTP at: http://localhost:8086/mcp');
});
