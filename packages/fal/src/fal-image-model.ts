import type {
  ImageModelV2,
  ImageModelV2CallWarning,
  JSONObject,
} from '@ai-sdk/provider';
import type { Resolvable } from '@ai-sdk/provider-utils';
import {
  FetchFunction,
  combineHeaders,
  createBinaryResponseHandler,
  createJsonResponseHandler,
  createJsonErrorResponseHandler,
  createStatusCodeErrorResponseHandler,
  getFromApi,
  postJsonToApi,
  resolve,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { FalImageModelId, FalImageSize } from './fal-image-settings';

interface FalImageModelConfig {
  provider: string;
  baseURL: string;
  headers?: Resolvable<Record<string, string | undefined>>;
  fetch?: FetchFunction;
  _internal?: {
    currentDate?: () => Date;
  };
}

export class FalImageModel implements ImageModelV2 {
  readonly specificationVersion = 'v2';
  readonly maxImagesPerCall = 1;

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: FalImageModelId,
    private readonly config: FalImageModelConfig,
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
  }: Parameters<ImageModelV2['doGenerate']>[0]): Promise<
    Awaited<ReturnType<ImageModelV2['doGenerate']>>
  > {
    const warnings: Array<ImageModelV2CallWarning> = [];

    let imageSize: FalImageSize | undefined;
    if (size) {
      const [width, height] = size.split('x').map(Number);
      imageSize = { width, height };
    } else if (aspectRatio) {
      imageSize = convertAspectRatioToSize(aspectRatio);
    }

    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const { value, responseHeaders } = await postJsonToApi({
      url: `${this.config.baseURL}/${this.modelId}`,
      headers: combineHeaders(await resolve(this.config.headers), headers),
      body: {
        prompt,
        seed,
        image_size: imageSize,
        num_images: n,
        ...(providerOptions.fal ?? {}),
      },
      failedResponseHandler: falFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        falImageResponseSchema,
      ),
      abortSignal,
      fetch: this.config.fetch,
    });

    // download the images:
    const targetImages = 'images' in value ? value.images : [value.image];
    const downloadedImages = await Promise.all(
      targetImages.map(image => this.downloadImage(image.url, abortSignal)),
    );
    const {
      // @ts-expect-error - either image or images is present, not both.
      image,
      // @ts-expect-error - either image or images is present, not both.
      images,
      // prompt is just passed through and not a revised prompt per image
      prompt: _prompt,
      // NSFW information is normalized merged into `providerMetadata.fal.images`
      has_nsfw_concepts,
      nsfw_content_detected,
      // pass through other properties to providerMetadata
      ...responseMetaData
    } = value;

    return {
      images: downloadedImages,
      warnings,
      response: {
        modelId: this.modelId,
        timestamp: currentDate,
        headers: responseHeaders,
      },
      providerMetadata: {
        fal: {
          images: targetImages.map((image, index) => {
            const {
              url,
              content_type: contentType,
              file_name: fileName,
              file_data: fileData,
              file_size: fileSize,
              ...imageMetaData
            } = image;

            const nsfw =
              value.has_nsfw_concepts?.[index] ??
              value.nsfw_content_detected?.[index];

            return {
              ...imageMetaData,
              ...(contentType !== undefined ? { contentType } : undefined),
              ...(fileName !== undefined ? { fileName } : undefined),
              ...(fileData !== undefined ? { fileData } : undefined),
              ...(fileSize !== undefined ? { fileSize } : undefined),
              ...(nsfw !== undefined ? { nsfw } : undefined),
            };
          }),
          ...responseMetaData,
        },
      },
    };
  }

  private async downloadImage(
    url: string,
    abortSignal: AbortSignal | undefined,
  ): Promise<Uint8Array> {
    const { value: response } = await getFromApi({
      url,
      // No specific headers should be needed for this request as it's a
      // generated image provided by fal.ai.
      abortSignal,
      failedResponseHandler: createStatusCodeErrorResponseHandler(),
      successfulResponseHandler: createBinaryResponseHandler(),
      fetch: this.config.fetch,
    });
    return response;
  }
}

/**
Converts an aspect ratio to an image size compatible with fal.ai APIs.
@param aspectRatio - The aspect ratio to convert.
@returns The image size.
 */
function convertAspectRatioToSize(
  aspectRatio: `${number}:${number}`,
): FalImageSize | undefined {
  switch (aspectRatio) {
    case '1:1':
      return 'square_hd';
    case '16:9':
      return 'landscape_16_9';
    case '9:16':
      return 'portrait_16_9';
    case '4:3':
      return 'landscape_4_3';
    case '3:4':
      return 'portrait_4_3';
    case '16:10':
      return { width: 1280, height: 800 };
    case '10:16':
      return { width: 800, height: 1280 };
    case '21:9':
      return { width: 2560, height: 1080 };
    case '9:21':
      return { width: 1080, height: 2560 };
  }
  return undefined;
}

// Validation error has a particular payload to inform the exact property that is invalid
const falValidationErrorSchema = z.object({
  detail: z.array(
    z.object({
      loc: z.array(z.string()),
      msg: z.string(),
      type: z.string(),
    }),
  ),
});

type ValidationError = z.infer<typeof falValidationErrorSchema>;

// Other errors have a message property
const falHttpErrorSchema = z.object({
  message: z.string(),
});

const falErrorSchema = z.union([falValidationErrorSchema, falHttpErrorSchema]);

const falImageSchema = z.object({
  url: z.string(),
  width: z.number().optional(),
  height: z.number().optional(),
  content_type: z.string().optional(),
  // e.g. https://fal.ai/models/fal-ai/flowedit/api#schema-output
  file_name: z.string().nullable().optional(),
  file_data: z.string().optional(),
  file_size: z.number().nullable().optional(),
});

// https://fal.ai/models/fal-ai/lora/api#type-File
const loraFileSchema = z.object({
  url: z.string(),
  content_type: z.string().optional(),
  file_name: z.string().nullable().optional(),
  file_data: z.string().optional(),
  file_size: z.number().nullable().optional(),
});

const commonResponseSchema = z.object({
  timings: z
    .object({
      inference: z.number(),
    })
    .optional(),
  seed: z.number().optional(),
  has_nsfw_concepts: z.array(z.boolean()).optional(),
  prompt: z.string().optional(),
  // https://fal.ai/models/fal-ai/lcm/api#schema-output
  nsfw_content_detected: z.array(z.boolean()).optional(),
  num_inference_steps: z.number().optional(),
  // https://fal.ai/models/fal-ai/lora/api#schema-output
  debug_latents: loraFileSchema.optional(),
  debug_per_pass_latents: loraFileSchema.optional(),
});

// Most FAL image models respond with an array of images, but some have a response
// with a single image, e.g. https://fal.ai/models/easel-ai/easel-avatar/api#schema-output
const falImageResponseSchema = z.union([
  z
    .object({
      images: z.array(falImageSchema),
    })
    .merge(commonResponseSchema),
  z
    .object({
      image: falImageSchema,
    })
    .merge(commonResponseSchema),
]);

function isValidationError(error: unknown): error is ValidationError {
  return falValidationErrorSchema.safeParse(error).success;
}

const falFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: falErrorSchema,
  errorToMessage: error => {
    if (isValidationError(error)) {
      return error.detail
        .map(detail => `${detail.loc.join('.')}: ${detail.msg}`)
        .join('\n');
    }
    return error.message ?? 'Unknown fal error';
  },
});
