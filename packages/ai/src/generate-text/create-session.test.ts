import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { createSession } from './create-session';

describe('createSession', () => {
  it('stores, retrieves, and deletes string and symbol keys', () => {
    const session = createSession();
    const symbolKey = Symbol('symbol-key');
    const object = { value: 1 };

    expect(session.has('object')).toBe(false);
    expect(session.get('object')).toBeUndefined();
    expect(session.delete('object')).toBeUndefined();

    expect(session.set('object', object)).toBe(object);
    expect(session.set(symbolKey, 'symbol value')).toBe('symbol value');

    expect(session.has('object')).toBe(true);
    expect(session.has(symbolKey)).toBe(true);
    expect(session.get<typeof object>('object')).toBe(object);
    expect(session.get<string>(symbolKey)).toBe('symbol value');
    expectTypeOf(session.get<typeof object>('object')).toEqualTypeOf<
      typeof object | undefined
    >();

    expect(session.delete<typeof object>('object')).toBe(object);
    expect(session.has('object')).toBe(false);
  });

  it('distinguishes a stored undefined value from a missing key', () => {
    const session = createSession();

    expect(session.set('key', undefined)).toBeUndefined();
    expect(session.has('key')).toBe(true);
    expect(session.get('key')).toBeUndefined();

    expect(session.delete('key')).toBeUndefined();
    expect(session.has('key')).toBe(false);
  });

  it('throws when setting a key that is already in use', () => {
    const session = createSession();

    session.set('key', undefined);

    expect(() => session.set('key', 'new value')).toThrow(
      new Error('Session key key is already in use.'),
    );
    expect(session.has('key')).toBe(true);
    expect(session.get('key')).toBeUndefined();
  });

  it('allows a deleted key to be inserted again', async () => {
    const firstCleanup = vi.fn();
    const secondCleanup = vi.fn();
    const session = createSession();

    session.set('key', 'first', { onDestroy: firstCleanup });

    expect(session.delete('key')).toBe('first');
    expect(session.set('key', 'second', { onDestroy: secondCleanup })).toBe(
      'second',
    );

    await session.destroy();

    expect(firstCleanup).not.toHaveBeenCalled();
    expect(secondCleanup).toHaveBeenCalledExactlyOnceWith('second');
  });

  it('does not run cleanup when deleting a value', async () => {
    const cleanup = vi.fn();
    const session = createSession();

    session.set('key', 'value', { onDestroy: cleanup });

    expect(session.delete('key')).toBe('value');
    expect(cleanup).not.toHaveBeenCalled();

    await session.destroy();

    expect(cleanup).not.toHaveBeenCalled();
  });

  it('runs synchronous and asynchronous cleanup sequentially in reverse insertion order', async () => {
    const events: string[] = [];
    let continueSecondCleanup: (() => void) | undefined;
    const secondCleanupGate = new Promise<void>(resolve => {
      continueSecondCleanup = resolve;
    });
    const session = createSession();

    session.set(
      'first',
      { id: 1 },
      {
        onDestroy: value => {
          events.push(`first:${value.id}`);
        },
      },
    );
    session.set(
      'second',
      { id: 2 },
      {
        onDestroy: async value => {
          events.push(`second:start:${value.id}`);
          await secondCleanupGate;
          events.push(`second:end:${value.id}`);
        },
      },
    );
    session.set(
      'third',
      { id: 3 },
      {
        onDestroy: value => {
          events.push(`third:${value.id}`);
        },
      },
    );

    const destroyPromise = session.destroy();

    await Promise.resolve();

    expect(events).toEqual(['third:3', 'second:start:2']);

    continueSecondCleanup?.();
    await destroyPromise;

    expect(events).toEqual([
      'third:3',
      'second:start:2',
      'second:end:2',
      'first:1',
    ]);
  });

  it('attempts every cleanup and rethrows a sole cleanup error unchanged', async () => {
    const cleanupError = new Error('cleanup failed');
    const events: string[] = [];
    const session = createSession();

    session.set('first', 'first', {
      onDestroy: () => {
        events.push('first');
      },
    });
    session.set('second', 'second', {
      onDestroy: () => {
        events.push('second');
        throw cleanupError;
      },
    });
    session.set('third', 'third', {
      onDestroy: () => {
        events.push('third');
      },
    });

    await expect(session.destroy()).rejects.toBe(cleanupError);
    expect(events).toEqual(['third', 'second', 'first']);
  });

  it('aggregates multiple cleanup errors in cleanup order', async () => {
    const firstError = new Error('first cleanup failed');
    const secondError = new Error('second cleanup failed');
    const events: string[] = [];
    const session = createSession();

    session.set('first', 'first', {
      onDestroy: () => {
        events.push('first');
        throw firstError;
      },
    });
    session.set('middle', 'middle', {
      onDestroy: () => {
        events.push('middle');
      },
    });
    session.set('second', 'second', {
      onDestroy: async () => {
        events.push('second');
        throw secondError;
      },
    });

    const error = await session.destroy().catch(error => error);

    expect(error).toBeInstanceOf(AggregateError);
    expect(error).toMatchObject({
      message: 'Failed to destroy session.',
      errors: [secondError, firstError],
    });
    expect(events).toEqual(['second', 'middle', 'first']);
  });

  it('invalidates the session before cleanup begins', async () => {
    const session = createSession();
    const cleanup = vi.fn(() => {
      expect(() => session.has('key')).toThrow('Session has been destroyed.');
      expect(() => session.get('key')).toThrow('Session has been destroyed.');
      expect(() => session.set('other', 'value')).toThrow(
        'Session has been destroyed.',
      );
      expect(() => session.delete('key')).toThrow(
        'Session has been destroyed.',
      );
    });

    session.set('key', 'value', { onDestroy: cleanup });

    await session.destroy();

    expect(cleanup).toHaveBeenCalledExactlyOnceWith('value');
  });

  it('returns the same promise and runs cleanup once for concurrent and later destroy calls', async () => {
    let continueCleanup: (() => void) | undefined;
    const cleanupGate = new Promise<void>(resolve => {
      continueCleanup = resolve;
    });
    const cleanup = vi.fn(() => cleanupGate);
    const session = createSession();

    session.set('key', 'value', { onDestroy: cleanup });

    const firstDestroyPromise = session.destroy();
    const secondDestroyPromise = session.destroy();

    expect(secondDestroyPromise).toBe(firstDestroyPromise);

    await Promise.resolve();
    expect(cleanup).toHaveBeenCalledExactlyOnceWith('value');

    continueCleanup?.();
    await firstDestroyPromise;

    expect(session.destroy()).toBe(firstDestroyPromise);
    await session.destroy();
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it('keeps returning the same rejected promise after cleanup fails', async () => {
    const cleanupError = new Error('cleanup failed');
    const session = createSession();

    session.set('key', 'value', {
      onDestroy: () => {
        throw cleanupError;
      },
    });

    const destroyPromise = session.destroy();

    await expect(destroyPromise).rejects.toBe(cleanupError);
    expect(session.destroy()).toBe(destroyPromise);
    await expect(session.destroy()).rejects.toBe(cleanupError);
  });
});
