import { lazySchema, zodSchema } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

const heygenVideoAssetSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('url'), url: z.url().startsWith('https://') }),
  z.object({ type: z.literal('asset_id'), assetId: z.string().min(1) }),
  z.object({
    type: z.literal('base64'),
    mediaType: z.string().min(1),
    data: z.string().min(1),
  }),
]);

export type HeyGenVideoAsset = z.infer<typeof heygenVideoAssetSchema>;

const heygenVideoOptions = z.object({
  /** Inferred from the supplied image and references when omitted. */
  mode: z
    .enum(['text_to_video', 'image_to_video', 'reference_to_video'])
    .optional(),
  /** Output size class. Takes precedence over the standard resolution option. */
  resolution: z.enum(['480p', '768p', '1080p', '2k']).optional(),
  /** Defaults to turbo. Use disabled to preserve the original prompt. */
  promptEnhancement: z.enum(['turbo', 'quality', 'disabled']).optional(),
  /** First frame, including an existing HeyGen asset. Cannot be combined with a standard image. */
  image: heygenVideoAssetSchema.optional(),
  /** Additional references, appended after standard inputReferences of the same kind. */
  referenceImages: z.array(heygenVideoAssetSchema).max(9).optional(),
  referenceVideos: z.array(heygenVideoAssetSchema).max(3).optional(),
  referenceAudio: z.array(heygenVideoAssetSchema).max(3).optional(),
});

export type HeyGenVideoModelOptions = z.infer<typeof heygenVideoOptions>;
export const heygenVideoModelOptionsSchema = lazySchema(() =>
  zodSchema(heygenVideoOptions),
);
