/**
 * A relaxed version of JSONValue that allows undefined,
 * but is still structurally JSON-like.
 */
export type JSONValueLoose =
  | null
  | string
  | number
  | boolean
  | { [key: string]: JSONValueLoose | undefined }
  | (JSONValueLoose | undefined)[];


export type JSONObjectLoose = {
  [key: string]: JSONValueLoose;
};

export type JSONArrayLoose = JSONValueLoose[];
