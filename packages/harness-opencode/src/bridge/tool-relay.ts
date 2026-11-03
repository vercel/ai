import { createServer, type Server } from 'node:http';
import type { BridgeTurn } from '@ai-sdk/harness/bridge';
import { ToolRelayAuthorizer, type ToolRelayCall } from './tool-relay-auth';

/**
 * Largest accepted tool relay request body. Host tool inputs are JSON and are
 * expected to be small; this matches the harness-acp host tool relay limit and
 * bounds the memory a single request can make the relay allocate.
 */
const TOOL_RELAY_MAX_BODY_BYTES = 16 * 1024 * 1024;

class ToolRelayRequestError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ToolRelayRequestError';
    this.status = status;
  }
}

export type ToolRelay = {
  port: number;
  close(): void;
  authorizeToolCall(call: ToolRelayCall): void;
};

export async function startAuthorizedToolRelay({
  tools,
  emit,
  requestToolResult,
  onWaitingChange,
  authorizer = new ToolRelayAuthorizer(),
}: {
  tools: ReadonlyArray<{ name: string }>;
  emit: (message: Record<string, unknown>) => void;
  requestToolResult: BridgeTurn['requestToolResult'];
  onWaitingChange?: (input: { requestId: string; waiting: boolean }) => void;
  authorizer?: ToolRelayAuthorizer;
}): Promise<ToolRelay> {
  const toolNames = new Set(tools.map(tool => tool.name));
  const server = createServer(async (req, res) => {
    try {
      if (req.method !== 'POST' || req.url !== '/') {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'unauthorized tool relay request' }));
        return;
      }
      // Trust a declared length only to fail fast; the streamed count is the
      // guard. Both checks run before the allow-list and the authorizer, so an
      // unauthenticated caller cannot make the relay buffer an oversized body.
      const declaredLength = Number(req.headers['content-length']);
      if (
        Number.isFinite(declaredLength) &&
        declaredLength > TOOL_RELAY_MAX_BODY_BYTES
      ) {
        throw new ToolRelayRequestError(
          413,
          'Tool relay request is too large.',
        );
      }
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of req) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += buffer.length;
        if (size > TOOL_RELAY_MAX_BODY_BYTES) {
          throw new ToolRelayRequestError(
            413,
            'Tool relay request is too large.',
          );
        }
        chunks.push(buffer);
      }
      const body = Buffer.concat(chunks).toString('utf8');
      const { requestId, toolName, input } = JSON.parse(body) as {
        requestId: string;
        toolName: string;
        input: unknown;
      };

      if (!toolNames.has(toolName)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({ error: `Tool "${toolName}" is not available` }),
        );
        return;
      }
      if (
        !(await authorizer.waitForToolCallAuthorization({ toolName, input }))
      ) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'unauthorized tool relay request' }));
        return;
      }

      emit({
        type: 'tool-call',
        toolCallId: requestId,
        toolName,
        input: JSON.stringify(input ?? {}),
        providerExecuted: false,
      });

      onWaitingChange?.({ requestId, waiting: true });
      const { output, isError, toolResult } = await requestToolResult(
        requestId,
      ).finally(() => onWaitingChange?.({ requestId, waiting: false }));
      emit({
        type: 'tool-result',
        toolCallId: requestId,
        toolName,
        result: output ?? null,
        isError: !!isError,
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          result: output,
          ...(isError != null ? { isError } : {}),
          ...(toolResult != null ? { toolResult } : {}),
        }),
      );
    } catch (error) {
      const status =
        error instanceof ToolRelayRequestError ? error.status : 500;
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  });

  await new Promise<void>(resolve =>
    server.listen(0, '127.0.0.1', () => resolve()),
  );
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('tool relay did not expose a numeric port');
  }
  return {
    port: address.port,
    close: () => {
      authorizer.close();
      closeServer(server);
    },
    authorizeToolCall: call => authorizer.authorizeToolCall(call),
  };
}

function closeServer(server: Server): void {
  try {
    server.close();
  } catch {}
}
