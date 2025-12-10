import {
  ImageModelV3,
  ImageModelV3File,
  SharedV3Warning,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  createJsonResponseHandler,
  type InferSchema,
  lazySchema,
  parseProviderOptions,
  postJsonToApi,
  resolve,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { googleFailedResponseHandler } from './google-error';
import {
  GoogleGenerativeAIImageModelId,
  GoogleGenerativeAIImageSettings,
} from './google-generative-ai-image-settings';
import { FetchFunction, Resolvable } from '@ai-sdk/provider-utils';

interface GoogleGenerativeAIImageModelConfig {
  provider: string;
  baseURL: string;
  headers?: Resolvable<Record<string, string | undefined>>;
  fetch?: FetchFunction;
  generateId?: () => string;
  _internal?: {
    currentDate?: () => Date;
  };
}

export class GoogleGenerativeAIImageModel implements ImageModelV3 {
  readonly specificationVersion = 'v3';

  get maxImagesPerCall(): number {
    // https://ai.google.dev/gemini-api/docs/imagen#imagen-model
    return this.settings.maxImagesPerCall ?? 4;
  }

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: GoogleGenerativeAIImageModelId,
    private readonly settings: GoogleGenerativeAIImageSettings,
    private readonly config: GoogleGenerativeAIImageModelConfig,
  ) {}

  async doGenerate(
    options: Parameters<ImageModelV3['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<ImageModelV3['doGenerate']>>> {
    const {
      prompt,
      n = 1,
      size,
      aspectRatio: aspectRatioArg,
      seed,
      providerOptions,
      headers,
      abortSignal,
      files,
      mask,
    } = options;
    // Apply default aspectRatio only for non-edit mode
    const isEditMode = files != null && files.length > 0;
    const aspectRatio = aspectRatioArg ?? (isEditMode ? undefined : '1:1');
    const warnings: Array<SharedV3Warning> = [];

    if (size != null) {
      warnings.push({
        type: 'unsupported',
        feature: 'size',
        details:
          'This model does not support the `size` option. Use `aspectRatio` instead.',
      });
    }

    if (seed != null) {
      warnings.push({
        type: 'unsupported',
        feature: 'seed',
        details:
          'This model does not support the `seed` option through this provider.',
      });
    }

    const googleOptions = await parseProviderOptions({
      provider: 'google',
      providerOptions,
      schema: googleImageProviderOptionsSchema,
    });

    // Extract edit-specific options from provider options
    const { edit, ...otherOptions } = googleOptions ?? {};
    const {
      mode: editMode,
      baseSteps,
      maskMode,
      maskDilation,
    } = edit ?? {};

    const currentDate = this.config._internal?.currentDate?.() ?? new Date();

    let body: Record<string, unknown>;

    if (isEditMode) {
      // Build reference images for editing
      const referenceImages: Array<Record<string, unknown>> = [];

      // Add the source image(s)
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        referenceImages.push({
          referenceType: 'REFERENCE_TYPE_RAW',
          referenceId: i + 1,
          referenceImage: {
            bytesBase64Encoded: getBase64Data(file),
          },
        });
      }

      // Add mask if provided
      if (mask != null) {
        referenceImages.push({
          referenceType: 'REFERENCE_TYPE_MASK',
          referenceId: files.length + 1,
          referenceImage: {
            bytesBase64Encoded: getBase64Data(mask),
          },
          maskImageConfig: {
            maskMode: maskMode ?? 'MASK_MODE_USER_PROVIDED',
            ...(maskDilation != null ? { dilation: maskDilation } : {}),
          },
        });
      }

      const parameters: Record<string, unknown> = {
        sampleCount: n,
        editMode: editMode ?? 'EDIT_MODE_INPAINT_INSERTION',
        ...(baseSteps != null ? { editConfig: { baseSteps } } : {}),
        ...otherOptions,
      };

      if (aspectRatio != null) {
        parameters.aspectRatio = aspectRatio;
      }

      body = {
        instances: [
          {
            prompt,
            referenceImages,
          },
        ],
        parameters,
      };
    } else {
      // Standard image generation
      const parameters: Record<string, unknown> = {
        sampleCount: n,
      };

      if (aspectRatio != null) {
        parameters.aspectRatio = aspectRatio;
      }

      if (otherOptions) {
        Object.assign(parameters, otherOptions);
      }

      body = {
        instances: [{ prompt }],
        parameters,
      };
    }

    const { responseHeaders, value: response } = await postJsonToApi<{
      predictions: Array<{ bytesBase64Encoded: string }>;
    }>({
      url: `${this.config.baseURL}/models/${this.modelId}:predict`,
      headers: combineHeaders(await resolve(this.config.headers), headers),
      body,
      failedResponseHandler: googleFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        googleImageResponseSchema,
      ),
      abortSignal,
      fetch: this.config.fetch,
    });
    return {
      images: response.predictions.map(
        (p: { bytesBase64Encoded: string }) => p.bytesBase64Encoded,
      ),
      warnings: warnings ?? [],
      providerMetadata: {
        google: {
          images: response.predictions.map(prediction => ({
            // Add any prediction-specific metadata here
          })),
        },
      },
      response: {
        timestamp: currentDate,
        modelId: this.modelId,
        headers: responseHeaders,
      },
    };
  }
}

// minimal version of the schema
const googleImageResponseSchema = lazySchema(() =>
  zodSchema(
    z.object({
      predictions: z
        .array(z.object({ bytesBase64Encoded: z.string() }))
        .default([]),
    }),
  ),
);

// Note: For the initial GA launch of Imagen 3, safety filters are not configurable.
// https://ai.google.dev/gemini-api/docs/imagen#imagen-model
const googleImageProviderOptionsSchema = lazySchema(() =>
  zodSchema(
    z.object({
      personGeneration: z
        .enum(['dont_allow', 'allow_adult', 'allow_all'])
        .nullish(),
      aspectRatio: z.enum(['1:1', '3:4', '4:3', '9:16', '16:9']).nullish(),
      /**
       * Configuration for image editing operations
       */
      edit: z
        .object({
          /**
           * An integer that represents the number of sampling steps.
           * A higher value offers better image quality, a lower value offers better latency.
           * Try 35 steps to start. If the quality doesn't meet your requirements,
           * increase the value towards an upper limit of 75.
           */
          baseSteps: z.number().nullish(),

          // Edit mode options
          // https://cloud.google.com/vertex-ai/generative-ai/docs/image/edit-insert-objects
          mode: z
            .enum([
              'EDIT_MODE_INPAINT_INSERTION',
              'EDIT_MODE_INPAINT_REMOVAL',
              'EDIT_MODE_OUTPAINT',
              'EDIT_MODE_CONTROLLED_EDITING',
              'EDIT_MODE_PRODUCT_IMAGE',
              'EDIT_MODE_BGSWAP',
            ])
            .nullish(),

          /**
           * The mask mode to use.
           * - `MASK_MODE_DEFAULT` - Default value for mask mode.
           * - `MASK_MODE_USER_PROVIDED` - User provided mask. No segmentation needed.
           * - `MASK_MODE_DETECTION_BOX` - Mask from detected bounding boxes.
           * - `MASK_MODE_CLOTHING_AREA` - Masks from segmenting the clothing area with open-vocab segmentation.
           * - `MASK_MODE_PARSED_PERSON` - Masks from segmenting the person body and clothing using the person-parsing model.
           */
          maskMode: z
            .enum([
              'MASK_MODE_DEFAULT',
              'MASK_MODE_USER_PROVIDED',
              'MASK_MODE_DETECTION_BOX',
              'MASK_MODE_CLOTHING_AREA',
              'MASK_MODE_PARSED_PERSON',
            ])
            .nullish(),

          /**
           * Optional. A float value between 0 and 1, inclusive, that represents the
           * percentage of the image width to grow the mask by. Using dilation helps
           * compensate for imprecise masks. We recommend a value of 0.01.
           */
          maskDilation: z.number().nullish(),
        })
        .nullish(),
    }),
  ),
);

export type GoogleGenerativeAIImageProviderOptions = InferSchema<
  typeof googleImageProviderOptionsSchema
>;

/**
 * Helper to convert ImageModelV3File data to base64 string
 */
function getBase64Data(file: ImageModelV3File): string {
  if (file.type === 'url') {
    throw new Error(
      'URL-based images are not supported for Google Generative AI image editing. Please provide the image data directly.',
    );
  }

  if (typeof file.data === 'string') {
    return file.data;
  }

  // Convert Uint8Array to base64
  return uint8ArrayToBase64(file.data);
}

function uint8ArrayToBase64(data: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]);
  }
  return btoa(binary);
}
