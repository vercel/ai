import { z } from 'zod/v4';

export const typesafeAiFilePartProviderOptions = z.object({
  /**
   * Asset reference for this image. Automatically inserted into state at the
   * file's position. Use the same reference in instructions or criteria to
   * refer to the image there.
   *
   * Defaults to a generated ID. References must be nonempty and unique within
   * the request, and should not occur accidentally in other request text.
   */
  reference: z
    .string()
    .refine(value => value.trim().length > 0)
    .optional(),
});

export type TypeSafeAiFilePartProviderOptions = z.infer<
  typeof typesafeAiFilePartProviderOptions
>;
