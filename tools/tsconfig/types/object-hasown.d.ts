/*
 * Adds a narrowing overload to `Object.hasOwn`, so an own-property check
 * narrows types the way the `in` operator does. The built-in signature
 * returns a plain `boolean`, which forces `in` checks wherever narrowing is
 * needed, even though `in` also matches inherited properties.
 *
 * The overload only applies to literal keys. Dynamic keys (`string`,
 * `number`, `symbol`) fall back to the built-in signature, because a type
 * predicate over a dynamic key would narrow index-signature types such as
 * `Record<string, T>` to `never` in the `false` branch.
 *
 * Union members with a string index signature are never treated as owning the
 * key, for the same reason. When no union member declares the key, the value
 * is narrowed member by member to an intersection with the key, typed from the
 * member's index signature where it has one and as `unknown` otherwise. That
 * intersection carries a phantom brand so index-signature types are not
 * assignable to it, which keeps them intact in the `false` branch.
 */
declare const objectHasOwnNarrowing: unique symbol;

type ObjectHasOwnDeclaredMembers<O> = O extends unknown
  ? string extends keyof O
    ? never
    : O
  : never;

type ObjectHasOwnLiteralKey<K extends PropertyKey> = string extends K
  ? never
  : number extends K
    ? never
    : symbol extends K
      ? never
      : unknown;

type ObjectHasOwnWithKey<O, K extends PropertyKey> = O extends unknown
  ? O & { [P in K]: P extends keyof O ? O[P] : unknown } & {
      readonly [objectHasOwnNarrowing]: true;
    }
  : never;

declare global {
  interface ObjectConstructor {
    hasOwn<O extends object, K extends PropertyKey>(
      o: O,
      v: K & ObjectHasOwnLiteralKey<K>,
    ): o is Extract<ObjectHasOwnDeclaredMembers<O>, Record<K, unknown>> extends never
      ? ObjectHasOwnWithKey<O, K>
      : Extract<ObjectHasOwnDeclaredMembers<O>, Record<K, unknown>>;
  }
}

export {};
