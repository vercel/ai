import type { OnStepStartEvent } from '../callback-events';
import type { Output } from '../output';
import type { ToolSet } from '../tool-set';
import { asArray } from '../../util/as-array';

export type OnStepStartListener<
  TOOLS extends ToolSet,
  OUTPUT extends Output,
  INCLUDE,
> = (
  event: OnStepStartEvent<TOOLS, OUTPUT, INCLUDE>,
) => PromiseLike<void> | void;

/**
 * Notifies all provided onStepStart callbacks.
 * Errors in callbacks do not break the generation flow.
 */
export async function notifyOnStepStart<
  TOOLS extends ToolSet,
  OUTPUT extends Output,
  INCLUDE,
>(options: {
  event: OnStepStartEvent<TOOLS, OUTPUT, INCLUDE>;
  callbacks?:
    | OnStepStartListener<TOOLS, OUTPUT, INCLUDE>
    | Array<OnStepStartListener<TOOLS, OUTPUT, INCLUDE>>;
}): Promise<void> {
  for (const callback of asArray(options.callbacks)) {
    try {
      await callback(options.event);
    } catch (_ignored) {}
  }
}
