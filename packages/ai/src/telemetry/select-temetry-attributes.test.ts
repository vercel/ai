import { selectTelemetryAttributes } from './select-telemetry-attributes';
import { it, expect, describe } from 'vitest';

it('should return an empty object when telemetry is disabled', async () => {
  const result = await selectTelemetryAttributes({
    telemetry: { isEnabled: false },
    attributes: { key: 'value' },
  });
  expect(result).toEqual({});
});

it('should return an empty object when telemetry enablement is undefined', async () => {
  const result = await selectTelemetryAttributes({
    telemetry: { isEnabled: undefined },
    attributes: { key: 'value' },
  });
  expect(result).toEqual({});
});

it('should return attributes with simple values', async () => {
  const result = await selectTelemetryAttributes({
    telemetry: { isEnabled: true },
    attributes: { string: 'value', number: 42, boolean: true },
  });
  expect(result).toEqual({ string: 'value', number: 42, boolean: true });
});

it('should handle input functions when recordInputs is true', async () => {
  const result = await selectTelemetryAttributes({
    telemetry: { isEnabled: true, recordInputs: true },
    attributes: {
      input: { input: () => 'input value' },
      other: 'other value',
    },
  });
  expect(result).toEqual({ input: 'input value', other: 'other value' });
});

it('should not include input functions when recordInputs is false', async () => {
  const result = await selectTelemetryAttributes({
    telemetry: { isEnabled: true, recordInputs: false },
    attributes: {
      input: { input: () => 'input value' },
      other: 'other value',
    },
  });
  expect(result).toEqual({ other: 'other value' });
});

it('should handle output functions when recordOutputs is true', async () => {
  const result = await selectTelemetryAttributes({
    telemetry: { isEnabled: true, recordOutputs: true },
    attributes: {
      output: { output: () => 'output value' },
      other: 'other value',
    },
  });
  expect(result).toEqual({ output: 'output value', other: 'other value' });
});

it('should not include output functions when recordOutputs is false', async () => {
  const result = await selectTelemetryAttributes({
    telemetry: { isEnabled: true, recordOutputs: false },
    attributes: {
      output: { output: () => 'output value' },
      other: 'other value',
    },
  });
  expect(result).toEqual({ other: 'other value' });
});

it('should ignore undefined values', async () => {
  const result = await selectTelemetryAttributes({
    telemetry: { isEnabled: true },
    attributes: {
      defined: 'value',
      undefined: undefined,
    },
  });
  expect(result).toEqual({ defined: 'value' });
});

it('should ignore input and output functions that return undefined', async () => {
  const result = await selectTelemetryAttributes({
    telemetry: { isEnabled: true },
    attributes: {
      input: { input: () => undefined },
      output: { output: () => undefined },
      other: 'value',
    },
  });
  expect(result).toEqual({ other: 'value' });
});

it('should handle mixed attribute types correctly', async () => {
  const result = await selectTelemetryAttributes({
    telemetry: { isEnabled: true },
    attributes: {
      simple: 'value',
      input: { input: () => 'input value' },
      output: { output: () => 'output value' },
      undefined: undefined,
      // Invalid null input
      null: null as any,
      input_null: { input: () => null as any },
    },
  });

  expect(result).toEqual({
    simple: 'value',
    input: 'input value',
    output: 'output value',
  });
});

describe('maxAttributeValueLength', () => {
  it('should truncate string values that exceed maxAttributeValueLength', async () => {
    const result = await selectTelemetryAttributes({
      telemetry: { isEnabled: true, maxAttributeValueLength: 10 },
      attributes: {
        short: 'short',
        long: 'this is a very long string that should be truncated',
      },
    });
    expect(result).toEqual({
      short: 'short',
      long: 'this is a ',
    });
  });

  it('should not truncate values when maxAttributeValueLength is not set', async () => {
    const longString = 'a'.repeat(10000);
    const result = await selectTelemetryAttributes({
      telemetry: { isEnabled: true },
      attributes: { long: longString },
    });
    expect(result).toEqual({ long: longString });
  });

  it('should truncate input function results', async () => {
    const result = await selectTelemetryAttributes({
      telemetry: { isEnabled: true, maxAttributeValueLength: 5 },
      attributes: {
        input: { input: () => 'hello world' },
      },
    });
    expect(result).toEqual({ input: 'hello' });
  });

  it('should truncate output function results', async () => {
    const result = await selectTelemetryAttributes({
      telemetry: { isEnabled: true, maxAttributeValueLength: 5 },
      attributes: {
        output: { output: () => 'hello world' },
      },
    });
    expect(result).toEqual({ output: 'hello' });
  });

  it('should not truncate number values', async () => {
    const result = await selectTelemetryAttributes({
      telemetry: { isEnabled: true, maxAttributeValueLength: 5 },
      attributes: { number: 123456789 },
    });
    expect(result).toEqual({ number: 123456789 });
  });

  it('should not truncate boolean values', async () => {
    const result = await selectTelemetryAttributes({
      telemetry: { isEnabled: true, maxAttributeValueLength: 5 },
      attributes: { boolean: true },
    });
    expect(result).toEqual({ boolean: true });
  });

  it('should truncate strings in arrays', async () => {
    const result = await selectTelemetryAttributes({
      telemetry: { isEnabled: true, maxAttributeValueLength: 5 },
      attributes: {
        strings: ['hello world', 'short', 'another long string'],
      },
    });
    expect(result).toEqual({
      strings: ['hello', 'short', 'anoth'],
    });
  });

  it('should not truncate numbers in arrays', async () => {
    const result = await selectTelemetryAttributes({
      telemetry: { isEnabled: true, maxAttributeValueLength: 5 },
      attributes: {
        numbers: [123456789, 987654321],
      },
    });
    expect(result).toEqual({
      numbers: [123456789, 987654321],
    });
  });

  it('should handle large maxAttributeValueLength values', async () => {
    const largeLimit = 1048576; // 1MB
    const longString = 'a'.repeat(2000);
    const result = await selectTelemetryAttributes({
      telemetry: { isEnabled: true, maxAttributeValueLength: largeLimit },
      attributes: { long: longString },
    });
    expect(result).toEqual({ long: longString });
  });

  it('should handle edge case where value length equals maxAttributeValueLength', async () => {
    const result = await selectTelemetryAttributes({
      telemetry: { isEnabled: true, maxAttributeValueLength: 5 },
      attributes: { exact: 'hello' },
    });
    expect(result).toEqual({ exact: 'hello' });
  });
});
