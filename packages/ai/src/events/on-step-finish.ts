import type { OnStepFinishEvent } from '../generate-text/callback-events';
import type { ToolSet } from '../generate-text/tool-set';

/**
 * Generic listener type that accepts any OnStepFinishEvent variant.
 */
type OnStepFinishListener = <TOOLS extends ToolSet>(
  event: OnStepFinishEvent<TOOLS>,
) => void;

const listeners: OnStepFinishListener[] = [];

/**
 * Subscribe to `onStepFinish` events from all generateText/streamText calls.
 * Returns an unsubscribe function.
 */
export function listenOnStepFinish(listener: OnStepFinishListener): () => void {
  listeners.push(listener);
  return () => {
    const index = listeners.indexOf(listener);
    if (index > -1) listeners.splice(index, 1);
  };
}

/**
 * Notifies all registered onStepFinish listeners and optionally calls a callback.
 * Errors in listeners/callback do not break the generation flow.
 */
export async function notifyOnStepFinish<TOOLS extends ToolSet>(
  event: OnStepFinishEvent<TOOLS>,
  callback?:
    | ((event: OnStepFinishEvent<TOOLS>) => PromiseLike<void> | void)
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
