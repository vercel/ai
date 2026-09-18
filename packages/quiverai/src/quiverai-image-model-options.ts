import {
  lazySchema,
  zodSchema,
  type InferSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

/**
 * Provider options schema for QuiverAI image generation.
 *
 * @see https://quiver.ai/
 */
export const quiveraiImageModelOptionsSchema = lazySchema(() =>
  zodSchema(
    z.object({
      /**
       * The operation to perform. Defaults to `generate`.
       *
       * - `generate`: Text-to-SVG generation. Requires `prompt`.
       * - `vectorize`: Convert an input raster image into an SVG. Requires a
       *   single image in `prompt.images` / `files`.
       * - `animate`: Animate an input SVG. Requires a single SVG in
       *   `prompt.images` / `files`; the text prompt is optional.
       * - `edit`: Edit a single SVG from `prompt.images` using `prompt.text`
       *   as the required instruction.
       */
      operation: z
        .enum(['generate', 'vectorize', 'animate', 'edit'])
        .optional(),

      /**
       * Extra style guidance for prompt-based generation.
       */
      instructions: z.string().min(1).optional(),

      /**
       * Reasoning effort applied to generation or vectorization.
       */
      reasoningEffort: z.enum(['low', 'medium', 'high', 'xhigh']).optional(),

      /**
       * Optional reference images for SVG editing. Use
       * `prepareQuiverAIImageReference` to convert binary inputs.
       */
      referenceImages: z
        .array(
          z.union([
            z.object({ url: z.string().min(1) }).strict(),
            z.object({ base64: z.string().min(1).max(16_777_216) }).strict(),
          ]),
        )
        .max(4)
        .optional(),

      /**
       * Maximum number of edit review and redo steps (0-5).
       */
      maxReviewSteps: z.number().int().min(0).max(5).optional(),

      /**
       * SVG root attributes requested for generation or vectorization.
       */
      attributes: z
        .object({
          viewBox: z
            .object({
              minX: z.number(),
              minY: z.number(),
              width: z.number().positive(),
              height: z.number().positive(),
            })
            .optional(),
        })
        .optional(),

      /**
       * Sampling temperature (0-2).
       */
      temperature: z.number().min(0).max(2).optional(),

      /**
       * Nucleus sampling top-p (0-1).
       */
      topP: z.number().min(0).max(1).optional(),

      /**
       * Presence penalty (-2 to 2).
       */
      presencePenalty: z.number().min(-2).max(2).nullable().optional(),

      /**
       * Maximum number of output tokens (1 - 65536 for Arrow 2 models).
       * The legacy upper bound of 131072 is retained for other model IDs.
       */
      maxOutputTokens: z.number().int().min(1).max(131072).optional(),

      /**
       * Provider orchestrator token budget for SVG editing (1-65536).
       */
      orchestratorMaxOutputTokens: z
        .number()
        .int()
        .min(1)
        .max(65536)
        .optional(),

      /**
       * Provider shallow edit token budget for SVG editing (1-65536).
       */
      shallowMaxOutputTokens: z.number().int().min(1).max(65536).optional(),

      /**
       * Whether to auto-crop the input image before vectorization.
       * Only used when `operation` is `vectorize`.
       */
      autoCrop: z.boolean().optional(),

      /**
       * Target canvas size in pixels for vectorization (128 - 4096).
       * Only used when `operation` is `vectorize`.
       */
      targetSize: z.number().int().min(128).max(4096).optional(),
    }),
  ),
);

export type QuiverAIImageModelOptions = InferSchema<
  typeof quiveraiImageModelOptionsSchema
>;
