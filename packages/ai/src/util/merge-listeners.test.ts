import { describe, expect, it } from 'vitest';
import { mergeListeners } from './merge-listeners';

describe('mergeListeners', () => {
  it('should await listeners in order and continue after errors', async () => {
    const calls: string[] = [];

    let resolveFirstListener!: () => void;
    const firstListenerCompleted = new Promise<void>(resolve => {
      resolveFirstListener = resolve;
    });

    const merged = mergeListeners<{ value: string }>(
      async event => {
        calls.push(`first start: ${event.value}`);
        await firstListenerCompleted;
        calls.push('first end');
      },
      undefined,
      () => {
        calls.push('second before throw');
        throw new Error('listener error');
      },
      event => {
        calls.push(`third: ${event.value}`);
      },
    )!;

    const mergedPromise = merged({ value: 'hello' });
    calls.push('after call');

    resolveFirstListener();
    await mergedPromise;

    expect(calls).toMatchInlineSnapshot(`
      [
        "first start: hello",
        "after call",
        "first end",
        "second before throw",
        "third: hello",
      ]
    `);
  });

  it('should ignore undefined listeners', async () => {
    const calls: string[] = [];

    const merged = mergeListeners<{ value: string }>(
      undefined,
      event => {
        calls.push(event.value);
      },
      undefined,
    )!;

    await merged({ value: 'hello' });

    expect(calls).toMatchInlineSnapshot(`
      [
        "hello",
      ]
    `);
  });
});
