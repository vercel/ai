import type { OnStepStartEvent } from '../callback-events';
import type { Output } from '../output';
import type { ToolSet } from '../tool-set';

/**
 * Generic listener type that accepts any OnStepStartEvent variant.
 */
type OnStepStartListener = <
  TOOLS extends ToolSet,
  OUTPUT extends Output,
  INCLUDE,
>(
  event: OnStepStartEvent<TOOLS, OUTPUT, INCLUDE>,
) => void;

const listeners: OnStepStartListener[] = [];

/**
 * Subscribe to `onStepStart` events from all generateText/streamText calls.
 * Returns an unsubscribe function.
 */
export function listenOnStepStart(listener: OnStepStartListener): () => void {
  listeners.push(listener);
  return () => {
    const index = listeners.indexOf(listener);
    if (index > -1) listeners.splice(index, 1);
  };
}

/**
 * Notifies all registered onStepStart listeners and optionally calls a callback.
 * Errors in listeners/callback do not break the generation flow.
 */
export async function notifyOnStepStart<
  TOOLS extends ToolSet,
  OUTPUT extends Output,
  INCLUDE,
>(
  event: OnStepStartEvent<TOOLS, OUTPUT, INCLUDE>,
  callback?:
    | ((
        event: OnStepStartEvent<TOOLS, OUTPUT, INCLUDE>,
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
