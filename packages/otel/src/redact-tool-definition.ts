/** Remove provider credentials from a telemetry-only copy of a tool definition. */
export function redactToolDefinition(
  tool: Record<string, unknown>,
): Record<string, unknown> {
  if (tool.type !== 'provider') {
    return tool;
  }

  const args = tool.args;
  if (!isRecord(args)) return tool;

  if (tool.id === 'openai.mcp') {
    return {
      ...tool,
      args: {
        ...args,
        ...(args.authorization != null ? { authorization: '[redacted]' } : {}),
        ...(isRecord(args.headers)
          ? {
              headers: Object.fromEntries(
                Object.keys(args.headers).map(name => [name, '[redacted]']),
              ),
            }
          : {}),
      },
    };
  }

  const containerKey =
    tool.id === 'openai.code_interpreter'
      ? 'container'
      : tool.id === 'openai.shell'
        ? 'environment'
        : undefined;
  if (containerKey == null) return tool;

  const container = args[containerKey];
  if (!isRecord(container)) return tool;
  const networkPolicy = container.networkPolicy;
  if (!isRecord(networkPolicy) || !Array.isArray(networkPolicy.domainSecrets)) {
    return tool;
  }

  return {
    ...tool,
    args: {
      ...args,
      [containerKey]: {
        ...container,
        networkPolicy: {
          ...networkPolicy,
          domainSecrets: networkPolicy.domainSecrets.map(secret =>
            isRecord(secret) && 'value' in secret
              ? { ...secret, value: '[redacted]' }
              : secret,
          ),
        },
      },
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}
