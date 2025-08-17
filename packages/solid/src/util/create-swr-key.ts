import { Accessor, createMemo } from 'solid-js';

export const createSwrKey = (...args: (Accessor<string> | string)[]) => {
  const key = createMemo(() =>
    args.map(arg => (typeof arg === 'string' ? arg : arg())).join('/'),
  );
  return key;
};
