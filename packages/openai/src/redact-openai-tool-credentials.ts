import { withTelemetryRedaction } from '@ai-sdk/provider-utils';

/** OpenAI owns both the SDK configuration paths and their wire equivalents. */
export function redactOpenAIToolArgs(
  type: unknown,
  args: Record<string, unknown>,
  wireFormat = false,
): Record<string, unknown> {
  if (type === 'mcp') {
    return {
      ...args,
      ...(args.authorization != null ? { authorization: '[redacted]' } : {}),
      ...(isRecord(args.headers)
        ? {
            headers: Object.fromEntries(
              Object.keys(args.headers).map(name => [name, '[redacted]']),
            ),
          }
        : {}),
    };
  }

  const key =
    type === 'code_interpreter'
      ? 'container'
      : type === 'shell'
        ? 'environment'
        : undefined;
  if (key == null || !isRecord(args[key])) return args;
  const container = args[key];
  const policyKey = wireFormat ? 'network_policy' : 'networkPolicy';
  const secretsKey = wireFormat ? 'domain_secrets' : 'domainSecrets';
  const policy = container[policyKey];
  if (!isRecord(policy) || !Array.isArray(policy[secretsKey])) return args;
  return {
    ...args,
    [key]: {
      ...container,
      [policyKey]: {
        ...policy,
        [secretsKey]: policy[secretsKey].map(secret =>
          isRecord(secret) && 'value' in secret
            ? { ...secret, value: '[redacted]' }
            : secret,
        ),
      },
    },
  };
}

/** Preserve raw request/response bodies while providing a safe telemetry view. */
export function withOpenAIResponseRedaction<T>(value: T): T {
  if (!isRecord(value) || !Array.isArray(value.tools)) return value;
  return withTelemetryRedaction(value, body => ({
    ...body,
    tools: (body.tools as unknown[]).map(tool =>
      isRecord(tool) ? redactOpenAIToolArgs(tool.type, tool, true) : tool,
    ),
  }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}
