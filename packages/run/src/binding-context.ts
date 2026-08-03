import { AsyncLocalStorage } from 'node:async_hooks';
import type { BindingContext } from './types.js';

interface BindingContextStore {
  active: boolean;
  context: BindingContext;
}

const bindingContextStorage = new AsyncLocalStorage<BindingContextStore>();

/** Returns the context for the currently executing host binding. */
export function getBindingContext(): BindingContext {
  const store = bindingContextStorage.getStore();
  if (store === undefined || !store.active) {
    throw new Error(
      'getBindingContext() can only be called while executing a run binding.',
    );
  }
  return store.context;
}

export async function runWithBindingContext<OUTPUT>(
  context: BindingContext,
  execute: () => OUTPUT | Promise<OUTPUT>,
): Promise<OUTPUT> {
  const store: BindingContextStore = { active: true, context };
  try {
    return await bindingContextStorage.run(store, execute);
  } finally {
    store.active = false;
  }
}
