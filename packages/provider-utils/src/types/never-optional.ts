// 0 extends 1 & N checks for any
// [N] extends [never] checks for never
// The generic case includes both known-output and outputless specializations.
export type NeverOptional<N, T> = 0 extends 1 & N
  ? { [K in keyof T]?: T[K] | undefined }
  : [N] extends [never]
    ? Partial<Record<keyof T, undefined>>
    : T;
