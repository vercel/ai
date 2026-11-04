import type { JSONValue } from '@ai-sdk/provider';

export type HarnessV2SerializableValue =
  | JSONValue
  | undefined
  | bigint
  | Date
  | RegExp
  | URL
  | URLSearchParams
  | ArrayBuffer
  | ArrayBufferView
  | readonly HarnessV2SerializableValue[]
  | { readonly [key: string]: HarnessV2SerializableValue }
  | ReadonlyMap<HarnessV2SerializableValue, HarnessV2SerializableValue>
  | ReadonlySet<HarnessV2SerializableValue>;
