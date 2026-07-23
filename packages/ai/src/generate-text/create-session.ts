import type { Experimental_Session as Session } from '@ai-sdk/provider';

type SessionEntry = {
  value: unknown;
  onDestroy?: () => void | PromiseLike<void>;
};

class DefaultSession implements Session {
  private readonly items = new Map<string | symbol, SessionEntry>();
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

  set<T>(
    key: string | symbol,
    value: T,
    options?: {
      onDestroy?: (value: T) => void | PromiseLike<void>;
    },
  ): T {
    this.assertNotDestroyed();

    if (this.items.has(key)) {
      throw new Error(`Session key ${String(key)} is already in use.`);
    }

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

    const items = Array.from(this.items.values()).reverse();
    this.items.clear();

    const errors: unknown[] = [];

    for (const item of items) {
      try {
        await item.onDestroy?.();
      } catch (error) {
        errors.push(error);
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

export function createSession(): Session {
  return new DefaultSession();
}
