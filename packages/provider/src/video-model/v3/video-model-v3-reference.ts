import type { VideoModelV3File } from './video-model-v3-file';

/**
 * The role a reference input plays in reference-to-video generation.
 *
 * - `subject`: the reference defines the subject/identity the model should
 *   reproduce (the default for every provider that supports references).
 * - `style`: the reference defines the visual style the model should emulate
 *   rather than the subject itself.
 */
export type VideoModelV3ReferenceType = 'subject' | 'style';

/**
 * A role-tagged reference input for reference-to-video generation.
 *
 * A reference is a {@link VideoModelV3File} (image or video) with an optional
 * `referenceType` describing what the model should do with it. When
 * `referenceType` is omitted, providers treat the reference as `subject`.
 */
export type VideoModelV3Reference = VideoModelV3File & {
  /**
   * What the model should do with this reference. Defaults to `subject`.
   */
  referenceType?: VideoModelV3ReferenceType;
};
