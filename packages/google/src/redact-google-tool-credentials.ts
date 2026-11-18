import { withTelemetryRedaction } from '@ai-sdk/provider-utils';

const REDACTED = '[redacted]';

/**
 * Google owns both the SDK tool configuration and its Interactions wire
 * equivalent. MCP server headers carry connector credentials (for example an
 * `Authorization` header), so neither copy may reach telemetry unchanged.
 */
export function redactGoogleToolArgs(
  id: unknown,
  args: Record<string, unknown>,
): Record<string, unknown> {
  return id === 'google.mcp_server' ? redactHeaderValues(args) : args;
}

/** Preserve raw request/response bodies while providing a safe telemetry view. */
export function withGoogleInteractionsRequestRedaction<T>(value: T): T {
  if (!isRecord(value) || !Array.isArray(value.tools)) return value;

  const tools = value.tools as unknown[];
  if (!tools.some(hasMcpServerHeaders)) return value;

  return withTelemetryRedaction(value, body => ({
    ...body,
    tools: (body.tools as unknown[]).map(tool =>
      isRecord(tool) && tool.type === 'mcp_server'
        ? redactHeaderValues(tool)
        : tool,
    ),
  }));
}

function hasMcpServerHeaders(tool: unknown): boolean {
  return isRecord(tool) && tool.type === 'mcp_server' && isRecord(tool.headers);
}

function redactHeaderValues(
  record: Record<string, unknown>,
): Record<string, unknown> {
  if (!isRecord(record.headers)) return record;

  return {
    ...record,
    headers: Object.fromEntries(
      Object.keys(record.headers).map(name => [name, REDACTED]),
    ),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}
