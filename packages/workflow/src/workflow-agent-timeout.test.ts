import { InvalidArgumentError } from 'ai';
import { describe, expect, it } from 'vitest';
import { resolveTimeoutSettings } from './workflow-agent-timeout.js';

const MAX_TIMEOUT_MS = 2 ** 31 - 1;

function expectInvalidArgument(error: unknown, parameter: string) {
  expect(InvalidArgumentError.isInstance(error)).toBe(true);
  expect((error as Error).message).toContain(parameter);
}

describe('resolveTimeoutSettings', () => {
  it('returns no settings for an undefined timeout', () => {
    expect(resolveTimeoutSettings(undefined)).toEqual({});
  });

  it('maps a number to the total timeout', () => {
    expect(resolveTimeoutSettings(1000)).toEqual({ totalTimeoutMs: 1000 });
  });

  it('maps the object form to the individual timeouts', () => {
    expect(
      resolveTimeoutSettings({
        totalMs: 1000,
        stepMs: 200,
        firstChunkMs: 300,
        chunkMs: 400,
      }),
    ).toEqual({
      totalTimeoutMs: 1000,
      stepTimeoutMs: 200,
      firstChunkTimeoutMs: 300,
      chunkTimeoutMs: 400,
    });
  });

  it('accepts the timer bounds', () => {
    expect(resolveTimeoutSettings(0)).toEqual({ totalTimeoutMs: 0 });
    expect(
      resolveTimeoutSettings({
        totalMs: MAX_TIMEOUT_MS,
        stepMs: 0,
        firstChunkMs: MAX_TIMEOUT_MS,
        chunkMs: 0,
      }),
    ).toEqual({
      totalTimeoutMs: MAX_TIMEOUT_MS,
      stepTimeoutMs: 0,
      firstChunkTimeoutMs: MAX_TIMEOUT_MS,
      chunkTimeoutMs: 0,
    });
  });

  it('rounds a fractional total timeout up', () => {
    expect(resolveTimeoutSettings(100.5)).toEqual({ totalTimeoutMs: 101 });
    expect(resolveTimeoutSettings({ totalMs: 100.5 })).toEqual({
      totalTimeoutMs: 101,
    });
  });

  it('treats a negative total timeout as a deadline that has passed', () => {
    expect(resolveTimeoutSettings(-1)).toEqual({ totalTimeoutMs: 0 });
    expect(resolveTimeoutSettings({ totalMs: -250.5 })).toEqual({
      totalTimeoutMs: 0,
    });
  });

  it.each([
    ['NaN', NaN, 'timeout'],
    ['Infinity', Infinity, 'timeout'],
    ['-Infinity', -Infinity, 'timeout'],
    ['a value above the timer limit', MAX_TIMEOUT_MS + 1, 'timeout'],
    ['a string', '1000' as never, 'timeout'],
  ])('rejects %s as the total timeout', (_label, timeout, parameter) => {
    expect(() => resolveTimeoutSettings(timeout)).toThrow(InvalidArgumentError);
    try {
      resolveTimeoutSettings(timeout);
    } catch (error) {
      expectInvalidArgument(error, parameter);
    }
  });

  it.each([
    ['a NaN totalMs', { totalMs: NaN }, 'timeout.totalMs'],
    ['a NaN stepMs', { stepMs: NaN }, 'timeout.stepMs'],
    ['a negative firstChunkMs', { firstChunkMs: -1 }, 'timeout.firstChunkMs'],
    ['a negative chunkMs', { chunkMs: -1 }, 'timeout.chunkMs'],
    ['a negative stepMs', { stepMs: -1 }, 'timeout.stepMs'],
    [
      'an infinite firstChunkMs',
      { firstChunkMs: Infinity },
      'timeout.firstChunkMs',
    ],
    [
      'a chunkMs above the timer limit',
      { chunkMs: MAX_TIMEOUT_MS + 1 },
      'timeout.chunkMs',
    ],
  ])('rejects %s', (_label, timeout, parameter) => {
    try {
      resolveTimeoutSettings(timeout as never);
    } catch (error) {
      expectInvalidArgument(error, parameter);
      return;
    }
    throw new Error('Expected resolveTimeoutSettings to throw');
  });
});
