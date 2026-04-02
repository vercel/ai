/**
 * Converts a union type `U` into an intersection type.
 *
 * For example:
 *   type A = { a: number };
 *   type B = { b: string };
 *   type Union = A | B;
 *   type Intersection = UnionToIntersection<Union>;
 *   // Intersection is: { a: number } & { b: string }
 *
 * This is useful when you have a union of object types and need a type with all possible properties.
 */
export type UnionToIntersection<U> = (
  U extends unknown ? (arg: U) => void : never
) extends (arg: infer I) => void
  ? I
  : never;
