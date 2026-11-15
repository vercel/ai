import { redactTelemetryValue } from '@ai-sdk/provider-utils';

/**
 * Apply provider-owned credential redaction on telemetry-only copies. Only visit SDK
 * metadata containers, never arbitrary prompts, tool outputs, or user context.
 */
export function redactTelemetryCredentials<T>(value: T): T {
  return replaceProperties(value, {
    args: redactTelemetryValue,
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
  // Gateways can forward standardized provider tool definitions in their body.
  return replaceProperties(redactTelemetryValue(value), { tools: redactTools });
}

function redactTools(value: unknown): unknown {
  if (Array.isArray(value)) return mapArray(value, redactTelemetryCredentials);
  if (!isRecord(value)) return value;
  return replaceProperties(
    value,
    Object.fromEntries(
      Object.keys(value).map(key => [key, redactTelemetryCredentials]),
    ),
  );
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
