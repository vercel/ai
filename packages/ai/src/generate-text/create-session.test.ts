import { describe, expect, it, vi } from 'vitest';
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
    expect(session.get('object')).toBe(object);
    expect(session.get<string>(symbolKey)).toBe('symbol value');

    expect(session.delete('object')).toBe(object);
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

  it('allows a deleted key to be inserted again', () => {
    const session = createSession();

    session.set('key', 'first');

    expect(session.delete('key')).toBe('first');
    expect(session.set('key', 'second')).toBe('second');
    expect(session.get('key')).toBe('second');
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

  it('attempts every cleanup and rethrows a sole cleanup error unchanged', async () => {
    const cleanupError = new Error('cleanup failed');
    const firstCleanup = vi.fn();
    const failingCleanup = vi.fn(() => {
      throw cleanupError;
    });
    const thirdCleanup = vi.fn();
    const session = createSession();

    session.set('first', 'first', { onDestroy: firstCleanup });
    session.set('second', 'second', {
      onDestroy: failingCleanup,
    });
    session.set('third', 'third', { onDestroy: thirdCleanup });

    await expect(session.destroy()).rejects.toBe(cleanupError);
    expect(firstCleanup).toHaveBeenCalledExactlyOnceWith('first');
    expect(failingCleanup).toHaveBeenCalledExactlyOnceWith('second');
    expect(thirdCleanup).toHaveBeenCalledExactlyOnceWith('third');
  });

  it('aggregates multiple cleanup errors', async () => {
    const firstError = new Error('first cleanup failed');
    const secondError = new Error('second cleanup failed');
    const firstCleanup = vi.fn(() => {
      throw firstError;
    });
    const successfulCleanup = vi.fn();
    const secondCleanup = vi.fn(async () => {
      throw secondError;
    });
    const session = createSession();

    session.set('first', 'first', { onDestroy: firstCleanup });
    session.set('middle', 'middle', { onDestroy: successfulCleanup });
    session.set('second', 'second', { onDestroy: secondCleanup });

    const error = await session.destroy().catch(error => error);

    expect(error).toBeInstanceOf(AggregateError);
    expect(error.message).toBe('Failed to destroy session.');
    expect(error.errors).toHaveLength(2);
    expect(error.errors).toEqual(
      expect.arrayContaining([firstError, secondError]),
    );
    expect(firstCleanup).toHaveBeenCalledExactlyOnceWith('first');
    expect(successfulCleanup).toHaveBeenCalledExactlyOnceWith('middle');
    expect(secondCleanup).toHaveBeenCalledExactlyOnceWith('second');
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

    continueCleanup?.();
    await firstDestroyPromise;

    expect(cleanup).toHaveBeenCalledExactlyOnceWith('value');
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
