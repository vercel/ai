import type { ToolCallUpdate } from '@agentclientprotocol/sdk';

export type HostToolCall = {
  readonly toolName: string;
  readonly input: Readonly<Record<string, unknown>>;
};

export function resolveHostToolCall({
  toolCall,
  serverName,
  toolNames,
}: {
  toolCall: ToolCallUpdate;
  serverName: string;
  toolNames: ReadonlyArray<string>;
}): HostToolCall | undefined {
  const rawInput = toolCall.rawInput;
  if (!isRecord(rawInput)) return undefined;
  const isDeferred = 'tool_name' in rawInput;
  const isProvider =
    'providerIdentifier' in rawInput &&
    'toolName' in rawInput &&
    'args' in rawInput;
  const isOrigin =
    'origin' in rawInput && 'operation' in rawInput && 'arguments' in rawInput;
  const isCodex =
    'server' in rawInput && 'tool' in rawInput && 'arguments' in rawInput;
  if ([isDeferred, isProvider, isOrigin, isCodex].filter(Boolean).length > 1) {
    return undefined;
  }
  const matches: HostToolCall[] = [];
  for (const toolName of toolNames) {
    const qualifiedNames = [
      `mcp__${serverName}__${toolName}`,
      `${serverName}__${toolName}`,
      `mcp_${serverName}_${toolName}`,
    ];
    const isQualified = (value: unknown) =>
      typeof value === 'string' && qualifiedNames.includes(value);
    const isDirect =
      toolCall.name === toolName &&
      isRecord(toolCall._meta) &&
      toolCall._meta.serverName === serverName;
    if (
      isDeferred &&
      isQualified(rawInput.tool_name) &&
      isRecord(rawInput.tool_input) &&
      (toolCall.name == null ||
        toolCall.name === 'use_tool' ||
        isQualified(toolCall.name))
    ) {
      matches.push({ toolName, input: rawInput.tool_input });
    } else if (
      isProvider &&
      rawInput.providerIdentifier === serverName &&
      rawInput.toolName === toolName &&
      isRecord(rawInput.args) &&
      (toolCall.name == null || isQualified(toolCall.name))
    ) {
      matches.push({ toolName, input: rawInput.args });
    } else if (
      isCodex &&
      rawInput.server === serverName &&
      rawInput.tool === toolName &&
      isRecord(rawInput.arguments) &&
      (toolCall.name == null || isQualified(toolCall.name))
    ) {
      matches.push({ toolName, input: rawInput.arguments });
    } else if (
      isOrigin &&
      rawInput.origin === serverName &&
      rawInput.operation === toolName &&
      isRecord(rawInput.arguments) &&
      (toolCall.name == null ||
        toolCall.name === toolName ||
        isQualified(toolCall.name))
    ) {
      matches.push({ toolName, input: rawInput.arguments });
    } else if (
      !isDeferred &&
      !isProvider &&
      !isOrigin &&
      !isCodex &&
      (isDirect ||
        isQualified(toolCall.name) ||
        (toolCall.name == null &&
          (isQualified(toolCall.title) ||
            toolCall.title === `${serverName}-${toolName}`)))
    ) {
      matches.push({ toolName, input: rawInput });
    }
  }
  return matches.length === 1 ? matches[0] : undefined;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}
