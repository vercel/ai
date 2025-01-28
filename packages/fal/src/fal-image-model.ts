import type { ImageModelV1, ImageModelV1CallWarning } from '@ai-sdk/provider';
import type { Resolvable } from '@ai-sdk/provider-utils';
import {
  FetchFunction,
  combineHeaders,
  createJsonResponseHandler,
  createJsonErrorResponseHandler,
  postJsonToApi,
  resolve,
} from '@ai-sdk/provider-utils';
import { z } from 'zod';
import {
  FalImageModelId,
  FalImageSettings,
  FalImageSize,
} from './fal-image-settings';

interface FalImageModelConfig {
  provider: string;
  baseURL: string;
  headers?: Resolvable<Record<string, string | undefined>>;
  fetch?: FetchFunction;
}

// Validation error has a particular payload to inform the exact property that is invalid
const falValidationErrorSchema = z.object({
  name: z.literal('ValidationError'),
  status: z.literal(422),
  body: z.object({
    detail: z.array(
      z.object({
        loc: z.array(z.string()),
        msg: z.string(),
        type: z.string(),
      }),
    ),
  }),
});

type ValidationError = z.infer<typeof falValidationErrorSchema>;

function isValidationError(error: unknown): error is ValidationError {
  return falValidationErrorSchema.safeParse(error).success;
}

// Other errors have a message property
const falHttpErrorSchema = z.object({
  name: z.string(),
  status: z.number(),
  body: z
    .object({
      message: z.string(),
    })
    .optional(),
});

const falErrorSchema = z.union([falValidationErrorSchema, falHttpErrorSchema]);

const falFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: falErrorSchema,
  errorToMessage: error => {
    if (isValidationError(error)) {
      return error.body.detail
        .map(detail => `${detail.loc.join('.')}: ${detail.msg}`)
        .join('\n');
    }
    const body = error.body || ({} as any);
    return body.message ?? 'Unknown fal error';
  },
});

const falImageSchema = z.object({
  url: z.string(),
  width: z.number(),
  height: z.number(),
  content_type: z.string(),
});

const falImageResponseSchema = z.union([
  z.object({
    images: z.array(falImageSchema),
  }),
  z.object({
    image: falImageSchema,
  }),
]);

type ImageModelV1Parameters = Parameters<ImageModelV1['doGenerate']>[0];

type ImageModelV1Response = Awaited<ReturnType<ImageModelV1['doGenerate']>>;

/**
 * Convert an aspect ratio to an image size compatible with fal.ai APIs.
 * @param aspectRatio - The aspect ratio to convert.
 * @returns The image size.
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

function convertToFalImageInput(
  params: Omit<ImageModelV1Parameters, 'headers' | 'abortSignal'>,
) {
  let imageSize: FalImageSize | undefined;
  if (params.size) {
    const [width, height] = params.size.split('x').map(Number);
    imageSize = { width, height };
  } else if (params.aspectRatio) {
    imageSize = convertAspectRatioToSize(params.aspectRatio);
  }
  return {
    prompt: params.prompt,
    seed: params.seed,
    image_size: imageSize,
    num_images: params.n,
    ...params.providerOptions,
  };
}

export class FalImageModel implements ImageModelV1 {
  readonly specificationVersion = 'v1';

  get provider(): string {
    return this.config.provider;
  }

  get maxImagesPerCall(): number {
    return this.settings.maxImagesPerCall ?? 1;
  }

  constructor(
    readonly modelId: FalImageModelId,
    private readonly settings: FalImageSettings,
    private readonly config: FalImageModelConfig,
  ) {}

  async doGenerate(
    params: ImageModelV1Parameters,
  ): Promise<ImageModelV1Response> {
    const warnings: Array<ImageModelV1CallWarning> = [];
    const { headers, abortSignal, ...input } = params;
    const { value, responseHeaders } = await postJsonToApi<
      z.infer<typeof falImageResponseSchema>
    >({
      url: `${this.config.baseURL}/${this.modelId}`,
      headers: combineHeaders(await resolve(this.config.headers), headers),
      body: {
        input: convertToFalImageInput(input),
      },
      failedResponseHandler: falFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        falImageResponseSchema,
      ),
      abortSignal,
      fetch: this.config.fetch,
    });
    const currentDate = new Date();

    // download the images:
    const result = 'images' in value ? value.images : [value.image];
    const images = await Promise.all(
      result.map(async image => {
        const response = await fetch(image.url);
        return new Uint8Array(await response.arrayBuffer());
      }),
    );

    return {
      images,
      warnings,
      response: {
        timestamp: currentDate,
        modelId: this.modelId,
        headers: responseHeaders,
      },
    };
  }
}
