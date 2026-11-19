import type { JSONValue } from '../json-value/json-value';

/**
 * A value composed of JSON values, supported built-ins, and recursively
 * serializable arrays, plain objects, maps, and sets. Custom serialization
 * protocols are not part of this type.
 */
export type SerializableValue =
  | JSONValue
  | undefined
  | bigint
  | Date
  | RegExp
  | URL
  | URLSearchParams
  | ArrayBuffer
  | ArrayBufferView
  | readonly SerializableValue[]
  | {
      /**
       * Serializable values indexed by string keys.
       */
      readonly [key: string]: SerializableValue;
    }
  | ReadonlyMap<SerializableValue, SerializableValue>
  | ReadonlySet<SerializableValue>;
