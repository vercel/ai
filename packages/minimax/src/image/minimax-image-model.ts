import type {
  ImageModelV4,
  ImageModelV4CallOptions,
  ImageModelV4Result,
  SharedV4Warning,
} from '@ai-sdk/provider';

import {
  resolve,
  combineHeaders,
  createJsonResponseHandler,
  parseProviderOptions,
  postJsonToApi,
  serializeModelOptions,
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
  type FetchFunction,
  type Resolvable,
  createJsonErrorResponseHandler,
  convertToBase64,
} from '@ai-sdk/provider-utils';
import { minimaxImageModelProviderOptions } from './minimax-image-model-options';
import { minimaxErrorResponseSchema } from '../minimax-error';
import { minimaxImageModelResponseSchema } from './minimax-image-model-api';

interface MinimaxImageModelConfig {
  provider: string;
  baseURL: string;
  headers?: Resolvable<Record<string, string | undefined>>;
  fetch?: FetchFunction;
}

export class MinimaxImageModel implements ImageModelV4 {
  readonly specificationVersion = 'v4';
  readonly maxImagesPerCall = 1;

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: string,
    readonly config: MinimaxImageModelConfig,
  ) {}

  static [WORKFLOW_SERIALIZE](model: MinimaxImageModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: model.config,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: string;
    config: MinimaxImageModelConfig;
  }) {
    return new MinimaxImageModel(options.modelId, options.config);
  }

  private async getHeaders(
    headers?: Record<string, string | undefined>,
  ): Promise<Record<string, string | undefined>> {
    return combineHeaders(await resolve(this.config.headers), headers);
  }

  async doGenerate({
    prompt,
    n,
    seed,
    size,
    aspectRatio,
    mask,
    files,
    providerOptions,
    headers,
    abortSignal,
  }: ImageModelV4CallOptions): Promise<ImageModelV4Result> {
    const warnings: SharedV4Warning[] = [];
    if (mask != null) {
      warnings.push({
        type: 'unsupported',
        feature: 'mask',
        details: 'Masking is not supported by the Minimax image model.',
      });
    }

    const resolvedHeaders = await this.getHeaders(headers);
    const minimaxOptions = await parseProviderOptions({
      provider: 'minimax',
      providerOptions,
      schema: minimaxImageModelProviderOptions,
    });

    const subjectReference =
      files != null
        ? files.map(file => ({
            type: 'character',
            image_file:
              file.type === 'url'
                ? file.url
                : `data:${file.mediaType};base64,${convertToBase64(file.data)}`,
          }))
        : undefined;

    const { width, height } = getSizeFromDimensions(size ?? '', warnings);
    const { value: response, responseHeaders } = await postJsonToApi({
      url: `${this.config.baseURL}/v1/image_generation`,
      body: {
        model: this.modelId,
        prompt,
        n: n ?? minimaxOptions?.n ?? 1,
        aspect_ratio: aspectRatio ?? minimaxOptions?.aspect_ratio ?? '1:1',
        seed: seed ?? minimaxOptions?.seed,
        prompt_optimizer: minimaxOptions?.prompt_optimizer,
        width: width ?? minimaxOptions?.width,
        height: height ?? minimaxOptions?.height,
        response_format: minimaxOptions?.response_format ?? 'url',
        ...(subjectReference != null
          ? { subject_reference: subjectReference }
          : {}),
      },
      headers: resolvedHeaders,
      fetch: this.config.fetch,
      abortSignal,
      failedResponseHandler: createJsonErrorResponseHandler({
        errorSchema: minimaxErrorResponseSchema,
        errorToMessage: data => data.error.message,
      }),
      successfulResponseHandler: createJsonResponseHandler(
        minimaxImageModelResponseSchema,
      ),
    });
    const timestamp = new Date();

    const images =
      'image_urls' in response.data
        ? response.data.image_urls
        : response.data.image_base64;
    return {
      images,
      warnings,
      response: {
        modelId: this.modelId,
        timestamp,
        headers: responseHeaders,
      },
      providerMetadata: {
        minimax: {
          images,
        },
      },
    };
  }
}

function getSizeFromDimensions(
  size: string,
  warnings: SharedV4Warning[],
): { width: number; height: number } {
  const [width, height] = size.split('x').map(Number);
  if (size && (isNaN(width) || isNaN(height))) {
    warnings.push({
      type: 'unsupported',
      feature: 'size',
      details: `Invalid size format: ${size}. Expected format is WIDTHxHEIGHT.`,
    });
    return { width: 512, height: 512 };
  }
  return { width, height };
}
