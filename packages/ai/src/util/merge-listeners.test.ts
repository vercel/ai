import { describe, expect, it } from 'vitest';
import { mergeListeners } from './merge-listeners';

describe('mergeListeners', () => {
  it('should invoke listeners in parallel, wait for them to settle, and continue after errors', async () => {
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
    );

    let mergedResolved = false;
    const mergedPromise = Promise.resolve(merged({ value: 'hello' })).then(
      () => {
        mergedResolved = true;
      },
    );
    calls.push('after call');

    await Promise.resolve();

    expect(mergedResolved).toBe(false);
    expect(calls).toMatchInlineSnapshot(`
      [
        "first start: hello",
        "second before throw",
        "third: hello",
        "after call",
      ]
    `);

    resolveFirstListener();
    await mergedPromise;

    expect(calls).toMatchInlineSnapshot(`
      [
        "first start: hello",
        "second before throw",
        "third: hello",
        "after call",
        "first end",
      ]
    `);
  });

  it('should ignore rejected listeners', async () => {
    const calls: string[] = [];

    const merged = mergeListeners<{ value: string }>(
      async event => {
        calls.push(`first before reject: ${event.value}`);
        await Promise.resolve();
        throw new Error('listener error');
      },
      event => {
        calls.push(`second: ${event.value}`);
      },
    );

    await expect(merged({ value: 'hello' })).resolves.toBeUndefined();

    expect(calls).toMatchInlineSnapshot(`
      [
        "first before reject: hello",
        "second: hello",
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
    );

    await merged({ value: 'hello' });

    expect(calls).toMatchInlineSnapshot(`
      [
        "hello",
      ]
    `);
  });
});
