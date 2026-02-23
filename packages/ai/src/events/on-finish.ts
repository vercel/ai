import type { OnFinishEvent } from '../generate-text/callback-events';
import type { ToolSet } from '../generate-text/tool-set';

/**
 * Generic listener type that accepts any OnFinishEvent variant.
 */
type OnFinishListener = <TOOLS extends ToolSet>(
  event: OnFinishEvent<TOOLS>,
) => void;

const listeners: OnFinishListener[] = [];

/**
 * Subscribe to `onFinish` events from all generateText/streamText calls.
 * Returns an unsubscribe function.
 */
export function listenOnFinish(listener: OnFinishListener): () => void {
  listeners.push(listener);
  return () => {
    const index = listeners.indexOf(listener);
    if (index > -1) listeners.splice(index, 1);
  };
}

/**
 * Notifies all registered onFinish listeners and optionally calls a callback.
 * Errors in listeners/callback do not break the generation flow.
 */
export async function notifyOnFinish<TOOLS extends ToolSet>(
  event: OnFinishEvent<TOOLS>,
  callback?:
    | ((event: OnFinishEvent<TOOLS>) => PromiseLike<void> | void)
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
