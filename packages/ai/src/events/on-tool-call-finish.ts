import type { OnToolCallFinishEvent } from '../generate-text/callback-events';
import type { ToolSet } from '../generate-text/tool-set';

/**
 * Generic listener type that accepts any OnToolCallFinishEvent variant.
 */
type OnToolCallFinishListener = <TOOLS extends ToolSet>(
  event: OnToolCallFinishEvent<TOOLS>,
) => void;

const listeners: OnToolCallFinishListener[] = [];

/**
 * Subscribe to `onToolCallFinish` events from all generateText/streamText calls.
 * Returns an unsubscribe function.
 */
export function listenOnToolCallFinish(
  listener: OnToolCallFinishListener,
): () => void {
  listeners.push(listener);
  return () => {
    const index = listeners.indexOf(listener);
    if (index > -1) listeners.splice(index, 1);
  };
}

/**
 * Notifies all registered onToolCallFinish listeners and optionally calls a callback.
 * Errors in listeners/callback do not break the generation flow.
 */
export async function notifyOnToolCallFinish<TOOLS extends ToolSet>(
  event: OnToolCallFinishEvent<TOOLS>,
  callback?:
    | ((event: OnToolCallFinishEvent<TOOLS>) => PromiseLike<void> | void)
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
