/**
 * FAL video model identifiers.
 *
 * @see https://fal.ai/models - Browse all FAL video models
 *
 * @example Text-to-video models
 * ```typescript
 * fal.video('luma-dream-machine')
 * fal.video('hunyuan-video')
 * ```
 *
 * @example Motion control (image + video → video)
 * ```typescript
 * // Requires image_url and video_url in providerOptions
 * fal.video('kling-video/v2.6/pro/motion-control')
 * ```
 */
export type FalVideoModelId =
  // Luma models - text-to-video
  | 'luma-dream-machine'
  | 'luma-ray-2'
  | 'luma-ray-2-flash'
  // Minimax models - text-to-video
  | 'minimax-video'
  | 'minimax-video-01'
  // Hunyuan - text-to-video
  | 'hunyuan-video'
  // Kling Motion Control - image + video → video
  // Requires: image_url, video_url in providerOptions.fal
  | 'kling-video/v2.6/pro/motion-control'
  | 'kling-video/v2.6/standard/motion-control'
  // Allow any other model ID
  | (string & {});

export interface FalVideoSettings {}
