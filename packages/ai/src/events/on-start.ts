import type { OnStartEvent } from '../generate-text/callback-events';
import type { Output } from '../generate-text/output';
import type { ToolSet } from '../generate-text/tool-set';

/**
 * Listener type that accepts any OnStartEvent variant.
 */
type OnStartListener = <TOOLS extends ToolSet, OUTPUT extends Output, INCLUDE>(
  event: OnStartEvent<TOOLS, OUTPUT, INCLUDE>,
) => void;

const listeners: OnStartListener[] = [];

/**
 * Subscribe to `onStart` events from all generateText/streamText calls.
 * Returns an unsubscribe function.
 */
export function listenOnStart(listener: OnStartListener): () => void {
  listeners.push(listener);
  return () => {
    const index = listeners.indexOf(listener);
    if (index > -1) listeners.splice(index, 1);
  };
}

/**
 * Notifies all registered onStart listeners and optionally calls a callback.
 * Errors in listeners/callback do not break the generation flow.
 */
export async function notifyOnStart<
  TOOLS extends ToolSet,
  OUTPUT extends Output,
  INCLUDE,
>(
  event: OnStartEvent<TOOLS, OUTPUT, INCLUDE>,
  callback?:
    | ((
        event: OnStartEvent<TOOLS, OUTPUT, INCLUDE>,
      ) => PromiseLike<void> | void)
    | undefined,
): Promise<void> {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch (_ignored) {
      // Errors in listeners should not break the generation flow.
    }
  }

  if (callback) {
    try {
      await callback(event);
    } catch (_ignored) {
      // Errors in callbacks should not break the generation flow.
    }
  }
}
