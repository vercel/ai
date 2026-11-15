import express from 'express';

const app = express();
app.use(express.json());

const protocolVersion = '2026-07-28';

app.post('/mcp', (request, response) => {
  const body = request.body as {
    id?: string | number;
    method?: string;
    params?: {
      name?: string;
      arguments?: Record<string, unknown>;
      _meta?: Record<string, unknown>;
    };
  };

  console.log(`${body.method}:`, {
    protocolVersion: request.get('MCP-Protocol-Version'),
    method: request.get('Mcp-Method'),
    name: request.get('Mcp-Name'),
    region: request.get('Mcp-Param-Region'),
    sessionId: request.get('Mcp-Session-Id'),
  });

  if (
    request.get('MCP-Protocol-Version') !== protocolVersion ||
    body.params?._meta?.['io.modelcontextprotocol/protocolVersion'] !==
      protocolVersion
  ) {
    response.status(400).json({
      jsonrpc: '2.0',
      id: body.id,
      error: {
        code: -32022,
        message: 'Unsupported protocol version',
        data: {
          requested: request.get('MCP-Protocol-Version'),
          supported: [protocolVersion],
        },
      },
    });
    return;
  }

  if (request.get('Mcp-Method') !== body.method) {
    response.status(400).json({
      jsonrpc: '2.0',
      id: body.id,
      error: {
        code: -32020,
        message: 'Mcp-Method header does not match the request body',
      },
    });
    return;
  }

  switch (body.method) {
    case 'server/discover': {
      response.json({
        jsonrpc: '2.0',
        id: body.id,
        result: {
          resultType: 'complete',
          supportedVersions: [protocolVersion],
          capabilities: { tools: {} },
          instructions: 'Call greet with a name and deployment region.',
          ttlMs: 60_000,
          cacheScope: 'public',
          _meta: {
            'io.modelcontextprotocol/serverInfo': {
              name: 'ai-sdk-mcp-2026-example',
              version: '1.0.0',
            },
          },
        },
      });
      return;
    }

    case 'tools/list': {
      response.json({
        jsonrpc: '2.0',
        id: body.id,
        result: {
          resultType: 'complete',
          tools: [
            {
              name: 'greet',
              description: 'Greet someone from a deployment region.',
              inputSchema: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  region: {
                    type: 'string',
                    'x-mcp-header': 'Region',
                  },
                },
                required: ['name', 'region'],
                additionalProperties: false,
              },
            },
          ],
          ttlMs: 60_000,
          cacheScope: 'public',
        },
      });
      return;
    }

    case 'tools/call': {
      const region = body.params?.arguments?.region;
      if (
        body.params?.name !== 'greet' ||
        request.get('Mcp-Name') !== 'greet' ||
        typeof region !== 'string' ||
        request.get('Mcp-Param-Region') !== region
      ) {
        response.status(400).json({
          jsonrpc: '2.0',
          id: body.id,
          error: {
            code: -32020,
            message: 'Required MCP request headers do not match the tool call',
          },
        });
        return;
      }

      const name = body.params.arguments?.name;
      response.json({
        jsonrpc: '2.0',
        id: body.id,
        result: {
          resultType: 'complete',
          content: [
            {
              type: 'text',
              text: `Hello, ${String(name)} from ${region}!`,
            },
          ],
          isError: false,
        },
      });
      return;
    }

    default: {
      response.status(404).json({
        jsonrpc: '2.0',
        id: body.id,
        error: { code: -32601, message: 'Method not found' },
      });
    }
  }
});

app.listen(3001, () => {
  console.log('MCP 2026 example server listening on http://localhost:3001/mcp');
});
