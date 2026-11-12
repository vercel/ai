import {
  lazySchema,
  zodSchema,
  type InferSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import {
  getOpenAIImageModelEntry,
  openaiImageModelMaxImagesPerCall,
} from '../openai-model-catalog';

export type OpenAIImageModelId =
  | 'dall-e-3'
  | 'dall-e-2'
  | 'gpt-image-1'
  | 'gpt-image-1-mini'
  | 'gpt-image-1.5'
  | 'gpt-image-2'
  | 'gpt-image-2.6-flare'
  | 'gpt-image-2.6-sunburst'
  | 'gpt-image-2.5-flare'
  | 'gpt-image-2.5-flare-2026-09-08'
  | 'gpt-image-2.5-sunburst'
  | 'gpt-image-2.5-sunburst-2026-09-08'
  | 'chatgpt-image-latest'
  | (string & {});

export const modelMaxImagesPerCall: Record<OpenAIImageModelId, number> =
  openaiImageModelMaxImagesPerCall;

export function hasDefaultResponseFormat(modelId: string): boolean {
  return (
    getOpenAIImageModelEntry(modelId).requestConfig.image.responseFormat ===
    'provider-default'
  );
}

export function getMaxImagesPerCall(modelId: OpenAIImageModelId): number {
  return (
    getOpenAIImageModelEntry(modelId).capabilities.image.maxImagesPerCall ?? 1
  );
}

const baseImageModelOptionsObject = () =>
  z.object({
    /**
     * Quality of the generated image(s).
     *
     * Valid values: `standard`, `hd`, `low`, `medium`, `high`, `xhigh`, `max`, `auto`.
     * `xhigh` and `max` are supported by GPT Image 2.5 models.
     */
    quality: z
      .enum(['standard', 'hd', 'low', 'medium', 'high', 'xhigh', 'max', 'auto'])
      .optional(),

    /**
     * Background behavior for the generated image(s).
     *
     * If `transparent`, the output format must support transparency
     * (i.e. `png` or `webp`).
     */
    background: z.enum(['transparent', 'opaque', 'auto']).optional(),

    /**
     * Format in which the generated image(s) are returned.
     */
    outputFormat: z.enum(['png', 'jpeg', 'webp']).optional(),

    /**
     * How much detail the model puts into the image. Supported by GPT Image
     * 2.6 models. The API defaults to `high`.
     */
    complexity: z.enum(['low', 'medium', 'high']).optional(),

    /**
     * Compression level (0-100) for the generated image(s). Applies to the
     * `jpeg` and `webp` output formats.
     */
    outputCompression: z.number().int().min(0).max(100).optional(),

    /**
     * A unique identifier representing your end-user, which can help OpenAI
     * to monitor and detect abuse.
     */
    user: z.string().optional(),

    /**
     * A stable identifier used to help detect users of your application that
     * may be violating OpenAI's usage policies. Should be a hashed username
     * or email address.
     */
    safetyIdentifier: z.string().max(128).optional(),
  });

export const openaiImageModelOptions = lazySchema(() =>
  zodSchema(baseImageModelOptionsObject()),
);

export type OpenAIImageModelOptions = InferSchema<
  typeof openaiImageModelOptions
>;

/**
 * Shape of the OpenAI image generation options. Exported so that routers
 * that also call the OpenAI image API (e.g. Azure) can accept these options
 * under their own providerOptions key.
 */
export const openaiImageModelGenerationOptionsShape = () =>
  baseImageModelOptionsObject().extend({
    /**
     * Style of the generated image. `vivid` produces hyper-real and
     * dramatic images; `natural` produces more subdued, less hyper-real
     * looking images.
     */
    style: z.enum(['vivid', 'natural']).optional(),

    /**
     * Format in which the generated image(s) are returned. `gif` produces
     * an animated GIF and is supported by GPT Image 2.6 models.
     */
    outputFormat: z.enum(['png', 'jpeg', 'webp', 'gif']).optional(),

    /**
     * Number of frames (2-64) of an animated GIF. Only applies to the `gif`
     * output format. The API defaults to 9.
     */
    frameCount: z.number().int().min(2).max(64).optional(),

    /**
     * Duration of each frame in milliseconds (20-2000) of an animated GIF.
     * The API rounds it to the nearest 10 ms. Only applies to the `gif`
     * output format. The API defaults to 200.
     */
    frameDurationMs: z.number().int().min(20).max(2000).optional(),

    /**
     * Content moderation level for the generated image(s). `low` applies
     * less restrictive filtering.
     */
    moderation: z.enum(['auto', 'low']).optional(),
  }).shape;

export const openaiImageModelGenerationOptions = lazySchema(() =>
  zodSchema(z.object(openaiImageModelGenerationOptionsShape())),
);

export type OpenAIImageModelGenerationOptions = InferSchema<
  typeof openaiImageModelGenerationOptions
>;

/**
 * Shape of the OpenAI image edit options. Exported so that routers can accept
 * these options under their own providerOptions key.
 */
export const openaiImageModelEditOptionsShape = () =>
  baseImageModelOptionsObject().extend({
    /**
     * Fidelity of the output image(s) to the input image(s).
     */
    inputFidelity: z.enum(['high', 'low']).optional(),

    /**
     * A transparent PNG overlaid on the first input image to mark up the
     * regions to change, as an HTTPS URL or a base64 data URL. It must match
     * the dimensions of the first image. Supported by GPT Image 2.5 and 2.6
     * models. Cannot be combined with a `mask`.
     */
    markup: z.string().optional(),

    /**
     * Content moderation level for the edited image(s). `low` applies
     * less restrictive filtering. Supported by GPT Image models.
     */
    moderation: z.enum(['auto', 'low']).optional(),
  }).shape;

export const openaiImageModelEditOptions = lazySchema(() =>
  zodSchema(z.object(openaiImageModelEditOptionsShape())),
);

export type OpenAIImageModelEditOptions = InferSchema<
  typeof openaiImageModelEditOptions
>;
