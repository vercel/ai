import {
  AISDKError,
  type ImageModelV4,
  type SharedV4Warning,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  convertImageModelFileToDataUri,
  createBinaryResponseHandler,
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  createStatusCodeErrorResponseHandler,
  getFromApi,
  parseProviderOptions,
  postJsonToApi,
  resolve,
  type FetchFunction,
  type Resolvable,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import {
  minimaxImageAspectRatios,
  minimaxImageModelOptionsSchema,
  type MiniMaxImageModelOptions,
} from './minimax-image-model-options';
import type { MiniMaxImageModelId } from './minimax-image-settings';

interface MiniMaxImageModelConfig {
  provider: string;
  // API root without a version suffix, e.g. `https://api.minimax.io`.
  baseURL: string;
  headers: Resolvable<Record<string, string | undefined>>;
  fetch?: FetchFunction;
  _internal?: {
    currentDate?: () => Date;
  };
}

const MAX_IMAGES_PER_CALL = 9;
const allowedAspectRatios = new Set<string>(minimaxImageAspectRatios);

export class MiniMaxImageModel implements ImageModelV4 {
  readonly specificationVersion = 'v4';
  readonly maxImagesPerCall = MAX_IMAGES_PER_CALL;

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: MiniMaxImageModelId,
    private readonly config: MiniMaxImageModelConfig,
  ) {}

  async doGenerate({
    prompt,
    files,
    mask,
    n,
    size,
    aspectRatio,
    seed,
    providerOptions,
    headers,
    abortSignal,
  }: Parameters<ImageModelV4['doGenerate']>[0]): Promise<
    Awaited<ReturnType<ImageModelV4['doGenerate']>>
  > {
    const warnings: SharedV4Warning[] = [];

    const minimaxOptions = (await parseProviderOptions({
      provider: 'minimax',
      providerOptions,
      schema: minimaxImageModelOptionsSchema,
    })) as MiniMaxImageModelOptions | undefined;

    if (mask != null) {
      warnings.push({
        type: 'unsupported',
        feature: 'mask',
        details:
          'MiniMax image generation does not support a mask image. The mask was ignored.',
      });
    }

    // Size is passed as `{width}x{height}`; the API takes width and height as
    // separate integers.
    const [widthStr, heightStr] = size?.split('x') ?? [];
    const width = size != null ? Number(widthStr) : undefined;
    const height = size != null ? Number(heightStr) : undefined;

    // The API takes aspect ratios as `{width}:{height}` strings, matching the
    // top-level option. Unsupported ratios are ignored with a warning.
    let resolvedAspectRatio: string | undefined;
    if (aspectRatio != null) {
      if (allowedAspectRatios.has(aspectRatio)) {
        resolvedAspectRatio = aspectRatio;
      } else {
        warnings.push({
          type: 'unsupported',
          feature: 'aspectRatio',
          details:
            `MiniMax image generation does not support the aspect ratio "${aspectRatio}". ` +
            'Using the provider default (1:1).',
        });
      }
    }

    // Image-to-image generation: input images are sent as subject references.
    // The API currently only supports the `character` subject type.
    const subjectReference =
      files != null && files.length > 0
        ? files.map(file => ({
            type: 'character',
            image_file: convertImageModelFileToDataUri(file),
          }))
        : undefined;

    const body: Record<string, unknown> = {
      model: this.modelId,
      prompt: prompt ?? '',
      ...(subjectReference != null
        ? { subject_reference: subjectReference }
        : {}),
      ...(resolvedAspectRatio != null
        ? { aspect_ratio: resolvedAspectRatio }
        : {}),
      ...(width != null ? { width } : {}),
      ...(height != null ? { height } : {}),
      ...(seed != null ? { seed } : {}),
      n,
      response_format: minimaxOptions?.responseFormat ?? 'url',
      ...(minimaxOptions?.promptOptimizer != null
        ? { prompt_optimizer: minimaxOptions.promptOptimizer }
        : {}),
    };

    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const { value: response, responseHeaders } = await postJsonToApi({
      url: `${this.config.baseURL}/v1/image_generation`,
      headers: combineHeaders(await resolve(this.config.headers), headers),
      body,
      failedResponseHandler: minimaxImageFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        minimaxImageResponseSchema,
      ),
      abortSignal,
      fetch: this.config.fetch,
    });

    const statusCode = response.base_resp?.status_code;
    if (statusCode != null && statusCode !== 0) {
      throw new AISDKError({
        name: 'MINIMAX_IMAGE_GENERATION_ERROR',
        message:
          `MiniMax image generation failed: ${response.base_resp?.status_msg ?? 'unknown error'} ` +
          `(status code ${statusCode}).`,
      });
    }

    const imageUrls = response.data?.image_urls ?? [];
    const imageBase64 = response.data?.image_base64 ?? [];

    if (imageUrls.length === 0 && imageBase64.length === 0) {
      throw new AISDKError({
        name: 'MINIMAX_IMAGE_GENERATION_ERROR',
        message: 'MiniMax image generation returned no images.',
      });
    }

    // `response_format: "base64"` returns base64 strings directly; otherwise the
    // API returns URLs that must be downloaded.
    const images: Array<string> | Array<Uint8Array> =
      imageBase64.length > 0
        ? imageBase64
        : await Promise.all(
            imageUrls.map(url =>
              getFromApi({
                url,
                // URLs come from the provider response body; validate them.
                validateUrl: true,
                trustedOrigin: this.config.baseURL,
                // Image URLs are delivered from a CDN without credentials.
                abortSignal,
                failedResponseHandler: createStatusCodeErrorResponseHandler(),
                successfulResponseHandler: createBinaryResponseHandler(),
                fetch: this.config.fetch,
              }).then(({ value }) => value),
            ),
          );

    return {
      images,
      warnings,
      response: {
        timestamp: currentDate,
        modelId: this.modelId,
        headers: responseHeaders,
      },
      providerMetadata: {
        minimax: {
          images:
            imageUrls.length > 0
              ? imageUrls.map(url => ({ url }))
              : imageBase64.map(() => ({})),
          ...(response.id != null ? { traceId: response.id } : {}),
          ...(response.metadata?.success_count != null
            ? { successCount: response.metadata.success_count }
            : {}),
          ...(response.metadata?.failed_count != null
            ? { failedCount: response.metadata.failed_count }
            : {}),
        },
      },
    };
  }
}

const minimaxImageResponseSchema = z.object({
  data: z
    .object({
      image_urls: z.array(z.string()).nullish(),
      image_base64: z.array(z.string()).nullish(),
    })
    .nullish(),
  metadata: z
    .object({
      success_count: z.coerce.number().nullish(),
      failed_count: z.coerce.number().nullish(),
    })
    .nullish(),
  id: z.string().nullish(),
  base_resp: z
    .object({
      status_code: z.coerce.number().nullish(),
      status_msg: z.string().nullish(),
    })
    .nullish(),
});

const minimaxImageErrorSchema = z.object({
  base_resp: z
    .object({
      status_code: z.coerce.number().nullish(),
      status_msg: z.string().nullish(),
    })
    .nullish(),
});

const minimaxImageFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: minimaxImageErrorSchema,
  errorToMessage: data =>
    data.base_resp?.status_msg ?? 'MiniMax image generation error',
});
