import type { Attributes, AttributeValue } from '@opentelemetry/api';
import type { TelemetrySettings } from './telemetry-settings';

type ResolvableAttributeValue = () =>
  | AttributeValue
  | PromiseLike<AttributeValue>
  | undefined;

/**
 * Truncates a string to the specified maximum length.
 */
function truncateString(value: string, maxLength: number): string {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

/**
 * Applies maxAttributeValueLength to an attribute value.
 * Only string values are truncated; other types are returned as-is.
 */
function applyAttributeValueLimit(
  value: AttributeValue,
  maxLength: number | undefined,
): AttributeValue {
  if (maxLength == null) {
    return value;
  }

  if (typeof value === 'string') {
    return truncateString(value, maxLength);
  }

  if (Array.isArray(value)) {
    // Check if this is a string array (only truncate string arrays)
    if (value.length > 0 && typeof value[0] === 'string') {
      return (value as Array<null | undefined | string>).map(item =>
        typeof item === 'string' ? truncateString(item, maxLength) : item,
      );
    }
    // Return non-string arrays as-is
    return value;
  }

  return value;
}

export async function selectTelemetryAttributes({
  telemetry,
  attributes,
}: {
  telemetry?: TelemetrySettings;
  attributes: {
    [attributeKey: string]:
      | AttributeValue
      | { input: ResolvableAttributeValue }
      | { output: ResolvableAttributeValue }
      | undefined;
  };
}): Promise<Attributes> {
  // when telemetry is disabled, return an empty object to avoid serialization overhead:
  if (telemetry?.isEnabled !== true) {
    return {};
  }

  const resultAttributes: Attributes = {};
  const maxLength = telemetry?.maxAttributeValueLength;

  for (const [key, value] of Object.entries(attributes)) {
    if (value == null) {
      continue;
    }

    // input value, check if it should be recorded:
    if (
      typeof value === 'object' &&
      'input' in value &&
      typeof value.input === 'function'
    ) {
      // default to true:
      if (telemetry?.recordInputs === false) {
        continue;
      }

      const result = await value.input();

      if (result != null) {
        resultAttributes[key] = applyAttributeValueLimit(result, maxLength);
      }

      continue;
    }

    // output value, check if it should be recorded:
    if (
      typeof value === 'object' &&
      'output' in value &&
      typeof value.output === 'function'
    ) {
      // default to true:
      if (telemetry?.recordOutputs === false) {
        continue;
      }

      const result = await value.output();

      if (result != null) {
        resultAttributes[key] = applyAttributeValueLimit(result, maxLength);
      }
      continue;
    }

    // value is an attribute value already:
    resultAttributes[key] = applyAttributeValueLimit(
      value as AttributeValue,
      maxLength,
    );
  }

  return resultAttributes;
}
