import type { AttributeValue } from '@opentelemetry/api';

export function sanitizeTelemetryAttributeValue(
  value: AttributeValue | undefined,
): AttributeValue | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }

  if (
    Array.isArray(value) &&
    value.some(item => typeof item === 'number' && !Number.isFinite(item))
  ) {
    return undefined;
  }

  return value;
}
