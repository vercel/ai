import {
  ImageModelV3,
  ImageModelV3File,
  SharedV3Warning,
} from '@ai-sdk/provider';
import {
  Resolvable,
  combineHeaders,
  convertUint8ArrayToBase64,
  createJsonResponseHandler,
  parseProviderOptions,
  postJsonToApi,
  resolve,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { googleVertexFailedResponseHandler } from './google-vertex-error';
import { GoogleVertexImageModelId } from './google-vertex-image-settings';

interface GoogleVertexImageModelConfig {
  provider: string;
  baseURL: string;
  headers?: Resolvable<Record<string, string | undefined>>;
  fetch?: typeof fetch;
  _internal?: {
    currentDate?: () => Date;
  };
}

// https://cloud.google.com/vertex-ai/generative-ai/docs/image/generate-images
export class GoogleVertexImageModel implements ImageModelV3 {
  readonly specificationVersion = 'v3';
  // https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/imagen-api#parameter_list
  readonly maxImagesPerCall = 4;

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: GoogleVertexImageModelId,
    private config: GoogleVertexImageModelConfig,
  ) {}

  async doGenerate({
    prompt,
    n,
    size,
    aspectRatio,
    seed,
    providerOptions,
    headers,
    abortSignal,
    files,
    mask,
  }: Parameters<ImageModelV3['doGenerate']>[0]): Promise<
    Awaited<ReturnType<ImageModelV3['doGenerate']>>
  > {
    const warnings: Array<SharedV3Warning> = [];

    if (size != null) {
      warnings.push({
        type: 'unsupported',
        feature: 'size',
        details:
          'This model does not support the `size` option. Use `aspectRatio` instead.',
      });
    }

    const vertexImageOptions = await parseProviderOptions({
      provider: 'vertex',
      providerOptions,
      schema: vertexImageProviderOptionsSchema,
    });

    // Extract edit-specific options from provider options
    const { edit, ...otherOptions } = vertexImageOptions ?? {};
    const { mode: editMode, baseSteps, maskMode, maskDilation } = edit ?? {};

    // Build the request body based on whether we're editing or generating
    const isEditMode = files != null && files.length > 0;

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

      body = {
        instances: [
          {
            prompt,
            referenceImages,
          },
        ],
        parameters: {
          sampleCount: n,
          ...(aspectRatio != null ? { aspectRatio } : {}),
          ...(seed != null ? { seed } : {}),
          editMode: editMode ?? 'EDIT_MODE_INPAINT_INSERTION',
          ...(baseSteps != null ? { editConfig: { baseSteps } } : {}),
          ...otherOptions,
        },
      };
    } else {
      // Standard image generation
      body = {
        instances: [{ prompt }],
        parameters: {
          sampleCount: n,
          ...(aspectRatio != null ? { aspectRatio } : {}),
          ...(seed != null ? { seed } : {}),
          ...otherOptions,
        },
      };
    }

    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const { value: response, responseHeaders } = await postJsonToApi({
      url: `${this.config.baseURL}/models/${this.modelId}:predict`,
      headers: combineHeaders(await resolve(this.config.headers), headers),
      body,
      failedResponseHandler: googleVertexFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        vertexImageResponseSchema,
      ),
      abortSignal,
      fetch: this.config.fetch,
    });

    return {
      images:
        response.predictions?.map(
          ({ bytesBase64Encoded }) => bytesBase64Encoded,
        ) ?? [],
      warnings,
      response: {
        timestamp: currentDate,
        modelId: this.modelId,
        headers: responseHeaders,
      },
      providerMetadata: {
        vertex: {
          images:
            response.predictions?.map(prediction => {
              const {
                // normalize revised prompt property
                prompt: revisedPrompt,
              } = prediction;

              return { ...(revisedPrompt != null && { revisedPrompt }) };
            }) ?? [],
        },
      },
    };
  }
}

// minimal version of the schema, focussed on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
const vertexImageResponseSchema = z.object({
  predictions: z
    .array(
      z.object({
        bytesBase64Encoded: z.string(),
        mimeType: z.string(),
        prompt: z.string().nullish(),
      }),
    )
    .nullish(),
});

const vertexImageProviderOptionsSchema = z.object({
  negativePrompt: z.string().nullish(),
  personGeneration: z
    .enum(['dont_allow', 'allow_adult', 'allow_all'])
    .nullish(),
  safetySetting: z
    .enum([
      'block_low_and_above',
      'block_medium_and_above',
      'block_only_high',
      'block_none',
    ])
    .nullish(),
  addWatermark: z.boolean().nullish(),
  storageUri: z.string().nullish(),
  sampleImageSize: z.enum(['1K', '2K']).nullish(),
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
});
export type GoogleVertexImageProviderOptions = z.infer<
  typeof vertexImageProviderOptionsSchema
>;

/**
 * Helper to convert ImageModelV3File data to base64 string
 */
function getBase64Data(file: ImageModelV3File): string {
  if (file.type === 'url') {
    throw new Error(
      'URL-based images are not supported for Google Vertex image editing. Please provide the image data directly.',
    );
  }

  if (typeof file.data === 'string') {
    return file.data;
  }

  // Convert Uint8Array to base64
  return convertUint8ArrayToBase64(file.data);
}
