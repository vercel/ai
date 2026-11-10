import { type ImageModelV4, type SharedV4Warning } from '@ai-sdk/provider';
import {
  type FetchFunction,
  type Resolvable,
  combineHeaders,
  convertImageModelFileToDataUri,
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  lazySchema,
  parseProviderOptions,
  postJsonToApi,
  resolve,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import {
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

const PIXEL_SIZE = /^\d+x\d+$/;

export class MiniMaxImageModel implements ImageModelV4 {
  readonly specificationVersion = 'v4';
  readonly maxImagesPerCall = 10;
  readonly supportsFileInputs = true;
  readonly supportsMaskInputs = false;

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: MiniMaxImageModelId,
    private readonly config: MiniMaxImageModelConfig,
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
  }: Parameters<ImageModelV4['doGenerate']>[0]): Promise<
    Awaited<ReturnType<ImageModelV4['doGenerate']>>
  > {
    const warnings: SharedV4Warning[] = [];
    const minimaxOptions = ((await parseProviderOptions({
      provider: 'minimax',
      providerOptions,
      schema: minimaxImageModelOptionsSchema,
    })) ?? {}) as MiniMaxImageModelOptions;

    if (seed != null) {
      warnings.push({
        type: 'unsupported',
        feature: 'seed',
        details: `${this.modelId} does not support a seed.`,
      });
    }

    if (mask != null) {
      warnings.push({
        type: 'unsupported',
        feature: 'mask',
        details: `${this.modelId} does not support mask inputs.`,
      });
    }

    const isEditing = files != null && files.length > 0;
    const pixelSize = size != null && PIXEL_SIZE.test(size) ? size : undefined;
    const aspectRatioValue = minimaxOptions.aspectRatio ?? aspectRatio;
    const body: Record<string, unknown> = {
      model: this.modelId,
      prompt,
      n,
      response_format: 'b64_json',
    };

    if (pixelSize != null) {
      body.size = pixelSize;
      if (aspectRatioValue != null) {
        warnings.push({
          type: 'unsupported',
          feature: 'aspectRatio',
          details:
            '`size` cannot be combined with `aspectRatio`. The aspect ratio was ignored.',
        });
      }
      if (minimaxOptions.area != null) {
        warnings.push({
          type: 'unsupported',
          feature: 'providerOptions.minimax.area',
          details:
            '`size` cannot be combined with `area`. The area was ignored.',
        });
      }
    } else {
      if (size != null) {
        body.size = size;
      }
      if (aspectRatioValue != null) {
        body.aspect_ratio = aspectRatioValue;
      }
      if (minimaxOptions.area != null) {
        body.area = minimaxOptions.area;
      }
    }

    if (isEditing) {
      body.images = files.map(file => ({
        image_url: convertImageModelFileToDataUri(file),
      }));
    }

    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const { value: response, responseHeaders } = await postJsonToApi({
      url: `${this.config.baseURL}/v1/images/${isEditing ? 'edits' : 'generations'}`,
      headers: combineHeaders(await resolve(this.config.headers), headers),
      body,
      failedResponseHandler: minimaxImageFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        minimaxImageResponseSchema,
      ),
      abortSignal,
      fetch: this.config.fetch,
    });

    return {
      images: response.data.map(item => item.b64_json),
      warnings,
      response: {
        timestamp: currentDate,
        modelId: this.modelId,
        headers: responseHeaders,
      },
    };
  }
}

const minimaxImageResponseSchema = lazySchema(() =>
  zodSchema(
    z.object({
      data: z.array(z.object({ b64_json: z.string() })),
    }),
  ),
);

const minimaxImageErrorSchema = lazySchema(() =>
  zodSchema(
    z.object({
      error: z.object({ message: z.string().nullish() }).nullish(),
    }),
  ),
);

const minimaxImageFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: minimaxImageErrorSchema,
  errorToMessage: data =>
    data.error?.message ?? 'MiniMax image generation error',
});
