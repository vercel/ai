/**
A JSON value can be a string, number, boolean, object, array, or null.
JSON values can be serialized and deserialized by the JSON.stringify and JSON.parse methods.
 */
export type JSONValue =
  | null
  | string
  | number
  | boolean
  | JSONObject
  | JSONArray;

export type JSONObject = {
  [key: string]: JSONValue;
};

export type JSONArray = JSONValue[];

const test: Record<string, JSONValue> = {
  images: [{ revisedPrompt: 'test' }],
};

// Type '{ revisedPrompt: string; }[]' is not assignable to type 'Record<string, JSONValue>'.
