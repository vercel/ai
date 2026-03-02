import { asArray } from './as-array';

export type Listener<EVENT> = (event: EVENT) => PromiseLike<void> | void;

/**
 * Notifies all provided callbacks with the given event.
 * Errors in callbacks do not break the generation flow.
 */
export async function notify<EVENT>(options: {
  event: EVENT;
  callbacks?: Listener<EVENT> | Array<Listener<EVENT>>;
}): Promise<void> {
  for (const callback of asArray(options.callbacks)) {
    try {
      await callback(options.event);
    } catch (_ignored) {}
  }
}
