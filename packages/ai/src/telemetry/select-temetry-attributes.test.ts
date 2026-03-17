import { selectTelemetryAttributes } from './select-telemetry-attributes';
import { it, expect } from 'vitest';

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

it('should omit non-finite numeric attributes', async () => {
  const result = await selectTelemetryAttributes({
    telemetry: { isEnabled: true },
    attributes: {
      valid: 1,
      nan: Number.NaN,
      positiveInfinity: Number.POSITIVE_INFINITY,
      negativeInfinity: Number.NEGATIVE_INFINITY,
      validArray: [1, 2, 3],
      invalidArray: [1, Number.NaN, 3],
    },
  });

  expect(result).toEqual({
    valid: 1,
    validArray: [1, 2, 3],
  });
});

it('should omit non-finite numeric values from input and output resolvers', async () => {
  const result = await selectTelemetryAttributes({
    telemetry: { isEnabled: true },
    attributes: {
      validInput: { input: () => 1 },
      invalidInput: { input: () => Number.NaN },
      validOutput: { output: () => [1, 2, 3] },
      invalidOutput: { output: () => [1, Number.POSITIVE_INFINITY, 3] },
    },
  });

  expect(result).toEqual({
    validInput: 1,
    validOutput: [1, 2, 3],
  });
});
