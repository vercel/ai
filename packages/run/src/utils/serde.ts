import { parse, stringify } from 'devalue';

export const RUN_SERDE = 'run-js-v1' as const;

// This is a durable replay wire format, not just an implementation detail.
// Keep devalue pinned and introduce a new RUN_SERDE identifier before changing
// either its serialized representation or these reducers/revivers.

const runReducers = {
  RunOwnProtoObject: (value: unknown) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return false;
    }
    const prototype = Object.getPrototypeOf(value);
    if (
      (prototype !== Object.prototype && prototype !== null) ||
      !Object.hasOwn(value, '__proto__')
    ) {
      return false;
    }
    return [
      prototype === null,
      Object.keys(value).map(key => [
        key,
        (value as Record<string, unknown>)[key],
      ]),
    ];
  },
  RunErrorValue: (value: unknown) => {
    if (!(value instanceof Error)) return false;
    return {
      name: String(value.name),
      message: String(value.message),
      hasCause: Object.hasOwn(value, 'cause'),
      cause: value.cause,
      errors: value instanceof AggregateError ? [...value.errors] : undefined,
    };
  },
};

const runRevivers = {
  RunOwnProtoObject: reviveOwnProtoObject,
  RunErrorValue: reviveError,
};

export function serializeRunValue(value: unknown): string {
  return stringify(value, runReducers);
}

export function deserializeRunValue(serialized: string): unknown {
  return parse(serialized, runRevivers);
}

function reviveOwnProtoObject(value: unknown): object {
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    typeof value[0] !== 'boolean' ||
    !Array.isArray(value[1])
  ) {
    throw new TypeError('Serialized object value is malformed.');
  }
  const result = Object.create(value[0] ? null : Object.prototype) as Record<
    string,
    unknown
  >;
  const seen = new Set<string>();
  for (const entry of value[1]) {
    if (
      !Array.isArray(entry) ||
      entry.length !== 2 ||
      typeof entry[0] !== 'string' ||
      seen.has(entry[0])
    ) {
      throw new TypeError('Serialized object entry is malformed.');
    }
    seen.add(entry[0]);
    Object.defineProperty(result, entry[0], {
      value: entry[1],
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return result;
}

function reviveError(value: unknown): Error {
  if (
    value === null ||
    typeof value !== 'object' ||
    !('name' in value) ||
    typeof value.name !== 'string' ||
    !('message' in value) ||
    typeof value.message !== 'string' ||
    !('hasCause' in value) ||
    typeof value.hasCause !== 'boolean' ||
    !Object.hasOwn(value, 'cause') ||
    !Object.hasOwn(value, 'errors') ||
    ((value as { errors?: unknown }).errors !== undefined &&
      !Array.isArray((value as { errors?: unknown }).errors))
  ) {
    throw new TypeError('Serialized Error value is malformed.');
  }

  const record = value as {
    name: string;
    message: string;
    hasCause: boolean;
    cause: unknown;
    errors: unknown[] | undefined;
  };
  const options = record.hasCause ? { cause: record.cause } : undefined;
  let error: Error;
  if (record.errors !== undefined) {
    error = new AggregateError(record.errors, record.message, options);
  } else {
    const constructors: Record<string, ErrorConstructor> = {
      Error,
      EvalError,
      RangeError,
      ReferenceError,
      SyntaxError,
      TypeError,
      URIError,
    };
    const Constructor = Object.hasOwn(constructors, record.name)
      ? constructors[record.name]!
      : Error;
    error = new Constructor(record.message, options);
  }
  error.name = record.name;
  return error;
}
