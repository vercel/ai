export type JSONValue =
  | null
  | string
  | number
  | boolean
  | JSONObject
  | JSONArray;

interface JSONObject {
  [key: string]: JSONValue;
}

interface JSONArray extends Array<JSONValue> {}
