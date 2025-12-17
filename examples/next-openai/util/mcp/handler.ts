import { ServerOptions } from '@modelcontextprotocol/sdk/server/index.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { ServerResponse } from 'http';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { convertNextRequestToIncomingMessage } from './incoming-message';

export const mcpApiHandler = initializeMcpApiHandler({
  initializationCallback: server => {
    server.tool(
      'calculateSum',
      'Returns the sum of N numbers',
      {
        values: z.array(z.number()),
      },
      { title: '🔢 Calculator' },
      async ({ values }: { values: number[] }) => ({
        content: [
          {
            type: 'text',
            text: `Sum: ${values.reduce((a: number, b: number) => a + b, 0)}`,
          },
        ],
      }),
    );
  },
  serverOptions: {
    capabilities: {
      tools: {},
    },
  },
});

function initializeMcpApiHandler({
  initializationCallback,
  serverOptions,
}: {
  initializationCallback: (server: McpServer) => void;
  serverOptions?: ServerOptions;
}) {
  return async function mcpApiHandler(req: NextRequest, res: ServerResponse) {
    const url = new URL(req.url || '', 'https://example.com');

    if (url.pathname === '/mcp/server') {
      if (req.method === 'GET') {
        console.log('Received GET MCP request');
        res.writeHead(405, { 'Content-Type': 'application/json' }).end(
          JSON.stringify({
            jsonrpc: '2.0',
            error: {
              code: -32000,
              message: 'Method not allowed.',
            },
            id: null,
          }),
        );
        return;
      }

      if (req.method === 'DELETE') {
        console.log('Received DELETE MCP request');
        res.writeHead(405, { 'Content-Type': 'application/json' }).end(
          JSON.stringify({
            jsonrpc: '2.0',
            error: {
              code: -32000,
              message: 'Method not allowed.',
            },
            id: null,
          }),
        );
        return;
      }

      console.log('New MCP connection', req.url, req.method);

      if (req.method === 'POST') {
        /**
         * In Stateless Mode, we create a new instance of transport and server for each request to ensure complete isolation. A single instance would cause request ID collisions when multiple clients connect concurrently.
         */
        const server = new McpServer(
          {
            name: 'MCP Next.js Server',
            version: '0.1.0',
          },
          serverOptions,
        );
        const statelessTransport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
        });
        initializationCallback(server);
        await server.connect(statelessTransport);

        const incomingMessage = await convertNextRequestToIncomingMessage(req);
        await statelessTransport.handleRequest(incomingMessage, res);
      }
    } else {
      res.statusCode = 404;
      res.end('Not found');
    }
  };
}
