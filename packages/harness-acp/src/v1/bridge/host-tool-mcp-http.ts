import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import type { HarnessV1BridgeToolWire } from '@ai-sdk/harness';
import {
  createHostToolMCPServer,
  type HostToolMCPInvocationResult,
  type HostToolMCPServer,
} from './host-tool-mcp-server';

export const HOST_TOOL_MCP_ENDPOINT_PATH = '/mcp';

export type HostToolMCPHttpEndpoint = {
  handleRequest(options: {
    request: IncomingMessage;
    response: ServerResponse;
    body?: unknown;
  }): Promise<void>;
  updateCatalog(options: {
    revision: number;
    tools: ReadonlyArray<HarnessV1BridgeToolWire>;
  }): Promise<void>;
  close(): Promise<void>;
};

type EndpointSession = {
  readonly transport: StreamableHTTPServerTransport;
  readonly hostToolServer: HostToolMCPServer;
};

/*
 * The ACP host tool catalog is shared by every MCP session opened against this
 * endpoint. Each session needs its own MCP `Server` instance because a server
 * can be connected to a single transport at a time, so catalog updates are
 * fanned out to all live sessions and also retained for sessions opened later.
 */
export function createHostToolMCPHttpEndpoint({
  tools,
  revision,
  invoke,
  onListTools,
}: {
  tools: ReadonlyArray<HarnessV1BridgeToolWire>;
  revision: number;
  invoke: (options: {
    toolName: string;
    input: Readonly<Record<string, unknown>>;
    catalogRevision: number;
  }) => Promise<HostToolMCPInvocationResult>;
  onListTools: (options: { revision: number }) => Promise<void>;
}): HostToolMCPHttpEndpoint {
  let catalog: {
    revision: number;
    tools: ReadonlyArray<HarnessV1BridgeToolWire>;
  } = { revision, tools: [...tools] };
  const sessions = new Map<string, EndpointSession>();
  let closed = false;

  async function openSession({
    request,
    response,
    body,
  }: {
    request: IncomingMessage;
    response: ServerResponse;
    body: unknown;
  }): Promise<void> {
    const hostToolServer = createHostToolMCPServer({
      tools: catalog.tools,
      revision: catalog.revision,
      invoke,
      onListTools,
    });
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: sessionId => {
        sessions.set(sessionId, { transport, hostToolServer });
      },
      onsessionclosed: sessionId => {
        sessions.delete(sessionId);
      },
    });
    transport.onclose = () => {
      const { sessionId } = transport;
      if (sessionId != null) sessions.delete(sessionId);
    };
    await hostToolServer.server.connect(transport);
    await transport.handleRequest(request, response, body);
  }

  return {
    handleRequest: async ({ request, response, body }) => {
      if (closed) {
        respondWithJSONRPCError({
          response,
          status: 503,
          code: -32000,
          message: 'The host tool MCP endpoint is closed.',
        });
        return;
      }
      const sessionId = readSessionId({ request });
      if (sessionId != null) {
        const session = sessions.get(sessionId);
        if (session == null) {
          respondWithJSONRPCError({
            response,
            status: 404,
            code: -32001,
            message: 'Unknown host tool MCP session.',
          });
          return;
        }
        await session.transport.handleRequest(request, response, body);
        return;
      }
      if (request.method !== 'POST' || !isInitializeRequest(body)) {
        respondWithJSONRPCError({
          response,
          status: 400,
          code: -32000,
          message:
            'Host tool MCP requests without a session id must be an initialize request.',
        });
        return;
      }
      await openSession({ request, response, body });
    },
    updateCatalog: async ({ revision: nextRevision, tools: nextTools }) => {
      catalog = { revision: nextRevision, tools: [...nextTools] };
      await Promise.all(
        [...sessions.values()].map(session =>
          session.hostToolServer.updateCatalog({
            revision: nextRevision,
            tools: nextTools,
          }),
        ),
      );
    },
    close: async () => {
      if (closed) return;
      closed = true;
      const live = [...sessions.values()];
      sessions.clear();
      await Promise.all(
        live.map(session => session.hostToolServer.server.close()),
      );
    },
  };
}

function readSessionId({
  request,
}: {
  request: IncomingMessage;
}): string | undefined {
  const value = request.headers['mcp-session-id'];
  const sessionId = Array.isArray(value) ? value[0] : value;
  return sessionId == null || sessionId.length === 0 ? undefined : sessionId;
}

function respondWithJSONRPCError({
  response,
  status,
  code,
  message,
}: {
  response: ServerResponse;
  status: number;
  code: number;
  message: string;
}): void {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(
    JSON.stringify({
      jsonrpc: '2.0',
      error: { code, message },
      id: null,
    }),
  );
}
