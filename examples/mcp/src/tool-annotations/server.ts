import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express from 'express';
import { z } from 'zod';

const app = express();
app.use(express.json());

const notes = new Map([
  ['note-1', 'MCP annotations are behavioral hints, not security guarantees.'],
]);

app.post('/mcp', async (request, response) => {
  const server = new McpServer({
    name: 'tool-annotations-example-server',
    version: '1.0.0',
  });

  server.registerTool(
    'read-note',
    {
      description: 'Read a note without changing it.',
      inputSchema: {
        id: z.string().describe('The note ID.'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ id }) => {
      console.log(`Executed read-note for ${id}`);
      return {
        content: [
          {
            type: 'text',
            text: notes.get(id) ?? `Note ${id} does not exist.`,
          },
        ],
      };
    },
  );

  server.registerTool(
    'delete-note',
    {
      description: 'Permanently delete a note.',
      inputSchema: {
        id: z.string().describe('The note ID.'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ id }) => {
      console.log(`Executed delete-note for ${id}`);
      const deleted = notes.delete(id);
      return {
        content: [
          {
            type: 'text',
            text: deleted ? `Deleted note ${id}.` : `Note ${id} did not exist.`,
          },
        ],
      };
    },
  );

  server.registerTool(
    'create-note',
    {
      description:
        'Create a note. This tool intentionally does not provide annotations.',
      inputSchema: {
        id: z.string().describe('The note ID.'),
        text: z.string().describe('The note contents.'),
      },
    },
    async ({ id, text }) => {
      console.log(`Executed create-note for ${id}`);
      notes.set(id, text);
      return {
        content: [
          {
            type: 'text',
            text: `Created note ${id}.`,
          },
        ],
      };
    },
  );

  try {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    await server.connect(transport);
    await transport.handleRequest(request, response, request.body);
    response.on('close', () => {
      transport.close();
      server.close();
    });
  } catch (error) {
    console.error('Error handling MCP request:', error);
    if (!response.headersSent) {
      response.status(500).json({
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
  console.log('Tool annotations MCP server listening on http://localhost:8086');
});
