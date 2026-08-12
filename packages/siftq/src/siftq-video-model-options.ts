import { lazySchema, zodSchema } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

function isSupportedAudioLocation(value: string): boolean {
  if (/^mm_file:\/\/[^\s/]+$/.test(value)) {
    return true;
  }
  if (/^data:audio\/(wav|x-wav|mp3|mpeg);base64,[a-zA-Z0-9+/=]+$/.test(value)) {
    return true;
  }

  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export type SiftQVideoModelOptions = {
  /**
   * Output resolution tier. Defaults to `2K`.
   */
  resolution?: '768P' | '2K';

  /**
   * Output aspect ratio. Frame-based generation always uses `adaptive`.
   */
  ratio?: 'adaptive' | '21:9' | '16:9' | '4:3' | '1:1' | '3:4' | '9:16';

  /**
   * Additional audio references for reference-to-video generation.
   */
  referenceAudioUrls?: string[];
};

export const siftQVideoModelOptionsSchema = lazySchema(() =>
  zodSchema(
    z.object({
      resolution: z.enum(['768P', '2K']).optional(),
      ratio: z
        .enum(['adaptive', '21:9', '16:9', '4:3', '1:1', '3:4', '9:16'])
        .optional(),
      referenceAudioUrls: z
        .array(
          z.string().min(1).refine(isSupportedAudioLocation, {
            message:
              'Expected an http(s) URL, audio data URI, or mm_file:// file reference.',
          }),
        )
        .max(3)
        .optional(),
    }),
  ),
);
