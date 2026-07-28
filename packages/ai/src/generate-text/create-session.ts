import type { Experimental_SharedV4Session } from '@ai-sdk/provider';

type SessionItem = {
  value: unknown;
  onDestroy?: () => void | PromiseLike<void>;
};

class DefaultSession implements Experimental_SharedV4Session {
  private readonly items = new Map<string | symbol, SessionItem>();
  private destroyed = false;
  private destroyPromise: Promise<void> | undefined;

  has(key: string | symbol): boolean {
    this.assertNotDestroyed();
    return this.items.has(key);
  }

  get<T = unknown>(key: string | symbol): T | undefined {
    this.assertNotDestroyed();
    return this.items.get(key)?.value as T | undefined;
  }

  getOrSet<T>(
    key: string | symbol,
    createValue: () => T,
    options?: {
      onDestroy?: (value: T) => void | PromiseLike<void>;
    },
  ): T {
    this.assertNotDestroyed();

    const item = this.items.get(key);

    if (item !== undefined) {
      return item.value as T;
    }

    const value = createValue();
    const onDestroy = options?.onDestroy;

    this.items.set(key, {
      value,
      onDestroy: onDestroy == null ? undefined : () => onDestroy(value),
    });

    return value;
  }

  delete<T = unknown>(key: string | symbol): T | undefined {
    this.assertNotDestroyed();

    const item = this.items.get(key);
    this.items.delete(key);

    return item?.value as T | undefined;
  }

  destroy(): Promise<void> {
    if (this.destroyPromise !== undefined) {
      return this.destroyPromise;
    }

    this.destroyPromise = this.doDestroy();
    return this.destroyPromise;
  }

  private async doDestroy(): Promise<void> {
    this.destroyed = true;

    const cleanupPromises = Array.from(this.items.values(), async item => {
      await item.onDestroy?.();
    });

    this.items.clear();

    const results = await Promise.allSettled(cleanupPromises);

    const errors: unknown[] = [];

    for (const result of results) {
      if (result.status === 'rejected') {
        errors.push(result.reason);
      }
    }

    if (errors.length === 1) {
      throw errors[0];
    }

    if (errors.length > 1) {
      throw new AggregateError(errors, 'Failed to destroy session.');
    }
  }

  private assertNotDestroyed(): void {
    if (this.destroyed) {
      throw new Error('Session has been destroyed.');
    }
  }
}

export function createSession(): Experimental_SharedV4Session {
  return new DefaultSession();
}
