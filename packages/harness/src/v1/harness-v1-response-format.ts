export type HarnessV1JSONValue =
  | null
  | boolean
  | number
  | string
  | HarnessV1JSONArray
  | HarnessV1JSONObject;

export interface HarnessV1JSONArray extends Array<HarnessV1JSONValue> {}

export interface HarnessV1JSONObject {
  [key: string]: HarnessV1JSONValue | undefined;
}

export type HarnessV1JSONSchema = HarnessV1JSONObject;

/**
 * Requested response format for one harness turn.
 *
 * This intentionally mirrors the AI SDK provider response-format shape
 * without depending on `@ai-sdk/provider`. Harness implementations receive
 * JSON Schema rather than the caller's original Zod or Standard Schema so the
 * contract can cross process and package boundaries.
 */
export type HarnessV1ResponseFormat =
  | { readonly type: 'text' }
  | {
      readonly type: 'json';
      readonly schema?: HarnessV1JSONSchema;
      readonly name?: string;
      readonly description?: string;
    };
