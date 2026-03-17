import type { Attributes, AttributeValue } from '@opentelemetry/api';
import { sanitizeTelemetryAttributeValue } from './sanitize-telemetry-attribute-value';
import type { TelemetrySettings } from './telemetry-settings';

type ResolvableAttributeValue = () =>
  | AttributeValue
  | PromiseLike<AttributeValue>
  | undefined;

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
      const sanitizedResult = sanitizeTelemetryAttributeValue(result);

      if (sanitizedResult != null) {
        resultAttributes[key] = sanitizedResult;
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
      const sanitizedResult = sanitizeTelemetryAttributeValue(result);

      if (sanitizedResult != null) {
        resultAttributes[key] = sanitizedResult;
      }
      continue;
    }

    // value is an attribute value already:
    const sanitizedValue = sanitizeTelemetryAttributeValue(
      value as AttributeValue,
    );

    if (sanitizedValue != null) {
      resultAttributes[key] = sanitizedValue;
    }
  }

  return resultAttributes;
}
