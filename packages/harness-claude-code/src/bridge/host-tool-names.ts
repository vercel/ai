export const HOST_TOOL_PREFIX = 'mcp__harness-tools__';

export function resolveHostToolName(
  toolName: string,
  toolAliases?: Readonly<Record<string, string>>,
): string | undefined {
  const resolvedName =
    toolAliases != null && Object.hasOwn(toolAliases, toolName)
      ? toolAliases[toolName]!
      : toolName;
  return resolvedName.startsWith(HOST_TOOL_PREFIX)
    ? resolvedName.slice(HOST_TOOL_PREFIX.length)
    : undefined;
}
