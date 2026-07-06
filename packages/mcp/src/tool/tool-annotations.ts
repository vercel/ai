import type { McpProviderMetadata } from './types';

type MetadataSource =
  | { metadata?: unknown }
  | { toolMetadata?: unknown }
  | null
  | undefined;

/**
 * Reads the raw metadata object from a discovered tool (`metadata`) or a tool
 * call (`toolMetadata`), returning `undefined` when neither is a usable object.
 */
function getRawMcpMetadata(
  source: MetadataSource,
): Record<string, unknown> | undefined {
  if (source == null || typeof source !== 'object') {
    return undefined;
  }

  const meta =
    (source as { metadata?: unknown }).metadata ??
    (source as { toolMetadata?: unknown }).toolMetadata;

  return meta != null && typeof meta === 'object'
    ? (meta as Record<string, unknown>)
    : undefined;
}

/**
 * Determines whether a tool or tool call originated from an MCP server.
 *
 * The MCP client stamps `clientName` and `toolName` into the tool's `metadata`,
 * which is surfaced on a tool call as `toolMetadata`. This checks for that
 * marker, so it can be used inside a generic `toolApproval` function to scope
 * MCP-specific logic and leave non-MCP tools untouched.
 *
 * @example
 * ```ts
 * toolApproval: ({ toolCall }) => {
 *   if (isMCPToolCall(toolCall)) {
 *     const annotations = getMCPToolAnnotations(toolCall);
 *     return annotations?.readOnlyHint === true ? 'approved' : 'user-approval';
 *   }
 *   // ...your own policy for non-MCP tools
 * }
 * ```
 */
export function isMCPToolCall(source: MetadataSource): boolean {
  const meta = getRawMcpMetadata(source);
  return meta != null && 'clientName' in meta && 'toolName' in meta;
}

/**
 * Reads the MCP behavioral annotation hints from a tool or tool call.
 *
 * Returns the typed hints (`readOnlyHint`, `destructiveHint`, `idempotentHint`,
 * `openWorldHint`) when the source is an MCP tool that carries them, otherwise
 * `undefined`.
 *
 * Note that `undefined` covers two distinct cases: the source is not an MCP
 * tool, or it is an MCP tool whose server sent no behavioral hints. Use
 * {@link isMCPToolCall} first if you need to tell these apart.
 *
 * Per the MCP spec these hints are untrusted signals rather than guarantees.
 */
export function getMCPToolAnnotations(
  source: MetadataSource,
): McpProviderMetadata['annotations'] | undefined {
  if (!isMCPToolCall(source)) {
    return undefined;
  }

  const meta = getRawMcpMetadata(source);
  return (meta as McpProviderMetadata | undefined)?.annotations;
}
