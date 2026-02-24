import type { OnStartEvent } from '../callback-events';
import type { Output } from '../output';
import type { ToolSet } from '../tool-set';
import { asArray } from '../../util/as-array';

export type OnStartListener<
  TOOLS extends ToolSet,
  OUTPUT extends Output,
  INCLUDE,
> = (event: OnStartEvent<TOOLS, OUTPUT, INCLUDE>) => PromiseLike<void> | void;

/**
 * Notifies all provided onStart callbacks.
 * Errors in callbacks do not break the generation flow.
 */
export async function notifyOnStart<
  TOOLS extends ToolSet,
  OUTPUT extends Output,
  INCLUDE,
>(options: {
  event: OnStartEvent<TOOLS, OUTPUT, INCLUDE>;
  callbacks?:
    | OnStartListener<TOOLS, OUTPUT, INCLUDE>
    | Array<OnStartListener<TOOLS, OUTPUT, INCLUDE>>;
}): Promise<void> {
  for (const callback of asArray(options.callbacks)) {
    try {
      await callback(options.event);
    } catch (_ignored) {}
  }
}
