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

  /**
   * Whether to insert the reference into state at the file's position.
   * Set to `false` when the state already contains the reference, for example
   * as a field value in JSON state. Requires an explicit `reference`.
   *
   * Defaults to `true`.
   */
  insertReference: z.boolean().optional(),
});

export type TypeSafeAiFilePartProviderOptions = z.infer<
  typeof typesafeAiFilePartProviderOptions
>;
