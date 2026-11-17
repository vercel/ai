const telemetryRedaction = Symbol.for('vercel.ai.telemetry.redact');

/**
 * Attach a provider-owned telemetry view without changing the original value.
 * The annotation is not serialized or included in enumerable application data.
 * Keep the annotated object when forwarding tool arguments or provider metadata.
 */
export function withTelemetryRedaction<T extends Record<string, unknown>>(
  value: T,
  redact: (value: T) => T,
): T {
  return Object.create(Object.getPrototypeOf(value), {
    ...Object.getOwnPropertyDescriptors(value),
    [telemetryRedaction]: { value: redact, configurable: true },
  });
}

/** Apply the provider's telemetry view, leaving unannotated values unchanged. */
export function redactTelemetryValue<T>(value: T): T | undefined {
  if (value == null || typeof value !== 'object') return value;
  const redact = Object.getOwnPropertyDescriptor(
    value,
    telemetryRedaction,
  )?.value;
  if (typeof redact !== 'function') return value;
  try {
    return redact(value);
  } catch {
    // A broken provider redactor must neither expose credentials nor fail the call.
    return undefined;
  }
}
