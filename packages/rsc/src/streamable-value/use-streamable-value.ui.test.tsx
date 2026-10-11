import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createStreamableValue } from './create-streamable-value';
import { useStreamableValue } from './use-streamable-value';

describe('useStreamableValue', () => {
  it('clears the previous error when a replacement stream succeeds', async () => {
    const first = createStreamableValue<string, Error>('first');
    const firstValue = first.value;
    first.error(new Error('first failed'));

    const hook = renderHook(
      ({ value }) => useStreamableValue<string, Error>(value),
      { initialProps: { value: firstValue } },
    );

    await act(async () => {});
    expect(hook.result.current).toEqual([
      'first',
      new Error('first failed'),
      false,
    ]);

    const second = createStreamableValue<string, Error>('second');
    second.done();

    await act(async () => {
      hook.rerender({ value: second.value });
    });

    expect(hook.result.current).toEqual(['second', undefined, false]);
  });

  it('uses the error from a failed replacement stream', async () => {
    const first = createStreamableValue<string, Error>('first');
    const firstValue = first.value;
    first.error(new Error('first failed'));

    const hook = renderHook(
      ({ value }) => useStreamableValue<string, Error>(value),
      { initialProps: { value: firstValue } },
    );

    await act(async () => {});

    const second = createStreamableValue<string, Error>('second');
    const secondValue = second.value;
    second.error(new Error('second failed'));

    await act(async () => {
      hook.rerender({ value: secondValue });
    });

    expect(hook.result.current).toEqual([
      'second',
      new Error('second failed'),
      false,
    ]);
  });
});
