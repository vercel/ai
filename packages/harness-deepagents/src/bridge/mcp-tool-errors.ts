import { ToolMessage } from '@langchain/core/messages';
import { createMiddleware } from 'langchain';

/** Keep native MCP failures in the tool loop without recovering aborts or host-tool exceptions. */
export function createMcpToolErrorMiddleware({
  mcpToolNames,
  abortSignal,
}: {
  mcpToolNames: () => ReadonlySet<string>;
  abortSignal: () => AbortSignal | undefined;
}) {
  return createMiddleware({
    name: 'harnessMcpToolErrors',
    wrapToolCall: async (request, handler) => {
      const signal = abortSignal();
      try {
        signal?.throwIfAborted();
        return await handler(request);
      } catch (error) {
        if (
          !signal ||
          signal.aborted ||
          !mcpToolNames().has(request.toolCall.name) ||
          !(error instanceof Error) ||
          error.name !== 'ToolException' ||
          typeof request.toolCall.id !== 'string' ||
          !request.toolCall.id
        ) {
          throw error;
        }
        return new ToolMessage({
          content: error.message,
          tool_call_id: request.toolCall.id,
          status: 'error',
        });
      }
    },
  });
}
