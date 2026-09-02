/**
 * Topaz image model ids.
 *
 * The AI SDK exposes a readable id that is mapped onto the name the Topaz API
 * expects in the `model` form field (see `topazImageApiModelIds`). Passing a
 * raw Topaz name such as `Wonder 3.5` also works - unknown ids are forwarded
 * to the API unchanged.
 */
export type TopazImageModelId = 'wonder-3.5' | (string & {});

/**
 * Maps AI SDK image model ids onto Topaz API model names.
 *
 * @see https://developer.topazlabs.com/image-models/wonder/wonder-3.5-new
 */
export const topazImageApiModelIds: Record<string, string> = {
  'wonder-3.5': 'Wonder 3.5',
};

export function resolveTopazImageApiModelId(modelId: string): string {
  return topazImageApiModelIds[modelId] ?? modelId;
}
