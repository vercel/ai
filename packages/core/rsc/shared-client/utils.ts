'use client';

import type { BulkAction } from '../types';

export function createResolvablePromise<T = any>() {
  let resolve: (value: T) => void, reject: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return {
    promise,
    resolve: resolve!,
    reject: reject!,
  };
}

export function createActionQueue<T>(bulkActions: BulkAction<T>) {
  let executing: Promise<any> | null = null;
  let queueExecuting: Promise<any> | null = null;
  const queued: any[] = [];

  return async (
    getState: () => any,
    args: any[],
    action: (...args: any[]) => Promise<[Promise<any>, unknown]>,
    applyStateDiff: (state: any, delta: any) => void,
  ) => {
    const index = queued.length;

    // Add execution to the queue
    queued.push([action, args]);

    if (executing) {
      await executing;
    }

    const resolvable = createResolvablePromise();
    const state = getState();

    try {
      const bulkSize = queued.length;
      if (bulkSize > 1) {
        const queueResolvable = createResolvablePromise();

        try {
          // Bulk execute all queued actions. The first action needs to start
          // the request and others should just wait.
          executing = resolvable.promise;
          queueExecuting = queueResolvable.promise;

          // Remove executed actions from the queue
          const actions = [...queued];
          queued.length = 0;

          const bulkResult = await bulkActions(state, actions);
          executing = null;
          queueExecuting = null;

          const aiStateDelta = bulkResult[0];
          const result = bulkResult[1][index];

          (async () => {
            try {
              const delta = await aiStateDelta;
              applyStateDiff(state, delta);
              resolvable.resolve(result);
              executing = null;
              queueExecuting = null;
            } catch (e) {
              resolvable.reject(e);
              executing = null;
              queueExecuting = null;
              throw e;
            }
          })();

          queueResolvable.resolve(bulkResult);
          return result;
        } catch (e) {
          queueResolvable.reject(e);
          throw e;
        }
      } else if (queueExecuting) {
        // Wait for bulk execution to finish. No need to apply any state changes.
        const bulkResult = await queueExecuting;
        const result = bulkResult[1][index];

        resolvable.resolve(null);
        return result;
      } else {
        // Single execution.
        executing = resolvable.promise;

        // Remove executed action from the queue
        queued.shift();

        const [aiStateDelta, result] = await action(state, ...args);

        (async () => {
          try {
            const delta = await aiStateDelta;
            applyStateDiff(state, delta);
            resolvable.resolve(result);
            executing = null;
            queueExecuting = null;
          } catch (e) {
            resolvable.reject(e);
            executing = null;
            queueExecuting = null;
            throw e;
          }
        })();

        return result;
      }
    } catch (e) {
      resolvable.reject(e);
      executing = null;
      queueExecuting = null;
      throw e;
    }
  };
}
