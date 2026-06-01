import type { Attributes, AttributeValue } from '@opentelemetry/api';
import type { TelemetryOptions } from 'ai';

export type AttributeSpec =
  | AttributeValue
  | { input: () => AttributeValue | undefined }
  | { output: () => AttributeValue | undefined }
  | undefined;

export type AttributeSpecMap = Record<string, AttributeSpec>;

function shouldRecord(
  telemetry: TelemetryOptions | undefined,
): telemetry is TelemetryOptions {
  return telemetry?.isEnabled !== false;
}

export function selectAttributes(
  telemetry: TelemetryOptions | undefined,
  attributes: AttributeSpecMap,
): Attributes {
  if (!shouldRecord(telemetry)) {
    return {};
  }

  const result: Attributes = {};

  for (const [key, value] of Object.entries(attributes)) {
    if (value == null) continue;

    if (
      typeof value === 'object' &&
      'input' in value &&
      typeof value.input === 'function'
    ) {
      if (telemetry?.recordInputs === false) continue;
      const resolved = value.input();
      if (resolved != null) result[key] = resolved;
      continue;
    }

    if (
      typeof value === 'object' &&
      'output' in value &&
      typeof value.output === 'function'
    ) {
      if (telemetry?.recordOutputs === false) continue;
      const resolved = value.output();
      if (resolved != null) result[key] = resolved;
      continue;
    }

    result[key] = value as AttributeValue;
  }

  return result;
}
