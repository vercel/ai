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
      | { input: () => AttributeValue | undefined }
      | { output: () => AttributeValue | undefined }
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
      if (telemetry?.recordInputs === false) {
        return attributes;
      }

      const result = value.input();

      return result === undefined
        ? attributes
        : { ...attributes, [key]: result };
    }

    // output value, check if it should be recorded:
    if (
      typeof value === 'object' &&
      'output' in value &&
      typeof value.output === 'function'
    ) {
      if (telemetry?.recordOutputs === false) {
        return attributes;
      }

      const result = value.output();

      return result === undefined
        ? attributes
        : { ...attributes, [key]: result };
    }

    // value is an attribute value already:
    return { ...attributes, [key]: value };
  }, {});
}
