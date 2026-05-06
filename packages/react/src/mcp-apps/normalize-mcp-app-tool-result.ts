/**
 * Converts an AI SDK tool output into the MCP Apps tool-result shape.
 *
 * MCP Apps expect tool results to have `content` and optional
 * `structuredContent`. MCP tools already return that shape, but typed AI SDK
 * tools may return only structured data. This helper wraps structured-only
 * outputs so the iframe can receive a valid tool result notification.
 *
 * @example
 * ```ts
 * normalizeMCPAppToolResult({ cards: [] });
 * // { content: [], structuredContent: { cards: [] } }
 * ```
 */
export function normalizeMCPAppToolResult(output: unknown): {
  content: unknown[];
  structuredContent?: unknown;
  isError?: boolean;
} {
  if (output != null && typeof output === 'object' && 'content' in output) {
    return output as {
      content: unknown[];
      structuredContent?: unknown;
      isError?: boolean;
    };
  }

  return {
    content: [],
    structuredContent: output,
  };
}
