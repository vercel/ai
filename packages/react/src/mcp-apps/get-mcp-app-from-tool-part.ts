import type { MCPAppMetadata, MCPAppToolPart } from './mcp-app-types';

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function isVisibility(value: unknown): value is 'model' | 'app' {
  return value === 'model' || value === 'app';
}

export function getMCPAppFromToolPart(
  part: MCPAppToolPart,
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
    ? appMetadata.visibility.filter(isVisibility)
    : undefined;

  return {
    resourceUri: appMetadata.resourceUri,
    mimeType: 'text/html;profile=mcp-app',
    ...(visibility != null ? { visibility } : {}),
  };
}
