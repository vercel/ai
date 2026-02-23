import type { OnToolCallStartEvent } from '../generate-text/callback-events';
import type { ToolSet } from '../generate-text/tool-set';

/**
 * Generic listener type that accepts any OnToolCallStartEvent variant.
 */
type OnToolCallStartListener = <TOOLS extends ToolSet>(
  event: OnToolCallStartEvent<TOOLS>,
) => void;

const listeners: OnToolCallStartListener[] = [];

/**
 * Subscribe to `onToolCallStart` events from all generateText/streamText calls.
 * Returns an unsubscribe function.
 */
export function listenOnToolCallStart(
  listener: OnToolCallStartListener,
): () => void {
  listeners.push(listener);
  return () => {
    const index = listeners.indexOf(listener);
    if (index > -1) listeners.splice(index, 1);
  };
}

/**
 * Notifies all registered onToolCallStart listeners and optionally calls a callback.
 * Errors in listeners/callback do not break the generation flow.
 */
export async function notifyOnToolCallStart<TOOLS extends ToolSet>(
  event: OnToolCallStartEvent<TOOLS>,
  callback?:
    | ((event: OnToolCallStartEvent<TOOLS>) => PromiseLike<void> | void)
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
