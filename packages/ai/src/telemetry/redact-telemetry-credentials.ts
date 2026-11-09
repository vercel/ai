/**
 * Redact known provider credentials on telemetry-only copies. Only visit SDK
 * metadata containers, never arbitrary prompts, tool outputs, or user context.
 */
export function redactTelemetryCredentials<T>(value: T): T {
  return replaceProperties(value, {
    tools: redactTools,
    stepTools: redactTools,
    request: redactMetadata,
    response: redactMetadata,
    steps: steps => mapArray(steps, redactTelemetryCredentials),
    finalStep: redactTelemetryCredentials,
    error: redactTelemetryCredentials,
    cause: redactTelemetryCredentials,
    // RetryError exposes both the full attempt history and the final error.
    errors: errors => mapArray(errors, redactTelemetryCredentials),
    lastError: redactTelemetryCredentials,
    // Provider errors carry the same request body outside request metadata.
    requestBodyValues: redactBody,
  });
}

function redactMetadata(value: unknown): unknown {
  return Array.isArray(value)
    ? mapArray(value, redactMetadata)
    : replaceProperties(value, { body: redactBody });
}

function redactBody(value: unknown): unknown {
  // OpenAI Responses request and response metadata contain object bodies.
  return replaceProperties(value, { tools: redactTools });
}

function redactTools(value: unknown): unknown {
  if (Array.isArray(value)) return mapArray(value, redactTool);
  if (!isRecord(value)) return value;
  return replaceProperties(
    value,
    Object.fromEntries(Object.keys(value).map(key => [key, redactTool])),
  );
}

function redactTool(value: unknown): unknown {
  if (!isRecord(value)) return value;

  const providerTool = value.type === 'provider';
  const type = providerTool ? value.id : value.type;
  const containerKey =
    type === 'openai.code_interpreter' || type === 'code_interpreter'
      ? 'container'
      : type === 'openai.shell' || type === 'shell'
        ? 'environment'
        : undefined;

  const redactArgs = (args: unknown) =>
    containerKey != null
      ? replaceProperties(args, {
          [containerKey]: container =>
            replaceProperties(container, {
              [providerTool ? 'networkPolicy' : 'network_policy']: policy =>
                replaceProperties(policy, {
                  [providerTool ? 'domainSecrets' : 'domain_secrets']:
                    secrets =>
                      mapArray(secrets, secret =>
                        replaceProperties(secret, {
                          value: () => '[redacted]',
                        }),
                      ),
                }),
            }),
        })
      : type === 'openai.mcp' || type === 'mcp'
        ? replaceProperties(args, {
            authorization: () => '[redacted]',
            headers: headers =>
              isRecord(headers)
                ? Object.fromEntries(
                    Object.keys(headers).map(key => [key, '[redacted]']),
                  )
                : headers,
          })
        : args;

  return providerTool
    ? replaceProperties(value, { args: redactArgs })
    : redactArgs(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function mapArray(
  value: unknown,
  redact: (value: unknown) => unknown,
): unknown {
  if (!Array.isArray(value)) return value;
  const copy = value.map(redact);
  return copy.some((entry, index) => entry !== value[index]) ? copy : value;
}

/** Preserve result getters, streams, and property descriptors without mutation. */
function replaceProperties<T>(
  value: T,
  redactors: Record<string, (value: unknown) => unknown>,
): T {
  if (!isRecord(value)) return value;
  let descriptors: PropertyDescriptorMap | undefined;
  for (const [key, redact] of Object.entries(redactors)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor == null || !('value' in descriptor)) continue;
    const redacted = redact(descriptor.value);
    if (redacted !== descriptor.value) {
      descriptors ??= Object.getOwnPropertyDescriptors(value);
      descriptors[key] = { ...descriptor, value: redacted };
    }
  }
  return descriptors == null
    ? value
    : Object.create(Object.getPrototypeOf(value), descriptors);
}
