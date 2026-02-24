import type { OnToolCallFinishEvent } from '../callback-events';
import type { ToolSet } from '../tool-set';
import { asArray } from '../../util/as-array';

export type OnToolCallFinishListener<TOOLS extends ToolSet> = (
  event: OnToolCallFinishEvent<TOOLS>,
) => PromiseLike<void> | void;

/**
 * Notifies all provided onToolCallFinish callbacks.
 * Errors in callbacks do not break the generation flow.
 */
export async function notifyOnToolCallFinish<TOOLS extends ToolSet>(options: {
  event: OnToolCallFinishEvent<TOOLS>;
  callbacks?:
    | OnToolCallFinishListener<TOOLS>
    | Array<OnToolCallFinishListener<TOOLS>>;
}): Promise<void> {
  for (const callback of asArray(options.callbacks)) {
    try {
      await callback(options.event);
    } catch (_ignored) {}
  }
}
