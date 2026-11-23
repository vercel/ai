import {
  redactTelemetryValue,
  withTelemetryRedaction,
} from '@ai-sdk/provider-utils';

export type SerializableTelemetryBody = { value: Record<string, unknown> };

/** Retain provider-owned body views across durable step serialization. */
export function serializeTelemetryBody(
  body: unknown,
): SerializableTelemetryBody | undefined {
  if (body == null || typeof body !== 'object' || Array.isArray(body)) {
    return undefined;
  }
  const value = redactTelemetryValue(body as Record<string, unknown>);
  return value === body ? undefined : { value: value ?? {} };
}

export function restoreTelemetryBody(
  body: unknown,
  view: SerializableTelemetryBody | undefined,
): unknown {
  if (view == null) return body;
  if (body == null || typeof body !== 'object' || Array.isArray(body)) {
    return undefined;
  }
  return withTelemetryRedaction(
    body as Record<string, unknown>,
    () => view.value,
  );
}
