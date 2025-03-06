export type Box<T> = { value: T };

export function box<T>(value: T): Box<T> {
  let state = $state(value);
  return {
    get value() {
      return state;
    },
    set value(value: T) {
      state = value;
    },
  };
}

export function promiseWithResolvers<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve: (value: T) => void;
  let reject: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve: resolve!, reject: reject! };
}
