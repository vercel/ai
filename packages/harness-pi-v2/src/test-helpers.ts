import {
  createModels,
  fauxProvider,
  type FauxProviderHandle,
} from '@earendil-works/pi-ai';
import type { PiModelRuntime } from './pi-model-runtime';
import { createServer } from 'node:http';
import { parseJSON } from '@ai-sdk/provider-utils';

/**
 * Faux model access for adapter tests: scripted responses instead of AI
 * Gateway requests.
 */
export type TestModelRuntime = PiModelRuntime & {
  /**
   * Faux provider whose responses the test scripts.
   */
  faux: FauxProviderHandle;
};

/**
 * Creates a model runtime backed by Pi's faux provider. Every model ID
 * resolves to the faux model.
 */
export function createTestModelRuntime(): TestModelRuntime {
  const faux = fauxProvider();
  const models = createModels();
  models.setProvider(faux.provider);
  return {
    faux,
    resolveModel: () => faux.getModel(),
    streamFn: (model, context, options) =>
      models.streamSimple(model, context, options),
  };
}

/**
 * Local Streamable HTTP server exercising native MCP clients without provider
 * network requests. Captures requests and session deletion for lifecycle tests.
 */
export async function createTestMcpServer(
  options: {
    handle?: (request: {
      method: string;
      params?: Record<string, unknown>;
    }) => unknown | Promise<unknown>;
  } = {},
) {
  const requests: Array<{
    method: string;
    params?: Record<string, unknown>;
    authorization?: string;
  }> = [];
  let deletes = 0;
  const server = createServer(async (request, response) => {
    if (request.method === 'GET') {
      response.writeHead(405).end();
      return;
    }
    if (request.method === 'DELETE') {
      deletes++;
      response.writeHead(200).end();
      return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const input = (await parseJSON({
      text: Buffer.concat(chunks).toString(),
    })) as {
      id?: number;
      method: string;
      params?: Record<string, unknown>;
    };
    requests.push({
      method: input.method,
      params: input.params,
      authorization: request.headers.authorization,
    });
    if (input.id === undefined) {
      response.writeHead(202).end();
      return;
    }
    try {
      const custom = await options.handle?.(input);
      const result =
        custom ??
        (input.method === 'initialize'
          ? {
              protocolVersion: '2025-11-25',
              capabilities: { tools: {} },
              serverInfo: { name: 'test', version: '1' },
              instructions: 'Test MCP instructions',
            }
          : input.method === 'tools/list'
            ? {
                tools: [
                  {
                    name: 'lookup',
                    description: 'Look up data',
                    inputSchema: {
                      type: 'object',
                      properties: { query: { type: 'string' } },
                      required: ['query'],
                    },
                  },
                ],
              }
            : { content: [{ type: 'text', text: 'remote result' }] });
      response
        .writeHead(200, {
          'content-type': 'application/json',
          'mcp-session-id': 'test-session',
        })
        .end(JSON.stringify({ jsonrpc: '2.0', id: input.id, result }));
    } catch (error) {
      response.writeHead(200, { 'content-type': 'application/json' }).end(
        JSON.stringify({
          jsonrpc: '2.0',
          id: input.id,
          error: {
            code: -32000,
            message: error instanceof Error ? error.message : String(error),
          },
        }),
      );
    }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address == null || typeof address === 'string')
    throw new Error('Missing MCP test server address');
  return {
    url: `http://127.0.0.1:${address.port}/mcp`,
    requests,
    get deletes() {
      return deletes;
    },
    close: async () => {
      if (!server.listening) return;
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close(error => {
          if (error) reject(error);
          else resolve();
        }),
      );
    },
  };
}
