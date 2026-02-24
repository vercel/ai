import type { OnStepFinishEvent } from '../callback-events';
import type { ToolSet } from '../tool-set';
import { asArray } from '../../util/as-array';

export type OnStepFinishListener<TOOLS extends ToolSet> = (
  event: OnStepFinishEvent<TOOLS>,
) => PromiseLike<void> | void;

/**
 * Notifies all provided onStepFinish callbacks.
 * Errors in callbacks do not break the generation flow.
 */
export async function notifyOnStepFinish<TOOLS extends ToolSet>(options: {
  event: OnStepFinishEvent<TOOLS>;
  callbacks?: OnStepFinishListener<TOOLS> | Array<OnStepFinishListener<TOOLS>>;
}): Promise<void> {
  for (const callback of asArray(options.callbacks)) {
    try {
      await callback(options.event);
    } catch (_ignored) {}
  }
}
