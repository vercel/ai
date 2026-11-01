import { describe, expect, it } from 'vitest';
import {
  deserializeToolError,
  serializeToolError,
} from './tool-call-telemetry.js';

describe('tool-call-telemetry error serialization', () => {
  it('serializes and deserializes standard Error instances', () => {
    const original = new Error('Database connection failed');
    const serialized = serializeToolError(original);

    expect(serialized).toEqual({
      isErrorInstance: true,
      name: 'Error',
      message: 'Database connection failed',
      stack: original.stack,
    });

    const deserialized = deserializeToolError(serialized);
    expect(deserialized).toBeInstanceOf(Error);
    expect((deserialized as Error).name).toBe('Error');
    expect((deserialized as Error).message).toBe('Database connection failed');
    expect((deserialized as Error).stack).toBe(original.stack);
  });

  it('serializes and deserializes custom error types', () => {
    const original = new TypeError('Invalid argument type');
    const serialized = serializeToolError(original);

    expect(serialized).toEqual({
      isErrorInstance: true,
      name: 'TypeError',
      message: 'Invalid argument type',
      stack: original.stack,
    });

    const deserialized = deserializeToolError(serialized);
    expect(deserialized).toBeInstanceOf(Error);
    expect((deserialized as Error).name).toBe('TypeError');
    expect((deserialized as Error).message).toBe('Invalid argument type');
  });

  it('serializes and deserializes string error values', () => {
    const original = 'Failed with raw string error';
    const serialized = serializeToolError(original);

    expect(serialized).toEqual({
      isErrorInstance: false,
      value: 'Failed with raw string error',
    });

    const deserialized = deserializeToolError(serialized);
    expect(deserialized).toBe('Failed with raw string error');
  });

  it('serializes and deserializes structured object error values', () => {
    const original = { code: 503, reason: 'Service Unavailable' };
    const serialized = serializeToolError(original);

    expect(serialized).toEqual({
      isErrorInstance: false,
      value: { code: 503, reason: 'Service Unavailable' },
    });

    const deserialized = deserializeToolError(serialized);
    expect(deserialized).toEqual({ code: 503, reason: 'Service Unavailable' });
  });

  it('serializes and deserializes primitive non-error values', () => {
    for (const val of [42, false, null, undefined]) {
      const serialized = serializeToolError(val);
      expect(serialized).toEqual({
        isErrorInstance: false,
        value: val,
      });
      const deserialized = deserializeToolError(serialized);
      expect(deserialized).toBe(val);
    }
  });
});
