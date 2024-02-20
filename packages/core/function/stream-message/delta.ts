export type Delta<T> =
  | {
      type: 'delta';
      deltaValue: T;
    }
  | {
      type: 'error';
      error: unknown;
    };
