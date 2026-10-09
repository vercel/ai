import type { ToolCallUpdate } from '@agentclientprotocol/sdk';

export type HostToolCall = {
  readonly toolName: string;
  readonly input: Readonly<Record<string, unknown>>;
};

export type HostToolInputEnvelopeKind =
  | 'none'
  | 'deferred-tool'
  | 'provider-tool'
  | 'origin-operation'
  | 'server-tool'
  | 'ambiguous';

export function classifyHostToolInputEnvelope({
  rawInput,
}: {
  rawInput: Readonly<Record<string, unknown>>;
}): HostToolInputEnvelopeKind {
  const isDeferredToolEnvelope = 'tool_name' in rawInput;
  const isProviderToolEnvelope =
    'providerIdentifier' in rawInput &&
    'toolName' in rawInput &&
    'args' in rawInput;
  const isOriginOperationEnvelope =
    'origin' in rawInput && 'operation' in rawInput && 'arguments' in rawInput;
  const isServerToolEnvelope =
    'server' in rawInput && 'tool' in rawInput && 'arguments' in rawInput;
  if (
    [
      isDeferredToolEnvelope,
      isProviderToolEnvelope,
      isOriginOperationEnvelope,
      isServerToolEnvelope,
    ].filter(Boolean).length > 1
  ) {
    return 'ambiguous';
  }
  if (isDeferredToolEnvelope) return 'deferred-tool';
  if (isProviderToolEnvelope) return 'provider-tool';
  if (isOriginOperationEnvelope) return 'origin-operation';
  if (isServerToolEnvelope) return 'server-tool';
  return 'none';
}

export function isQualifiedHostToolName({
  name,
  serverName,
  toolName,
}: {
  name: unknown;
  serverName: string;
  toolName: string;
}): boolean {
  return (
    name === `mcp__${serverName}__${toolName}` ||
    name === `${serverName}__${toolName}` ||
    name === `mcp_${serverName}_${toolName}`
  );
}

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
  const envelopeKind = classifyHostToolInputEnvelope({ rawInput });
  if (envelopeKind === 'ambiguous') return undefined;
  const matches: HostToolCall[] = [];
  for (const toolName of toolNames) {
    const isQualified = (value: unknown) =>
      isQualifiedHostToolName({ name: value, serverName, toolName });
    const isDirect =
      toolCall.name === toolName &&
      isRecord(toolCall._meta) &&
      toolCall._meta.serverName === serverName;
    if (
      envelopeKind === 'deferred-tool' &&
      isQualified(rawInput.tool_name) &&
      isRecord(rawInput.tool_input) &&
      (toolCall.name == null ||
        toolCall.name === 'use_tool' ||
        isQualified(toolCall.name))
    ) {
      matches.push({ toolName, input: rawInput.tool_input });
    } else if (
      envelopeKind === 'provider-tool' &&
      rawInput.providerIdentifier === serverName &&
      rawInput.toolName === toolName &&
      isRecord(rawInput.args) &&
      (toolCall.name == null || isQualified(toolCall.name))
    ) {
      matches.push({ toolName, input: rawInput.args });
    } else if (
      envelopeKind === 'server-tool' &&
      rawInput.server === serverName &&
      rawInput.tool === toolName &&
      isRecord(rawInput.arguments) &&
      (toolCall.name == null || isQualified(toolCall.name))
    ) {
      matches.push({ toolName, input: rawInput.arguments });
    } else if (
      envelopeKind === 'origin-operation' &&
      rawInput.origin === serverName &&
      rawInput.operation === toolName &&
      isRecord(rawInput.arguments) &&
      (toolCall.name == null ||
        toolCall.name === toolName ||
        isQualified(toolCall.name))
    ) {
      matches.push({ toolName, input: rawInput.arguments });
    } else if (
      envelopeKind === 'none' &&
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
