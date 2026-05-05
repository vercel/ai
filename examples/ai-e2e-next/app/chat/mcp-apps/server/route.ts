import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import type { NextRequest } from 'next/server';
import { z } from 'zod';

const DASHBOARD_RESOURCE_URI = 'ui://ai-sdk-e2e/dashboard';
const MCP_APP_MIME_TYPE = 'text/html;profile=mcp-app';

function createDashboardHtml() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>AI SDK MCP App</title>
    <style>
      :root {
        color-scheme: light dark;
        font-family: var(--font-sans, system-ui, sans-serif);
        background: var(--color-background-primary, #ffffff);
        color: var(--color-text-primary, #171717);
      }

      body {
        margin: 0;
        padding: 16px;
      }

      .card {
        border: 1px solid var(--color-border-primary, #d4d4d4);
        border-radius: var(--border-radius-lg, 12px);
        padding: 16px;
        background: var(--color-background-secondary, #fafafa);
      }

      .eyebrow {
        margin: 0 0 8px;
        color: var(--color-text-secondary, #525252);
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }

      h1 {
        margin: 0;
        font-size: 20px;
      }

      p {
        line-height: 1.5;
      }

      button {
        border: 1px solid var(--color-border-primary, #d4d4d4);
        border-radius: var(--border-radius-md, 8px);
        padding: 8px 12px;
        background: var(--color-background-primary, #ffffff);
        color: inherit;
        cursor: pointer;
      }

      pre {
        overflow: auto;
        padding: 12px;
        border-radius: var(--border-radius-md, 8px);
        background: var(--color-background-tertiary, #f5f5f5);
      }
    </style>
  </head>
  <body>
    <main class="card">
      <p class="eyebrow">MCP App</p>
      <h1>AI SDK dashboard</h1>
      <p>
        This HTML is served from an MCP <code>ui://</code> resource. Once the
        host bridge is implemented, tool input and tool result notifications
        should hydrate this view.
      </p>
      <button id="refresh">Call app-only refresh tool</button>
      <pre id="log">Waiting for host bridge...</pre>
    </main>

    <script>
      const log = document.getElementById('log');
      let nextId = 1;

      function sendRequest(method, params) {
        const id = nextId++;
        window.parent.postMessage({ jsonrpc: '2.0', id, method, params }, '*');
        return id;
      }

      window.addEventListener('message', event => {
        log.textContent = JSON.stringify(event.data, null, 2);
      });

      document.getElementById('refresh').addEventListener('click', () => {
        sendRequest('tools/call', {
          name: 'refreshDashboardData',
          arguments: { reason: 'User clicked refresh in the MCP App' },
        });
      });

      sendRequest('ui/initialize', {
        protocolVersion: '2026-01-26',
        appCapabilities: {
          availableDisplayModes: ['inline', 'fullscreen'],
        },
        clientInfo: {
          name: 'ai-sdk-e2e-mcp-app',
          version: '1.0.0',
        },
      });
    </script>
  </body>
</html>`;
}

function createServer() {
  const server = new McpServer(
    {
      name: 'AI SDK MCP Apps E2E Server',
      version: '1.0.0',
    },
    {
      capabilities: {
        resources: {},
        tools: {},
      },
    },
  );

  server.registerResource(
    'dashboard-app',
    DASHBOARD_RESOURCE_URI,
    {
      description: 'Interactive dashboard rendered by an MCP Apps host.',
      mimeType: MCP_APP_MIME_TYPE,
      _meta: {
        ui: {
          prefersBorder: true,
        },
      },
    },
    async () => ({
      contents: [
        {
          uri: DASHBOARD_RESOURCE_URI,
          mimeType: MCP_APP_MIME_TYPE,
          text: createDashboardHtml(),
          _meta: {
            ui: {
              prefersBorder: true,
              csp: {
                connectDomains: [],
                resourceDomains: [],
                frameDomains: [],
              },
            },
          },
        },
      ],
    }),
  );

  server.registerTool(
    'showDashboard',
    {
      title: 'Show Dashboard',
      description: 'Show an interactive MCP App dashboard for a topic.',
      inputSchema: {
        topic: z
          .string()
          .describe(
            'The dashboard topic to display, such as usage or weather.',
          ),
      },
      _meta: {
        ui: {
          resourceUri: DASHBOARD_RESOURCE_URI,
          visibility: ['model', 'app'],
        },
      },
    },
    async ({ topic }) => ({
      content: [
        {
          type: 'text',
          text: `Rendered an MCP App dashboard for "${topic}".`,
        },
      ],
      structuredContent: {
        topic,
        cards: [
          { label: 'Requests', value: 128 },
          { label: 'Latency', value: '42ms' },
          { label: 'Status', value: 'Healthy' },
        ],
      },
      _meta: {
        ui: {
          resourceUri: DASHBOARD_RESOURCE_URI,
        },
      },
    }),
  );

  server.registerTool(
    'refreshDashboardData',
    {
      title: 'Refresh Dashboard Data',
      description:
        'Refresh the rendered dashboard data. This tool is intended for the MCP App, not the model.',
      inputSchema: {
        reason: z.string().optional(),
      },
      _meta: {
        ui: {
          resourceUri: DASHBOARD_RESOURCE_URI,
          visibility: ['app'],
        },
      },
    },
    async ({ reason }) => ({
      content: [
        {
          type: 'text',
          text: `Dashboard data refreshed${reason ? `: ${reason}` : ''}.`,
        },
      ],
      structuredContent: {
        refreshedAt: new Date().toISOString(),
        cards: [
          { label: 'Requests', value: 143 },
          { label: 'Latency', value: '39ms' },
          { label: 'Status', value: 'Healthy' },
        ],
      },
    }),
  );

  return server;
}

async function requestHandler(req: NextRequest) {
  if (req.method === 'GET' || req.method === 'DELETE') {
    return Response.json(
      {
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Method not allowed.',
        },
        id: null,
      },
      { status: 405 },
    );
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const server = createServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  await server.connect(transport);
  return transport.handleRequest(req);
}

export {
  requestHandler as DELETE,
  requestHandler as GET,
  requestHandler as POST,
};
