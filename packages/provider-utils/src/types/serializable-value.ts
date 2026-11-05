import type { JSONValue } from '@ai-sdk/provider';

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
  | { readonly [key: string]: SerializableValue }
  | ReadonlyMap<SerializableValue, SerializableValue>
  | ReadonlySet<SerializableValue>;
