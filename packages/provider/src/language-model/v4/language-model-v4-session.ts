/**
 * A key-value store for state that is scoped to a single language model
 * lifecycle.
 *
 * Providers can associate cleanup callbacks with values. The owner of the
 * session is responsible for destroying it when the lifecycle is complete.
 */
export type Session = {
  /**
   * Returns whether the session contains a value for the key.
   */
  has(key: string | symbol): boolean;

  /**
   * Returns the value for the key, or `undefined` when the key is not present.
   * The generic type is an unchecked assertion by the caller.
   */
  get<T = unknown>(key: string | symbol): T | undefined;

  /**
   * Stores a value and optional cleanup callback, then returns the value.
   * Throws when the key is already in use.
   */
  set<T>(
    key: string | symbol,
    value: T,
    options?: {
      onDestroy?: (value: T) => void | PromiseLike<void>;
    },
  ): T;

  /**
   * Returns the existing value for the key. When the key is not present,
   * stores and returns the provided default value. The options are only used
   * when the default value is stored.
   */
  getOrSet<T>(
    key: string | symbol,
    defaultValue: T,
    options?: {
      onDestroy?: (value: T) => void | PromiseLike<void>;
    },
  ): T;

  /**
   * Removes and returns the value for the key without running its cleanup
   * callback. The generic type is an unchecked assertion by the caller.
   */
  delete<T = unknown>(key: string | symbol): T | undefined;

  /**
   * Invalidates the session and runs the cleanup callbacks for its remaining
   * values. This method is intended to be called by the session owner.
   */
  destroy(): Promise<void>;
};
