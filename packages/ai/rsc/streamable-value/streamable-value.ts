export const STREAMABLE_VALUE_TYPE = Symbol.for('ui.streamable.value');

export type StreamablePatch = undefined | [0, string]; // Append string.

declare const __internal_curr: unique symbol;
declare const __internal_error: unique symbol;

/**
 * StreamableValue is a value that can be streamed over the network via AI Actions.
 * To read the streamed values, use the `readStreamableValue` or `useStreamableValue` APIs.
 */
export type StreamableValue<T = any, E = any> = {
  /**
   * @internal Use `readStreamableValue` to read the values.
   */
  type?: typeof STREAMABLE_VALUE_TYPE;
  /**
   * @internal Use `readStreamableValue` to read the values.
   */
  curr?: T;
  /**
   * @internal Use `readStreamableValue` to read the values.
   */
  error?: E;
  /**
   * @internal Use `readStreamableValue` to read the values.
   */
  diff?: StreamablePatch;
  /**
   * @internal Use `readStreamableValue` to read the values.
   */
  next?: Promise<StreamableValue<T, E>>;

  // branded types to maintain type signature after internal properties are stripped.
  [__internal_curr]?: T;
  [__internal_error]?: E;
};

function hasReadableValueSignature(value: unknown): value is StreamableValue {
  return !!(
    value &&
    typeof value === 'object' &&
    'type' in value &&
    value.type === STREAMABLE_VALUE_TYPE
  );
}

export function assertStreamableValue(
  value: unknown,
): asserts value is StreamableValue {
  if (!hasReadableValueSignature(value)) {
    throw new Error(
      'Invalid value: this hook only accepts values created via `createStreamableValue`.',
    );
  }
}

export function isStreamableValue(value: unknown): value is StreamableValue {
  const hasSignature = hasReadableValueSignature(value);

  if (!hasSignature && typeof value !== 'undefined') {
    throw new Error(
      'Invalid value: this hook only accepts values created via `createStreamableValue`.',
    );
  }

  return hasSignature;
}
