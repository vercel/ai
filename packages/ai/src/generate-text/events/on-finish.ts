import type { OnFinishEvent } from '../callback-events';
import type { ToolSet } from '../tool-set';
import { asArray } from '../../util/as-array';

export type OnFinishListener<TOOLS extends ToolSet> = (
  event: OnFinishEvent<TOOLS>,
) => PromiseLike<void> | void;

/**
 * Notifies all provided onFinish callbacks.
 * Errors in callbacks do not break the generation flow.
 */
export async function notifyOnFinish<TOOLS extends ToolSet>(options: {
  event: OnFinishEvent<TOOLS>;
  callbacks?: OnFinishListener<TOOLS> | Array<OnFinishListener<TOOLS>>;
}): Promise<void> {
  for (const callback of asArray(options.callbacks)) {
    try {
      await callback(options.event);
    } catch (_ignored) {}
  }
}
