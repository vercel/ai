import type { OnToolCallStartEvent } from '../callback-events';
import type { ToolSet } from '../tool-set';
import { asArray } from '../../util/as-array';

export type OnToolCallStartListener<TOOLS extends ToolSet> = (
  event: OnToolCallStartEvent<TOOLS>,
) => PromiseLike<void> | void;

/**
 * Notifies all provided onToolCallStart callbacks.
 * Errors in callbacks do not break the generation flow.
 */
export async function notifyOnToolCallStart<TOOLS extends ToolSet>(options: {
  event: OnToolCallStartEvent<TOOLS>;
  callbacks?:
    | OnToolCallStartListener<TOOLS>
    | Array<OnToolCallStartListener<TOOLS>>;
}): Promise<void> {
  for (const callback of asArray(options.callbacks)) {
    try {
      await callback(options.event);
    } catch (_ignored) {}
  }
}
