import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { parseJSON } from '@ai-sdk/provider-utils';
import type { FxModelRuntime } from './fx-model-runtime';

/**
 * A request the test model runtime received.
 */
export type TestModelRequest = {
  /**
   * Requested URL.
   */
  url: string;

  /**
   * HTTP method.
   */
  method: string;

  /**
   * Request headers.
   */
  headers: Headers;

  /**
   * Request body as text.
   */
  body: string;
};

/**
 * A scripted response of the test model runtime: a string is the body of a
 * successful event stream response, a `Response` is returned as is, and a
 * function creates the response for the request.
 */
export type TestModelResponse =
  | string
  | Response
  | ((request: TestModelRequest) => Response | Promise<Response>);

/**
 * Scripted model access for adapter tests: responses from a queue instead of
 * AI Gateway requests.
 */
export type TestModelRuntime = FxModelRuntime & {
  /**
   * Model requests received, in order.
   */
  requests: TestModelRequest[];

  /**
   * Model catalog requests received, in order.
   */
  catalogRequests: TestModelRequest[];

  /**
   * Appends scripted responses to the queue.
   */
  push(...responses: TestModelResponse[]): void;
};

/**
 * Creates a model runtime that answers each model request with the next
 * scripted response and records the request. A request without a scripted
 * response rejects. Model catalog requests are answered with the given
 * catalog, an empty one by default, without consuming a scripted response.
 */
export function createTestModelRuntime(
  options: {
    /**
     * Scripted responses, in order.
     */
    responses?: TestModelResponse[];

    /**
     * Body of the model catalog response.
     */
    catalog?: string;
  } = {},
): TestModelRuntime {
  const queue = [...(options.responses ?? [])];
  const requests: TestModelRequest[] = [];
  const catalogRequests: TestModelRequest[] = [];
  const catalog = options.catalog ?? '{"object":"list","data":[]}';
  return {
    apiKey: 'test-api-key',
    requests,
    catalogRequests,
    push(...responses) {
      queue.push(...responses);
    },
    // oxlint-disable-next-line ai-sdk/require-object-parameter -- `fetch` signature.
    async fetch(input, init) {
      const request = new Request(input, init);
      const recorded: TestModelRequest = {
        url: request.url,
        method: request.method,
        headers: new Headers(request.headers),
        body: await request.text(),
      };
      if (new URL(recorded.url).pathname === '/coding-agent/v1/models') {
        catalogRequests.push(recorded);
        return new Response(catalog, {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      requests.push(recorded);
      const next = queue.shift();
      if (next == null) {
        throw new Error(
          `unexpected request ${recorded.method} ${recorded.url}`,
        );
      }
      if (typeof next === 'string') {
        return new Response(next, {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        });
      }
      return typeof next === 'function' ? next(recorded) : next;
    },
  };
}

/**
 * Reads a fixture file from `src/__fixtures__` as text.
 */
export function readFixture(options: {
  /**
   * File name of the fixture.
   */
  name: string;
}): Promise<string> {
  return readFile(
    new URL(`./__fixtures__/${options.name}`, import.meta.url),
    'utf8',
  );
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
