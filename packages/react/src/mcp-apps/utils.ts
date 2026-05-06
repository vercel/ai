import { asRecord } from '@ai-sdk/provider-utils';
import type { MCPAppMetadata, MCPAppRendererProps } from './types';

/**
 * Extracts MCP App metadata from an AI SDK tool UI part.
 *
 * @example
 * ```ts
 * const app = getMCPAppFromToolPart({
 *   type: 'dynamic-tool',
 *   toolName: 'showDashboard',
 *   toolCallId: 'call-1',
 *   state: 'input-available',
 *   input: { topic: 'usage' },
 *   callProviderMetadata: {
 *     mcp: {
 *       app: {
 *         resourceUri: 'ui://example/dashboard',
 *         mimeType: 'text/html;profile=mcp-app',
 *       },
 *     },
 *   },
 * });
 * // { resourceUri: 'ui://example/dashboard', mimeType: 'text/html;profile=mcp-app' }
 * ```
 */
export function getMCPAppFromToolPart(
  part: MCPAppRendererProps['part'],
): MCPAppMetadata | undefined {
  const mcpMetadata = asRecord(part.callProviderMetadata?.mcp);
  const appMetadata = asRecord(mcpMetadata?.app);

  if (
    appMetadata == null ||
    appMetadata.mimeType !== 'text/html;profile=mcp-app' ||
    typeof appMetadata.resourceUri !== 'string' ||
    !appMetadata.resourceUri.startsWith('ui://') ||
    (appMetadata.visibility != null &&
      (!Array.isArray(appMetadata.visibility) ||
        appMetadata.visibility.some(
          value => value !== 'model' && value !== 'app',
        )))
  ) {
    return undefined;
  }

  return appMetadata as MCPAppMetadata;
}

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
