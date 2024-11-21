import { batch } from 'solid-js';
import { TriggerCache } from '@solid-primitives/trigger';

const $KEYS = Symbol('track-keys');

/**
 * A reactive LRU (Least Recently Used) cache implementation based on Map.
 * All reads and writes are reactive signals.
 * @param maxSize maximum number of entries to store before evicting least recently used
 * @param initial initial entries of the reactive LRU cache
 */
export class ReactiveLRU<K, V> extends Map<K, V> {
  #keyTriggers = new TriggerCache<K | typeof $KEYS>();
  #valueTriggers = new TriggerCache<K>();
  #maxSize: number;
  #accessList: K[] = [];

  constructor(maxSize = 10, initial?: Iterable<readonly [K, V]> | null) {
    super();
    this.#maxSize = maxSize;
    if (initial) {
      for (const [key, value] of initial) {
        this.set(key, value);
      }
    }
  }

  #recordAccess(key: K) {
    const index = this.#accessList.indexOf(key);
    if (index > -1) {
      this.#accessList.splice(index, 1);
    }
    this.#accessList.push(key);
    if (this.#accessList.length > this.#maxSize) {
      const lru = this.#accessList.shift()!;
      this.delete(lru);
    }
  }

  // reads
  has(key: K): boolean {
    this.#keyTriggers.track(key);
    const exists = super.has(key);
    if (exists) {
      this.#recordAccess(key);
    }
    return exists;
  }

  get(key: K): V | undefined {
    this.#valueTriggers.track(key);
    const value = super.get(key);
    if (value !== undefined) {
      this.#recordAccess(key);
    }
    return value;
  }

  get size(): number {
    this.#keyTriggers.track($KEYS);
    return super.size;
  }

  *keys(): MapIterator<K> {
    for (const key of super.keys()) {
      this.#keyTriggers.track(key);
      yield key;
    }
    this.#keyTriggers.track($KEYS);
  }

  *values(): MapIterator<V> {
    for (const [key, v] of super.entries()) {
      this.#valueTriggers.track(key);
      yield v;
    }
    this.#keyTriggers.track($KEYS);
  }

  *entries(): MapIterator<[K, V]> {
    for (const entry of super.entries()) {
      this.#valueTriggers.track(entry[0]);
      yield entry;
    }
    this.#keyTriggers.track($KEYS);
  }

  // writes
  set(key: K, value: V): this {
    batch(() => {
      if (super.has(key)) {
        if (super.get(key)! === value) {
          this.#recordAccess(key);
          return;
        }
      } else {
        this.#keyTriggers.dirty(key);
        this.#keyTriggers.dirty($KEYS);
      }
      this.#valueTriggers.dirty(key);
      super.set(key, value);
      this.#recordAccess(key);
    });
    return this;
  }

  delete(key: K): boolean {
    const r = super.delete(key);
    if (r) {
      batch(() => {
        this.#keyTriggers.dirty(key);
        this.#keyTriggers.dirty($KEYS);
        this.#valueTriggers.dirty(key);
        const index = this.#accessList.indexOf(key);
        if (index > -1) {
          this.#accessList.splice(index, 1);
        }
      });
    }
    return r;
  }

  clear(): void {
    if (super.size) {
      batch(() => {
        for (const v of super.keys()) {
          this.#keyTriggers.dirty(v);
          this.#valueTriggers.dirty(v);
        }
        super.clear();
        this.#accessList = [];
        this.#keyTriggers.dirty($KEYS);
      });
    }
  }

  // callback
  forEach(callbackfn: (value: V, key: K, map: this) => void) {
    this.#keyTriggers.track($KEYS);
    for (const [key, v] of super.entries()) {
      this.#valueTriggers.track(key);
      this.#recordAccess(key);
      callbackfn(v, key, this);
    }
  }

  [Symbol.iterator](): MapIterator<[K, V]> {
    return this.entries();
  }
}
