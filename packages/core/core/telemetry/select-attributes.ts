import type { Attributes, AttributeValue } from '@opentelemetry/api';
import type { TelemetrySettings } from './telemetry-settings';

export function selectTelemetryAttributes({
  telemetry,
  attributes,
}: {
  telemetry?: TelemetrySettings;
  attributes: {
    [attributeKey: string]:
      | AttributeValue
      | { input: () => AttributeValue }
      | { output: () => AttributeValue }
      | undefined;
  };
}): Attributes {
  const entries = Object.entries(attributes);

  return entries.reduce((attributes, entry) => {
    const [key, value] = entry;

    if (value === undefined) {
      return attributes;
    }

    // input value, check if it should be recorded:
    if (
      typeof value === 'object' &&
      'input' in value &&
      typeof value.input === 'function'
    ) {
      return telemetry?.recordInputs === false
        ? attributes
        : { ...attributes, [key]: value.input() };
    }

    // output value, check if it should be recorded:
    if (
      typeof value === 'object' &&
      'output' in value &&
      typeof value.output === 'function'
    ) {
      return telemetry?.recordOutputs === false
        ? attributes
        : { ...attributes, [key]: value.output() };
    }

    // value is an attribute value already:
    return { ...attributes, [key]: value };
  }, {});
}
