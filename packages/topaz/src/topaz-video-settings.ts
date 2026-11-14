import {
  getTopazVideoModelEntry,
  type TopazModelIds,
} from './topaz-model-catalog';
/**
 * Topaz video model ids.
 *
 * The AI SDK exposes readable ids that are mapped onto the short names the
 * Topaz API expects in the `filters[].model` field (see
 * `topazVideoApiModelIds`). Passing a raw Topaz name such as `slp-2.6` also
 * works - unknown ids are forwarded to the API unchanged.
 */
export type TopazVideoModelId = TopazModelIds['video'] | (string & {});

/**
 * Maps AI SDK video model ids onto Topaz API model names.
 *
 * @see https://developer.topazlabs.com/video-models/proteus/proteus-1
 * @see https://developer.topazlabs.com/video-models/starlight/starlight-precise-2.6
 */
export { topazVideoApiModelIds } from './topaz-model-catalog';

export function resolveTopazVideoApiModelId(modelId: string): string {
  return getTopazVideoModelEntry(modelId).requestConfig.video.apiModelId;
}
