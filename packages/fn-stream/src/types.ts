export type JsonObject = { [key: string]: JsonValue };
export type JsonArray = JsonValue[];
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonObject | JsonArray | JsonPrimitive;

export const parseStateSymbol: unique symbol = Symbol('ParseState');
export type ParseStateSymbol = typeof parseStateSymbol;

export type PartialPrimitiveValue = 'complete' | 'partial' | undefined;

export type PartialObject = JsonObject & {
  [parseStateSymbol]: PartialPrimitiveValue;
};
export type PartialArray = JsonValue[] & {
  [parseStateSymbol]: PartialPrimitiveValue;
};

// We could use a symbol, but null is JSON serializable, which keeps the API serializable.
export const Sentinel = null;
export type Sentinel = typeof Sentinel;

export type PathPart = string | number | Sentinel | Symbol; // Symbol is not actually used.

export type MapPartialParseEvent<T, PathPrefix extends Array<PathPart>> = {
  [K in keyof T]: InferParseEvent<T[K], [...PathPrefix, K], 'complete'>;
};

export type ParseEventKind = 'partial' | 'complete' | 'value';

export type InferParseEvent<
  T,
  PathPrefix extends PathPart[] = [],
  RootKind extends 'complete' | 'value' = 'value',
> =
  | {
      kind: RootKind;
      path: [...PathPrefix, Sentinel];
      value: T;
    }
  | (T extends undefined
      ? {
          kind: 'partial';
          path: [...PathPrefix, Sentinel];
          value: T;
        }
      : T extends string
      ? {
          kind: 'partial';
          path: [...PathPrefix, Sentinel];
          value: T;
        }
      : T extends JsonPrimitive
      ? {
          kind: RootKind;
          path: [...PathPrefix, Sentinel];
          value: T;
        }
      : T extends JsonArray
      ? // prettier-ignore
        MapPartialParseEvent<T, PathPrefix> extends [...infer U] ? U[number] : never
      : T extends JsonObject
      ? // prettier-ignore
        MapPartialParseEvent<T, PathPrefix> extends Record<any, infer U> ? U : never
      : never);

export type IsStrictlyAny<T> = (T extends never ? true : false) extends false
  ? false
  : true;

export type ParseEvent<T> = IsStrictlyAny<T> extends true
  ? any
  : Readonly<InferParseEvent<T>>;
