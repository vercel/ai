import { secureJsonParse } from '@ai-sdk/provider-utils';

/** Redact SDK-owned credential fields on telemetry-only copies. */
export function redactTelemetrySecrets<T>(value: T): T {
  return redactValue(value, new WeakMap());
}

function redactValue<T>(value: T, seen: WeakMap<object, unknown>): T {
  if (!isRecord(value)) return value;
  if (seen.has(value)) return seen.get(value) as T;
  const copy = Object.create(Object.getPrototypeOf(value));
  seen.set(value, copy);

  const replacements: Record<string, unknown> = {};
  for (const key of ['tools', 'stepTools'] as const) {
    const tools = value[key];
    if (Array.isArray(tools)) {
      const redacted = tools.map(redactTool);
      if (redacted.some((tool, index) => tool !== tools[index]))
        replacements[key] = redacted;
    } else if (isRecord(tools)) {
      const redacted = Object.fromEntries(
        Object.entries(tools).map(([name, tool]) => [name, redactTool(tool)]),
      );
      if (Object.keys(tools).some(name => redacted[name] !== tools[name]))
        replacements[key] = redacted;
    }
  }

  if (isRecord(value.request) && value.request.body != null) {
    const body = value.request.body;
    let redactedBody: unknown;
    if (typeof body === 'string') {
      try {
        // Channel contexts are published synchronously, so use the secure
        // synchronous parser underlying parseJSON / safeParseJSON.
        const parsed = secureJsonParse(body);
        const redacted = redactValue(parsed, seen);
        redactedBody = redacted === parsed ? body : JSON.stringify(redacted);
      } catch {
        // Do not publish a body that cannot be safely inspected.
        redactedBody = '[redacted]';
      }
    } else {
      redactedBody = redactValue(body, seen);
    }
    if (redactedBody !== body)
      replacements.request = { ...value.request, body: redactedBody };
  }

  for (const key of [
    'event',
    'steps',
    'finalStep',
    'error',
    'errors',
    'lastError',
    'cause',
    'requestBodyValues',
  ]) {
    const child = value[key];
    if (Object.hasOwn(value, key) && child != null) {
      const redacted = Array.isArray(child)
        ? child.map(entry => redactValue(entry, seen))
        : redactValue(child, seen);
      if (
        Array.isArray(child) && Array.isArray(redacted)
          ? redacted.some((entry, index) => entry !== child[index])
          : redacted !== child
      )
        replacements[key] = redacted;
    }
  }

  if (Object.keys(replacements).length === 0) {
    seen.set(value, value);
    return value;
  }
  const descriptors: Record<string, PropertyDescriptor> =
    Object.getOwnPropertyDescriptors(value);
  if (value instanceof Error) {
    descriptors.stack = {
      value: value.stack,
      enumerable: false,
      configurable: true,
      writable: true,
    };
  }
  for (const [key, replacement] of Object.entries(replacements)) {
    descriptors[key] = {
      value: replacement,
      enumerable: true,
      configurable: true,
      writable: true,
    };
  }
  return Object.defineProperties(copy, descriptors);
}

function redactTool(tool: unknown): unknown {
  if (!isRecord(tool)) return tool;
  const providerTool = tool.type === 'provider';
  const id = providerTool ? tool.id : tool.type;
  const container =
    id === 'openai.code_interpreter' || id === 'code_interpreter'
      ? 'container'
      : id === 'openai.shell' || id === 'shell'
        ? 'environment'
        : undefined;
  if (container == null) return tool;

  return redactPath(tool, [
    ...(providerTool ? ['args'] : []),
    container,
    providerTool ? 'networkPolicy' : 'network_policy',
    providerTool ? 'domainSecrets' : 'domain_secrets',
  ]);
}

function redactPath(value: unknown, [key, ...rest]: string[]): unknown {
  if (key == null) {
    return Array.isArray(value)
      ? value.map(secret =>
          isRecord(secret) && 'value' in secret
            ? { ...secret, value: '[redacted]' }
            : secret,
        )
      : value;
  }
  if (!isRecord(value) || !(key in value)) return value;
  const redacted = redactPath(value[key], rest);
  return redacted === value[key] ? value : { ...value, [key]: redacted };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}
