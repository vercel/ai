import { Arrayable, asArray } from '@ai-sdk/provider-utils';
import type { Callback } from './callback';

/**
 * Notifies all provided callbacks with the given event.
 * Errors in callbacks do not break the generation flow.
 */
export async function notify<EVENT>(options: {
  event: EVENT;
  callbacks?: Arrayable<Callback<EVENT> | undefined | null>;
}): Promise<void> {
  for (const callback of asArray(options.callbacks)) {
    try {
      await callback?.(options.event);
    } catch {}
  }
}
