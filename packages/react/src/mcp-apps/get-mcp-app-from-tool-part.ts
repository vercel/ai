import type { MCPAppMetadata, MCPAppRendererProps } from './types';

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

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
