/**
 * A JSON value can be a string, number, boolean, object, array, or null.
 * JSON values can be serialized and deserialized by the JSON.stringify and JSON.parse methods.
 */
export type JSONValue =
  | null
  | string
  | number
  | boolean
  | Readonly<JSONObject>
  | readonly JSONValue[];

export type JSONObject = {
  [key: string]: JSONValue | undefined;
};

export type JSONArray = JSONValue[];
