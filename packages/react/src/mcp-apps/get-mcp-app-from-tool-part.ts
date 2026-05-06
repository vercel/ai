import type { MCPAppMetadata, MCPAppRendererProps } from './types';

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function isMCPAppToolVisibleTo(value: unknown): value is 'model' | 'app' {
  return value === 'model' || value === 'app';
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
    !appMetadata.resourceUri.startsWith('ui://')
  ) {
    return undefined;
  }

  const visibility = Array.isArray(appMetadata.visibility)
    ? appMetadata.visibility.filter(isMCPAppToolVisibleTo)
    : undefined;

  return {
    resourceUri: appMetadata.resourceUri,
    mimeType: appMetadata.mimeType,
    ...(visibility != null ? { visibility } : {}),
  };
}
