import { z } from 'zod/v4';

export const typesafeAiFilePartProviderOptions = z.object({
  /**
   * Asset reference for this image. Inserted into state at the file's position
   * unless the state already contains it. Every occurrence in state,
   * instructions, or criteria sends another copy of the image.
   *
   * Defaults to a generated ID. References must be nonempty and unique within
   * the request, and should not occur accidentally in other request text.
   */
  reference: z
    .string()
    .refine(value => value.trim().length > 0)
    .optional(),

  /**
   * Whether to insert the reference into state at the file's position.
   * Set to `false` to send the image only where you reference it in
   * instructions or criteria. Set to `true` to insert it even when the state
   * already contains it. `false` requires an explicit `reference`.
   *
   * Defaults to inserting the reference unless the state already contains it.
   */
  insertReference: z.boolean().optional(),
});

export type TypeSafeAiFilePartProviderOptions = z.infer<
  typeof typesafeAiFilePartProviderOptions
>;
