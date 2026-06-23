import type { AttributeValue } from '@opentelemetry/api';
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

it('drops malformed finish_reasons arrays that contain only undefined', async () => {
  const result = await selectTelemetryAttributes({
    telemetry: { isEnabled: true },
    attributes: {
      'gen_ai.response.finish_reasons': [
        undefined,
      ] as unknown as AttributeValue,
      'gen_ai.response.id': 'msg_123',
    },
  });

  expect(result).toEqual({ 'gen_ai.response.id': 'msg_123' });
});

it('sanitizes array attributes, dropping invalid entries and mixed arrays', async () => {
  const result = await selectTelemetryAttributes({
    telemetry: { isEnabled: true },
    attributes: {
      keep: ['stop', undefined, {}, 'length'] as unknown as AttributeValue,
      valid: ['a', 'b'],
      dropMixed: ['stop', 1] as unknown as AttributeValue,
      fromInput: {
        input: () => [undefined, 'value'] as unknown as AttributeValue,
      },
    },
  });

  expect(result).toEqual({
    keep: ['stop', 'length'],
    valid: ['a', 'b'],
    fromInput: ['value'],
  });
});
