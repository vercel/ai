// https://docs.bfl.ai/api-reference/utility/generate-a-video-with-flux-3
export type BlackForestLabsVideoModelId = 'flux-3-video' | (string & {});

/**
 * Aspect ratios FLUX 3 video accepts. `auto` lets the model infer the ratio
 * from the prompt and any conditioning media, and is the API default.
 */
export const blackForestLabsVideoAspectRatios = [
  '21:9',
  '2:1',
  '16:9',
  '4:3',
  '1:1',
  '3:4',
  '9:16',
  'auto',
] as const;

/**
 * Output resolution tiers FLUX 3 video accepts.
 */
export const blackForestLabsVideoResolutions = ['hd', 'fhd'] as const;
